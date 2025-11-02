import { jsPDF } from 'jspdf';
import { Receipt } from '@shared/schema';
import { format, isValid } from 'date-fns';

// Format currency for South African Rands
const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return 'R ' + numAmount.toFixed(2);
};

/**
 * Parse and format a date string correctly
 */
function formatDateString(dateString: string, outputFormat: string = 'd MMMM yyyy'): string {
  try {
    const date = new Date(dateString);
    if (isValid(date)) {
      return format(date, outputFormat);
    }
    return dateString;
  } catch (e) {
    console.error("Error formatting date:", e);
    return dateString;
  }
}

export async function exportToPDF(receipt: Receipt) {
  const doc = new jsPDF();
  
  // Simple Slips branding colors
  const primaryBlue = [0, 115, 170]; // #0073AA
  const darkGray = [60, 60, 60];
  
  // Format date for South African display and filename
  const dateStr = formatDateString(String(receipt.date), 'd MMMM yyyy');
  const fileDate = formatDateString(String(receipt.date), 'yyyy-MM-dd');
  
  // Add Simple Slips branded header
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.setFontSize(20);
  doc.text(`Receipt - ${receipt.storeName}`, 105, 20, { align: 'center' });
  
  // Add Simple Slips branding line
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.setFontSize(10);
  doc.text('Simple Slips - AI-Powered Receipt Management', 105, 30, { align: 'center' });
  
  // Add receipt info with brand styling
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.setFontSize(12);
  doc.text(`Store: ${receipt.storeName}`, 20, 45);
  doc.text(`Date: ${dateStr}`, 20, 55);
  doc.text(`Total: ${formatCurrency(receipt.total)}`, 20, 65);
  
  // Add category if available
  let yPos = 75;
  if (receipt.category) {
    const categoryName = receipt.category.charAt(0).toUpperCase() + receipt.category.slice(1).replace('_', ' ');
    doc.text(`Category: ${categoryName}`, 20, yPos);
    yPos += 10;
  }
  
  // Add payment method if available
  if (receipt.paymentMethod) {
    doc.text(`Payment Method: ${receipt.paymentMethod}`, 20, yPos);
    yPos += 10;
  }
  
  // Add tax deductible info if available
  if (receipt.isTaxDeductible) {
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text('✓ Tax Deductible', 20, yPos);
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    yPos += 10;
  }
  
  // Add receipt image if available (check all possible storage locations)
  if (receipt.imageData || receipt.blobUrl || receipt.blobName) {
    try {
      let imageData = null;
      
      if (receipt.imageData) {
        // Base64 image data stored directly in database
        imageData = receipt.imageData;
      } else if (receipt.blobUrl && receipt.blobUrl.startsWith('/uploads/')) {
        // Local file storage - fetch from server
        try {
          const response = await fetch(receipt.blobUrl);
          if (response.ok) {
            const blob = await response.blob();
            console.log('Local image blob type:', blob.type, 'size:', blob.size);
            
            // Convert blob to base64
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                try {
                  const result = reader.result as string;
                  if (result && result.includes(',')) {
                    imageData = result; // Keep full data URL
                    resolve(result.split(',')[1]); // Remove data URL prefix
                  } else {
                    reject(new Error('Invalid file reader result'));
                  }
                } catch (error) {
                  reject(error);
                }
              };
              reader.onerror = () => reject(new Error('Failed to read file'));
              reader.readAsDataURL(blob);
            });
            
            imageData = `data:${blob.type};base64,${base64}`;
          }
        } catch (localError) {
          console.error('Failed to fetch local image:', localError);
        }
      } else if (receipt.blobName) {
        // Azure blob storage - get fresh SAS URL
        const token = localStorage.getItem('auth_token');
        if (token) {
          const response = await fetch(`/api/receipts/${receipt.id}/refresh-image-url`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (response.ok) {
            const { imageUrl } = await response.json();
            
            // Fetch the image data with proper headers for Azure blob storage
            const imageResponse = await fetch(imageUrl, {
              mode: 'cors',
              credentials: 'omit',
              headers: {
                'Accept': 'image/*'
              }
            });
            
            if (imageResponse.ok) {
              const blob = await imageResponse.blob();
              console.log('Azure image blob type:', blob.type, 'size:', blob.size);
              
              // Convert blob to base64
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  try {
                    const result = reader.result as string;
                    if (result && result.includes(',')) {
                      imageData = result; // Keep full data URL
                      resolve(result.split(',')[1]); // Return base64 part for logging
                    } else {
                      reject(new Error('Invalid file reader result'));
                    }
                  } catch (error) {
                    reject(error);
                  }
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(blob);
              });
              
              console.log('Successfully converted Azure blob to base64 for PDF export');
            } else {
              console.warn('Failed to fetch Azure image:', imageResponse.status, imageResponse.statusText);
              
              // Alternative approach: Try using a proxy fetch through our own API
              try {
                console.log('Attempting proxy fetch through API...');
                const proxyResponse = await fetch(`/api/receipts/${receipt.id}/image-data`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  },
                });
                
                if (proxyResponse.ok) {
                  const imageBlob = await proxyResponse.blob();
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const result = reader.result as string;
                      if (result && result.includes(',')) {
                        imageData = result;
                        resolve(result);
                      } else {
                        reject(new Error('Invalid proxy response'));
                      }
                    };
                    reader.onerror = () => reject(new Error('Failed to read proxy response'));
                    reader.readAsDataURL(imageBlob);
                  });
                  console.log('Successfully fetched image via proxy');
                } else {
                  console.warn('Proxy fetch also failed, using direct SAS URL as final fallback');
                  imageData = imageUrl;
                }
              } catch (proxyError) {
                console.error('Proxy approach failed:', proxyError);
                // Final fallback: use the SAS URL directly
                imageData = imageUrl;
                console.log('Using SAS URL directly as final fallback');
              }
            }
          }
        }
      }
      
      // Add image to PDF if we have image data
      if (imageData) {
        try {
          // Determine image format from data URL or extension
          let imageFormat = 'JPEG'; // Default to JPEG
          if (imageData.includes('data:image/png') || imageData.includes('.png')) {
            imageFormat = 'PNG';
          } else if (imageData.includes('data:image/webp') || imageData.includes('.webp')) {
            imageFormat = 'WEBP';
          }
          
          console.log(`Adding image to PDF with format: ${imageFormat}`);
          
          // Use receipt-like aspect ratio: width=120, height=160 (3:4 ratio)
          doc.addImage(imageData, imageFormat, 20, yPos, 120, 160);
          yPos += 170;
          
          console.log('Successfully added image to PDF');
        } catch (imgError) {
          console.error('Failed to add image to PDF:', imgError);
          // Add placeholder text
          doc.setFontSize(10);
          doc.text('Receipt image could not be displayed in PDF', 20, yPos);
          yPos += 15;
        }
      } else {
        console.log('No image data available for PDF export');
        // Add note about missing image
        doc.setFontSize(10);
        doc.text('Receipt image not available', 20, yPos);
        yPos += 15;
      }
    } catch (error) {
      console.error('Failed to add image to PDF:', error);
      // Continue without image
    }
  }
  
  // Add notes if available
  if (receipt.notes) {
    doc.text('Notes:', 20, yPos);
    yPos += 10;
    
    // Wrap text for notes
    const splitText = doc.splitTextToSize(receipt.notes, 170);
    doc.text(splitText, 20, yPos);
    yPos += splitText.length * 7 + 10;
  }
  

  
  // Add Simple Slips branded footer to all pages
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer background
    doc.setFillColor(240, 240, 240);
    doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
    
    // Footer content
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    
    // Left: Simple Slips branding & timestamp
    doc.text('Simple Slips - AI-Powered Receipt Management', 10, pageHeight - 15);
    doc.text(`Generated: ${format(new Date(), "d MMM yyyy, h:mm a")}`, 10, pageHeight - 8);
    
    // Right: Page numbering & website
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, pageHeight - 15, { align: 'right' });
    doc.text('simpleslips.app', pageWidth - 40, pageHeight - 8, { align: 'right' });
  }
  
  // Save the PDF with meaningful filename
  doc.save(`receipt_${receipt.storeName.replace(/\s+/g, "_")}_${fileDate}.pdf`);
}