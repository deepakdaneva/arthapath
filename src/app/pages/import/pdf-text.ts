/**
 * Text from a PDF statement, read in the browser with pdf.js (loaded only
 * here). Items are grouped into lines by their vertical position so table
 * rows read left to right. Password-protected PDFs are opened with the
 * password the user types; it never leaves the device.
 */
export class PdfPasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'Incorrect PDF password' : 'PDF password required');
  }
}

interface TextItem {
  str: string;
  transform: number[];
}

export async function pdfToText(data: ArrayBuffer, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), ...(password ? { password } : {}) }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') {
      throw new PdfPasswordError((e as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw e;
  }
  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const it of content.items as TextItem[]) {
        if (!it.str?.trim()) continue;
        const y = Math.round(it.transform[5]! / 3) * 3;
        const row = rows.get(y) ?? [];
        row.push({ x: it.transform[4]!, s: it.str.trim() });
        rows.set(y, row);
      }
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
    }
  } finally {
    // Frees the worker and the parsed document.
    await doc.loadingTask.destroy();
  }
  return lines.join('\n');
}
