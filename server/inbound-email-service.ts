import { db } from "./db";
import { users, receipts, emailReceipts, inboundEmailLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { azureFormRecognizer } from "./azure-form-recognizer";
import { azureStorage } from "./azure-storage";
import { aiCategorizationService } from "./ai-categorization";
import { imagePreprocessor } from "./image-preprocessing";
import { emailService } from "./email-service";
import { log } from "./vite";
import crypto from "crypto";
import { convertPdfToImage, isPdfBuffer } from "./pdf-converter";
import { storage } from "./storage";
import OpenAI from "openai";
import { createCanvas } from "canvas";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface InboundEmailData {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: number;
  'attachment-info'?: string;
  [key: string]: any;
}

interface AttachmentInfo {
  filename: string;
  name: string;
  type: string;
  charset?: string;
  'content-id'?: string;
}

export class InboundEmailService {
  private receiptEmailDomain = 'receipts.simpleslips.app';

  generateReceiptEmailId(): string {
    return crypto.randomBytes(6).toString('hex').toLowerCase();
  }

  async getUserByReceiptEmailId(receiptEmailId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.receiptEmailId, receiptEmailId),
    });
    return user;
  }

  extractReceiptEmailId(toAddress: string): string | null {
    const angleBracketMatch = toAddress.match(/<([^>]+)>/);
    const emailPart = angleBracketMatch ? angleBracketMatch[1] : toAddress;
    
    const emailMatch = emailPart.match(/([a-z0-9]+)@receipts\.simpleslips\.(app|co\.za)/i);
    if (emailMatch) {
      return emailMatch[1].toLowerCase();
    }
    
    const simpleMatch = emailPart.match(/^([a-z0-9]+)@/i);
    return simpleMatch ? simpleMatch[1].toLowerCase() : null;
  }

  isValidImageType(contentType: string): boolean {
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf'
    ];
    return validTypes.some(type => contentType.toLowerCase().includes(type));
  }

  private static MIN_RECEIPT_SIZE_BYTES = 15000; // 15KB - real receipt photos are much larger
  private static MIN_INLINE_RECEIPT_SIZE_BYTES = 45000; // Inline receipts are often compressed screenshots/PDF previews

  private static SIGNATURE_FILENAME_PATTERNS = [
    /^image\d{3}\.\w+$/i,          // image001.png, image002.jpg
    /logo/i,                        // company-logo.png, logo.jpg
    /icon/i,                        // facebook-icon.png, mail-icon.png
    /banner/i,                      // email-banner.jpg
    /signature/i,                   // signature.png
    /badge/i,                       // badge.png
    /avatar/i,                      // avatar.jpg
    /^(?:facebook|twitter|linkedin|instagram|youtube|tiktok|x|whatsapp|telegram)/i,
    /social/i,                      // social-media.png
    /spacer/i,                      // spacer.gif
    /divider/i,                     // divider.png
    /^unnamed/i,                    // unnamed inline images
  ];

  private static RECEIPT_KEYWORDS = [
    'invoice', 'receipt', 'order', 'payment', 'purchase', 'transaction',
    'total', 'amount', 'paid', 'billing', 'statement', 'confirmation',
    'tax invoice', 'vat', 'subtotal', 'delivery', 'shipping',
    'your order', 'order confirmation', 'payment confirmation',
    'thank you for your', 'thanks for your order', 'proof of payment',
    'account statement', 'charge', 'refund', 'credit note',
    'quotation', 'quote', 'pro forma', 'proforma',
  ];

  private static RECEIPT_FILENAME_HINTS = [
    /receipt/i,
    /invoice/i,
    /order/i,
    /statement/i,
    /transaction/i,
    /payment/i,
    /proof/i,
    /bill/i,
    /tax/i,
    /slip/i,
    /pdf/i,
    /scan/i,
  ];

  private hasReceiptFilenameHint(filename: string): boolean {
    return InboundEmailService.RECEIPT_FILENAME_HINTS.some((pattern) => pattern.test(filename || ''));
  }

  private stripEmailSignature(text: string): string {
    if (!text) return text;

    const signatureMarkers = [
      /^\s*(thanks|thank you|kind regards|regards|best regards|warm regards|cheers|sincerely|sent from my)/i,
      /^\s*--\s*$/,
      /^\s*__+\s*$/,
      /^\s*this email and any attachments are confidential/i,
      /^\s*please consider the environment before printing/i,
      /^\s*powered by/i,
    ];

    const lines = text.split(/\r?\n/);
    let cutIndex = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (signatureMarkers.some((marker) => marker.test(line))) {
        cutIndex = i;
        break;
      }
    }

    return lines.slice(0, cutIndex).join('\n').trim();
  }

  private stripHtml(html: string): string {
    let text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, ' | ')
      .replace(/<\/th>/gi, ' | ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&rsquo;/gi, "'")
      .replace(/&lsquo;/gi, "'")
      .replace(/&rdquo;/gi, '"')
      .replace(/&ldquo;/gi, '"')
      .replace(/&mdash;/gi, '—')
      .replace(/&ndash;/gi, '–')
      .replace(/&#\d+;/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    return text;
  }

  isEmailBodyReceiptLike(subject: string, htmlBody?: string, textBody?: string): boolean {
    const subjectLower = (subject || '').toLowerCase();
    const normalizedBody = this.stripEmailSignature(textBody || (htmlBody ? this.stripHtml(htmlBody) : ''));
    const bodyText = normalizedBody.toLowerCase();
    const combined = subjectLower + ' ' + bodyText;

    let matchCount = 0;
    for (const keyword of InboundEmailService.RECEIPT_KEYWORDS) {
      if (combined.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    return matchCount >= 2;
  }


  private createEmailBodyReceiptPreviewImage(data: {
    storeName: string;
    total: string;
    receiptDate: Date;
    items: string[];
    subject: string;
  }): string {
    const width = 1200;
    const height = 1600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 44px Arial';
    ctx.fillText('Email Receipt Summary', 60, 90);

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 120);
    ctx.lineTo(width - 60, 120);
    ctx.stroke();

    let y = 190;
    const rowSpacing = 64;

    const drawField = (label: string, value: string) => {
      ctx.fillStyle = '#4b5563';
      ctx.font = 'bold 30px Arial';
      ctx.fillText(label, 60, y);

      ctx.fillStyle = '#111827';
      ctx.font = '30px Arial';
      ctx.fillText(value || '-', 300, y);
      y += rowSpacing;
    };

    drawField('Merchant', data.storeName || 'Unknown Store');
    drawField('Total', data.total || '0.00');
    drawField('Date', data.receiptDate.toISOString().slice(0, 10));

    const subjectText = (data.subject || '(No subject)').slice(0, 90);
    drawField('Subject', subjectText);

    y += 30;
    ctx.fillStyle = '#4b5563';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('Items', 60, y);
    y += 44;

    ctx.fillStyle = '#111827';
    ctx.font = '28px Arial';

    const itemList = data.items.length > 0 ? data.items.slice(0, 18) : ['(No line items extracted)'];
    for (const item of itemList) {
      const itemText = `• ${item}`.slice(0, 96);
      ctx.fillText(itemText, 80, y);
      y += 38;
      if (y > height - 120) break;
    }

    ctx.fillStyle = '#6b7280';
    ctx.font = '24px Arial';
    ctx.fillText('Source: Email body extraction', 60, height - 70);

    return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', { quality: 0.9 }).toString('base64')}`;
  }

  async extractReceiptFromEmailBody(
    userId: number,
    workspaceId: number,
    subject: string,
    htmlBody?: string,
    textBody?: string,
    emailReceiptId?: number
  ): Promise<{ success: boolean; receiptId?: number; error?: string }> {
    const bodyText = this.stripEmailSignature(textBody || (htmlBody ? this.stripHtml(htmlBody) : ''));

    if (!bodyText || bodyText.length < 50) {
      return { success: false, error: 'Email body too short to extract receipt data' };
    }

    const truncatedBody = bodyText.substring(0, 8000);

    log(`Attempting to extract receipt data from email body (${bodyText.length} chars)`, 'inbound-email');

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting receipt and invoice data from email text content. 
Extract the following fields from the email body text. This is typically a forwarded email receipt, invoice, order confirmation, or payment notification from a South African or international retailer/service.

Return a JSON object with these fields:
- storeName: The merchant/store/company name (string)
- total: The total amount paid as a string (just the number, no currency symbol, e.g. "299.99")
- date: The transaction date in ISO format (YYYY-MM-DD). If no date found, use today's date.
- items: An array of item descriptions (strings). Extract individual line items if visible. If none found, use an empty array.
- currency: The currency code (e.g. "ZAR", "USD"). Default to "ZAR" if South African.
- confidence: A number from 0 to 1 indicating how confident you are in the extraction.

If you cannot find a valid receipt/invoice/order in the text, return {"error": "No receipt data found"}.
Only return valid JSON, no markdown or explanation.`
          },
          {
            role: "user",
            content: `Subject: ${subject}\n\nEmail body:\n${truncatedBody}`
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        return { success: false, error: 'AI returned empty response' };
      }

      let parsed: any;
      try {
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        log(`Failed to parse AI response: ${content}`, 'inbound-email');
        return { success: false, error: 'Failed to parse AI extraction result' };
      }

      if (parsed.error) {
        log(`AI could not extract receipt: ${parsed.error}`, 'inbound-email');
        return { success: false, error: parsed.error };
      }

      const storeName = parsed.storeName || 'Unknown Store';
      const total = parsed.total || '0.00';
      const dateStr = parsed.date;
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

      let receiptDate: Date;
      try {
        receiptDate = dateStr ? new Date(dateStr) : new Date();
        if (isNaN(receiptDate.getTime())) receiptDate = new Date();
      } catch {
        receiptDate = new Date();
      }

      log(`AI extracted from email body: ${storeName}, R${total}, ${items.length} items, confidence: ${confidence}`, 'inbound-email');

      let previewImageBase64: string | null = null;
      let blobUrl: string | null = null;
      let blobName: string | null = null;

      try {
        previewImageBase64 = this.createEmailBodyReceiptPreviewImage({
          storeName,
          total,
          receiptDate,
          items,
          subject,
        });

        const uploadResult = await azureStorage.uploadFile(previewImageBase64, `email_receipt_${userId}_${Date.now()}.jpg`);
        if (uploadResult) {
          blobUrl = uploadResult.blobUrl;
          blobName = uploadResult.blobName;
          previewImageBase64 = null;
          log(`Uploaded email body preview image to Azure: ${blobName}`, 'inbound-email');
        }
      } catch (previewError: any) {
        log(`Failed to generate/upload email body preview image: ${previewError.message}`, 'inbound-email');
      }

      let category = 'other';
      try {
        const categorization = await aiCategorizationService.categorizeReceipt(
          storeName,
          items,
          total
        );
        category = categorization.category;
        log(`AI categorized as: ${category}`, 'inbound-email');
      } catch (catError: any) {
        log(`AI categorization failed, using default: ${catError.message}`, 'inbound-email');
      }

      let isPotentialDuplicate = false;
      try {
        if (storage.findDuplicateReceipts) {
          const duplicates = await storage.findDuplicateReceipts(userId, storeName, receiptDate, total);
          if (duplicates.length > 0) {
            isPotentialDuplicate = true;
            log(`Found ${duplicates.length} potential duplicate(s) for email body receipt: ${storeName}, ${total}`, 'inbound-email');
          }
        }
      } catch (dupError: any) {
        log(`Duplicate check failed: ${dupError.message}`, 'inbound-email');
      }

      const [receipt] = await db
        .insert(receipts)
        .values({
          userId,
          workspaceId,
          createdByUserId: userId,
          storeName,
          date: receiptDate,
          total,
          items,
          category: category as any,
          confidenceScore: Math.round(confidence * 100).toString(),
          blobUrl,
          blobName,
          imageData: blobUrl ? null : previewImageBase64,
          source: 'email',
          sourceEmailId: emailReceiptId || null,
          processedAt: new Date(),
          isPotentialDuplicate,
          notes: `Extracted from email body (no image attachment). Subject: ${subject}`,
        })
        .returning();

      log(`Created receipt ${receipt.id} from email body extraction${isPotentialDuplicate ? ' (flagged as potential duplicate)' : ''}`, 'inbound-email');

      return { success: true, receiptId: receipt.id };

    } catch (error: any) {
      log(`AI email body extraction failed: ${error.message}`, 'inbound-email');
      return { success: false, error: `AI extraction failed: ${error.message}` };
    }
  }

  isLikelySignatureImage(attachment: { content: Buffer; contentType: string; filename: string; size?: number; contentId?: string }): { isSignature: boolean; reason: string } {
    const size = attachment.size || attachment.content.length;
    const filename = attachment.filename || '';
    const contentType = attachment.contentType.toLowerCase();

    if (contentType.includes('application/pdf')) {
      return { isSignature: false, reason: '' };
    }

    const hasReceiptFilenameHint = this.hasReceiptFilenameHint(filename);

    if (attachment.contentId) {
      if (size < InboundEmailService.MIN_INLINE_RECEIPT_SIZE_BYTES) {
        return {
          isSignature: true,
          reason: `Inline image too small to be a receipt (${Math.round(size / 1024)}KB < ${Math.round(InboundEmailService.MIN_INLINE_RECEIPT_SIZE_BYTES / 1024)}KB minimum)`
        };
      }

      if (!hasReceiptFilenameHint && size < InboundEmailService.MIN_INLINE_RECEIPT_SIZE_BYTES * 2) {
        return {
          isSignature: true,
          reason: `Inline image missing receipt filename hint and likely decorative (${Math.round(size / 1024)}KB)`
        };
      }
    }

    if (size < InboundEmailService.MIN_RECEIPT_SIZE_BYTES) {
      return { isSignature: true, reason: `Too small for a receipt (${Math.round(size / 1024)}KB < ${Math.round(InboundEmailService.MIN_RECEIPT_SIZE_BYTES / 1024)}KB minimum)` };
    }

    for (const pattern of InboundEmailService.SIGNATURE_FILENAME_PATTERNS) {
      if (pattern.test(filename) && !hasReceiptFilenameHint) {
        return { isSignature: true, reason: `Filename matches signature pattern: "${filename}"` };
      }
    }

    return { isSignature: false, reason: '' };
  }

  private async createLog(data: {
    fromEmail: string;
    toAddress: string;
    receiptEmailId?: string | null;
    userId?: number | null;
    subject?: string | null;
    attachmentCount: number;
    validAttachmentCount?: number;
    receiptsCreated?: number;
    status: string;
    errorMessage?: string | null;
    processingTimeMs?: number | null;
    htmlBody?: string | null;
    textBody?: string | null;
  }) {
    try {
      await db.insert(inboundEmailLogs).values({
        fromEmail: data.fromEmail,
        toAddress: data.toAddress,
        receiptEmailId: data.receiptEmailId || null,
        userId: data.userId || null,
        subject: data.subject || null,
        attachmentCount: data.attachmentCount,
        validAttachmentCount: data.validAttachmentCount || 0,
        receiptsCreated: data.receiptsCreated || 0,
        status: data.status,
        errorMessage: data.errorMessage || null,
        processingTimeMs: data.processingTimeMs || null,
        htmlBody: data.htmlBody || null,
        textBody: data.textBody || null,
      });
    } catch (logError: any) {
      log(`Failed to write inbound email log: ${logError.message}`, 'inbound-email');
    }
  }


  private async tryEmailBodyFallbackForFailedPdf(
    user: { id: number; workspaceId: number | null },
    emailData: InboundEmailData,
    emailReceiptId: number,
    attachmentFilename: string,
    failureReason: string
  ): Promise<{ success: boolean; receiptId?: number }> {
    log(`PDF attachment processing failed (${attachmentFilename}): ${failureReason || 'unknown error'}`, 'inbound-email');
    log('PDF processing failed - attempting fallback to email body extraction...', 'inbound-email');

    const hasReceiptContent = this.isEmailBodyReceiptLike(emailData.subject, emailData.html, emailData.text);
    if (!hasReceiptContent) {
      log('Email body fallback skipped because body does not look receipt-like', 'inbound-email');
      return { success: false };
    }

    const bodyResult = await this.extractReceiptFromEmailBody(
      user.id,
      user.workspaceId!,
      emailData.subject,
      emailData.html,
      emailData.text,
      emailReceiptId
    );

    if (bodyResult.success && bodyResult.receiptId) {
      log(`Email body fallback succeeded for failed PDF attachment ${attachmentFilename}`, 'inbound-email');
      return { success: true, receiptId: bodyResult.receiptId };
    }

    log(`Email body fallback failed after PDF failure: ${bodyResult.error || 'unknown error'}`, 'inbound-email');
    return { success: false };
  }

  async processInboundEmail(
    emailData: InboundEmailData,
    attachments: Map<string, { content: Buffer; contentType: string; filename: string; size?: number; contentId?: string }>
  ): Promise<{ success: boolean; receiptId?: number; error?: string }> {
    const startTime = Date.now();
    const totalAttachments = attachments.size;

    try {
      log(`Processing inbound email from: ${emailData.from} to: ${emailData.to}`, 'inbound-email');

      const emailBodyHtml = emailData.html || null;
      const emailBodyText = emailData.text || null;

      const receiptEmailId = this.extractReceiptEmailId(emailData.to);
      if (!receiptEmailId) {
        log(`Could not extract receipt email ID from: ${emailData.to}`, 'inbound-email');
        await this.createLog({
          fromEmail: emailData.from,
          toAddress: emailData.to,
          attachmentCount: totalAttachments,
          status: 'invalid_address',
          errorMessage: 'Could not extract receipt email ID from address',
          processingTimeMs: Date.now() - startTime,
          htmlBody: emailBodyHtml,
          textBody: emailBodyText,
        });
        return { success: false, error: 'Invalid recipient address format' };
      }

      const user = await this.getUserByReceiptEmailId(receiptEmailId);
      if (!user) {
        log(`No user found for receipt email ID: ${receiptEmailId}`, 'inbound-email');
        await this.createLog({
          fromEmail: emailData.from,
          toAddress: emailData.to,
          receiptEmailId,
          subject: emailData.subject,
          attachmentCount: totalAttachments,
          status: 'user_not_found',
          errorMessage: `No user found for receipt email ID: ${receiptEmailId}`,
          processingTimeMs: Date.now() - startTime,
          htmlBody: emailBodyHtml,
          textBody: emailBodyText,
        });
        return { success: false, error: 'Unknown recipient' };
      }

      log(`Found user ${user.id} (${user.username}) for receipt email ID: ${receiptEmailId}`, 'inbound-email');

      const emailMessageId = `inbound_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const [emailReceiptRecord] = await db
        .insert(emailReceipts)
        .values({
          userId: user.id,
          emailId: emailMessageId,
          fromEmail: emailData.from,
          subject: emailData.subject || '(No subject)',
          receivedAt: new Date(),
          processed: false,
        })
        .returning();

      const validAttachments: Array<{ content: Buffer; contentType: string; filename: string; size?: number; contentId?: string }> = [];
      let skippedSignatures = 0;
      
      attachments.forEach((attachment, key) => {
        if (!this.isValidImageType(attachment.contentType)) {
          log(`Skipping non-image attachment: ${attachment.filename} (${attachment.contentType})`, 'inbound-email');
          return;
        }

        const signatureCheck = this.isLikelySignatureImage(attachment);
        if (signatureCheck.isSignature) {
          skippedSignatures++;
          log(`Skipping signature/decorative image: ${attachment.filename} - ${signatureCheck.reason}`, 'inbound-email');
          return;
        }

        validAttachments.push(attachment);
        log(`Found valid receipt attachment: ${attachment.filename} (${attachment.contentType}, ${Math.round((attachment.size || attachment.content.length) / 1024)}KB)`, 'inbound-email');
      });
      
      if (skippedSignatures > 0) {
        log(`Filtered out ${skippedSignatures} signature/decorative image(s)`, 'inbound-email');
      }

      if (validAttachments.length === 0) {
        log(`No valid attachments found. Checking email body for receipt content...`, 'inbound-email');

        const hasReceiptContent = this.isEmailBodyReceiptLike(emailData.subject, emailData.html, emailData.text);

        if (hasReceiptContent) {
          log(`Email body looks like a receipt/invoice - attempting AI extraction`, 'inbound-email');

          const bodyResult = await this.extractReceiptFromEmailBody(
            user.id,
            user.workspaceId!,
            emailData.subject,
            emailData.html,
            emailData.text,
            emailReceiptRecord.id
          );

          if (bodyResult.success && bodyResult.receiptId) {
            await db
              .update(emailReceipts)
              .set({
                processed: true,
                receiptId: bodyResult.receiptId,
              })
              .where(eq(emailReceipts.id, emailReceiptRecord.id));

            await this.createLog({
              fromEmail: emailData.from,
              toAddress: emailData.to,
              receiptEmailId,
              userId: user.id,
              subject: emailData.subject,
              attachmentCount: totalAttachments,
              validAttachmentCount: 0,
              receiptsCreated: 1,
              status: 'success_email_body',
              errorMessage: null,
              processingTimeMs: Date.now() - startTime,
              htmlBody: emailBodyHtml,
              textBody: emailBodyText,
            });

            if (user.email) {
              await this.sendProcessingSuccessEmail(user.email, user.username, 1);
            }

            return { success: true, receiptId: bodyResult.receiptId };
          } else {
            log(`Email body extraction failed: ${bodyResult.error}`, 'inbound-email');
          }
        } else {
          log(`Email body does not appear to contain receipt/invoice content`, 'inbound-email');
        }

        await db
          .update(emailReceipts)
          .set({
            processed: true,
            errorMessage: 'No valid receipt images found in email attachments and email body extraction failed',
          })
          .where(eq(emailReceipts.id, emailReceiptRecord.id));

        await this.createLog({
          fromEmail: emailData.from,
          toAddress: emailData.to,
          receiptEmailId,
          userId: user.id,
          subject: emailData.subject,
          attachmentCount: totalAttachments,
          validAttachmentCount: 0,
          status: 'no_attachments',
          errorMessage: hasReceiptContent 
            ? 'Email body looked like a receipt but AI extraction failed' 
            : 'No valid receipt images found and email body does not contain receipt content',
          processingTimeMs: Date.now() - startTime,
          htmlBody: emailBodyHtml,
          textBody: emailBodyText,
        });

        if (user.email) {
          await this.sendProcessingFailureEmail(
            user.email,
            user.username,
            'No receipt images found',
            'We couldn\'t find any receipt images in your email. If your receipt is embedded in the email body, we tried to extract it but couldn\'t find enough data. Please attach a photo or PDF of your receipt and try again.'
          );
        }

        return { success: false, error: 'No valid image attachments found' };
      }

      const processedReceipts: number[] = [];
      let emailBodyFallbackUsed = false;

      for (const attachment of validAttachments) {
        const isPdfAttachment = attachment.contentType === 'application/pdf' || isPdfBuffer(attachment.content);

        try {
          const result = await this.processAttachment(user.id, user.workspaceId!, attachment, emailReceiptRecord.id);
          if (result.receiptId) {
            processedReceipts.push(result.receiptId);
            continue;
          }

          if (!result.success && isPdfAttachment && !emailBodyFallbackUsed) {
            const fallbackResult = await this.tryEmailBodyFallbackForFailedPdf(
              user,
              emailData,
              emailReceiptRecord.id,
              attachment.filename,
              result.error || 'unknown error'
            );

            if (fallbackResult.receiptId) {
              processedReceipts.push(fallbackResult.receiptId);
              emailBodyFallbackUsed = true;
            }
          }
        } catch (attachmentError: any) {
          log(`Error processing attachment ${attachment.filename}: ${attachmentError.message}`, 'inbound-email');

          if (isPdfAttachment && !emailBodyFallbackUsed) {
            const fallbackResult = await this.tryEmailBodyFallbackForFailedPdf(
              user,
              emailData,
              emailReceiptRecord.id,
              attachment.filename,
              attachmentError.message || 'unknown error'
            );

            if (fallbackResult.receiptId) {
              processedReceipts.push(fallbackResult.receiptId);
              emailBodyFallbackUsed = true;
            }
          }
        }
      }

      if (processedReceipts.length > 0) {
        await db
          .update(emailReceipts)
          .set({
            processed: true,
            receiptId: processedReceipts[0],
          })
          .where(eq(emailReceipts.id, emailReceiptRecord.id));

        const status = processedReceipts.length === validAttachments.length ? 'success' : 'partial';
        await this.createLog({
          fromEmail: emailData.from,
          toAddress: emailData.to,
          receiptEmailId,
          userId: user.id,
          subject: emailData.subject,
          attachmentCount: totalAttachments,
          validAttachmentCount: validAttachments.length,
          receiptsCreated: processedReceipts.length,
          status,
          errorMessage: status === 'partial' ? `${validAttachments.length - processedReceipts.length} attachment(s) failed to process` : null,
          processingTimeMs: Date.now() - startTime,
          htmlBody: emailBodyHtml,
          textBody: emailBodyText,
        });

        if (user.email) {
          await this.sendProcessingSuccessEmail(
            user.email,
            user.username,
            processedReceipts.length
          );
        }

        return { success: true, receiptId: processedReceipts[0] };
      } else {
        await db
          .update(emailReceipts)
          .set({
            processed: true,
            errorMessage: 'Failed to process receipt images',
          })
          .where(eq(emailReceipts.id, emailReceiptRecord.id));

        await this.createLog({
          fromEmail: emailData.from,
          toAddress: emailData.to,
          receiptEmailId,
          userId: user.id,
          subject: emailData.subject,
          attachmentCount: totalAttachments,
          validAttachmentCount: validAttachments.length,
          receiptsCreated: 0,
          status: 'failed',
          errorMessage: 'All attachments failed to process (OCR/upload errors)',
          processingTimeMs: Date.now() - startTime,
          htmlBody: emailBodyHtml,
          textBody: emailBodyText,
        });

        return { success: false, error: 'Failed to process receipt images' };
      }

    } catch (error: any) {
      log(`Error processing inbound email: ${error.message}`, 'inbound-email');
      await this.createLog({
        fromEmail: emailData.from || 'unknown',
        toAddress: emailData.to || 'unknown',
        subject: emailData.subject,
        attachmentCount: totalAttachments,
        status: 'failed',
        errorMessage: `Unhandled error: ${error.message}`,
        processingTimeMs: Date.now() - startTime,
        htmlBody: emailData.html || null,
        textBody: emailData.text || null,
      });
      return { success: false, error: error.message };
    }
  }

  private async processAttachment(
    userId: number,
    workspaceId: number,
    attachment: { content: Buffer; contentType: string; filename: string },
    emailReceiptId: number
  ): Promise<{ success: boolean; receiptId?: number; error?: string }> {
    try {
      log(`Processing attachment: ${attachment.filename}`, 'inbound-email');

      let imageBase64: string;

      if (attachment.contentType === 'application/pdf' || isPdfBuffer(attachment.content)) {
        log('PDF attachment detected - converting to image...', 'inbound-email');
        try {
          imageBase64 = await convertPdfToImage(attachment.content);
          log('PDF successfully converted to image', 'inbound-email');
        } catch (pdfError: any) {
          log(`PDF conversion failed: ${pdfError.message}`, 'inbound-email');
          throw new Error(`Failed to process PDF: ${pdfError.message}`);
        }
      } else {
        const rawBase64 = `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`;
        imageBase64 = await imagePreprocessor.enhanceImage(rawBase64);
      }

      log('Running OCR on attachment...', 'inbound-email');
      const ocrResult = await azureFormRecognizer.analyzeReceipt(imageBase64);

      if (!ocrResult) {
        throw new Error('OCR failed to extract receipt data');
      }

      const { storeName, total, date, items, confidenceScore } = ocrResult;

      log(`OCR extracted: ${storeName}, R${total}, ${items?.length || 0} items`, 'inbound-email');

      let category = 'other';
      try {
        const categorization = await aiCategorizationService.categorizeReceipt(
          storeName,
          items || [],
          total || '0'
        );
        category = categorization.category;
        log(`AI categorized as: ${category}`, 'inbound-email');
      } catch (catError: any) {
        log(`AI categorization failed, using default: ${catError.message}`, 'inbound-email');
      }

      let blobUrl: string | null = null;
      let blobName: string | null = null;

      try {
        const uploadResult = await azureStorage.uploadFile(imageBase64, `receipt_${userId}_${Date.now()}.jpg`);
        if (uploadResult) {
          blobUrl = uploadResult.blobUrl;
          blobName = uploadResult.blobName;
          log(`Uploaded to Azure: ${blobName}`, 'inbound-email');
        }
      } catch (uploadError: any) {
        log(`Azure upload failed, storing locally: ${uploadError.message}`, 'inbound-email');
      }

      let isPotentialDuplicate = false;
      const receiptDate = date ? new Date(date) : new Date();
      const receiptTotal = total || '0.00';
      const receiptStoreName = storeName || 'Unknown Store';

      try {
        if (storage.findDuplicateReceipts) {
          const duplicates = await storage.findDuplicateReceipts(userId, receiptStoreName, receiptDate, receiptTotal);
          if (duplicates.length > 0) {
            isPotentialDuplicate = true;
            log(`Found ${duplicates.length} potential duplicate(s) for emailed receipt: ${receiptStoreName}, ${receiptTotal}`, 'inbound-email');
          }
        }
      } catch (dupError: any) {
        log(`Duplicate check failed, proceeding anyway: ${dupError.message}`, 'inbound-email');
      }

      const [receipt] = await db
        .insert(receipts)
        .values({
          userId,
          workspaceId,
          createdByUserId: userId,
          storeName: receiptStoreName,
          date: receiptDate,
          total: receiptTotal,
          items: items || [],
          category: category as any,
          confidenceScore: confidenceScore || null,
          blobUrl,
          blobName,
          imageData: blobUrl ? null : imageBase64,
          source: 'email',
          sourceEmailId: emailReceiptId,
          processedAt: new Date(),
          isPotentialDuplicate,
        })
        .returning();

      log(`Created receipt ${receipt.id} from email attachment${isPotentialDuplicate ? ' (flagged as potential duplicate)' : ''}`, 'inbound-email');

      return { success: true, receiptId: receipt.id };

    } catch (error: any) {
      log(`Error processing attachment: ${error.message}`, 'inbound-email');
      return { success: false, error: error.message };
    }
  }

  private async sendProcessingSuccessEmail(
    email: string,
    username: string,
    receiptCount: number
  ): Promise<void> {
    try {
      await emailService.sendReceiptImportConfirmation(email, username, receiptCount);
    } catch (error: any) {
      log(`Failed to send success email: ${error.message}`, 'inbound-email');
    }
  }

  private async sendProcessingFailureEmail(
    email: string,
    username: string,
    errorTitle: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await emailService.sendReceiptImportFailure(email, username, errorTitle, errorMessage);
    } catch (error: any) {
      log(`Failed to send failure email: ${error.message}`, 'inbound-email');
    }
  }
}

export const inboundEmailService = new InboundEmailService();
