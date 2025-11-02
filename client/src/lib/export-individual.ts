import { Receipt } from '@shared/schema';
import { format } from 'date-fns';

/**
 * Export a single receipt to PDF using the server-side export service
 * This uses the same logic as the bulk export that works perfectly with images
 */
export async function exportToPDF(receipt: Receipt) {
  // Use the server-side export approach (same logic as the working bulk export)
  const token = localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('Authentication required for PDF export');
  }

  try {
    console.log('Using server-side PDF export (same as bulk export)...');
    const exportResponse = await fetch(`/api/receipts/${receipt.id}/export-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        includeImages: true,
        includeSummary: false // Just the receipt, no summary for individual export
      })
    });
    
    if (exportResponse.ok) {
      // Get the PDF blob and trigger download
      const pdfBlob = await exportResponse.blob();
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${receipt.storeName.replace(/\s+/g, "_")}_${format(new Date(receipt.date), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('Server-side PDF export completed successfully with images');
      return;
    } else {
      const errorData = await exportResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Server export failed: ${errorData.error || exportResponse.statusText}`);
    }
  } catch (error) {
    console.error('Server-side export failed:', error);
    throw error;
  }
}