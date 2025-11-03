import { MailService } from '@sendgrid/mail';
import type { Receipt, ReceiptShare, EmailReceipt, Quotation, Invoice, Client, BusinessProfile, LineItem } from '../shared/schema.js';
import { aiEmailAssistant } from './ai-email-assistant.js';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not found - email features will be disabled");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

export class EmailService {
  private fromEmail = 'keo@nine28.co.za';
  private appUrl = process.env.APP_URL || 'https://simpleslips.app';

  /**
   * Send email verification email
   */
  async sendEmailVerification(email: string, username: string, verificationToken: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send email verification - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const verificationUrl = `${this.appUrl}/verify-email?token=${verificationToken}`;
      
      const emailData = {
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        templateId: 'd-f13c8e5c302e4405904fa5366443f766',
        dynamicTemplateData: {
          username: username,
          verificationUrl: verificationUrl,
          appUrl: this.appUrl
        },
        trackingSettings: {
          clickTracking: {
            enable: false,
            enableText: false
          },
          openTracking: {
            enable: false
          }
        }
      };
      
      console.log(`[EMAIL] Sending verification email to: ${email} from: ${this.fromEmail}`);
      console.log(`[EMAIL] Verification URL being sent: ${verificationUrl}`);
      console.log(`[EMAIL] App URL: ${this.appUrl}`);
      const result = await mailService.send(emailData);
      console.log(`[EMAIL] SendGrid response:`, result);
      
      // Log the message ID for tracking
      if (result && result[0] && result[0].headers && result[0].headers['x-message-id']) {
        console.log(`[EMAIL] Message ID: ${result[0].headers['x-message-id']}`);
        console.log(`[EMAIL] Status: ${result[0].statusCode}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to send email verification:', error);
      return false;
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, username: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send welcome email - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      await mailService.send({
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: 'Your Simple Slips account is ready!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">AI-Powered Receipt Management</p>
            </div>
            
            <h2 style="color: #333;">You're all set, ${username}! 🎉</h2>
            <p>Your email has been verified and your Simple Slips account is ready to use.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${this.appUrl}/home" 
                 style="background: #0073AA; color: white; padding: 14px 30px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold;">
                Get Started Now
              </a>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
              <h3 style="color: #333; margin-top: 0;">Quick Start Guide:</h3>
              <ol style="color: #666; line-height: 1.8;">
                <li><strong>Upload your first receipt</strong> - Use the scan button to capture receipts</li>
                <li><strong>Review AI categorization</strong> - Our AI automatically categorizes expenses</li>
                <li><strong>Set up budgets</strong> - Track spending against monthly limits</li>
                <li><strong>Explore tax features</strong> - Maximize deductions with AI insights</li>
              </ol>
            </div>
            
            <p>Need help? Visit our <a href="${this.appUrl}/tax-pros" style="color: #0073AA;">Tax Professionals</a> section to connect with certified accountants.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              Welcome to Simple Slips - your AI-powered financial management companion.
            </p>
          </div>
        `,
        text: `
You're all set, ${username}!

Your email has been verified and your Simple Slips account is ready to use.

Quick Start Guide:
1. Upload your first receipt - Use the scan button to capture receipts
2. Review AI categorization - Our AI automatically categorizes expenses  
3. Set up budgets - Track spending against monthly limits
4. Explore tax features - Maximize deductions with AI insights

Get started: ${this.appUrl}/home

Need help? Visit our Tax Professionals section to connect with certified accountants.
        `
      });

      return true;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, username: string, resetToken: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send password reset - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;
      
      await mailService.send({
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: 'Reset your Simple Slips password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">Password Reset Request</p>
            </div>
            
            <h2 style="color: #333;">Reset Your Password</h2>
            <p>Hi ${username},</p>
            <p>We received a request to reset your Simple Slips password. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: #0073AA; color: white; padding: 14px 30px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetUrl}" style="color: #0073AA; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404;">
                <strong>Security Notice:</strong> This link expires in 1 hour. If you didn't request this reset, please ignore this email.
              </p>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This email was sent from Simple Slips. For security reasons, this link will expire in 1 hour.
            </p>
          </div>
        `,
        text: `
Reset Your Password

Hi ${username},

We received a request to reset your Simple Slips password. Click this link to create a new password:
${resetUrl}

Security Notice: This link expires in 1 hour. If you didn't request this reset, please ignore this email.
        `
      });

      return true;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Send receipt sharing notification
   */
  async sendReceiptShare(
    share: ReceiptShare,
    receipt: Receipt,
    sharedByUsername: string
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send email - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const shareUrl = `${this.appUrl}/shared-receipt/${share.id}`;
      
      await mailService.send({
        to: share.sharedWithEmail,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: `${sharedByUsername} shared a receipt with you`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Receipt Shared</h2>
            <p>Hello!</p>
            <p><strong>${sharedByUsername}</strong> has shared a receipt with you:</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>${receipt.storeName}</h3>
              <p><strong>Date:</strong> ${receipt.date.toLocaleDateString()}</p>
              <p><strong>Total:</strong> R ${receipt.total}</p>
              <p><strong>Category:</strong> ${receipt.category}</p>
            </div>
            
            <p>
              <a href="${shareUrl}" 
                 style="background: #007bff; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                View Receipt
              </a>
            </p>
            
            <p style="color: #666; font-size: 14px;">
              ${share.expiresAt ? `This link expires on ${share.expiresAt.toLocaleDateString()}` : 'This link does not expire'}
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This email was sent from Receipt Manager. If you believe this was sent in error, please ignore this email.
            </p>
          </div>
        `,
        text: `
${sharedByUsername} has shared a receipt with you:

Store: ${receipt.storeName}
Date: ${receipt.date.toLocaleDateString()}
Total: R ${receipt.total}
Category: ${receipt.category}

View the receipt: ${shareUrl}

${share.expiresAt ? `This link expires on ${share.expiresAt.toLocaleDateString()}` : 'This link does not expire'}
        `
      });

      return true;
    } catch (error) {
      console.error('Failed to send receipt share email:', error);
      return false;
    }
  }

  /**
   * Send budget alert notification
   */
  async sendBudgetAlert(
    userEmail: string,
    budgetName: string,
    category: string,
    currentSpent: number,
    monthlyLimit: number,
    percentageUsed: number
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send email - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const alertType = percentageUsed >= 100 ? 'exceeded' : 'approaching';
      const alertColor = percentageUsed >= 100 ? '#dc3545' : '#ffc107';
      
      await mailService.send({
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: `Budget Alert: ${budgetName} ${alertType}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${alertColor};">Budget Alert</h2>
            <p>Your budget <strong>"${budgetName}"</strong> has ${alertType} its limit.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${alertColor};">
              <h3>${category.charAt(0).toUpperCase() + category.slice(1)} Budget</h3>
              <p><strong>Spent:</strong> R ${currentSpent.toFixed(2)}</p>
              <p><strong>Budget:</strong> R ${monthlyLimit.toFixed(2)}</p>
              <p><strong>Usage:</strong> ${percentageUsed.toFixed(1)}%</p>
              
              <div style="background: #e9ecef; border-radius: 10px; height: 20px; margin: 10px 0;">
                <div style="background: ${alertColor}; height: 20px; border-radius: 10px; width: ${Math.min(percentageUsed, 100)}%;"></div>
              </div>
            </div>
            
            <p>
              <a href="${this.appUrl}/budgets" 
                 style="background: #007bff; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Manage Budgets
              </a>
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              You can disable budget alerts in your account settings.
            </p>
          </div>
        `,
        text: `
Budget Alert: ${budgetName} ${alertType}

Your ${category} budget has ${alertType} its limit:
- Spent: R ${currentSpent.toFixed(2)}
- Budget: R ${monthlyLimit.toFixed(2)} 
- Usage: ${percentageUsed.toFixed(1)}%

Manage your budgets: ${this.appUrl}/budgets
        `
      });

      return true;
    } catch (error) {
      console.error('Failed to send budget alert email:', error);
      return false;
    }
  }

  /**
   * Send backup reminder
   */
  async sendBackupReminder(
    userEmail: string,
    username: string,
    totalReceipts: number,
    lastBackupDate?: Date
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send email - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      await mailService.send({
        to: userEmail,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: 'Time to backup your receipts',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Backup Reminder</h2>
            <p>Hi ${username}!</p>
            <p>It's been a while since your last backup. Protect your financial data by creating a backup today.</p>
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Your Account Summary</h3>
              <p><strong>Total Receipts:</strong> ${totalReceipts}</p>
              <p><strong>Last Backup:</strong> ${lastBackupDate ? lastBackupDate.toLocaleDateString() : 'Never'}</p>
            </div>
            
            <p>
              <a href="${this.appUrl}/settings" 
                 style="background: #28a745; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Create Backup
              </a>
            </p>
            
            <p style="color: #666; font-size: 14px;">
              Regular backups ensure you never lose your important financial records.
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              You can disable backup reminders in your account settings.
            </p>
          </div>
        `,
        text: `
Backup Reminder

Hi ${username}!

It's time to backup your receipts. You currently have ${totalReceipts} receipts stored.
Last backup: ${lastBackupDate ? lastBackupDate.toLocaleDateString() : 'Never'}

Create a backup: ${this.appUrl}/settings
        `
      });

      return true;
    } catch (error) {
      console.error('Failed to send backup reminder:', error);
      return false;
    }
  }

  /**
   * Process incoming email receipt (webhook endpoint)
   */
  async processEmailReceipt(emailData: {
    from: string;
    subject: string;
    body: string;
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
    }>;
  }): Promise<EmailReceipt | null> {
    try {
      // This would be called by a webhook from SendGrid or email provider
      // For now, return basic structure - full implementation would require
      // parsing email content and extracting receipt data
      
      return {
        id: 0,
        userId: 0, // Would need to determine from forwarding address
        emailId: `email_${Date.now()}`,
        fromEmail: emailData.from,
        subject: emailData.subject,
        receivedAt: new Date(),
        processed: false,
        receiptId: null,
        errorMessage: null,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('Failed to process email receipt:', error);
      return null;
    }
  }

  /**
   * Send quotation to client via email with PDF attachment
   */
  async sendQuotation(
    quotation: Quotation,
    client: Client,
    businessProfile: BusinessProfile | null,
    lineItems: LineItem[],
    pdfBuffer: Buffer
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send quotation - SENDGRID_API_KEY not configured");
      return false;
    }

    if (!client.email) {
      console.error("Cannot send quotation - client has no email address");
      return false;
    }

    try {
      const businessName = businessProfile?.companyName || 'Your Business';
      
      // Generate AI-powered email content
      const emailContext = {
        documentType: 'quotation' as const,
        documentNumber: quotation.quotationNumber,
        clientName: client.name,
        total: `R ${parseFloat(quotation.total).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        businessName,
        expiryDate: new Date(quotation.expiryDate),
        isNewClient: false, // Could enhance with client history check
      };

      const [subject, aiMessage] = await Promise.all([
        aiEmailAssistant.generateSubjectLine(emailContext),
        aiEmailAssistant.draftEmailMessage(emailContext),
      ]);
      
      // Format expiry date
      const expiryDate = new Date(quotation.expiryDate).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Build professional HTML email with AI-generated message
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${businessName}" style="max-width: 200px; margin-bottom: 20px;">` : ''}
            <h1 style="color: #0073AA; margin: 0;">${businessName}</h1>
          </div>
          
          <div style="color: #333; font-size: 16px; line-height: 1.6; white-space: pre-wrap; margin-bottom: 30px;">
${aiMessage}
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
            <h3 style="color: #333; margin-top: 0;">Quotation Summary</h3>
            <table style="width: 100%; color: #666;">
              <tr>
                <td style="padding: 8px 0;"><strong>Quotation Number:</strong></td>
                <td style="text-align: right;">${quotation.quotationNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Date:</strong></td>
                <td style="text-align: right;">${new Date(quotation.date).toLocaleDateString('en-ZA')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Valid Until:</strong></td>
                <td style="text-align: right;">${expiryDate}</td>
              </tr>
              <tr style="border-top: 2px solid #dee2e6;">
                <td style="padding: 12px 0;"><strong style="font-size: 18px;">Total Amount:</strong></td>
                <td style="text-align: right;"><strong style="font-size: 18px; color: #0073AA;">R ${parseFloat(quotation.total).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
              </tr>
            </table>
          </div>

          ${businessProfile?.email || businessProfile?.phone ? `
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 5px 0;">
              ${businessProfile.email ? `Email: ${businessProfile.email}<br>` : ''}
              ${businessProfile.phone ? `Phone: ${businessProfile.phone}<br>` : ''}
              ${businessProfile.website ? `Website: ${businessProfile.website}` : ''}
            </p>
          </div>
          ` : ''}
        </div>
      `;

      await mailService.send({
        to: client.email,
        from: {
          email: businessProfile?.email || this.fromEmail,
          name: businessName
        },
        replyTo: businessProfile?.email ? {
          email: businessProfile.email,
          name: businessName
        } : undefined,
        subject: subject,
        html: emailBody,
        attachments: [
          {
            content: pdfBuffer.toString('base64'),
            filename: `Quotation-${quotation.quotationNumber}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          }
        ]
      });

      console.log(`[EMAIL] Quotation ${quotation.quotationNumber} sent to ${client.email}`);
      return true;

    } catch (error) {
      console.error('Failed to send quotation email:', error);
      return false;
    }
  }

  /**
   * Send invoice to client via email with PDF attachment
   */
  async sendInvoice(
    invoice: Invoice,
    client: Client,
    businessProfile: BusinessProfile | null,
    lineItems: LineItem[],
    pdfBuffer: Buffer
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send invoice - SENDGRID_API_KEY not configured");
      return false;
    }

    if (!client.email) {
      console.error("Cannot send invoice - client has no email address");
      return false;
    }

    try {
      const businessName = businessProfile?.companyName || 'Your Business';
      
      const balance = (parseFloat(invoice.total) - parseFloat(invoice.amountPaid)).toFixed(2);
      const isPaid = parseFloat(balance) <= 0;

      // Generate AI-powered email content
      const emailContext = {
        documentType: 'invoice' as const,
        documentNumber: invoice.invoiceNumber,
        clientName: client.name,
        total: `R ${parseFloat(invoice.total).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        businessName,
        dueDate: new Date(invoice.dueDate),
        amountPaid: `R ${parseFloat(invoice.amountPaid).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        amountOutstanding: `R ${parseFloat(balance).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
        isNewClient: false, // Could enhance with client history check
      };

      const [subject, aiMessage] = await Promise.all([
        aiEmailAssistant.generateSubjectLine(emailContext),
        aiEmailAssistant.draftEmailMessage(emailContext),
      ]);
      
      // Format due date
      const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Build professional HTML email with AI-generated message
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${businessName}" style="max-width: 200px; margin-bottom: 20px;">` : ''}
            <h1 style="color: #0073AA; margin: 0;">${businessName}</h1>
          </div>
          
          <div style="color: #333; font-size: 16px; line-height: 1.6; white-space: pre-wrap; margin-bottom: 30px;">
${aiMessage}
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
            <h3 style="color: #333; margin-top: 0;">Invoice Summary</h3>
            <table style="width: 100%; color: #666;">
              <tr>
                <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>
                <td style="text-align: right;">${invoice.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Invoice Date:</strong></td>
                <td style="text-align: right;">${new Date(invoice.date).toLocaleDateString('en-ZA')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
                <td style="text-align: right;">${dueDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Total Amount:</strong></td>
                <td style="text-align: right;">R ${parseFloat(invoice.total).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
              ${parseFloat(invoice.amountPaid) > 0 ? `
              <tr>
                <td style="padding: 8px 0;"><strong>Amount Paid:</strong></td>
                <td style="text-align: right; color: #28a745;">R ${parseFloat(invoice.amountPaid).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
              ` : ''}
              <tr style="border-top: 2px solid #dee2e6;">
                <td style="padding: 12px 0;"><strong style="font-size: 18px;">${isPaid ? 'Status:' : 'Balance Due:'}</strong></td>
                <td style="text-align: right;"><strong style="font-size: 18px; color: ${isPaid ? '#28a745' : '#dc3545'};">${isPaid ? 'PAID' : 'R ' + parseFloat(balance).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
              </tr>
            </table>
          </div>

          ${!isPaid && businessProfile?.bankName ? `
          <div style="background: #e7f3ff; padding: 20px; border-radius: 6px; margin: 30px 0;">
            <h3 style="color: #333; margin-top: 0;">Payment Details</h3>
            <table style="width: 100%; color: #666; font-size: 14px;">
              ${businessProfile.bankName ? `
              <tr>
                <td style="padding: 4px 0;"><strong>Bank:</strong></td>
                <td>${businessProfile.bankName}</td>
              </tr>
              ` : ''}
              ${businessProfile.accountHolder ? `
              <tr>
                <td style="padding: 4px 0;"><strong>Account Holder:</strong></td>
                <td>${businessProfile.accountHolder}</td>
              </tr>
              ` : ''}
              ${businessProfile.accountNumber ? `
              <tr>
                <td style="padding: 4px 0;"><strong>Account Number:</strong></td>
                <td>${businessProfile.accountNumber}</td>
              </tr>
              ` : ''}
              ${businessProfile.branchCode ? `
              <tr>
                <td style="padding: 4px 0;"><strong>Branch Code:</strong></td>
                <td>${businessProfile.branchCode}</td>
              </tr>
              ` : ''}
            </table>
            <p style="color: #666; font-size: 12px; margin-top: 10px; margin-bottom: 0;">
              Please use invoice number ${invoice.invoiceNumber} as payment reference.
            </p>
          </div>
          ` : ''}

          ${businessProfile?.email || businessProfile?.phone ? `
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 14px; margin: 5px 0;">
              ${businessProfile.email ? `Email: ${businessProfile.email}<br>` : ''}
              ${businessProfile.phone ? `Phone: ${businessProfile.phone}<br>` : ''}
              ${businessProfile.website ? `Website: ${businessProfile.website}` : ''}
            </p>
          </div>
          ` : ''}
        </div>
      `;

      await mailService.send({
        to: client.email,
        from: {
          email: businessProfile?.email || this.fromEmail,
          name: businessName
        },
        replyTo: businessProfile?.email ? {
          email: businessProfile.email,
          name: businessName
        } : undefined,
        subject: subject,
        html: emailBody,
        attachments: [
          {
            content: pdfBuffer.toString('base64'),
            filename: `Invoice-${invoice.invoiceNumber}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          }
        ]
      });

      console.log(`[EMAIL] Invoice ${invoice.invoiceNumber} sent to ${client.email}`);
      return true;

    } catch (error) {
      console.error('Failed to send invoice email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();