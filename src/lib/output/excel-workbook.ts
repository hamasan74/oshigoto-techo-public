import {
  buildExcelMetaRows,
  type ExcelBackupColumnDefinition,
  type ExcelBackupKeyValueSection,
  type ExcelBackupSheetDefinition,
  type ExcelBackupTableSection,
  type ExcelBackupWorkbookDefinition,
} from './excel-adapter';

type ExcelStyleTarget = {
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  numFmt?: string;
};

const japanTimeZone = 'Asia/Tokyo';

function buildThinBorder(color = 'D7E1E8') {
  return {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
}

function formatDatePartInJapan(date: Date) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: japanTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const year = read('year');
  const month = read('month');
  const day = read('day');

  const hour = read('hour');
  const minute = read('minute');
  const second = read('second');
  return `${year}/${month}/${day} ${hour}:${minute}:${second} JST`;
}

function applyCellStyle(cell: any, style: ExcelStyleTarget) {
  cell.font = {
    name: 'Meiryo UI',
    size: 10,
    color: { argb: 'FF2C3E4A' },
    ...(style.font ?? {}),
  };

  if (style.fill) {
    cell.fill = style.fill;
  }

  if (style.border) {
    cell.border = style.border;
  }

  if (style.alignment) {
    cell.alignment = style.alignment;
  }

  if (style.numFmt) {
    cell.numFmt = style.numFmt;
  }
}

function buildSolidFill(argb: string) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyRowBandStyle(worksheet: any, rowNumber: number, columnCount: number, style: ExcelStyleTarget) {
  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
    const cell = worksheet.getCell(rowNumber, columnIndex);
    applyCellStyle(cell, style);
  }
}

function getColumnCount(sheet: ExcelBackupSheetDefinition) {
  return Math.max(
    2,
    ...sheet.sections.map((section) => (section.type === 'table' ? section.columns.length : 2)),
  );
}

function buildColumnWidths(sheet: ExcelBackupSheetDefinition) {
  const widthMap = new Map<number, number>([
    [1, 18],
    [2, 24],
  ]);

  sheet.sections.forEach((section) => {
    if (section.type !== 'table') {
      return;
    }

    section.columns.forEach((column, index) => {
      const current = widthMap.get(index + 1) ?? 10;
      widthMap.set(index + 1, Math.max(current, column.width));
    });
  });

  const columnCount = getColumnCount(sheet);
  return Array.from({ length: columnCount }, (_, index) => widthMap.get(index + 1) ?? 12);
}

function toExcelValue(value: unknown, format?: ExcelBackupColumnDefinition['format']) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (value instanceof Date && format === 'datetime') {
    return formatDatePartInJapan(value);
  }

  if (format === 'hours' && typeof value === 'number') {
    return value / 60;
  }

  if (format === 'boolean' && typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }

  return value;
}

function resolveNumFmt(format?: ExcelBackupColumnDefinition['format']) {
  switch (format) {
    case 'date':
      return 'yyyy/mm/dd';
    case 'datetime':
      return 'yyyy/mm/dd hh:mm:ss';
    case 'hours':
      return '0.00';
    case 'minutes':
      return '0';
    case 'integer':
      return '0';
    default:
      return undefined;
  }
}

function resolveAlignment(column?: ExcelBackupColumnDefinition) {
  const horizontal = column?.align ?? (column?.format === 'hours' || column?.format === 'integer' ? 'right' : 'left');
  return {
    vertical: 'middle',
    horizontal,
    wrapText: Boolean(column?.wrapText),
  };
}

function addBandRow(worksheet: any, rowNumber: number, columnCount: number, value: string, style: ExcelStyleTarget) {
  applyRowBandStyle(worksheet, rowNumber, columnCount, style);
  const cell = worksheet.getCell(rowNumber, 1);
  cell.value = value;
}

