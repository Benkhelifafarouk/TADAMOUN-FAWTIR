declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PdfTextItem {
    str: string;
    transform?: number[];
    hasEOL?: boolean;
  }
  export interface PdfTextContent {
    items: PdfTextItem[];
  }
  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>;
    cleanup(): void;
  }
  export interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
  }
  export interface PdfDocumentLoadingTask {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  }
  export function getDocument(source: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
  }): PdfDocumentLoadingTask;
}
