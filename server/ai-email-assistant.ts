import { OpenAI } from 'openai';
import { log } from './vite';
import type { Client, BusinessProfile, Quotation, Invoice, InvoicePayment } from '@shared/schema';
import { format } from 'date-fns';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface EmailContext {
  documentType: 'quotation' | 'invoice';
  documentNumber: string;
  clientName: string;
  total: string;
  businessName: string;
  dueDate?: Date;
  expiryDate?: Date;
  isOverdue?: boolean;
  daysOverdue?: number;
  daysUntilDue?: number;
  amountPaid?: string;
  amountOutstanding?: string;
  previousSentCount?: number;
  isNewClient?: boolean;
}

export class AIEmailAssistant {
  async draftEmailMessage(context: EmailContext): Promise<string> {
    try {
      log(`[AI Email] Generating message for ${context.documentType} ${context.documentNumber}`, 'ai-email');
      log(`[AI Email] Context: client=${context.clientName}, total=${context.total}, business=${context.businessName}`, 'ai-email');
      
      const prompt = this.buildPrompt(context);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional business communication assistant for Simple Slips, helping South African solopreneurs and freelancers draft professional, warm, and effective emails for quotations and invoices. Generate email message bodies only (no subject lines). Use South African English. Be professional yet friendly. Keep emails concise (2-3 short paragraphs max)."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const message = completion.choices[0]?.message?.content || this.getFallbackMessage(context);
      log(`[AI Email] Generated message (first 100 chars): ${message.substring(0, 100)}...`, 'ai-email');
      return message.trim();
    } catch (error: any) {
      log(`[AI Email] Error: ${error.message}, using fallback`, 'ai-email');
      const fallback = this.getFallbackMessage(context);
      log(`[AI Email] Fallback message (first 100 chars): ${fallback.substring(0, 100)}...`, 'ai-email');
      return fallback;
    }
  }

  async generateSubjectLine(context: EmailContext): Promise<string> {
    try {
      const prompt = this.buildSubjectPrompt(context);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a professional email subject line writer. Generate concise, clear, professional subject lines for business documents. Maximum 60 characters. Include key information: document type, number, business name, and urgency if applicable."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 20,
      });