function addMetaSection(worksheet: any, rowCursor: number, columnCount: number, workbookDefinition: ExcelBackupWorkbookDefinition) {
  addBandRow(worksheet, rowCursor, columnCount, '出力メタ情報', {
    font: { bold: true, size: 11, color: { argb: 'FF335062' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FB' } },
    alignment: { vertical: 'middle', horizontal: 'left' },
    border: buildThinBorder(),
  });
  rowCursor += 1;

  for (const row of buildExcelMetaRows(workbookDefinition.meta)) {
    const excelRow = worksheet.getRow(rowCursor);
    excelRow.getCell(1).value = row.label;
    excelRow.getCell(2).value = toExcelValue(row.value, row.format);
    applyCellStyle(excelRow.getCell(1), {
      font: { bold: true, color: { argb: 'FF5A6C78' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FBFD' } },
      border: buildThinBorder(),
      alignment: { vertical: 'middle', horizontal: 'left' },
    });
    applyCellStyle(excelRow.getCell(2), {
      border: buildThinBorder(),
      alignment: { vertical: 'middle', horizontal: 'left' },
      numFmt: resolveNumFmt(row.format),
    });
    rowCursor += 1;
  }

  return rowCursor + 1;
}

function addKeyValueSection(worksheet: any, rowCursor: number, columnCount: number, section: ExcelBackupKeyValueSection) {
  if (section.title) {
    addBandRow(worksheet, rowCursor, columnCount, section.title, {
      font: { bold: true, size: 11, color: { argb: 'FF335062' } },
      fill: buildSolidFill('FFF1F6FA'),
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: buildThinBorder(),
    });
    rowCursor += 1;
  }

  section.rows.forEach((row) => {
    const excelRow = worksheet.getRow(rowCursor);
    excelRow.getCell(1).value = row.label;
    excelRow.getCell(2).value = toExcelValue(row.value, row.format);
    applyCellStyle(excelRow.getCell(1), {
      font: { bold: true, color: { argb: 'FF566874' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FBFD' } },
      border: buildThinBorder(),
      alignment: { vertical: 'middle', horizontal: 'left' },
    });
    applyCellStyle(excelRow.getCell(2), {
      border: buildThinBorder(),
      alignment: { vertical: 'middle', horizontal: 'left' },
      numFmt: resolveNumFmt(row.format),
    });
    rowCursor += 1;
  });

  return rowCursor + 1;
}

function resolveTableRowStyle(rowKind: ExcelBackupTableSection['rows'][number]['rowKind'], groupIndex: number) {
  switch (rowKind) {
    case 'work':
      return {
        fill: buildSolidFill(groupIndex % 2 === 0 ? 'FFF5FAFD' : 'FFEFF6FA'),
        font: { bold: true, color: { argb: 'FF27404E' } },
      };
    case 'project':
      return {
        fill: buildSolidFill(groupIndex % 2 === 0 ? 'FFFFFFFF' : 'FFFAFCFE'),
      };
    case 'aux':
      return {
        fill: buildSolidFill('FFFFF7EE'),
        font: { color: { argb: 'FF6B5848' } },
      };
    case 'kpi':
      return {
        fill: buildSolidFill('FFF2F7FB'),
        font: { bold: true, size: 10.5, color: { argb: 'FF243D4B' } },
      };
    case 'project-summary':
      return {
        fill: buildSolidFill('FFEFF5F9'),
        font: { bold: true, color: { argb: 'FF233D4B' } },
      };
    case 'project-day':
      return {
        fill: buildSolidFill(groupIndex % 2 === 0 ? 'FFFBFCFE' : 'FFF8FAFD'),
        font: { color: { argb: 'FF465C6A' } },
      };
    case 'empty':
      return {
        fill: buildSolidFill('FFF9FBFD'),
        font: { italic: true, color: { argb: 'FF738693' } },
      };
    default:
      return {
        fill: buildSolidFill(groupIndex % 2 === 0 ? 'FFFFFFFF' : 'FFF9FBFD'),
      };
  }
}

function addTableSection(worksheet: any, rowCursor: number, columnCount: number, section: ExcelBackupTableSection) {
  if (section.title) {
    addBandRow(worksheet, rowCursor, columnCount, section.title, {
      font: { bold: true, size: 11, color: { argb: 'FF335062' } },
      fill: buildSolidFill('FFF1F6FA'),
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: buildThinBorder(),
    });
    rowCursor += 1;
  }

  const headerRowNumber = rowCursor;
  section.columns.forEach((column, index) => {
    const cell = worksheet.getCell(headerRowNumber, index + 1);
    cell.value = column.header;
    applyCellStyle(cell, {
      font: { bold: true, color: { argb: 'FFF7FAFF' } },
      fill: buildSolidFill('FF5A789A'),
      border: buildThinBorder('C8D6E2'),
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    });
  });
  rowCursor += 1;

  let currentGroupKey: string | undefined;
  let groupIndex = 0;
  worksheet.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };

  section.rows.forEach((row, rowIndex) => {
    if (row.groupKey && row.groupKey !== currentGroupKey) {
      currentGroupKey = row.groupKey;
      groupIndex += 1;
    }

    const rowStyle = resolveTableRowStyle(row.rowKind, groupIndex);
    const excelRow = worksheet.getRow(rowCursor);
    if (row.outlineLevel) {
      excelRow.outlineLevel = row.outlineLevel;
      excelRow.hidden = true;
      worksheet.properties.outlineLevelRow = Math.max(worksheet.properties.outlineLevelRow ?? 0, row.outlineLevel);
    }

    section.columns.forEach((column, columnIndex) => {
      const cell = worksheet.getCell(rowCursor, columnIndex + 1);
      cell.value = toExcelValue(row.values[column.key], column.format);
      applyCellStyle(cell, {
        border: buildThinBorder(),
        fill: rowStyle.fill,
        font: rowStyle.font,
        alignment: resolveAlignment(column),
        numFmt: resolveNumFmt(column.format),
      });
    });
    rowCursor += 1;
  });

  if (section.enableAutoFilter) {
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: section.columns.length },
    };
  }

  return rowCursor + 1;
}

async function createWorkbook(definition: ExcelBackupWorkbookDefinition) {
  const exceljsModule = await import('exceljs');
  const ExcelJs = exceljsModule.default ?? (exceljsModule as unknown as { Workbook: new () => any });
  const workbook = new ExcelJs.Workbook();
  workbook.creator = 'oshigoto-techo';
  workbook.company = 'oshigoto-techo';
  workbook.created = definition.meta.exportedAt;
  workbook.modified = definition.meta.exportedAt;
  workbook.subject = `${definition.meta.targetMonth} の業務バックアップ`;
  workbook.title = definition.fileName.replace(/\.xlsx$/i, '');

  definition.sheets.forEach((sheetDefinition, sheetIndex) => {
    const worksheet = workbook.addWorksheet(sheetDefinition.name, {
      properties: {
        defaultRowHeight: 20,
      },
    });
    const columnCount = getColumnCount(sheetDefinition);
    const columnWidths = buildColumnWidths(sheetDefinition);
    worksheet.columns = columnWidths.map((width) => ({ width }));

    let rowCursor = 1;
    addBandRow(worksheet, rowCursor, columnCount, sheetDefinition.title, {
      font: { bold: true, size: 16, color: { argb: 'FF213845' } },
      fill: buildSolidFill('FFEAF1F6'),
      alignment: { vertical: 'middle', horizontal: 'left' },
      border: buildThinBorder('CCD8E0'),
    });
    worksheet.getRow(rowCursor).height = 28;
    rowCursor += 1;

    if (sheetDefinition.description) {
      addBandRow(worksheet, rowCursor, columnCount, sheetDefinition.description, {
        font: { size: 10, color: { argb: 'FF617786' } },
        alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
      });
      rowCursor += 2;
    } else {
      rowCursor += 1;
    }

    if (sheetIndex === 0) {
      rowCursor = addMetaSection(worksheet, rowCursor, columnCount, definition);
    }

    sheetDefinition.sections.forEach((section) => {
      rowCursor =
        section.type === 'kv'
          ? addKeyValueSection(worksheet, rowCursor, columnCount, section)
          : addTableSection(worksheet, rowCursor, columnCount, section);
    });

    worksheet.eachRow((row: any) => {
      row.eachCell((cell: any) => {
        if (!cell.font) {
          cell.font = {
            name: 'Meiryo UI',
            size: 10,
            color: { argb: 'FF2C3E4A' },
          };
        }
      });
    });
  });

  return workbook;
}

export async function generateExcelBackupBuffer(definition: ExcelBackupWorkbookDefinition) {
  const workbook = await createWorkbook(definition);
  return workbook.xlsx.writeBuffer();
}

export async function downloadExcelBackup(definition: ExcelBackupWorkbookDefinition) {
  const buffer = await generateExcelBackupBuffer(definition);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = definition.fileName;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
