// Browser-side specification reader: pdf.js text where available, OCR (tesseract.js) for scanned pages.
import { extractItems } from '../quote/parse.js';
import { linesFromItems, parseSpec } from './spec.js';

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** OCR one page: render to canvas, recognise words, return pdf.js-like items (PDF points). */
async function ocrPage(pdfjs, doc, pageNo, worker) {
  const page = await doc.getPage(pageNo);
  const scale = 2.2;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const { data } = await worker.recognize(canvas);
  const pw = vp.width / scale;
  const items = [];
  for (const line of data.lines || []) {
    const y = line.bbox.y1 / scale;
    for (const w of line.words || []) {
      if (!w.text?.trim() || w.confidence < 20) continue;
      items.push({ page: pageNo, str: w.text, x: w.bbox.x0 / scale, y, w: (w.bbox.x1 - w.bbox.x0) / scale, h: (w.bbox.y1 - w.bbox.y0) / scale, pw });
    }
  }
  return items;
}

/**
 * @param {File} file
 * @param {(msg: string) => void} onProgress
 */
export async function readSpecFile(file, onProgress = () => {}) {
  onProgress('Reading specification…');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await loadPdfjs();
  const pages = await extractItems(bytes, pdfjs);
  const scanned = pages.map((p, i) => (p.reduce((s, it) => s + it.str.trim().length, 0) < 40 ? i : -1)).filter((i) => i >= 0);
  let ocrUsed = 0;
  if (scanned.length) {
    onProgress(`Scanned pages found – loading text recognition (OCR)…`);
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    for (const [n, i] of scanned.entries()) {
      onProgress(`OCR – page ${i + 1} (${n + 1} of ${scanned.length})…`);
      pages[i] = await ocrPage(pdfjs, doc, i + 1, worker);
      ocrUsed++;
    }
    await worker.terminate();
    await doc.destroy();
  }
  onProgress('Splitting clauses…');
  const res = parseSpec(linesFromItems(pages));
  return { ...res, pages: pages.length, ocrPages: ocrUsed };
}
