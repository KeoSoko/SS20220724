import { db } from "./db";
import { users, receipts, emailReceipts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { azureFormRecognizer } from "./azure-form-recognizer";
import { azureStorage } from "./azure-storage";
import { aiCategorizationService } from "./ai-categorization";
import { imagePreprocessor } from "./image-preprocessing";
import { emailService } from "./email-service";
import { log } from "./vite";
import crypto from "crypto";

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
    // Handle various email formats:
    // 1. Simple: e0e73ae6c369@receipts.simpleslips.app
    // 2. With display name: Display Name <e0e73ae6c369@receipts.simpleslips.app>
    // 3. Outlook format: "e0e73ae6c369@receipts.simpleslips.app"<e0e73ae6c369@receipts.simpleslips.app>
    // 4. Multiple recipients separated by comma
    
    // First, try to extract email from angle brackets (most common format from email clients)
    const angleBracketMatch = toAddress.match(/<([^>]+)>/);
    const emailPart = angleBracketMatch ? angleBracketMatch[1] : toAddress;
    
    // Now extract the local part (before @) from the email
    const emailMatch = emailPart.match(/([a-z0-9]+)@receipts\.simpleslips\.(app|co\.za)/i);
    if (emailMatch) {
      return emailMatch[1].toLowerCase();
    }
    
    // Fallback: try to find any alphanumeric string followed by @ at the start
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

  async processInboundEmail(
    emailData: InboundEmailData,
    attachments: Map<string, { content: Buffer; contentType: string; filename: string }>
  ): Promise<{ success: boolean; receiptId?: number; error?: string }> {
    try {
      log(`Processing inbound email from: ${emailData.from} to: ${emailData.to}`, 'inbound-email');

      const receiptEmailId = this.extractReceiptEmailId(emailData.to);
      if (!receiptEmailId) {
        log(`Could not extract receipt email ID from: ${emailData.to}`, 'inbound-email');
        return { success: false, error: 'Invalid recipient address format' };
      }

      const user = await this.getUserByReceiptEmailId(receiptEmailId);
      if (!user) {
        log(`No user found for receipt email ID: ${receiptEmailId}`, 'inbound-email');
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
          const result = await this.processAttachment(user.id, attachment, emailReceiptRecord.id);
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

        return { success: false, error: 'Failed to process receipt images' };
      }

    } catch (error: any) {
      log(`Error processing inbound email: ${error.message}`, 'inbound-email');
      return { success: false, error: error.message };
    }
  }

  private async processAttachment(
    userId: number,
    attachment: { content: Buffer; contentType: string; filename: string },
    emailReceiptId: number
  ): Promise<{ success: boolean; receiptId?: number }> {
    try {
      log(`Processing attachment: ${attachment.filename}`, 'inbound-email');

      let imageBase64: string;

      if (attachment.contentType === 'application/pdf') {
        log('PDF attachment detected - will process directly with OCR', 'inbound-email');
        imageBase64 = `data:application/pdf;base64,${attachment.content.toString('base64')}`;
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

      const [receipt] = await db
        .insert(receipts)
        .values({
          userId,
          storeName: storeName || 'Unknown Store',
          date: date ? new Date(date) : new Date(),
          total: total || '0.00',
          items: items || [],
          category: category as any,
          confidenceScore: confidenceScore || null,
          blobUrl,
          blobName,
          imageData: blobUrl ? null : imageBase64,
          source: 'email',
          sourceEmailId: emailReceiptId,
          processedAt: new Date(),
        })
        .returning();

      log(`Created receipt ${receipt.id} from email attachment`, 'inbound-email');

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
