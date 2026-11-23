/**
 * Extracts the embedded text layer of a PDF.
 *
 * This is real extraction (no AI): invoices received electronically carry a text
 * layer. A scanned PDF has none, and the caller must treat that honestly as
 * "unreadable" rather than inventing values.
 */
export interface PdfTextResult {
  text: string;
  pageCount: number;
  hasTextLayer: boolean;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const document = await loadingTask.promise;

  try {
    const pageCount = document.numPages;
    const maxPages = Math.min(pageCount, 5);
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let lastY: number | undefined;
      for (const item of content.items) {
        const y = item.transform?.[5];
        if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 2) {
          chunks.push('\n');
        }
        chunks.push(item.str);
        if (item.hasEOL) chunks.push('\n');
        lastY = y;
      }
      chunks.push('\n');
      page.cleanup();
    }
    const text = chunks.join('').replace(/[ \t]{2,}/g, ' ').trim();
    return { text, pageCount, hasTextLayer: text.length >= 40 };
  } finally {
    // pdfjs 6 exposes destroy() on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
}

/** Cheap page counter used when only metadata is needed. */
export async function pdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const result = await extractPdfText(buffer);
    return result.pageCount;
  } catch {
    return null;
  }
}
