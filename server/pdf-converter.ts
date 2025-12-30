import { createCanvas } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { log } from './vite';

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export async function convertPdfToImage(pdfData: Buffer | string): Promise<string> {
  try {
    log('Starting PDF to image conversion...', 'pdf-converter');
    
    let pdfBuffer: Buffer;
    
    if (typeof pdfData === 'string') {
      const base64Match = pdfData.match(/^data:application\/pdf;base64,(.+)$/);
      if (base64Match) {
        pdfBuffer = Buffer.from(base64Match[1], 'base64');
      } else {
        pdfBuffer = Buffer.from(pdfData, 'base64');
      }
    } else {
      pdfBuffer = pdfData;
    }
    
    const uint8Array = new Uint8Array(pdfBuffer);
    
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    log(`PDF loaded successfully. Pages: ${pdfDocument.numPages}`, 'pdf-converter');
    
    const page = await pdfDocument.getPage(1);
    
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvasFactory = new NodeCanvasFactory();
    const canvasAndContext = canvasFactory.create(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );
    
    const renderContext = {
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
      canvas: canvasAndContext.canvas,
    };
    
    await page.render(renderContext as any).promise;
    log(`Page rendered: ${viewport.width}x${viewport.height}`, 'pdf-converter');
    
    const jpegDataUrl = canvasAndContext.canvas.toDataURL('image/jpeg', 0.9);
    
    canvasFactory.destroy(canvasAndContext);
    
    log('PDF converted to JPEG successfully', 'pdf-converter');
    return jpegDataUrl;
    
  } catch (error: any) {
    log(`PDF conversion error: ${error.message}`, 'pdf-converter');
    throw new Error(`Failed to convert PDF to image: ${error.message}`);
  }
}

export function isPdfData(data: string): boolean {
  return data.startsWith('data:application/pdf;base64,') || 
         data.startsWith('JVBERi0'); // Raw base64 PDF starts with %PDF
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.slice(0, 5).toString() === '%PDF-';
}
