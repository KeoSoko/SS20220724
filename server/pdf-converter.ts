import { fromBuffer } from 'pdf2pic';
import { log } from './vite';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PDF_CONVERSION_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function convertPdfToImage(pdfData: Buffer | string): Promise<string> {
  const tempDir = os.tmpdir();
  let tempPdfPath: string | null = null;
  
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
    
    const options = {
      density: 150,
      savePath: tempDir,
      saveFilename: `pdf_conversion_${Date.now()}`,
      format: 'jpeg',
      width: 1200,
      height: 1600,
      preserveAspectRatio: true,
    };
    
    const convert = fromBuffer(pdfBuffer, options);
    
    const result = await withTimeout(
      convert(1, { responseType: 'base64' }),
      PDF_CONVERSION_TIMEOUT_MS,
      'PDF to image conversion'
    );
    
    if (!result || !result.base64) {
      throw new Error('PDF conversion returned empty result');
    }
    
    const { width, height } = result as { width?: number; height?: number };
    if (width && height) {
      log(`PDF converted successfully: ${width}x${height}`, 'pdf-converter');
    } else {
      log('PDF converted successfully', 'pdf-converter');
    }
    
    return `data:image/jpeg;base64,${result.base64}`;
    
  } catch (error: any) {
    log(`PDF conversion error: ${error.message}`, 'pdf-converter');
    throw new Error(`Failed to convert PDF to image: ${error.message}`);
  } finally {
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      try {
        fs.unlinkSync(tempPdfPath);
      } catch (e) {
      }
    }
  }
}

export function isPdfData(data: string): boolean {
  return data.startsWith('data:application/pdf;base64,') || 
         data.startsWith('JVBERi0');
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.slice(0, 5).toString() === '%PDF-';
}
