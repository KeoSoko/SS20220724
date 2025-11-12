import type { 
  Quotation, 
  Invoice, 
  Client, 
  LineItem,
  BusinessProfile 
} from '../shared/schema';

interface EmailTemplateOptions {
  companyName: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
  primaryColor?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
}

function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Formats plain text with line breaks into HTML paragraphs for emails
 * - Double line breaks (\n\n) create new paragraphs with spacing
 * - Single line breaks (\n) become <br> tags
 */
function formatTextToParagraphs(text: string): string {
  if (!text) return '';
  
  // Split by double line breaks to create paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  
  // Convert each paragraph: replace single line breaks with <br> and wrap in <p>
  return paragraphs
    .map(para => {
      const formatted = para.trim().replace(/\n/g, '<br>');
      return `<p style="margin: 0 0 15px 0; line-height: 1.6; color: #333333;">${formatted}</p>`;
    })
    .join('');
}

function getBaseEmailTemplate(content: string, options: EmailTemplateOptions): string {
  const primaryColor = options.primaryColor || '#0073AA';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple Slips</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; color: #333333;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5;" bgcolor="#f5f5f5">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff;" bgcolor="#ffffff">
          <tr>
            <td style="background-color: ${primaryColor}; padding: 30px 40px; text-align: center;" bgcolor="${primaryColor}">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${options.companyName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; padding: 30px 40px; text-align: center; color: #666666; font-size: 14px;" bgcolor="#f5f5f5">
              <div style="margin-bottom: 15px;">
                <strong>${options.companyName}</strong>
              </div>
              ${options.companyEmail ? `<div style="margin: 5px 0;">${options.companyEmail}</div>` : ''}
              ${options.companyPhone ? `<div style="margin: 5px 0;">${options.companyPhone}</div>` : ''}
              ${options.companyAddress ? `<div style="margin: 5px 0;">${options.companyAddress}</div>` : ''}
              <div style="margin-top: 20px; font-size: 12px; color: #999999;">
                Powered by Simple Slips - AI-Powered Financial Management
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function generateQuotationEmailHTML(
  quotation: Quotation,
  client: Client,
  lineItems: LineItem[],
  businessProfile: BusinessProfile | null,
  aiGeneratedMessage: string
): string {
  const companyName = businessProfile?.companyName || 'Simple Slips';
  const companyEmail = businessProfile?.email || undefined;
  const companyPhone = businessProfile?.phone || undefined;
  const companyAddress = businessProfile?.address || undefined;
  const primaryColor = '#0073AA'; // Simple Slips blue

  const expiryDate = quotation.expiryDate ? formatDate(quotation.expiryDate) : 'N/A';
  const daysUntilExpiry = quotation.expiryDate 
    ? Math.ceil((new Date(quotation.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const lineItemsHTML = lineItems.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${formatCurrency(parseFloat(item.unitPrice))}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;"><strong>${formatCurrency(parseFloat(item.total))}</strong></td>
    </tr>
  `).join('');

  const content = `
    <h2 style="color: #333333; margin-top: 0;">Quotation ${quotation.quotationNumber}</h2>
    
    ${aiGeneratedMessage ? `
    <div style="background-color: #f9f9f9; border-left: 4px solid ${primaryColor}; padding: 20px; margin: 20px 0;">
      ${formatTextToParagraphs(aiGeneratedMessage)}
    </div>
    ` : ''}

    ${daysUntilExpiry !== null && daysUntilExpiry <= 7 ? `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404;">
      <strong>⏰ Time Sensitive:</strong> This quotation expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.
    </div>
    ` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Quotation Number:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;"><strong>${quotation.quotationNumber}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Date:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${formatDate(quotation.createdAt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Valid Until:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${expiryDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #666666;">Client:</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${client.name}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    <h3 style="color: #333333; margin-top: 40px; margin-bottom: 20px;">Items</h3>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin: 30px 0;">
      <thead>
        <tr>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: left; font-weight: 600;" bgcolor="${primaryColor}">Description</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Qty</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Unit Price</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 8px 0; color: #333333;">Subtotal:</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${formatCurrency(parseFloat(quotation.subtotal))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #333333;">VAT (15%):</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${formatCurrency(parseFloat(quotation.vatAmount))}</td>
            </tr>
            <tr>
              <td style="padding-top: 12px; margin-top: 8px; border-top: 2px solid ${primaryColor}; font-size: 20px; font-weight: 700; color: ${primaryColor};">Total:</td>
              <td style="padding-top: 12px; margin-top: 8px; border-top: 2px solid ${primaryColor}; font-size: 20px; font-weight: 700; color: ${primaryColor}; text-align: right;">${formatCurrency(parseFloat(quotation.total))}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    ${quotation.notes ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9;">
      <h4 style="margin-top: 0; color: #666666;">Notes</h4>
      ${formatTextToParagraphs(quotation.notes)}
    </div>
    ` : ''}

    ${quotation.terms ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9;">
      <h4 style="margin-top: 0; color: #666666;">Terms & Conditions</h4>
      <div style="font-size: 14px;">
        ${formatTextToParagraphs(quotation.terms)}
      </div>
    </div>
    ` : ''}

    <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 20px 0; color: #0c5460;">
      <strong>📄 Next Steps:</strong> Please review this quotation and let us know if you have any questions. We're happy to discuss any details or make adjustments as needed.
    </div>
  `;

  return getBaseEmailTemplate(content, {
    companyName,
    companyEmail,
    companyPhone,
    companyAddress,
    primaryColor,
  });
}

export function generateInvoiceEmailHTML(
  invoice: Invoice,
  client: Client,
  lineItems: LineItem[],
  businessProfile: BusinessProfile | null,
  aiGeneratedMessage: string
): string {
  const companyName = businessProfile?.companyName || 'Simple Slips';
  const companyEmail = businessProfile?.email || undefined;
  const companyPhone = businessProfile?.phone || undefined;
  const companyAddress = businessProfile?.address || undefined;
  const primaryColor = '#0073AA'; // Simple Slips blue

  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : 'Upon receipt';
  const daysUntilDue = invoice.dueDate 
    ? Math.ceil((new Date(invoice.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= 7;

  const amountDue = parseFloat(invoice.total) - parseFloat(invoice.amountPaid);

  const lineItemsHTML = lineItems.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${formatCurrency(parseFloat(item.unitPrice))}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;"><strong>${formatCurrency(parseFloat(item.total))}</strong></td>
    </tr>
  `).join('');

  const bankingDetails = businessProfile?.bankName && businessProfile?.accountNumber ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f0f8ff; border: 2px solid ${primaryColor};">
      <h4 style="margin-top: 0; color: ${primaryColor};">💳 Payment Details</h4>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0; color: #333333;"><strong>Bank Name:</strong></td>
          <td style="padding: 5px 0; color: #333333;">${businessProfile.bankName}</td>
        </tr>
        ${businessProfile.accountHolder ? `
        <tr>
          <td style="padding: 5px 0; color: #333333;"><strong>Account Holder:</strong></td>
          <td style="padding: 5px 0; color: #333333;">${businessProfile.accountHolder}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 5px 0; color: #333333;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0; color: #333333;"><strong>${businessProfile.accountNumber}</strong></td>
        </tr>
        ${businessProfile.branchCode ? `
        <tr>
          <td style="padding: 5px 0; color: #333333;"><strong>Branch Code:</strong></td>
          <td style="padding: 5px 0; color: #333333;">${businessProfile.branchCode}</td>
        </tr>
        ` : ''}
      </table>
      <p style="margin: 15px 0 0 0; font-size: 13px; color: #666;">Please use invoice number <strong>${invoice.invoiceNumber}</strong> as payment reference.</p>
    </div>
  ` : '';

  const content = `
    <h2 style="color: #333333; margin-top: 0;">Invoice ${invoice.invoiceNumber}</h2>
    
    ${aiGeneratedMessage ? `
    <div style="background-color: #f9f9f9; border-left: 4px solid ${primaryColor}; padding: 20px; margin: 20px 0;">
      ${formatTextToParagraphs(aiGeneratedMessage)}
    </div>
    ` : ''}

    ${isOverdue ? `
    <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; color: #721c24;">
      <strong>⚠️ Payment Overdue:</strong> This invoice was due ${Math.abs(daysUntilDue!)} day${Math.abs(daysUntilDue!) !== 1 ? 's' : ''} ago.
    </div>
    ` : isDueSoon ? `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404;">
      <strong>⏰ Due Soon:</strong> This invoice is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.
    </div>
    ` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Invoice Number:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;"><strong>${invoice.invoiceNumber}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Date:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${formatDate(invoice.createdAt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Due Date:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;"><strong>${dueDate}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666666;">Client:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; color: #333333; text-align: right;">${client.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #666666;">Amount Due:</td>
              <td style="padding: 8px 0; color: ${primaryColor}; font-size: 18px; text-align: right;"><strong>${formatCurrency(amountDue)}</strong></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    <h3 style="color: #333333; margin-top: 40px; margin-bottom: 20px;">Items</h3>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin: 30px 0;">
      <thead>
        <tr>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: left; font-weight: 600;" bgcolor="${primaryColor}">Description</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Qty</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Unit Price</th>
          <th style="background-color: ${primaryColor}; color: #ffffff; padding: 12px; text-align: right; font-weight: 600;" bgcolor="${primaryColor}">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 8px 0; color: #333333;">Subtotal:</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${formatCurrency(parseFloat(invoice.subtotal))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #333333;">VAT (15%):</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${formatCurrency(parseFloat(invoice.vatAmount))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #333333;">Total:</td>
              <td style="padding: 8px 0; color: #333333; text-align: right;">${formatCurrency(parseFloat(invoice.total))}</td>
            </tr>
            ${parseFloat(invoice.amountPaid) > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #333333;">Amount Paid:</td>
              <td style="padding: 8px 0; text-align: right; color: #28a745;">-${formatCurrency(parseFloat(invoice.amountPaid))}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding-top: 12px; margin-top: 8px; border-top: 2px solid ${primaryColor}; font-size: 20px; font-weight: 700; color: ${primaryColor};">Amount Due:</td>
              <td style="padding-top: 12px; margin-top: 8px; border-top: 2px solid ${primaryColor}; font-size: 20px; font-weight: 700; color: ${primaryColor}; text-align: right;">${formatCurrency(amountDue)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    ${bankingDetails}

    ${invoice.notes ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9;">
      <h4 style="margin-top: 0; color: #666666;">Notes</h4>
      ${formatTextToParagraphs(invoice.notes)}
    </div>
    ` : ''}

    ${invoice.terms ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9;">
      <h4 style="margin-top: 0; color: #666666;">Terms & Conditions</h4>
      <div style="font-size: 14px;">
        ${formatTextToParagraphs(invoice.terms)}
      </div>
    </div>
    ` : ''}

    <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 20px 0; color: #0c5460;">
      <strong>💼 Thank you for your business!</strong> If you have any questions about this invoice, please don't hesitate to contact us.
    </div>
  `;

  return getBaseEmailTemplate(content, {
    companyName,
    companyEmail,
    companyPhone,
    companyAddress,
    primaryColor,
  });
}

/**
 * Generate plain text version of quotation email for email client fallback
 */
export function generateQuotationEmailPlainText(
  quotation: Quotation,
  client: Client,
  lineItems: LineItem[],
  businessProfile: BusinessProfile | null,
  aiGeneratedMessage: string
): string {
  const companyName = businessProfile?.companyName || 'Simple Slips';
  const expiryDate = formatDate(quotation.expiryDate);
  const quotationDate = formatDate(quotation.createdAt);
  
  let text = `${companyName}\n`;
  text += `${'='.repeat(companyName.length)}\n\n`;
  
  text += `${aiGeneratedMessage}\n\n`;
  
  text += `${'─'.repeat(60)}\n`;
  text += `QUOTATION DETAILS\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  text += `Quotation Number:  ${quotation.quotationNumber}\n`;
  text += `Date:              ${quotationDate}\n`;
  text += `Valid Until:       ${expiryDate}\n`;
  text += `Client:            ${client.name}\n\n`;
  
  const now = new Date();
  const expiry = new Date(quotation.expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
    text += `⏰ TIME SENSITIVE: This quotation expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.\n\n`;
  }
  
  text += `${'─'.repeat(60)}\n`;
  text += `LINE ITEMS\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  text += `Description                         Qty    Price      Total\n`;
  text += `${'-'.repeat(60)}\n`;
  
  lineItems.forEach((item: LineItem) => {
    const desc = item.description.substring(0, 35).padEnd(35);
    const qty = item.quantity.toString().padStart(3);
    const price = formatCurrency(parseFloat(item.unitPrice)).padStart(10);
    const total = formatCurrency(parseFloat(item.total)).padStart(10);
    text += `${desc} ${qty}  ${price}  ${total}\n`;
  });
  
  text += `${'-'.repeat(60)}\n\n`;
  
  text += `Subtotal:          ${formatCurrency(parseFloat(quotation.subtotal))}\n`;
  text += `VAT (15%):         ${formatCurrency(parseFloat(quotation.vatAmount))}\n`;
  text += `${'─'.repeat(60)}\n`;
  text += `TOTAL:             ${formatCurrency(parseFloat(quotation.total))}\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  if (quotation.notes) {
    text += `NOTES:\n${quotation.notes}\n\n`;
  }
  
  if (quotation.terms) {
    text += `TERMS & CONDITIONS:\n${quotation.terms}\n\n`;
  }
  
  text += `${'─'.repeat(60)}\n`;
  if (businessProfile?.email || businessProfile?.phone || businessProfile?.address) {
    text += `CONTACT INFORMATION\n`;
    text += `${'─'.repeat(60)}\n`;
    if (businessProfile?.email) text += `Email:   ${businessProfile.email}\n`;
    if (businessProfile?.phone) text += `Phone:   ${businessProfile.phone}\n`;
    if (businessProfile?.address) text += `Address: ${businessProfile.address}\n`;
    text += `\n`;
  }
  
  text += `This email was sent by Simple Slips on behalf of ${companyName}.\n`;
  text += `Please find the detailed quotation PDF attached.\n`;
  
  return text;
}

/**
 * Generate plain text version of invoice email for email client fallback
 */
export function generateInvoiceEmailPlainText(
  invoice: Invoice,
  client: Client,
  lineItems: LineItem[],
  businessProfile: BusinessProfile | null,
  aiGeneratedMessage: string
): string {
  const companyName = businessProfile?.companyName || 'Simple Slips';
  const dueDate = formatDate(invoice.dueDate);
  const invoiceDate = formatDate(invoice.createdAt);
  const amountDue = parseFloat(invoice.total) - parseFloat(invoice.amountPaid);
  
  let text = `${companyName}\n`;
  text += `${'='.repeat(companyName.length)}\n\n`;
  
  text += `${aiGeneratedMessage}\n\n`;
  
  const now = new Date();
  const due = new Date(invoice.dueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const daysOverdue = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  
  if (invoice.status === 'overdue' && daysOverdue > 0) {
    text += `⚠️ OVERDUE: This invoice is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue.\n\n`;
  } else if (daysUntilDue > 0 && daysUntilDue <= 7) {
    text += `⏰ DUE SOON: This invoice is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.\n\n`;
  }
  
  text += `${'─'.repeat(60)}\n`;
  text += `INVOICE DETAILS\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  text += `Invoice Number:    ${invoice.invoiceNumber}\n`;
  text += `Date:              ${invoiceDate}\n`;
  text += `Due Date:          ${dueDate}\n`;
  text += `Client:            ${client.name}\n`;
  text += `Amount Due:        ${formatCurrency(amountDue)}\n\n`;
  
  text += `${'─'.repeat(60)}\n`;
  text += `LINE ITEMS\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  text += `Description                         Qty    Price      Total\n`;
  text += `${'-'.repeat(60)}\n`;
  
  lineItems.forEach((item: LineItem) => {
    const desc = item.description.substring(0, 35).padEnd(35);
    const qty = item.quantity.toString().padStart(3);
    const price = formatCurrency(parseFloat(item.unitPrice)).padStart(10);
    const total = formatCurrency(parseFloat(item.total)).padStart(10);
    text += `${desc} ${qty}  ${price}  ${total}\n`;
  });
  
  text += `${'-'.repeat(60)}\n\n`;
  
  text += `Subtotal:          ${formatCurrency(parseFloat(invoice.subtotal))}\n`;
  text += `VAT (15%):         ${formatCurrency(parseFloat(invoice.vatAmount))}\n`;
  text += `Total:             ${formatCurrency(parseFloat(invoice.total))}\n`;
  
  if (parseFloat(invoice.amountPaid) > 0) {
    text += `Amount Paid:       -${formatCurrency(parseFloat(invoice.amountPaid))}\n`;
  }
  
  text += `${'─'.repeat(60)}\n`;
  text += `AMOUNT DUE:        ${formatCurrency(amountDue)}\n`;
  text += `${'─'.repeat(60)}\n\n`;
  
  if (businessProfile?.bankName || businessProfile?.accountNumber) {
    text += `PAYMENT DETAILS\n`;
    text += `${'─'.repeat(60)}\n`;
    if (businessProfile?.bankName) text += `Bank:            ${businessProfile.bankName}\n`;
    if (businessProfile?.accountNumber) text += `Account Number:  ${businessProfile.accountNumber}\n`;
    if (businessProfile?.branchCode) text += `Branch Code:     ${businessProfile.branchCode}\n`;
    text += `\nPlease use invoice number ${invoice.invoiceNumber} as payment reference.\n\n`;
  }
  
  if (invoice.notes) {
    text += `NOTES:\n${invoice.notes}\n\n`;
  }
  
  if (invoice.terms) {
    text += `TERMS & CONDITIONS:\n${invoice.terms}\n\n`;
  }
  
  text += `${'─'.repeat(60)}\n`;
  if (businessProfile?.email || businessProfile?.phone || businessProfile?.address) {
    text += `CONTACT INFORMATION\n`;
    text += `${'─'.repeat(60)}\n`;
    if (businessProfile?.email) text += `Email:   ${businessProfile.email}\n`;
    if (businessProfile?.phone) text += `Phone:   ${businessProfile.phone}\n`;
    if (businessProfile?.address) text += `Address: ${businessProfile.address}\n`;
    text += `\n`;
  }
  
  text += `💼 Thank you for your business! If you have any questions about\n`;
  text += `this invoice, please don't hesitate to contact us.\n\n`;
  
  text += `This email was sent by Simple Slips on behalf of ${companyName}.\n`;
  text += `Please find the detailed invoice PDF attached.\n`;
  
  return text;
}
