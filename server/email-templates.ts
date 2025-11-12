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

function getBaseEmailTemplate(content: string, options: EmailTemplateOptions): string {
  const primaryColor = options.primaryColor || '#0073AA';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple Slips</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      color: #333333;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${primaryColor};
      padding: 30px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px;
    }
    .message-section {
      background-color: #f9f9f9;
      border-left: 4px solid ${primaryColor};
      padding: 20px;
      margin: 20px 0;
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .document-details {
      margin: 30px 0;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .detail-row {
      width: 100%;
      padding: 8px 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #666666;
    }
    .detail-value {
      color: #333333;
      text-align: right;
    }
    .line-items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    .line-items-table th {
      background-color: ${primaryColor};
      color: #ffffff;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    .line-items-table td {
      padding: 12px;
      border-bottom: 1px solid #e5e5e5;
    }
    .line-items-table tr:last-child td {
      border-bottom: none;
    }
    .text-right {
      text-align: right;
    }
    .totals-section {
      margin: 30px 0;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .total-row {
      width: 100%;
      padding: 8px 0;
    }
    .total-row.grand-total {
      font-size: 20px;
      font-weight: 700;
      color: ${primaryColor};
      border-top: 2px solid ${primaryColor};
      padding-top: 12px;
      margin-top: 8px;
    }
    .footer {
      background-color: #f5f5f5;
      padding: 30px 40px;
      text-align: center;
      color: #666666;
      font-size: 14px;
    }
    .footer-company {
      margin-bottom: 15px;
    }
    .footer-contact {
      margin: 5px 0;
    }
    .alert-box {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 15px;
      margin: 20px 0;
      color: #856404;
    }
    .alert-box.info {
      background-color: #d1ecf1;
      border-color: #bee5eb;
      color: #0c5460;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 20px;
      }
      .header {
        padding: 20px;
      }
      .header h1 {
        font-size: 24px;
      }
      .line-items-table th,
      .line-items-table td {
        padding: 8px 4px;
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>${options.companyName}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <div class="footer-company">
        <strong>${options.companyName}</strong>
      </div>
      ${options.companyEmail ? `<div class="footer-contact">${options.companyEmail}</div>` : ''}
      ${options.companyPhone ? `<div class="footer-contact">${options.companyPhone}</div>` : ''}
      ${options.companyAddress ? `<div class="footer-contact">${options.companyAddress}</div>` : ''}
      <div style="margin-top: 20px; font-size: 12px; color: #999999;">
        Powered by Simple Slips - AI-Powered Financial Management
      </div>
    </div>
  </div>
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

  const expiryDate = quotation.expiryDate ? formatDate(quotation.expiryDate) : 'N/A';
  const daysUntilExpiry = quotation.expiryDate 
    ? Math.ceil((new Date(quotation.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const lineItemsHTML = lineItems.map(item => `
    <tr>
      <td>${item.description}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${formatCurrency(parseFloat(item.unitPrice))}</td>
      <td class="text-right"><strong>${formatCurrency(parseFloat(item.total))}</strong></td>
    </tr>
  `).join('');

  const content = `
    <h2 style="color: #333333; margin-top: 0;">Quotation ${quotation.quotationNumber}</h2>
    
    ${aiGeneratedMessage ? `
    <div class="message-section">
      ${aiGeneratedMessage}
    </div>
    ` : ''}

    ${daysUntilExpiry !== null && daysUntilExpiry <= 7 ? `
    <div class="alert-box">
      <strong>⏰ Time Sensitive:</strong> This quotation expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.
    </div>
    ` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
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

    <h3 style="color: #333333; margin-top: 40px;">Items</h3>
    <table class="line-items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0;">Subtotal:</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(parseFloat(quotation.subtotal))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">VAT (15%):</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(parseFloat(quotation.vatAmount))}</td>
            </tr>
            <tr>
              <td style="padding-top: 12px; border-top: 2px solid #0073AA; font-size: 20px; font-weight: 700; color: #0073AA;">Total:</td>
              <td style="padding-top: 12px; border-top: 2px solid #0073AA; font-size: 20px; font-weight: 700; color: #0073AA; text-align: right;">${formatCurrency(parseFloat(quotation.total))}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    ${quotation.notes ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #666666;">Notes</h4>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${quotation.notes}</p>
    </div>
    ` : ''}

    ${quotation.terms ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #666666;">Terms & Conditions</h4>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; font-size: 14px;">${quotation.terms}</p>
    </div>
    ` : ''}

    <div class="alert-box info">
      <strong>📄 Next Steps:</strong> Please review this quotation and let us know if you have any questions. We're happy to discuss any details or make adjustments as needed.
    </div>
  `;

  return getBaseEmailTemplate(content, {
    companyName,
    companyEmail,
    companyPhone,
    companyAddress,
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

  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : 'Upon receipt';
  const daysUntilDue = invoice.dueDate 
    ? Math.ceil((new Date(invoice.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= 7;

  const amountDue = parseFloat(invoice.total) - parseFloat(invoice.amountPaid);

  const lineItemsHTML = lineItems.map(item => `
    <tr>
      <td>${item.description}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${formatCurrency(parseFloat(item.unitPrice))}</td>
      <td class="text-right"><strong>${formatCurrency(parseFloat(item.total))}</strong></td>
    </tr>
  `).join('');

  const bankingDetails = businessProfile?.bankName && businessProfile?.accountNumber ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f0f8ff; border: 2px solid #0073AA; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #0073AA;">💳 Payment Details</h4>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0;"><strong>Bank Name:</strong></td>
          <td style="padding: 5px 0;">${businessProfile.bankName}</td>
        </tr>
        ${businessProfile.accountHolder ? `
        <tr>
          <td style="padding: 5px 0;"><strong>Account Holder:</strong></td>
          <td style="padding: 5px 0;">${businessProfile.accountHolder}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 5px 0;"><strong>Account Number:</strong></td>
          <td style="padding: 5px 0;"><strong>${businessProfile.accountNumber}</strong></td>
        </tr>
        ${businessProfile.branchCode ? `
        <tr>
          <td style="padding: 5px 0;"><strong>Branch Code:</strong></td>
          <td style="padding: 5px 0;">${businessProfile.branchCode}</td>
        </tr>
        ` : ''}
      </table>
      <p style="margin: 15px 0 0 0; font-size: 13px; color: #666;">Please use invoice number <strong>${invoice.invoiceNumber}</strong> as payment reference.</p>
    </div>
  ` : '';

  const content = `
    <h2 style="color: #333333; margin-top: 0;">Invoice ${invoice.invoiceNumber}</h2>
    
    ${aiGeneratedMessage ? `
    <div class="message-section">
      ${aiGeneratedMessage}
    </div>
    ` : ''}

    ${isOverdue ? `
    <div class="alert-box" style="background-color: #f8d7da; border-color: #f5c6cb; color: #721c24;">
      <strong>⚠️ Payment Overdue:</strong> This invoice was due ${Math.abs(daysUntilDue!)} day${Math.abs(daysUntilDue!) !== 1 ? 's' : ''} ago.
    </div>
    ` : isDueSoon ? `
    <div class="alert-box">
      <strong>⏰ Due Soon:</strong> This invoice is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.
    </div>
    ` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
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
              <td style="padding: 8px 0; color: #0073AA; font-size: 18px; text-align: right;"><strong>${formatCurrency(amountDue)}</strong></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    <h3 style="color: #333333; margin-top: 40px;">Items</h3>
    <table class="line-items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding: 15px 0;"></td></tr>
      <tr>
        <td style="padding: 20px; background-color: #f9f9f9;" bgcolor="#f9f9f9">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0;">Subtotal:</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(parseFloat(invoice.subtotal))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">VAT (15%):</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(parseFloat(invoice.vatAmount))}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">Total:</td>
              <td style="padding: 8px 0; text-align: right;">${formatCurrency(parseFloat(invoice.total))}</td>
            </tr>
            ${parseFloat(invoice.amountPaid) > 0 ? `
            <tr>
              <td style="padding: 8px 0;">Amount Paid:</td>
              <td style="padding: 8px 0; text-align: right; color: #28a745;">-${formatCurrency(parseFloat(invoice.amountPaid))}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding-top: 12px; border-top: 2px solid #0073AA; font-size: 20px; font-weight: 700; color: #0073AA;">Amount Due:</td>
              <td style="padding-top: 12px; border-top: 2px solid #0073AA; font-size: 20px; font-weight: 700; color: #0073AA; text-align: right;">${formatCurrency(amountDue)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="padding: 15px 0;"></td></tr>
    </table>

    ${bankingDetails}

    ${invoice.notes ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #666666;">Notes</h4>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${invoice.notes}</p>
    </div>
    ` : ''}

    ${invoice.terms ? `
    <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
      <h4 style="margin-top: 0; color: #666666;">Terms & Conditions</h4>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; font-size: 14px;">${invoice.terms}</p>
    </div>
    ` : ''}

    <div class="alert-box info">
      <strong>💼 Thank you for your business!</strong> If you have any questions about this invoice, please don't hesitate to contact us.
    </div>
  `;

  return getBaseEmailTemplate(content, {
    companyName,
    companyEmail,
    companyPhone,
    companyAddress,
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
    if (businessProfile?.accountType) text += `Account Type:    ${businessProfile.accountType}\n`;
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
