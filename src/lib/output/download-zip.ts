import JSZip from 'jszip';

interface ZipDownloadEntry {
  fileName: string;
  content: ArrayBuffer | Uint8Array;
}

export async function downloadZipArchive(zipFileName: string, entries: ZipDownloadEntry[]) {
  if (!entries.length) {
    throw new Error('ZIP に含めるファイルがありません。');
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const fileName = entry.fileName.trim();
    if (!fileName) {
      continue;
    }

    zip.file(fileName, entry.content);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = zipFileName;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
