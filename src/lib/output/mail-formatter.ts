import type { MailTemplateContext, MailTemplateContextTaskRow } from '../../types/mail';

export interface RenderedMailTemplateContent {
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface MailChromePalette {
  pageBackground: string;
  cardBackground: string;
  sectionBackground: string;
  headerBackground: string;
  borderColor: string;
  accentBorderColor: string;
  textColor: string;
  headingColor: string;
  mutedTextColor: string;
}

const outlookFontFamily = "'Meiryo UI', Meiryo, 'MS PGothic', sans-serif";
const baseTextStyle = `font-family:${outlookFontFamily}; font-size:14px; line-height:1.7; color:#22312c; mso-line-height-rule:exactly;`;
const defaultMailChromePalette: MailChromePalette = {
  pageBackground: '#f3f8f4',
  cardBackground: '#ffffff',
  sectionBackground: '#f7fbf8',
  headerBackground: '#edf6f0',
  borderColor: '#c8ddd0',
  accentBorderColor: '#aac8b7',
  textColor: '#22312c',
  headingColor: '#2f5d50',
  mutedTextColor: '#60756c',
};

function escapeHtml(value: string) {
  return value
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');
}

function toHtmlText(value: string) {
  return escapeHtml(value).split('\n').join('<br />');
}

function normalizeTaskTextForMail(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeHtml(line))
    .join('<br />');
}

function normalizeTaskTextForPlain(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' / ');
}

function buildHtmlDocument(bodyHtml: string) {
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>勤務連絡</title>',
    '  <style type="text/css">',
    `    body, table, td, th, p, span { font-family: ${outlookFontFamily} !important; }`,
    '  </style>',
    '  <!--[if mso]>',
    '  <style type="text/css">',
    '    body, table, td, th, p, span {',
    `      font-family: ${outlookFontFamily} !important;`,
    '    }',
    '  </style>',
    '  <![endif]-->',
    '</head>',
    `<body style="margin:0;padding:0;background:${defaultMailChromePalette.pageBackground};${baseTextStyle}">`,
    bodyHtml,
    '</body>',
    '</html>',
  ].join('\n');
}

function buildInfoRowHtml(label: string, value: string, chrome: MailChromePalette) {
  return [
    '<tr>',
    `  <th width="170" style="${baseTextStyle} width:170px; padding:10px 12px; text-align:left; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; background:${chrome.headerBackground};">${escapeHtml(label)}</th>`,
    `  <td style="${baseTextStyle} padding:10px 12px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; background:${chrome.cardBackground};">${escapeHtml(value)}</td>`,
    '</tr>',
  ].join('');
}

function buildTaskRowHtml(row: MailTemplateContextTaskRow, index: number, chrome: MailChromePalette) {
  return [
    '<tr>',
    `  <td width="48" style="${baseTextStyle} width:48px; padding:10px 8px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; text-align:center; vertical-align:top; background:${chrome.cardBackground};">${index}</td>`,
    `  <td width="330" style="${baseTextStyle} width:330px; padding:10px 12px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; vertical-align:top; word-break:break-word; word-wrap:break-word; background:${chrome.cardBackground};">${toHtmlText(row.projectName)}</td>`,
    `  <td width="420" style="${baseTextStyle} width:420px; padding:10px 12px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; vertical-align:top; word-break:break-word; word-wrap:break-word; background:${chrome.cardBackground};">${normalizeTaskTextForMail(row.taskLabel)}</td>`,
    `  <td width="90" style="${baseTextStyle} width:90px; padding:10px 10px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; text-align:right; vertical-align:top; white-space:nowrap; background:${chrome.cardBackground};">${escapeHtml(row.planHoursLabel)}h</td>`,
    `  <td width="90" style="${baseTextStyle} width:90px; padding:10px 10px; color:${chrome.textColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; text-align:right; vertical-align:top; white-space:nowrap; background:${chrome.cardBackground};">${escapeHtml(row.actualHoursLabel)}h</td>`,
    '</tr>',
  ].join('');
}

function buildTaskRowText(row: MailTemplateContextTaskRow, index: number) {
  return [
    `[${index}] ${row.projectName}`,
    `  タスク: ${normalizeTaskTextForPlain(row.taskLabel)}`,
    `  予定: ${row.planHoursLabel}h`,
    `  実績: ${row.actualHoursLabel}h`,
  ].join('\n');
}

