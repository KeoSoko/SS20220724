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
      });
    } catch (logError: any) {
      log(`Failed to write inbound email log: ${logError.message}`, 'inbound-email');
    }
  }

  async processInboundEmail(
    emailData: InboundEmailData,
    attachments: Map<string, { content: Buffer; contentType: string; filename: string }>
  ): Promise<{ success: boolean; receiptId?: number; error?: string }> {
    const startTime = Date.now();
    const totalAttachments = attachments.size;

    try {
      log(`Processing inbound email from: ${emailData.from} to: ${emailData.to}`, 'inbound-email');

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

      const validAttachments: Array<{ content: Buffer; contentType: string; filename: string }> = [];
      
      attachments.forEach((attachment, key) => {
        if (this.isValidImageType(attachment.contentType)) {
          validAttachments.push(attachment);
          log(`Found valid attachment: ${attachment.filename} (${attachment.contentType})`, 'inbound-email');
        } else {
          log(`Skipping non-image attachment: ${attachment.filename} (${attachment.contentType})`, 'inbound-email');
        }
      });

      if (validAttachments.length === 0) {
        await db
          .update(emailReceipts)
          .set({
            processed: true,
            errorMessage: 'No valid receipt images found in email attachments',
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
          errorMessage: 'No valid receipt images found in email attachments',
          processingTimeMs: Date.now() - startTime,
        });

        if (user.email) {
          await this.sendProcessingFailureEmail(
            user.email,
            user.username,
            'No receipt images found',
            'We couldn\'t find any receipt images in your email. Please attach a photo or PDF of your receipt and try again.'
          );
        }

        return { success: false, error: 'No valid image attachments found' };
      }

      const processedReceipts: number[] = [];

      for (const attachment of validAttachments) {
        try {
          const result = await this.processAttachment(user.id, user.workspaceId!, attachment, emailReceiptRecord.id);
          if (result.receiptId) {
            processedReceipts.push(result.receiptId);
          }
        } catch (attachmentError: any) {
          log(`Error processing attachment ${attachment.filename}: ${attachmentError.message}`, 'inbound-email');
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
      });
      return { success: false, error: error.message };
    }
  }

  private async processAttachment(
    userId: number,
    workspaceId: number,
    attachment: { content: Buffer; contentType: string; filename: string },
    emailReceiptId: number
  ): Promise<{ success: boolean; receiptId?: number }> {
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
      return { success: false };
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