      const subject = completion.choices[0]?.message?.content || this.getFallbackSubject(context);
      return subject.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
    } catch (error: any) {
      log(`Error generating subject line: ${error.message}`, 'ai-email');
      return this.getFallbackSubject(context);
    }
  }

  private buildPrompt(context: EmailContext): string {
    const parts: string[] = [];
    
    if (context.documentType === 'quotation') {
      parts.push(`Draft a professional email to send quotation ${context.documentNumber} to ${context.clientName}.`);
      parts.push(`Business: ${context.businessName}`);
      parts.push(`Total amount: ${context.total}`);
      
      if (context.expiryDate) {
        parts.push(`Valid until: ${format(context.expiryDate, 'dd MMM yyyy')}`);
      }
      
      if (context.isNewClient) {
        parts.push(`This is a new client - include a warm introduction.`);
      }
      
      parts.push(`Mention that the quotation is attached as a PDF. Ask them to review it and let you know if they have questions. Express enthusiasm about potentially working together.`);
      
    } else if (context.documentType === 'invoice') {
      if (context.isOverdue && context.daysOverdue) {
        // Overdue reminder
        const tone = this.getReminderTone(context.previousSentCount || 0, context.daysOverdue);
        parts.push(`Draft a ${tone} payment reminder for overdue invoice ${context.documentNumber}.`);
        parts.push(`Client: ${context.clientName}`);
        parts.push(`Amount outstanding: ${context.amountOutstanding || context.total}`);
        parts.push(`Days overdue: ${context.daysOverdue}`);
        
        if (context.amountPaid && context.amountPaid !== 'R0.00') {
          parts.push(`Amount already paid: ${context.amountPaid}`);
          parts.push(`Acknowledge the partial payment graciously.`);
        }
        
        if (context.previousSentCount && context.previousSentCount > 2) {
          parts.push(`This is the ${context.previousSentCount + 1}th reminder. Be firmer but still professional.`);
        }
        
      } else if (context.daysUntilDue !== undefined) {
        // Pre-due reminder (friendly heads-up)
        if (context.daysUntilDue === 0) {
          parts.push(`Draft a friendly reminder that invoice ${context.documentNumber} is due TODAY.`);
          parts.push(`Keep the tone polite but clear about the due date.`);
        } else {
          parts.push(`Draft a friendly, warm reminder that invoice ${context.documentNumber} is due in ${context.daysUntilDue} days.`);
          parts.push(`This is a courtesy heads-up, not a payment demand. Keep the tone light and helpful.`);
        }
        parts.push(`Client: ${context.clientName}`);
        parts.push(`Total amount: ${context.total}`);
        parts.push(`Due date: ${format(context.dueDate!, 'dd MMM yyyy')}`);
        parts.push(`Thank them for their business and mention they can reach out with any questions.`);
        
      } else {
        // New invoice
        parts.push(`Draft a professional email to send invoice ${context.documentNumber} to ${context.clientName}.`);
        parts.push(`Business: ${context.businessName}`);
        parts.push(`Total amount: ${context.total}`);
        
        if (context.dueDate) {
          parts.push(`Due date: ${format(context.dueDate, 'dd MMM yyyy')}`);
        }
        
        if (context.isNewClient) {
          parts.push(`This is a new client - thank them for their business.`);
        }
      }
      
      parts.push(`Mention that the invoice is attached as a PDF. Include payment instructions.`);
    }
    
    return parts.join('\n');
  }

  private buildSubjectPrompt(context: EmailContext): string {
    if (context.isOverdue && context.daysOverdue) {
      return `Payment reminder subject line for invoice ${context.documentNumber} from ${context.businessName}, ${context.daysOverdue} days overdue, amount ${context.amountOutstanding || context.total}`;
    }
    
    if (context.daysUntilDue !== undefined) {
      if (context.daysUntilDue === 0) {
        return `Friendly reminder subject line: invoice ${context.documentNumber} from ${context.businessName} is due TODAY, amount ${context.total}`;
      } else {
        return `Friendly heads-up subject line: invoice ${context.documentNumber} from ${context.businessName} due in ${context.daysUntilDue} days, amount ${context.total}`;
      }
    }
    
    if (context.documentType === 'quotation') {
      return `Quotation subject line: ${context.documentNumber} from ${context.businessName}, amount ${context.total}`;
    }
    
    if (context.dueDate) {
      return `Invoice subject line: ${context.documentNumber} from ${context.businessName}, due ${format(context.dueDate, 'dd MMM yyyy')}, amount ${context.total}`;
    }
    
    return `${context.documentType} subject line: ${context.documentNumber} from ${context.businessName}, amount ${context.total}`;
  }

  private getReminderTone(previousSentCount: number, daysOverdue: number): string {
    if (daysOverdue > 30 || previousSentCount > 2) {
      return 'firm but professional';
    } else if (daysOverdue > 14 || previousSentCount > 1) {
      return 'polite but direct';
    } else {
      return 'friendly and gentle';
    }
  }

  private getFallbackMessage(context: EmailContext): string {
    if (context.documentType === 'quotation') {
      return `Hi ${context.clientName.split(' ')[0]},\n\nThank you for your interest in working with us. Please find attached quotation ${context.documentNumber} for ${context.total}.\n\nThe quotation is valid until ${context.expiryDate ? format(context.expiryDate, 'dd MMMM yyyy') : 'the end of the month'}. Please review the details and let me know if you have any questions.\n\nLooking forward to working with you!\n\nKind regards`;
    } else {
      if (context.isOverdue) {
        return `Hi ${context.clientName.split(' ')[0]},\n\nI hope this email finds you well. This is a friendly reminder that invoice ${context.documentNumber} for ${context.amountOutstanding || context.total} is now ${context.daysOverdue} days overdue.\n\nPlease arrange payment at your earliest convenience. If you've already processed this payment, please disregard this reminder.\n\nBest regards`;
      }
      
      if (context.daysUntilDue !== undefined) {
        if (context.daysUntilDue === 0) {
          return `Hi ${context.clientName.split(' ')[0]},\n\nJust a friendly reminder that invoice ${context.documentNumber} for ${context.total} is due today.\n\nPlease find the invoice attached for your reference. If you have any questions or need payment arrangements, please don't hesitate to reach out.\n\nThank you for your business!\n\nKind regards`;
        } else {
          return `Hi ${context.clientName.split(' ')[0]},\n\nI hope you're doing well! This is a friendly heads-up that invoice ${context.documentNumber} for ${context.total} is due in ${context.daysUntilDue} days (${context.dueDate ? format(context.dueDate, 'dd MMMM yyyy') : ''}).\n\nPlease find the invoice attached for your reference. If you have any questions, feel free to reach out.\n\nThank you for your business!\n\nWarm regards`;
        }
      }
      
      return `Hi ${context.clientName.split(' ')[0]},\n\nPlease find attached invoice ${context.documentNumber} for ${context.total}. Payment is due by ${context.dueDate ? format(context.dueDate, 'dd MMMM yyyy') : 'the end of the month'}.\n\nThank you for your business!\n\nKind regards`;
    }
  }

  private getFallbackSubject(context: EmailContext): string {
    if (context.isOverdue) {
      return `Payment Reminder: Invoice ${context.documentNumber} - ${context.amountOutstanding || context.total}`;
    }
    
    if (context.daysUntilDue !== undefined) {
      if (context.daysUntilDue === 0) {
        return `Reminder: Invoice ${context.documentNumber} Due Today - ${context.total}`;
      } else {
        return `Friendly Reminder: Invoice ${context.documentNumber} Due in ${context.daysUntilDue} Days`;
      }
    }
    
    if (context.documentType === 'quotation') {
      return `Quotation ${context.documentNumber} from ${context.businessName}`;
    }
    
    return `Invoice ${context.documentNumber} from ${context.businessName}${context.dueDate ? ` - Due ${format(context.dueDate, 'dd MMM')}` : ''}`;
  }
}

export const aiEmailAssistant = new AIEmailAssistant();
