import { fromBuffer, FromBufferOptions } from 'pdf2pic';
import { log } from './vite';
import path from 'path';
import fs from 'fs';
import os from 'os';

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
    
    const options: FromBufferOptions = {
      density: 150,
      savePath: tempDir,
      saveFilename: `pdf_conversion_${Date.now()}`,
      format: 'jpeg',
      width: 1200,
      height: 1600,
      preserveAspectRatio: true,
    };
    
    const convert = fromBuffer(pdfBuffer, options);
    
    const result = await convert(1, { responseType: 'base64' });
    
    if (!result || !result.base64) {
      throw new Error('PDF conversion returned empty result');
    }
    
    log(`PDF converted successfully: ${result.width}x${result.height}`, 'pdf-converter');
    
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
