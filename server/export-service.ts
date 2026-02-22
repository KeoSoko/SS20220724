import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';
import type { Receipt, Budget } from '../shared/schema.js';
import { storage } from './storage.js';
import { azureStorage } from './azure-storage.js';
import { formatReportingCategory, getReportingCategory } from './reporting-utils.js';
import { db } from './db.js';
import { emailDocuments } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Compress and resize logo image to reduce PDF size for email attachments
 * Returns a smaller base64-encoded JPEG image
 */
async function compressLogoForPDF(imageBuffer: Buffer): Promise<string> {
  try {
    const compressedBuffer = await sharp(imageBuffer)
      .resize(600, 600, { // Max 600x600 px for high quality logos
        fit: 'inside',
        withoutEnlargement: true
      })
      .png({ compressionLevel: 4 }) // Minimal compression for best quality
      .toBuffer();
    
    return `data:image/png;base64,${compressedBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[PDF] Failed to compress logo:', error.message);
    // Return original as fallback
    return `data:image/png;base64,${imageBuffer.toString('base64')}`;
  }
}

/**
 * Sanitize text for PDF generation - replaces problematic Unicode characters
 * with ASCII equivalents to prevent rendering issues in jsPDF
 */
function sanitizeTextForPDF(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/–/g, '-')  // en-dash to hyphen
    .replace(/—/g, '-')  // em-dash to hyphen
    .replace(/'/g, "'")  // smart single quote
    .replace(/'/g, "'")  // smart single quote
    .replace(/"/g, '"')  // smart double quote
    .replace(/"/g, '"')  // smart double quote
    .replace(/…/g, '...') // ellipsis
    .replace(/•/g, '-')  // bullet point
    .replace(/[\u2000-\u200F]/g, ' ') // various Unicode spaces
    .replace(/[\u2018-\u201F]/g, "'") // various quote marks
    .replace(/[^\x00-\x7F]/g, (char) => {
      // For any remaining non-ASCII, try to keep or replace with ?
      return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '?';
    });
}

export class ExportService {
  private getReceiptCategoryLabel(receipt: Receipt): string {
    const rawCategory = getReportingCategory(receipt.category, receipt.notes);
    return formatReportingCategory(rawCategory);
  }

  private matchesCategoryFilter(receipt: Receipt, filter?: string): boolean {
    if (!filter) return true;

    const rawCategory = getReportingCategory(receipt.category, receipt.notes);
    return filter === rawCategory || filter === formatReportingCategory(rawCategory);
  }

  /**
   * Convert Simple Slips SVG logo to base64 PNG for PDF embedding
   */
  private async getSimpleSlipsLogoBase64(): Promise<string | null> {
    try {
      // Use require.resolve for better compatibility instead of dynamic imports
      const fs = require('fs');
      const path = require('path');
      
      // Try PNG first, fallback to SVG
      const logoPath = path.join(process.cwd(), 'public', 'simple-slips-logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
      
      // Try SVG as fallback
      const svgLogoPath = path.join(process.cwd(), 'public', 'simple-slips-logo.svg');
      if (fs.existsSync(svgLogoPath)) {
        const svgBuffer = fs.readFileSync(svgLogoPath);
        return `data:image/svg+xml;base64,${svgBuffer.toString('base64')}`;
      }
      
      console.log('Simple Slips logo not found - continuing without logo');
      return null;
    } catch (error) {
      console.error('Failed to load Simple Slips logo - continuing without logo:', error);
      return null;
    }
  }

  /**
   * Add professional footer with Simple Slips branding
   */
  private addBrandedFooter(doc: any, pageNumber: number, totalPages: number, generatedDate: Date) {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    
    // Footer background
    doc.setFillColor(240, 240, 240);
    doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
    
    // Footer content
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    
    // Left: Simple Slips branding
    doc.text('Simple Slips - AI-Powered Receipt Management', 10, pageHeight - 15);
    doc.text(`Generated: ${generatedDate.toLocaleDateString('en-ZA')} ${generatedDate.toLocaleTimeString('en-ZA')}`, 10, pageHeight - 8);
    
    // Right: Page numbering
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 40, pageHeight - 15, { align: 'right' });
    doc.text('simpleslips.app', pageWidth - 40, pageHeight - 8, { align: 'right' });
  }
  /**
   * Export receipts to CSV format
   */
  async exportReceiptsToCSV(userId: number, options: {
    startDate?: Date;
    endDate?: Date;
    category?: string;
    includeTaxInfo?: boolean;
  } = {}): Promise<string> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 10000);
      
      // Filter receipts based on options
      const filteredReceipts = receipts.filter(receipt => {
        if (options.startDate && receipt.date < options.startDate) return false;
        if (options.endDate && receipt.date > options.endDate) return false;
        if (!this.matchesCategoryFilter(receipt, options.category)) return false;
        return true;
      });

      // Build CSV headers
      const headers = [
        'Date',
        'Store Name',
        'Category',
        'Subcategory',
        'Total',
        'Payment Method',
        'Items',
        'Notes'
      ];

      if (options.includeTaxInfo) {
        headers.push('Tax Deductible', 'Tax Category');
      }

      // Build CSV rows
      const csvRows = [headers.join(',')];
      
      filteredReceipts.forEach(receipt => {
        const row = [
          receipt.date.toISOString().split('T')[0],
          `"${receipt.storeName.replace(/"/g, '""')}"`,
          this.getReceiptCategoryLabel(receipt),
          receipt.subcategory || '',
          receipt.total,
          receipt.paymentMethod || '',
          `"${receipt.items.map(item => `${item.name}: ${item.price}`).join('; ').replace(/"/g, '""')}"`,
          `"${(receipt.notes || '').replace(/"/g, '""')}"`
        ];

        if (options.includeTaxInfo) {
          row.push(
            receipt.isTaxDeductible ? 'Yes' : 'No',
            receipt.taxCategory || ''
          );
        }

        csvRows.push(row.join(','));
      });

      return csvRows.join('\n');
    } catch (error) {
      console.error('Failed to export receipts to CSV:', error);
      throw new Error('Export failed');
    }
  }

  /**
   * Export receipts to PDF format with embedded images
   */
  async exportReceiptsToPDF(userId: number, options: {
    startDate?: Date;
    endDate?: Date;
    category?: string;
    includeSummary?: boolean;
    includeImages?: boolean;
    groupBy?: 'category' | 'date';
  } = {}): Promise<Buffer> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 10000);
      const user = await storage.getUser(userId);
      
      // Filter receipts
      const filteredReceipts = receipts.filter(receipt => {
        if (options.startDate && receipt.date < options.startDate) return false;
        if (options.endDate && receipt.date > options.endDate) return false;
        if (!this.matchesCategoryFilter(receipt, options.category)) return false;
        return true;
      }).sort((a, b) => a.date.getTime() - b.date.getTime());

      const doc = new jsPDF();
      
      // Simple Slips branding colors
      const primaryBlue = [0, 115, 170]; // #0073AA
      const lightGray = [240, 240, 240];
      const darkGray = [60, 60, 60];
      
      // Add Simple Slips logo (convert SVG to base64 PNG for PDF compatibility)
      const logoBase64 = await this.getSimpleSlipsLogoBase64();
      if (logoBase64) {
        // Simple Slips logo proper aspect ratio: 329:79 = 4.16:1
        // Using width=50, height=12 maintains proper proportions
        doc.addImage(logoBase64, 'PNG', 15, 8, 50, 12); // Logo top-left with correct aspect ratio
      }
      
      // Add branded title
      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.setFontSize(20);
      doc.text('Receipt Export Report', logoBase64 ? 75 : 20, 20);
      
      // Add user info and date range with brand styling
      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFontSize(12);
      doc.text(`User: ${user?.username || 'Unknown'}`, logoBase64 ? 75 : 20, 35);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA', { 
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })}`, logoBase64 ? 75 : 20, 45);
      
      if (options.startDate || options.endDate) {
        const dateRange = `Date Range: ${options.startDate?.toLocaleDateString() || 'All'} - ${options.endDate?.toLocaleDateString() || 'All'}`;
        doc.text(dateRange, logoBase64 ? 75 : 20, 55);
      }

      // Add summary if requested
      if (options.includeSummary) {
        const totalAmount = filteredReceipts.reduce((sum, receipt) => sum + parseFloat(receipt.total), 0);
        const categoryBreakdown = this.getCategoryBreakdown(filteredReceipts);
        
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setFontSize(14);
        doc.text('Summary:', 20, 70);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.setFontSize(12);
        doc.text(`Total Receipts: ${filteredReceipts.length}`, 30, 80);
        doc.text(`Total Amount: R ${totalAmount.toFixed(2)}`, 30, 90);
        
        let yPos = 100;
        Object.entries(categoryBreakdown).forEach(([category, amount]) => {
          doc.text(`${category}: R ${amount.toFixed(2)}`, 30, yPos);
          yPos += 10;
        });
      }

      // Add receipts table
      const includeCategoryColumn = options.groupBy !== 'category';
      const tableHead = includeCategoryColumn
        ? ['Date', 'Store', 'Category', 'Total']
        : ['Date', 'Store', 'Total'];

      const tableRowForReceipt = (receipt: Receipt) => (
        includeCategoryColumn
          ? [
              receipt.date.toLocaleDateString(),
              receipt.storeName,
              this.getReceiptCategoryLabel(receipt),
              `R ${receipt.total}`
            ]
          : [
              receipt.date.toLocaleDateString(),
              receipt.storeName,
              `R ${receipt.total}`
            ]
      );

      const startY = options.includeSummary ? 150 : 80;

      if (options.groupBy === 'category') {
        const grouped = new Map<string, Receipt[]>();
        filteredReceipts.forEach(receipt => {
          const category = this.getReceiptCategoryLabel(receipt);
          if (!grouped.has(category)) {
            grouped.set(category, []);
          }
          grouped.get(category)!.push(receipt);
        });

        let yPos = startY;
        Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([category, receipts]) => {
          if (yPos > 250) {
            doc.addPage();
            yPos = 20;
          }

          doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
          doc.setFontSize(12);
          doc.text(category, 20, yPos);
          yPos += 6;

          autoTable(doc, {
            head: [tableHead],
            body: receipts.map(tableRowForReceipt),
            startY: yPos,
            margin: { bottom: 35 },
            styles: {
              fontSize: 8,
              cellPadding: 3
            },
            headStyles: {
              fillColor: [primaryBlue[0], primaryBlue[1], primaryBlue[2]] as [number, number, number],
              textColor: [255, 255, 255] as [number, number, number],
              fontStyle: 'bold'
            }
          });

          const lastTable = (doc as any).lastAutoTable;
          yPos = lastTable ? lastTable.finalY + 10 : yPos + 10;
        });
      } else {
        autoTable(doc, {
          head: [tableHead],
          body: filteredReceipts.map(tableRowForReceipt),
          startY,
          margin: { bottom: 35 },
          styles: { 
            fontSize: 8,
            cellPadding: 3
          },
          headStyles: { 
            fillColor: [primaryBlue[0], primaryBlue[1], primaryBlue[2]] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold'
          }
        });
      }

      // Add individual receipts with images if requested
      if (options.includeImages) {
        const emailReceiptIds = filteredReceipts
          .filter(r => r.source === 'email')
          .map(r => r.id);
        const emailHtmlReceiptIds = new Set<number>();
        if (emailReceiptIds.length > 0) {
          const emailDocs = await db.select({
            receiptId: emailDocuments.receiptId,
            sourceType: emailDocuments.sourceType,
          })
            .from(emailDocuments)
            .where(
              eq(emailDocuments.sourceType, 'email_body')
            );
          for (const doc_ of emailDocs) {
            if (doc_.receiptId && emailReceiptIds.includes(doc_.receiptId)) {
              emailHtmlReceiptIds.add(doc_.receiptId);
            }
          }
        }

        for (const receipt of filteredReceipts) {
          if (receipt.imageData || receipt.blobUrl || receipt.blobName) {
            try {
              doc.addPage();
              
              doc.setFontSize(16);
              doc.text(`Receipt: ${receipt.storeName}`, 20, 20);
              
              doc.setFontSize(12);
              doc.text(`Date: ${receipt.date.toLocaleDateString()}`, 20, 35);
              doc.text(`Total: R ${receipt.total}`, 20, 45);
              doc.text(`Category: ${this.getReceiptCategoryLabel(receipt)}`, 20, 55);
              let metaY = 65;
              if (receipt.paymentMethod) {
                doc.text(`Payment: ${receipt.paymentMethod}`, 20, metaY);
                metaY += 10;
              }

              if (emailHtmlReceiptIds.has(receipt.id)) {
                console.log(JSON.stringify({
                  stage: "EXPORT_HTML_RECEIPT_IN_BULK",
                  receiptId: receipt.id,
                  timestamp: new Date().toISOString()
                }));
                metaY += 2;
                doc.setFillColor(240, 248, 255);
                doc.rect(15, metaY - 5, 180, 20, 'F');
                doc.setDrawColor(0, 115, 170);
                doc.rect(15, metaY - 5, 180, 20, 'S');
                doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
                doc.setFontSize(9);
                doc.text('Document Source: Email (HTML)', 20, metaY + 2);
                doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
                doc.setFontSize(8);
                doc.text('Original email receipt available in the app.', 20, metaY + 10);
                doc.setTextColor(0, 0, 0);
              }
              
              let imageData = null;
              
              // Try to get image data from different sources
              if (receipt.imageData) {
                // Base64 image data stored directly in database
                imageData = receipt.imageData;
              } else if (receipt.blobUrl && receipt.blobUrl.startsWith('/uploads/')) {
                // Local file storage
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(process.cwd(), receipt.blobUrl);
                
                try {
                  if (fs.existsSync(filePath)) {
                    const fileBuffer = fs.readFileSync(filePath);
                    const base64 = fileBuffer.toString('base64');
                    // Determine MIME type from file extension
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                    imageData = `data:${mimeType};base64,${base64}`;
                  }
                } catch (fileError) {
                  console.error(`Failed to read local file: ${filePath}`, fileError);
                }
              } else if (receipt.blobName) {
                // Azure blob storage
                const imageUrl = await azureStorage.generateSasUrl(receipt.blobName, 1);
                
                if (imageUrl) {
                  try {
                    const response = await fetch(imageUrl);
                    if (response.ok) {
                      const arrayBuffer = await response.arrayBuffer();
                      const base64 = Buffer.from(arrayBuffer).toString('base64');
                      imageData = `data:image/jpeg;base64,${base64}`;
                    }
                  } catch (fetchError) {
                    console.error(`Failed to fetch Azure image: ${imageUrl}`, fetchError);
                  }
                }
              }
              
              // Add image to PDF if we have image data
              if (imageData) {
                try {
                  // Use receipt-like aspect ratio: width=120, height=160 (3:4 ratio)
                  doc.addImage(imageData, 'JPEG', 20, 80, 120, 160);
                } catch (imgError) {
                  console.error('Failed to add image to PDF:', imgError);
                  // Add placeholder text instead
                  doc.setFontSize(10);
                  doc.text('Receipt image could not be loaded', 20, 80);
                }
              } else {
                // Add placeholder text if no image available
                doc.setFontSize(10);
                doc.text('Receipt image not available', 20, 80);
              }
              
              // Add notes if available
              if (receipt.notes) {
                let yPos = 250;
                
                if (yPos > 280) {
                  doc.addPage();
                  yPos = 20;
                }
                
                doc.setFontSize(10);
                doc.text(`Notes: ${receipt.notes}`, 20, yPos);
              }
              
            } catch (imageError) {
              console.error(`Failed to add image for receipt ${receipt.id}:`, imageError);
              // Continue without the image
            }
          }
        }
      }

      // Add branded footer to all pages
      const totalPages = doc.getNumberOfPages();
      const generatedDate = new Date();
      
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        this.addBrandedFooter(doc, i, totalPages, generatedDate);
      }

      console.log(JSON.stringify({
        stage: "EXPORT_RECEIPTS_BY_DATE_RANGE",
        userId,
        receiptCount: filteredReceipts.length,
        startDate: options.startDate?.toISOString() || null,
        endDate: options.endDate?.toISOString() || null,
        category: options.category || null,
        includeImages: options.includeImages || false,
        timestamp: new Date().toISOString()
      }));

      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Failed to export receipts to PDF:', error);
      throw new Error('Export failed');
    }
  }

  /**
   * Export a single receipt to PDF by direct receipt reference.
   * No date filtering — uses the receipt object directly.
   */
  async exportSingleReceiptToPDF(receipt: Receipt): Promise<Buffer> {
    try {
      let isEmailHtmlReceipt = false;
      if (receipt.source === 'email') {
        const [emailDoc] = await db.select({ id: emailDocuments.id, sourceType: emailDocuments.sourceType })
          .from(emailDocuments)
          .where(eq(emailDocuments.receiptId, receipt.id))
          .limit(1);
        if (emailDoc && emailDoc.sourceType === 'email_body') {
          isEmailHtmlReceipt = true;
        }
      }

      if (isEmailHtmlReceipt) {
        console.log(JSON.stringify({
          stage: "EXPORT_HTML_RECEIPT_SUMMARY_ONLY",
          receiptId: receipt.id,
          timestamp: new Date().toISOString()
        }));
      }

      console.log(JSON.stringify({
        stage: "EXPORT_SINGLE_RECEIPT_BY_ID",
        receiptId: receipt.id,
        storeName: receipt.storeName,
        total: receipt.total,
        date: receipt.date.toISOString(),
        isEmailHtml: isEmailHtmlReceipt,
        timestamp: new Date().toISOString()
      }));

      const doc = new jsPDF();

      const primaryBlue = [0, 115, 170];
      const darkGray = [60, 60, 60];

      const logoBase64 = await this.getSimpleSlipsLogoBase64();
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 15, 8, 50, 12);
      }

      doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
      doc.setFontSize(20);
      doc.text('Receipt Export', logoBase64 ? 75 : 20, 20);

      doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
      doc.setFontSize(14);
      doc.text(sanitizeTextForPDF(receipt.storeName), 20, 40);

      doc.setFontSize(11);
      let yPos = 52;
      doc.text(`Date: ${receipt.date.toLocaleDateString('en-ZA')}`, 20, yPos);
      yPos += 10;
      doc.text(`Total: R ${receipt.total}`, 20, yPos);
      yPos += 10;
      doc.text(`Category: ${this.getReceiptCategoryLabel(receipt)}`, 20, yPos);
      yPos += 10;
      if (receipt.paymentMethod) {
        doc.text(`Payment Method: ${sanitizeTextForPDF(receipt.paymentMethod)}`, 20, yPos);
        yPos += 10;
      }
      if (receipt.notes) {
        doc.text(`Notes: ${sanitizeTextForPDF(receipt.notes)}`, 20, yPos);
        yPos += 10;
      }

      if (isEmailHtmlReceipt) {
        yPos += 5;
        doc.setFillColor(240, 248, 255);
        doc.rect(15, yPos - 5, 180, 25, 'F');
        doc.setDrawColor(0, 115, 170);
        doc.rect(15, yPos - 5, 180, 25, 'S');
        doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
        doc.setFontSize(10);
        doc.text('Document Source: Email (HTML)', 20, yPos + 3);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.setFontSize(9);
        doc.text('Original email receipt available in the app.', 20, yPos + 13);
        yPos += 30;
      }

      if (receipt.items && receipt.items.length > 0) {
        yPos += 5;
        autoTable(doc, {
          head: [['Item', 'Price']],
          body: receipt.items.map(item => [
            sanitizeTextForPDF(item.name),
            `R ${item.price}`
          ]),
          startY: yPos,
          margin: { bottom: 35 },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: {
            fillColor: [primaryBlue[0], primaryBlue[1], primaryBlue[2]] as [number, number, number],
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold'
          }
        });
        const lastTable = (doc as any).lastAutoTable;
        yPos = lastTable ? lastTable.finalY + 10 : yPos + 10;
      }

      let imageData: string | null = null;

      if (receipt.imageData) {
        imageData = receipt.imageData;
      } else if (receipt.blobUrl && receipt.blobUrl.startsWith('/uploads/')) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(process.cwd(), receipt.blobUrl);
        try {
          if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const base64 = fileBuffer.toString('base64');
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            imageData = `data:${mimeType};base64,${base64}`;
          }
        } catch (fileError) {
          console.error(`Failed to read local file: ${filePath}`, fileError);
        }
      } else if (receipt.blobName) {
        const blobNameStr = receipt.blobName as string;
        const isPdfBlob = blobNameStr.toLowerCase().endsWith('.pdf');

        if (!isPdfBlob) {
          const imageUrl = await azureStorage.generateSasUrl(blobNameStr, 1);
          if (imageUrl) {
            try {
              const response = await fetch(imageUrl);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                imageData = `data:image/jpeg;base64,${base64}`;
              }
            } catch (fetchError) {
              console.error(`Failed to fetch Azure image: ${blobNameStr}`, fetchError);
            }
          }
        }
      }

      if (imageData) {
        if (yPos > 200) {
          doc.addPage();
          yPos = 20;
        }
        try {
          doc.addImage(imageData, 'JPEG', 20, yPos, 120, 160);
        } catch (imgError) {
          console.error('Failed to add image to PDF:', imgError);
          doc.setFontSize(10);
          doc.text('Receipt image could not be loaded', 20, yPos);
        }
      }

      const totalPages = doc.getNumberOfPages();
      const generatedDate = new Date();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        this.addBrandedFooter(doc, i, totalPages, generatedDate);
      }

      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Failed to export single receipt to PDF:', error);
      throw new Error('Single receipt export failed');
    }
  }

  /**
   * Generate tax report for a specific year
   */
  async generateTaxReport(userId: number, taxYear: number, options?: {
    startDate?: Date;
    endDate?: Date;
    category?: string;
  }): Promise<{
    csv: string;
    pdf: Buffer;
    summary: {
      totalDeductible: number;
      categoriesBreakdown: Record<string, number>;
      receiptCount: number;
    };
  }> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 10000);
      
      // Filter for date range or tax year and deductible receipts
      const taxReceipts = receipts.filter(receipt => {
        if (!receipt.isTaxDeductible) return false;
        if (options?.startDate && receipt.date < options.startDate) return false;
        if (options?.endDate && receipt.date > options.endDate) return false;
        if (options?.category && !this.matchesCategoryFilter(receipt, options.category)) return false;
        if (!options?.startDate && !options?.endDate) {
          const receiptYear = receipt.date.getFullYear();
          return receiptYear === taxYear;
        }
        return true;
      });

      const totalDeductible = taxReceipts.reduce((sum, receipt) => sum + parseFloat(receipt.total), 0);
      const categoriesBreakdown = this.getTaxCategoryBreakdown(taxReceipts);

      // Generate CSV
      const csvHeaders = [
        'Date',
        'Store Name',
        'Category',
        'Tax Category',
        'Amount',
        'Notes'
      ];

      const csvRows = [csvHeaders.join(',')];
      taxReceipts.forEach(receipt => {
        const row = [
          receipt.date.toISOString().split('T')[0],
          `"${receipt.storeName.replace(/"/g, '""')}"`,
          this.getReceiptCategoryLabel(receipt),
          receipt.taxCategory || 'General',
          receipt.total,
          `"${(receipt.notes || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csv = csvRows.join('\n');

      // Generate PDF
      const doc = new jsPDF();
      doc.setFontSize(20);
      const titleSuffix = options?.startDate || options?.endDate
        ? 'Custom Range'
        : `${taxYear}`;
      doc.text(`Tax Report ${titleSuffix}`, 20, 20);
      
      doc.setFontSize(12);
      doc.text(`Total Deductible Amount: R ${totalDeductible.toFixed(2)}`, 20, 40);
      doc.text(`Number of Deductible Receipts: ${taxReceipts.length}`, 20, 50);
      if (options?.startDate || options?.endDate) {
        const dateRange = `Date Range: ${options?.startDate?.toLocaleDateString() || 'All'} - ${options?.endDate?.toLocaleDateString() || 'All'}`;
        doc.text(dateRange, 20, 60);
      }

      // Category breakdown
      let yPos = options?.startDate || options?.endDate ? 80 : 70;
      doc.text('Category Breakdown:', 20, yPos);
      Object.entries(categoriesBreakdown).forEach(([category, amount]) => {
        yPos += 10;
        doc.text(`${category}: R ${amount.toFixed(2)}`, 30, yPos);
      });

      // Receipts table
      const tableData = taxReceipts.map(receipt => [
        receipt.date.toLocaleDateString(),
        receipt.storeName,
        receipt.taxCategory || 'General',
        `R ${receipt.total}`
      ]);

      autoTable(doc, {
        head: [['Date', 'Store', 'Tax Category', 'Amount']],
        body: tableData,
        startY: yPos + 20,
        margin: { bottom: 35 },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [220, 53, 69] }
      });

      const pdf = Buffer.from(doc.output('arraybuffer'));

      return {
        csv,
        pdf,
        summary: {
          totalDeductible,
          categoriesBreakdown,
          receiptCount: taxReceipts.length
        }
      };
    } catch (error) {
      console.error('Failed to generate tax report:', error);
      throw new Error('Tax report generation failed');
    }
  }

  /**
   * Create backup of all user data
   */
  async createUserBackup(userId: number): Promise<{
    receipts: Receipt[];
    tags: any[];
    budgets: any[];
    metadata: {
      exportDate: Date;
      userId: number;
      receiptCount: number;
      totalValue: number;
    };
  }> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 10000);
      const tags = await storage.getTagsByUser(userId);
      // const budgets = await storage.getBudgetsByUser(userId); // To be implemented
      
      const totalValue = receipts.reduce((sum, receipt) => sum + parseFloat(receipt.total), 0);

      return {
        receipts,
        tags,
        budgets: [], // Placeholder until budget storage is implemented
        metadata: {
          exportDate: new Date(),
          userId,
          receiptCount: receipts.length,
          totalValue
        }
      };
    } catch (error) {
      console.error('Failed to create user backup:', error);
      throw new Error('Backup creation failed');
    }
  }

  /**
   * Export quotation to PDF
   */
  async exportQuotationToPDF(quotation: any, client: any, lineItems: any[], businessProfile: any): Promise<Buffer> {
    console.log(`[PDF] Starting quotation PDF export for ${quotation?.quotationNumber}`);
    console.log(`[PDF] Client: ${client?.name}, Business: ${businessProfile?.companyName}`);
    console.log(`[PDF] Line items count: ${lineItems?.length}`);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 20;

      // Add business logo if available (compressed for email attachments)
      if (businessProfile.logoUrl) {
        try {
          // Fetch with timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const response = await fetch(businessProfile.logoUrl, { 
            signal: controller.signal 
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);
            // Compress logo to reduce PDF size for email attachments
            const compressedLogoData = await compressLogoForPDF(imageBuffer);
            doc.addImage(compressedLogoData, 'PNG', 15, yPos, 40, 40);
          } else {
            console.error(`[PDF] Logo fetch failed with status ${response.status}`);
          }
        } catch (error: any) {
          // Don't let logo issues break the entire PDF
          console.error('[PDF] Failed to load business logo (continuing without it):', error.message || error);
        }
      }

      // Business details (right aligned)
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const businessText = [
        businessProfile.companyName,
        businessProfile.address || '',
        businessProfile.city ? `${businessProfile.city}, ${businessProfile.province || ''} ${businessProfile.postalCode || ''}` : '',
        businessProfile.phone || '',
        businessProfile.email || '',
        businessProfile.website || '',
        businessProfile.isVatRegistered ? `VAT: ${businessProfile.vatNumber}` : ''
      ].filter(Boolean);

      businessText.forEach((line, index) => {
        doc.text(line, pageWidth - 15, yPos + (index * 5), { align: 'right' });
      });

      yPos += 50;

      // Quotation title
      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0); // Black for professional look
      doc.text('QUOTATION', 15, yPos);
      yPos += 15;

      // Quotation details
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Quotation #: ${quotation.quotationNumber}`, 15, yPos);
      doc.text(`Date: ${new Date(quotation.date).toLocaleDateString('en-ZA')}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`Expiry Date: ${new Date(quotation.expiryDate).toLocaleDateString('en-ZA')}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 15;

      // Client details
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Bill To:', 15, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      
      const clientText = [
        client.name,
        client.companyName || '',
        client.address || '',
        client.city ? `${client.city}, ${client.province || ''} ${client.postalCode || ''}` : '',
        client.email || '',
        client.phone || '',
        client.vatNumber ? `VAT: ${client.vatNumber}` : ''
      ].filter(Boolean);

      clientText.forEach((line, index) => {
        doc.text(line, 15, yPos + (index * 5));
      });

      yPos += (clientText.length * 5) + 10;

      // Line items table - sanitize descriptions for PDF compatibility
      const tableData = lineItems.map(item => [
        sanitizeTextForPDF(item.description),
        item.quantity.toString(),
        `R ${parseFloat(item.unitPrice).toFixed(2)}`,
        `R ${parseFloat(item.total).toFixed(2)}`
      ]);

      autoTable(doc, {
        head: [['Description', 'Quantity', 'Unit Price', 'Total']],
        body: tableData,
        startY: yPos,
        margin: { bottom: 35 },
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 'auto' },  // Description - takes remaining space
          1: { cellWidth: 25, halign: 'center' },  // Quantity - centered
          2: { cellWidth: 35, halign: 'right' },   // Unit Price - right aligned
          3: { cellWidth: 35, halign: 'right' }    // Total - right aligned
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Calculate totals
      const subtotalQuote = lineItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const vatRateQuote = businessProfile.isVatRegistered ? 0.15 : 0;
      const vatAmountQuote = subtotalQuote * vatRateQuote;
      const totalQuote = subtotalQuote + vatAmountQuote;

      // Totals section - aligned with the Total column
      // The Total column ends at pageWidth - 15 (table margin) - 35 (column width) = pageWidth - 50
      const totalsLabelXQuote = pageWidth - 85;
      const totalsValueXQuote = pageWidth - 15;
      
      doc.setFontSize(10);
      doc.text('Subtotal:', totalsLabelXQuote, yPos);
      doc.text(`R ${subtotalQuote.toFixed(2)}`, totalsValueXQuote, yPos, { align: 'right' });
      yPos += 7;

      if (businessProfile.isVatRegistered) {
        doc.text('VAT (15%):', totalsLabelXQuote, yPos);
        doc.text(`R ${vatAmountQuote.toFixed(2)}`, totalsValueXQuote, yPos, { align: 'right' });
        yPos += 7;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Total:', totalsLabelXQuote, yPos);
      doc.text(`R ${totalQuote.toFixed(2)}`, totalsValueXQuote, yPos, { align: 'right' });
      yPos += 15;

      // Terms and conditions
      if (quotation.terms) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Terms & Conditions:', 15, yPos);
        yPos += 5;
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        const sanitizedTerms = sanitizeTextForPDF(quotation.terms);
        const splitTerms = doc.splitTextToSize(sanitizedTerms, pageWidth - 30);
        doc.text(splitTerms, 15, yPos);
      }

      return Buffer.from(doc.output('arraybuffer'));
    } catch (error: any) {
      console.error('[PDF] Failed to export quotation to PDF:', error.message || error);
      console.error('[PDF] Stack trace:', error.stack);
      throw new Error(`Quotation export failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Export invoice to PDF
   */
  async exportInvoiceToPDF(invoice: any, client: any, lineItems: any[], payments: any[], businessProfile: any): Promise<Buffer> {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      let yPos = 20;

      // Add business logo if available (compressed for email attachments)
      if (businessProfile.logoUrl) {
        try {
          // Fetch with timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const response = await fetch(businessProfile.logoUrl, { 
            signal: controller.signal 
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);
            // Compress logo to reduce PDF size for email attachments
            const compressedLogoData = await compressLogoForPDF(imageBuffer);
            doc.addImage(compressedLogoData, 'PNG', 15, yPos, 40, 40);
          } else {
            console.error(`[PDF] Invoice logo fetch failed with status ${response.status}`);
          }
        } catch (error: any) {
          // Don't let logo issues break the entire PDF
          console.error('[PDF] Failed to load invoice business logo (continuing without it):', error.message || error);
        }
      }

      // Business details (right aligned)
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const businessText = [
        businessProfile.companyName,
        businessProfile.address || '',
        businessProfile.city ? `${businessProfile.city}, ${businessProfile.province || ''} ${businessProfile.postalCode || ''}` : '',
        businessProfile.phone || '',
        businessProfile.email || '',
        businessProfile.website || '',
        businessProfile.isVatRegistered ? `VAT: ${businessProfile.vatNumber}` : ''
      ].filter(Boolean);

      businessText.forEach((line, index) => {
        doc.text(line, pageWidth - 15, yPos + (index * 5), { align: 'right' });
      });

      yPos += 50;

      // Invoice title
      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0);
      doc.text('INVOICE', 15, yPos);
      yPos += 15;

      // Invoice details
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, 15, yPos);
      doc.text(`Date: ${new Date(invoice.date).toLocaleDateString('en-ZA')}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-ZA')}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 15;

      // Client details
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Bill To:', 15, yPos);
      yPos += 7;
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      
      const clientText = [
        client.name,
        client.companyName || '',
        client.address || '',
        client.city ? `${client.city}, ${client.province || ''} ${client.postalCode || ''}` : '',
        client.email || '',
        client.phone || '',
        client.vatNumber ? `VAT: ${client.vatNumber}` : ''
      ].filter(Boolean);

      clientText.forEach((line, index) => {
        doc.text(line, 15, yPos + (index * 5));
      });

      yPos += (clientText.length * 5) + 10;

      // Line items table - sanitize descriptions for PDF compatibility
      const tableData = lineItems.map(item => [
        sanitizeTextForPDF(item.description),
        item.quantity.toString(),
        `R ${parseFloat(item.unitPrice).toFixed(2)}`,
        `R ${parseFloat(item.total).toFixed(2)}`
      ]);

      autoTable(doc, {
        head: [['Description', 'Quantity', 'Unit Price', 'Total']],
        body: tableData,
        startY: yPos,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 'auto' },  // Description - takes remaining space
          1: { cellWidth: 25, halign: 'center' },  // Quantity - centered
          2: { cellWidth: 35, halign: 'right' },   // Unit Price - right aligned
          3: { cellWidth: 35, halign: 'right' }    // Total - right aligned
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Calculate totals
      const subtotalInv = lineItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const vatRateInv = businessProfile.isVatRegistered ? 0.15 : 0;
      const vatAmountInv = subtotalInv * vatRateInv;
      const totalInv = subtotalInv + vatAmountInv;
      const amountPaid = parseFloat(invoice.amountPaid);
      const balance = totalInv - amountPaid;

      // Totals section - aligned with the Total column
      const totalsLabelX = pageWidth - 85;
      const totalsValueX = pageWidth - 15;
      
      doc.setFontSize(10);
      doc.text('Subtotal:', totalsLabelX, yPos);
      doc.text(`R ${subtotalInv.toFixed(2)}`, totalsValueX, yPos, { align: 'right' });
      yPos += 7;

      if (businessProfile.isVatRegistered) {
        doc.text('VAT (15%):', totalsLabelX, yPos);
        doc.text(`R ${vatAmountInv.toFixed(2)}`, totalsValueX, yPos, { align: 'right' });
        yPos += 7;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Total:', totalsLabelX, yPos);
      doc.text(`R ${totalInv.toFixed(2)}`, totalsValueX, yPos, { align: 'right' });
      yPos += 7;

      if (amountPaid > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Amount Paid:', totalsLabelX, yPos);
        doc.text(`R ${amountPaid.toFixed(2)}`, totalsValueX, yPos, { align: 'right' });
        yPos += 7;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(balance > 0 ? 200 : 0, balance > 0 ? 0 : 128, 0);
        doc.text('Balance Due:', totalsLabelX, yPos);
        doc.text(`R ${balance.toFixed(2)}`, totalsValueX, yPos, { align: 'right' });
        yPos += 10;
        doc.setTextColor(60, 60, 60);
      }

      // Payment details
      if (payments && payments.length > 0) {
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Payment History:', 15, yPos);
        yPos += 7;

        const paymentData = payments.map(payment => [
          new Date(payment.paymentDate).toLocaleDateString('en-ZA'),
          payment.paymentMethod || '-',
          payment.reference || '-',
          `R ${parseFloat(payment.amount).toFixed(2)}`
        ]);

        autoTable(doc, {
          head: [['Date', 'Method', 'Reference', 'Amount']],
          body: paymentData,
          startY: yPos,
          margin: { bottom: 35 },
          theme: 'plain',
          styles: { fontSize: 9 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Banking details
      if (businessProfile.bankName) {
        yPos += 5;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Banking Details:', 15, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        
        const bankingDetails = [
          `Bank: ${businessProfile.bankName}`,
          `Account Holder: ${businessProfile.accountHolder || ''}`,
          `Account Number: ${businessProfile.accountNumber || ''}`,
          `Branch Code: ${businessProfile.branchCode || ''}`,
        ].filter(line => !line.endsWith(': '));

        bankingDetails.forEach((line, index) => {
          doc.text(line, 15, yPos + (index * 5));
        });
        yPos += (bankingDetails.length * 5) + 5;
      }

      // Terms and conditions
      if (invoice.terms) {
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Terms & Conditions:', 15, yPos);
        yPos += 5;
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        const sanitizedTerms = sanitizeTextForPDF(invoice.terms);
        const splitTerms = doc.splitTextToSize(sanitizedTerms, pageWidth - 30);
        doc.text(splitTerms, 15, yPos);
      }

      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Failed to export invoice to PDF:', error);
      throw new Error('Invoice export failed');
    }
  }

  // Helper methods
  private getCategoryBreakdown(receipts: Receipt[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    receipts.forEach(receipt => {
      const category = this.getReceiptCategoryLabel(receipt);
      breakdown[category] = (breakdown[category] || 0) + parseFloat(receipt.total);
    });
    
    return breakdown;
  }

  private getTaxCategoryBreakdown(receipts: Receipt[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    receipts.forEach(receipt => {
      const taxCategory = receipt.taxCategory || 'General';
      breakdown[taxCategory] = (breakdown[taxCategory] || 0) + parseFloat(receipt.total);
    });
    
    return breakdown;
  }
}

export const exportService = new ExportService();
