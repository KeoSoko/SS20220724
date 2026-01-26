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

// Custom error types for better error handling
export class EmailError extends Error {
  constructor(
    message: string,
    public readonly errorType: 'pdf_generation' | 'sendgrid_api' | 'validation' | 'unknown',
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

// Retry utility with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; operationName?: string } = {}
): Promise<T> {
  const { maxRetries = 2, delayMs = 1000, operationName = 'operation' } = options;
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt <= maxRetries) {
        console.log(`[EMAIL] ${operationName} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

export class EmailService {
  private fromEmail = 'notifications@simpleslips.co.za';
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
      
      const authFromEmail = process.env.AUTH_FROM_EMAIL || this.fromEmail;
      
      const emailData = {
        to: email,
        from: {
          email: authFromEmail,
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
   * Send a generic plain text email (used for admin alerts)
   */
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send email - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      await mailService.send({
        to,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips'
        },
        subject,
        text: body,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #0073AA;">${subject}</h2>
          <pre style="white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 15px; border-radius: 5px;">${body}</pre>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">Simple Slips Admin Alert</p>
        </div>`,
      });
      console.log(`[EMAIL] Admin alert sent to: ${to}, subject: ${subject}`);
      return true;
    } catch (error) {
      console.error('Failed to send admin email:', error);
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
                <li><strong>Explore tax features</strong> - Track expenses with organizational suggestions</li>
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
4. Explore tax features - Track expenses with organizational suggestions

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
   * Send payment failure notification
   */
  async sendPaymentFailureNotification(
    email: string,
    username: string,
    notificationType: 'payment_failed' | 'subscription_cancelled',
    message: string
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send payment failure notification - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const subject = notificationType === 'subscription_cancelled' 
        ? '⚠️ Your Simple Slips subscription has been cancelled'
        : '⚠️ Payment failed for your Simple Slips subscription';

      const heading = notificationType === 'subscription_cancelled'
        ? 'Subscription Cancelled'
        : 'Payment Failed';

      await mailService.send({
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Billing'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">Billing Notification</p>
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <h2 style="color: #856404; margin-top: 0;">${heading}</h2>
              <p style="color: #856404; margin: 0;">
                Hi ${username},<br><br>
                ${message}
              </p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">What happens next?</h3>
              <ul style="color: #666; line-height: 1.8;">
                ${notificationType === 'subscription_cancelled' 
                  ? `
                    <li>Your access to premium features has been disabled</li>
                    <li>Business Hub (quotations, invoices, P&L reports) is no longer accessible</li>
                    <li>You can resubscribe anytime to restore full access</li>
                  `
                  : `
                    <li>We'll automatically retry the payment in a few days</li>
                    <li>You can update your payment method now to avoid service interruption</li>
                    <li>Your access remains active for now, but may be suspended after multiple failed attempts</li>
                  `
                }
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${this.appUrl}/subscription" 
                 style="background: #0073AA; color: white; padding: 14px 30px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold;">
                ${notificationType === 'subscription_cancelled' ? 'Resubscribe Now' : 'Update Payment Method'}
              </a>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              Need help? Contact our support team at keo@nine28.co.za
            </p>
          </div>
        `,
        text: `
${heading}

Hi ${username},

${message}

What happens next?
${notificationType === 'subscription_cancelled'
  ? `- Your access to premium features has been disabled
- Business Hub (quotations, invoices, P&L reports) is no longer accessible
- You can resubscribe anytime to restore full access`
  : `- We'll automatically retry the payment in a few days
- You can update your payment method now to avoid service interruption
- Your access remains active for now, but may be suspended after multiple failed attempts`
}

${notificationType === 'subscription_cancelled' ? 'Resubscribe' : 'Update your payment method'} at: ${this.appUrl}/subscription

Need help? Contact support at keo@nine28.co.za
        `
      });

      console.log(`Payment failure notification sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send payment failure notification:', error);
      return false;
    }
  }

  /**
   * Send trial recovery email to re-engage users stuck in trials
   * Admin-triggered only, uses SendGrid dynamic template
   */
  async sendTrialRecoveryEmail(email: string, username: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send trial recovery email - SENDGRID_API_KEY not configured");
      return false;
    }

    const templateId = process.env.SENDGRID_TRIAL_RECOVERY_TEMPLATE_ID;
    
    try {
      const fromEmail = 'hello@simpleslips.co.za';
      
      if (templateId) {
        await mailService.send({
          to: email,
          from: {
            email: fromEmail,
            name: 'Simple Slips'
          },
          replyTo: {
            email: 'admin@simpleslips.co.za',
            name: 'Simple Slips Support Team'
          },
          templateId: templateId,
          dynamicTemplateData: {
            username: username,
            appUrl: this.appUrl
          }
        });
      } else {
        await mailService.send({
          to: email,
          from: {
            email: fromEmail,
            name: 'Simple Slips'
          },
          replyTo: {
            email: 'admin@simpleslips.co.za',
            name: 'Simple Slips Support Team'
          },
          subject: "We noticed you haven't finished setting up Simple Slips",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
                <p style="color: #666; font-size: 16px;">AI-Powered Financial Management</p>
              </div>
              
              <h2 style="color: #333;">Hi ${username}, we miss you!</h2>
              
              <p>We noticed you started a free trial but haven't had a chance to fully explore Simple Slips yet. No worries - your account is still waiting for you!</p>
              
              <div style="background: #f0f8ff; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #0073AA;">
                <h3 style="color: #0073AA; margin-top: 0;">Here's what you're missing:</h3>
                <ul style="color: #666; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li><strong>AI Receipt Scanning</strong> - Snap a photo and let AI do the rest</li>
                  <li><strong>Smart Categorization</strong> - Expenses automatically sorted</li>
                  <li><strong>Tax-Ready Reports</strong> - Export for SARS in seconds</li>
                  <li><strong>Business Hub</strong> - Professional quotes and invoices</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${this.appUrl}/home" 
                   style="background: #0073AA; color: white; padding: 14px 30px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;
                          font-weight: bold;">
                  Continue Your Free Trial
                </a>
              </div>
              
              <p style="color: #666;">If you have any questions or need help getting started, just reply to this email - we're here to help!</p>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                You're receiving this because you signed up for Simple Slips. If you no longer wish to receive these emails, you can unsubscribe from your account settings.
              </p>
            </div>
          `,
          text: `
Hi ${username}, we miss you!

We noticed you started a free trial but haven't had a chance to fully explore Simple Slips yet. No worries - your account is still waiting for you!

Here's what you're missing:
- AI Receipt Scanning - Snap a photo and let AI do the rest
- Smart Categorization - Expenses automatically sorted
- Tax-Ready Reports - Export for SARS in seconds
- Business Hub - Professional quotes and invoices

Continue your free trial: ${this.appUrl}/home

If you have any questions or need help getting started, just reply to this email - we're here to help!

- The Simple Slips Team
          `
        });
      }

      console.log(`[EMAIL] Trial recovery email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send trial recovery email:', error);
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
   * Send quotation with custom subject and message using HTML template
   * Includes automatic retry logic and detailed error handling
   */
  async sendQuotationWithCustomMessage(
    quotation: Quotation,
    client: Client,
    businessProfile: BusinessProfile | null,
    lineItems: LineItem[],
    pdfBuffer: Buffer,
    subject: string,
    aiGeneratedMessage: string
  ): Promise<{ success: boolean; error?: string; errorType?: 'pdf_generation' | 'sendgrid_api' | 'validation' | 'unknown' }> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send quotation - SENDGRID_API_KEY not configured");
      return { success: false, error: "Email service not configured", errorType: 'validation' };
    }

    if (!client.email) {
      console.error("Cannot send quotation - client has no email address");
      return { success: false, error: "Client has no email address", errorType: 'validation' };
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error("Cannot send quotation - PDF not generated");
      return { success: false, error: "Failed to generate PDF attachment", errorType: 'pdf_generation' };
    }

    try {
      const { generateQuotationEmailHTML, generateQuotationEmailPlainText } = await import('./email-templates');
      const businessName = businessProfile?.companyName || 'Your Business';
      
      // Generate professional HTML and plain text email versions
      const htmlBody = generateQuotationEmailHTML(
        quotation,
        client,
        lineItems,
        businessProfile,
        aiGeneratedMessage
      );
      
      const textBody = generateQuotationEmailPlainText(
        quotation,
        client,
        lineItems,
        businessProfile,
        aiGeneratedMessage
      );

      // Use retry logic for SendGrid API calls
      await withRetry(
        async () => {
          await mailService.send({
            to: client.email,
            from: {
              email: this.fromEmail,
              name: 'Simple Slips Notifications'
            },
            replyTo: businessProfile?.email ? {
              email: businessProfile.email,
              name: businessName
            } : undefined,
            subject: subject,
            html: htmlBody,
            text: textBody,
            attachments: [
              {
                content: pdfBuffer.toString('base64'),
                filename: `Quotation-${quotation.quotationNumber}.pdf`,
                type: 'application/pdf',
                disposition: 'attachment'
              }
            ]
          });
        },
        { maxRetries: 2, delayMs: 1000, operationName: `Send quotation ${quotation.quotationNumber}` }
      );

      console.log(`[EMAIL] Quotation ${quotation.quotationNumber} sent to ${client.email}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL] Failed to send quotation ${quotation.quotationNumber}:`, errorMessage);
      
      // Determine error type from error message
      let errorType: 'sendgrid_api' | 'unknown' = 'unknown';
      let userFriendlyMessage = 'Failed to send email. Please try again.';
      
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service authentication failed. Please contact support.';
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Too many emails sent. Please wait a moment and try again.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service timed out. Please try again.';
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('email')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Invalid email address. Please check the client email.';
      }
      
      return { success: false, error: userFriendlyMessage, errorType };
    }
  }

  /**
   * Send quotation to client via email with PDF attachment
   * Includes automatic retry logic and detailed error handling
   */
  async sendQuotation(
    quotation: Quotation,
    client: Client,
    businessProfile: BusinessProfile | null,
    lineItems: LineItem[],
    pdfBuffer: Buffer
  ): Promise<{ success: boolean; error?: string; errorType?: 'pdf_generation' | 'sendgrid_api' | 'validation' | 'unknown' }> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send quotation - SENDGRID_API_KEY not configured");
      return { success: false, error: "Email service not configured", errorType: 'validation' };
    }

    if (!client.email) {
      console.error("Cannot send quotation - client has no email address");
      return { success: false, error: "Client has no email address", errorType: 'validation' };
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error("Cannot send quotation - PDF not generated");
      return { success: false, error: "Failed to generate PDF attachment", errorType: 'pdf_generation' };
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
        isNewClient: false,
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

      // Use retry logic for SendGrid API calls
      await withRetry(
        async () => {
          await mailService.send({
            to: client.email,
            from: {
              email: this.fromEmail,
              name: 'Simple Slips Notifications'
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
        },
        { maxRetries: 2, delayMs: 1000, operationName: `Send quotation ${quotation.quotationNumber}` }
      );

      console.log(`[EMAIL] Quotation ${quotation.quotationNumber} sent to ${client.email}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL] Failed to send quotation ${quotation.quotationNumber}:`, errorMessage);
      
      // Determine error type from error message
      let errorType: 'sendgrid_api' | 'unknown' = 'unknown';
      let userFriendlyMessage = 'Failed to send email. Please try again.';
      
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service authentication failed. Please contact support.';
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Too many emails sent. Please wait a moment and try again.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service timed out. Please try again.';
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('email')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Invalid email address. Please check the client email.';
      }
      
      return { success: false, error: userFriendlyMessage, errorType };
    }
  }

  /**
   * Send invoice to client via email with PDF attachment
   * Includes automatic retry logic and detailed error handling
   */
  async sendInvoice(
    invoice: Invoice,
    client: Client,
    businessProfile: BusinessProfile | null,
    lineItems: LineItem[],
    pdfBuffer: Buffer,
    customSubject?: string,
    customBody?: string
  ): Promise<{ success: boolean; error?: string; errorType?: 'pdf_generation' | 'sendgrid_api' | 'validation' | 'unknown' }> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send invoice - SENDGRID_API_KEY not configured");
      return { success: false, error: "Email service not configured", errorType: 'validation' };
    }

    if (!client.email) {
      console.error("Cannot send invoice - client has no email address");
      return { success: false, error: "Client has no email address", errorType: 'validation' };
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error("Cannot send invoice - PDF not generated");
      return { success: false, error: "Failed to generate PDF attachment", errorType: 'pdf_generation' };
    }

    try {
      const { generateInvoiceEmailHTML, generateInvoiceEmailPlainText } = await import('./email-templates');
      const businessName = businessProfile?.companyName || 'Your Business';
      
      const balance = (parseFloat(invoice.total) - parseFloat(invoice.amountPaid)).toFixed(2);

      // Use custom subject and body if provided, otherwise generate AI content
      let subject: string;
      let aiMessage: string;

      if (customSubject && customBody) {
        subject = customSubject;
        aiMessage = customBody;
      } else {
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
          isNewClient: false,
        };

        [subject, aiMessage] = await Promise.all([
          aiEmailAssistant.generateSubjectLine(emailContext),
          aiEmailAssistant.draftEmailMessage(emailContext),
        ]);
      }
      
      // Generate professional HTML and plain text email versions
      const emailBody = generateInvoiceEmailHTML(
        invoice,
        client,
        lineItems,
        businessProfile,
        aiMessage
      );
      
      const textBody = generateInvoiceEmailPlainText(
        invoice,
        client,
        lineItems,
        businessProfile,
        aiMessage
      );

      // Use retry logic for SendGrid API calls
      await withRetry(
        async () => {
          await mailService.send({
            to: client.email,
            from: {
              email: this.fromEmail,
              name: 'Simple Slips Notifications'
            },
            replyTo: businessProfile?.email ? {
              email: businessProfile.email,
              name: businessName
            } : undefined,
            subject: subject,
            html: emailBody,
            text: textBody,
            attachments: [
              {
                content: pdfBuffer.toString('base64'),
                filename: `Invoice-${invoice.invoiceNumber}.pdf`,
                type: 'application/pdf',
                disposition: 'attachment'
              }
            ]
          });
        },
        { maxRetries: 2, delayMs: 1000, operationName: `Send invoice ${invoice.invoiceNumber}` }
      );

      console.log(`[EMAIL] Invoice ${invoice.invoiceNumber} sent to ${client.email}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EMAIL] Failed to send invoice ${invoice.invoiceNumber}:`, errorMessage);
      
      // Determine error type from error message
      let errorType: 'sendgrid_api' | 'unknown' = 'unknown';
      let userFriendlyMessage = 'Failed to send email. Please try again.';
      
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service authentication failed. Please contact support.';
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Too many emails sent. Please wait a moment and try again.';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Email service timed out. Please try again.';
      } else if (errorMessage.includes('Invalid') || errorMessage.includes('email')) {
        errorType = 'sendgrid_api';
        userFriendlyMessage = 'Invalid email address. Please check the client email.';
      }
      
      return { success: false, error: userFriendlyMessage, errorType };
    }
  }

  /**
   * Test email configuration by sending a test email
   * This verifies the email is verified in SendGrid and can send emails
   */
  async testEmailConfiguration(email: string): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error("SendGrid API key not configured");
    }

    try {
      const emailData = {
        to: email,
        from: {
          email: email,
          name: 'Simple Slips Test'
        },
        subject: 'Email Verification Test - Simple Slips',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2>Email Verification Successful!</h2>
            <p>This is a test email to verify your sender email is configured correctly.</p>
            <p>Your email <strong>${email}</strong> is now verified and ready to send quotations and invoices to your clients.</p>
            <p style="margin-top: 20px; font-size: 14px; color: #666;">
              You can safely delete this email.
            </p>
          </div>
        `,
      };

      await mailService.send(emailData);
      console.log(`[EMAIL] Test email sent successfully to ${email}`);
      return true;

    } catch (error: any) {
      console.error(`[EMAIL] Test email failed for ${email}:`, error.message);
      throw new Error(`Email verification failed: ${error.message}. Please ensure this email is verified in SendGrid.`);
    }
  }

  /**
   * Send receipt import confirmation email
   */
  async sendReceiptImportConfirmation(email: string, username: string, receiptCount: number): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send receipt import confirmation - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      await mailService.send({
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: `Receipt${receiptCount > 1 ? 's' : ''} Successfully Imported`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">Receipt Import Confirmation</p>
            </div>
            
            <div style="background: #d4edda; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h2 style="color: #155724; margin-top: 0;">Success!</h2>
              <p style="color: #155724; margin: 0;">
                Hi ${username},<br><br>
                We've successfully processed <strong>${receiptCount} receipt${receiptCount > 1 ? 's' : ''}</strong> from your email.
                The receipt${receiptCount > 1 ? 's have' : ' has'} been automatically categorized and added to your account.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${this.appUrl}/receipts" 
                 style="background: #0073AA; color: white; padding: 14px 30px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold;">
                View Your Receipts
              </a>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                <strong>Tip:</strong> You can forward or email receipts anytime to your unique Simple Slips email address
                to automatically add them to your account.
              </p>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This email was sent from Simple Slips. If you didn't expect this email, please contact support.
            </p>
          </div>
        `,
        text: `
Receipt${receiptCount > 1 ? 's' : ''} Successfully Imported

Hi ${username},

We've successfully processed ${receiptCount} receipt${receiptCount > 1 ? 's' : ''} from your email.
The receipt${receiptCount > 1 ? 's have' : ' has'} been automatically categorized and added to your account.

View your receipts: ${this.appUrl}/receipts

Tip: You can forward or email receipts anytime to your unique Simple Slips email address
to automatically add them to your account.
        `
      });

      console.log(`[EMAIL] Receipt import confirmation sent to ${email}`);
      return true;

    } catch (error: any) {
      console.error(`[EMAIL] Failed to send receipt import confirmation: ${error.message}`);
      return false;
    }
  }

  /**
   * Send receipt import failure email
   */
  async sendReceiptImportFailure(
    email: string,
    username: string,
    errorTitle: string,
    errorMessage: string
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send receipt import failure - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      await mailService.send({
        to: email,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips'
        },
        replyTo: {
          email: 'keo@nine28.co.za',
          name: 'Simple Slips Support Team'
        },
        subject: 'Receipt Import - Action Required',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">Receipt Import Notice</p>
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <h2 style="color: #856404; margin-top: 0;">${errorTitle}</h2>
              <p style="color: #856404; margin: 0;">
                Hi ${username},<br><br>
                ${errorMessage}
              </p>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Tips for successful receipt imports:</h3>
              <ul style="color: #666; line-height: 1.8;">
                <li>Attach clear photos of your receipts (JPEG, PNG, or PDF)</li>
                <li>Make sure the receipt text is visible and not blurry</li>
                <li>Include only one receipt per image for best results</li>
                <li>Avoid screenshots of digital receipts - forward the original email instead</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${this.appUrl}/upload-receipt" 
                 style="background: #0073AA; color: white; padding: 14px 30px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;
                        font-weight: bold;">
                Try Uploading Manually
              </a>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              Need help? Reply to this email and our support team will assist you.
            </p>
          </div>
        `,
        text: `
Receipt Import - Action Required

Hi ${username},

${errorTitle}

${errorMessage}

Tips for successful receipt imports:
- Attach clear photos of your receipts (JPEG, PNG, or PDF)
- Make sure the receipt text is visible and not blurry
- Include only one receipt per image for best results
- Avoid screenshots of digital receipts - forward the original email instead

Try uploading manually: ${this.appUrl}/upload-receipt

Need help? Reply to this email and our support team will assist you.
        `
      });

      console.log(`[EMAIL] Receipt import failure notification sent to ${email}`);
      return true;

    } catch (error: any) {
      console.error(`[EMAIL] Failed to send receipt import failure notification: ${error.message}`);
      return false;
    }
  }

  /**
   * Send support request email to support team
   */
  async sendSupportRequest(
    userEmail: string,
    username: string,
    subject: string,
    message: string,
    userId: number,
    additionalInfo?: {
      deviceInfo?: {
        os: string;
        browser: string;
        deviceType: string;
        appVersion: string;
        userAgent?: string;
      } | null;
      screenshot?: string | null;
      contactPreference?: 'email' | 'phone';
      phoneNumber?: string | null;
    }
  ): Promise<boolean> {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("Cannot send support request - SENDGRID_API_KEY not configured");
      return false;
    }

    try {
      const supportEmail = 'support@simpleslips.co.za';
      
      // Build device info section
      const deviceInfoHtml = additionalInfo?.deviceInfo ? `
        <div style="background: #e8f4f8; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="color: #333; margin-top: 0; font-size: 14px;">Device Information</h3>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Device:</strong> ${additionalInfo.deviceInfo.deviceType}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>OS:</strong> ${additionalInfo.deviceInfo.os}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Browser:</strong> ${additionalInfo.deviceInfo.browser}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>App Version:</strong> ${additionalInfo.deviceInfo.appVersion}</p>
        </div>
      ` : '';
      
      // Build contact preference section
      const contactPreference = additionalInfo?.contactPreference || 'email';
      const contactInfoHtml = `
        <div style="background: ${contactPreference === 'phone' ? '#fff3cd' : '#d4edda'}; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="color: #333; margin-top: 0; font-size: 14px;">Contact Preference</h3>
          <p style="margin: 5px 0; font-size: 13px;">
            <strong>Preferred Method:</strong> ${contactPreference === 'phone' ? 'Phone Callback' : 'Email'}
          </p>
          ${contactPreference === 'phone' && additionalInfo?.phoneNumber ? `
            <p style="margin: 5px 0; font-size: 13px;"><strong>Phone Number:</strong> ${additionalInfo.phoneNumber}</p>
          ` : ''}
        </div>
      `;
      
      // Build screenshot section if provided
      const screenshotHtml = additionalInfo?.screenshot ? `
        <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="color: #333; margin-top: 0;">Attached Screenshot</h3>
          <img src="${additionalInfo.screenshot}" alt="User Screenshot" style="max-width: 100%; height: auto; border: 1px solid #eee;" />
        </div>
      ` : '';
      
      // Build attachments array for SendGrid
      const attachments: Array<{ content: string; filename: string; type: string; disposition: string }> = [];
      if (additionalInfo?.screenshot) {
        // Extract base64 data from data URL
        const matches = additionalInfo.screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          const [, ext, base64Data] = matches;
          attachments.push({
            content: base64Data,
            filename: `screenshot.${ext}`,
            type: `image/${ext}`,
            disposition: 'attachment'
          });
        }
      }
      
      await mailService.send({
        to: supportEmail,
        from: {
          email: this.fromEmail,
          name: 'Simple Slips Support Bot'
        },
        replyTo: {
          email: userEmail,
          name: username
        },
        subject: `[Support Request] ${subject}`,
        attachments: attachments.length > 0 ? attachments : undefined,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #0073AA; margin: 0;">Simple Slips</h1>
              <p style="color: #666; font-size: 16px;">Support Request</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #333; margin-top: 0;">User Details</h3>
              <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
              <p style="margin: 5px 0;"><strong>User ID:</strong> ${userId}</p>
            </div>
            
            ${contactInfoHtml}
            ${deviceInfoHtml}
            
            <div style="background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 20px;">
              <h3 style="color: #333; margin-top: 0;">Subject: ${subject}</h3>
              <div style="white-space: pre-wrap; color: #333; line-height: 1.6;">
${message}
              </div>
            </div>
            
            ${screenshotHtml}
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This support request was submitted from Simple Slips app. Reply directly to this email to respond to the user.
            </p>
          </div>
        `,
        text: `
Simple Slips Support Request

User Details:
- Username: ${username}
- Email: ${userEmail}
- User ID: ${userId}

Contact Preference: ${contactPreference === 'phone' ? `Phone Callback (${additionalInfo?.phoneNumber || 'No number provided'})` : 'Email'}

${additionalInfo?.deviceInfo ? `Device Information:
- Device: ${additionalInfo.deviceInfo.deviceType}
- OS: ${additionalInfo.deviceInfo.os}
- Browser: ${additionalInfo.deviceInfo.browser}
- App Version: ${additionalInfo.deviceInfo.appVersion}
` : ''}
Subject: ${subject}

Message:
${message}

${additionalInfo?.screenshot ? '[Screenshot attached]' : ''}

---
Reply directly to this email to respond to the user.
        `
      });

      console.log(`[EMAIL] Support request sent from ${userEmail}: ${subject}`);
      return true;

    } catch (error: any) {
      console.error(`[EMAIL] Failed to send support request: ${error.message}`);
      return false;
    }
  }
}

export const emailService = new EmailService();