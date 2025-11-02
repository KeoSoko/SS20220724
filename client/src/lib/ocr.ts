import { createWorker, Worker, RecognizeResult } from "tesseract.js";

export interface ReceiptData {
  storeName: string;
  date: string; // Using string to avoid validation issues
  total: string;
  items: Array<{name: string, price: string}>;
}

export async function scanReceipt(imageData: string): Promise<ReceiptData> {
  let worker: Worker | null = null;
  
  try {
    // Create worker with proper initialization
    worker = await createWorker();
    
    // Use the correct method calls based on Tesseract.js API
    await (worker as any).loadLanguage('eng');
    await (worker as any).initialize('eng');
    
    // Perform OCR without passing progress callback (fixes postMessage cloning error)
    const result = await (worker as any).recognize(imageData) as RecognizeResult;
    const text = result.data.text;

    // Basic parsing of receipt text - in a real app this would be more sophisticated
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract store name (assume first line is store name)
    const storeName = lines[0] || 'Unknown Store';

    // Try to find date using regex - return as string instead of Date object
    const dateMatch = text.match(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/);
    const date = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];

    // Find total amount
    const totalLine = lines.find(l => 
      l.toLowerCase().includes('total') || 
      l.toLowerCase().includes('sum') || 
      l.toLowerCase().includes('amount')
    );
    const total = totalLine?.match(/\$?\d+\.\d{2}/)?.[0]?.replace('$', '') || '0.00';

    // Extract items (assume lines with dollar amounts are items)
    const items = lines
      .filter(l => l.match(/\$?\d+\.\d{2}/))
      .filter(l => !l.toLowerCase().includes('total'))
      .map(l => {
        const price = l.match(/\$?\d+\.\d{2}/)?.[0]?.replace('$', '') || '0.00';
        const name = l.replace(/\$?\d+\.\d{2}/, '').trim();
        return { name: name || 'Unknown Item', price };
      });

    return {
      storeName,
      date,
      total,
      items: items.length > 0 ? items : [{ name: 'Item', price: total }]
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to scan receipt. Please try again or enter details manually.');
  } finally {
    // Clean up worker to prevent memory leaks
    if (worker) {
      try {
        await (worker as any).terminate();
      } catch (e) {
        console.error('Error terminating worker:', e);
      }
    }
  }
}