export function buildDefaultMailSubject(context: MailTemplateContext) {
  const subjectDateLabel = context.date.replace(/-/g, '/');
  return `【勤務連絡(${context.phaseLabel})_${context.workplaceLabel}】${context.userName || '未設定'}_${subjectDateLabel}`;
}

export function buildDefaultMailBodies(context: MailTemplateContext) {
  const chrome = defaultMailChromePalette;
  const taskRowsHtml =
    context.taskRows.length > 0
      ? context.taskRows.map((row, index) => buildTaskRowHtml(row, index + 1, chrome)).join('')
      : `<tr><td colspan="5" style="${baseTextStyle} padding:12px; color:${chrome.mutedTextColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; background:${chrome.cardBackground};">作業タスクはありません。</td></tr>`;
  const taskRowsText =
    context.taskRows.length > 0
      ? context.taskRows.map((row, index) => buildTaskRowText(row, index + 1)).join('\n\n')
      : '- 作業タスクはありません。';

  const htmlBody = buildHtmlDocument(`
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; background:${chrome.pageBackground};">
  <tr>
    <td align="left" style="padding:18px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="980" style="width:980px; border-collapse:collapse; background:${chrome.cardBackground}; border:1px solid ${chrome.borderColor};">
        <tr>
          <td style="${baseTextStyle} padding:18px 20px 10px; font-size:28px; font-weight:700; color:${chrome.headingColor}; border-bottom:1px solid ${chrome.accentBorderColor};">
            勤務連絡
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; table-layout:fixed; background:${chrome.sectionBackground}; border:1px solid ${chrome.borderColor};">
              ${buildInfoRowHtml('勤務地', context.workplaceLabel, chrome)}
              ${buildInfoRowHtml('勤務予定時間', context.workTimes.planned.label, chrome)}
              ${buildInfoRowHtml('勤務実績時間', context.workTimes.actual.label, chrome)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="${baseTextStyle} padding:0 20px 10px; font-size:20px; font-weight:700; color:${chrome.headingColor};">
            作業タスク
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; table-layout:fixed; background:${chrome.sectionBackground}; border:1px solid ${chrome.borderColor};">
              <thead>
                <tr style="background:${chrome.headerBackground};">
                  <th width="48" style="${baseTextStyle} width:48px; padding:10px 8px; text-align:center; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor};">#</th>
                  <th width="330" style="${baseTextStyle} width:330px; padding:10px 12px; text-align:left; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor};">PJ</th>
                  <th width="420" style="${baseTextStyle} width:420px; padding:10px 12px; text-align:left; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor};">タスク</th>
                  <th width="90" style="${baseTextStyle} width:90px; padding:10px 10px; text-align:right; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; white-space:nowrap;">予定(h)</th>
                  <th width="90" style="${baseTextStyle} width:90px; padding:10px 10px; text-align:right; font-weight:700; color:${chrome.headingColor}; border:1px solid ${chrome.borderColor}; border-bottom:1px solid ${chrome.accentBorderColor}; white-space:nowrap;">実績(h)</th>
                </tr>
              </thead>
              <tbody>
                ${taskRowsHtml}
              </tbody>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim());

  const textBody = [
    '勤務連絡',
    '',
    `勤務地: ${context.workplaceLabel}`,
    `勤務予定時間: ${context.workTimes.planned.label}`,
    `勤務実績時間: ${context.workTimes.actual.label}`,
    '',
    '作業タスク',
    taskRowsText,
  ]
    .join('\n')
    .trim();

  return {
    htmlBody,
    textBody,
  };
}

export function formatMailDraftFromTemplate(
  context: MailTemplateContext,
  rendered?: Partial<RenderedMailTemplateContent>,
): RenderedMailTemplateContent {
  const defaultBodies = buildDefaultMailBodies(context);

  return {
    subject: rendered?.subject?.trim() || buildDefaultMailSubject(context),
    htmlBody: rendered?.htmlBody?.trim() || defaultBodies.htmlBody,
    textBody: rendered?.textBody?.trim() || defaultBodies.textBody,
  };
}
