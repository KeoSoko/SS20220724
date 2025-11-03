import { db } from './db';
import { invoices, invoicePayments, clients } from '@shared/schema';
import { eq, and, lt, isNull, or, sql } from 'drizzle-orm';
import { log } from './vite';
import { aiEmailAssistant } from './ai-email-assistant.js';
import type { Invoice, Client } from '@shared/schema';
import { differenceInDays, addDays, isPast } from 'date-fns';

export interface ReminderSuggestion {
  invoice: Invoice;
  client: Client;
  daysOverdue: number;
  suggestedAction: 'send_reminder' | 'send_final_notice' | 'escalate' | 'wait';
  nextReminderDate: Date;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  aiMessage?: string;
  aiSubject?: string;
}

export interface PaymentPrediction {
  invoiceId: number;
  predictedPaymentDate: Date;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export class SmartReminderService {
  /**
   * Get all overdue invoices that need attention
   */
  async getOverdueInvoices(userId: number): Promise<Invoice[]> {
    const today = new Date();
    
    const overdueInvoices = await db.query.invoices.findMany({
      where: and(
        eq(invoices.userId, userId),
        lt(invoices.dueDate, today),
        or(
          eq(invoices.status, 'unpaid'),
          eq(invoices.status, 'partially_paid'),
          eq(invoices.status, 'overdue')
        )
      ),
    });

    return overdueInvoices;
  }

  /**
   * Get invoices that need reminders sent
   */
  async getInvoicesNeedingReminders(userId: number): Promise<ReminderSuggestion[]> {
    const overdueInvoices = await this.getOverdueInvoices(userId);
    const suggestions: ReminderSuggestion[] = [];

    for (const invoice of overdueInvoices) {
      // Skip if already paid or cancelled
      if (invoice.status === 'paid' || invoice.status === 'cancelled') {
        continue;
      }

      // Get client
      const client = await db.query.clients.findFirst({
        where: eq(clients.id, invoice.clientId),
      });

      if (!client || !client.email) {
        continue; // Skip if no client or no email
      }

      const daysOverdue = differenceInDays(new Date(), invoice.dueDate);
      const reminderCount = invoice.reminderCount || 0;
      
      // Check if it's time to send a reminder
      if (this.shouldSendReminder(invoice, daysOverdue, reminderCount)) {
        const suggestion = await this.generateReminderSuggestion(invoice, client, daysOverdue, reminderCount);
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Determine if a reminder should be sent based on smart timing
   */
  private shouldSendReminder(invoice: Invoice, daysOverdue: number, reminderCount: number): boolean {
    // Don't send reminder if already sent today
    if (invoice.lastReminderSent) {
      const daysSinceLastReminder = differenceInDays(new Date(), invoice.lastReminderSent);
      if (daysSinceLastReminder < 1) {
        return false;
      }
    }

    // If next reminder date is set and hasn't passed, wait
    if (invoice.nextReminderDate && !isPast(invoice.nextReminderDate)) {
      return false;
    }

    // First reminder: Send 3 days after due date
    if (reminderCount === 0 && daysOverdue >= 3) {
      return true;
    }

    // Second reminder: Send 7 days after first reminder
    if (reminderCount === 1 && invoice.lastReminderSent) {
      const daysSinceLastReminder = differenceInDays(new Date(), invoice.lastReminderSent);
      if (daysSinceLastReminder >= 7) {
        return true;
      }
    }

    // Third reminder: Send 7 days after second reminder
    if (reminderCount === 2 && invoice.lastReminderSent) {
      const daysSinceLastReminder = differenceInDays(new Date(), invoice.lastReminderSent);
      if (daysSinceLastReminder >= 7) {
        return true;
      }
    }

    // Fourth+ reminder: Send every 14 days
    if (reminderCount >= 3 && invoice.lastReminderSent) {
      const daysSinceLastReminder = differenceInDays(new Date(), invoice.lastReminderSent);
      if (daysSinceLastReminder >= 14) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a reminder suggestion with AI-powered messaging
   */
  private async generateReminderSuggestion(
    invoice: Invoice,
    client: Client,
    daysOverdue: number,
    reminderCount: number
  ): Promise<ReminderSuggestion> {
    const balance = (parseFloat(invoice.total) - parseFloat(invoice.amountPaid)).toFixed(2);
    
    // Determine urgency and action
    let urgency: 'low' | 'medium' | 'high' | 'critical';
    let suggestedAction: 'send_reminder' | 'send_final_notice' | 'escalate' | 'wait';
    let nextReminderDate: Date;

    if (daysOverdue >= 60 || reminderCount >= 4) {
      urgency = 'critical';
      suggestedAction = 'escalate';
      nextReminderDate = addDays(new Date(), 14);
    } else if (daysOverdue >= 30 || reminderCount >= 3) {
      urgency = 'high';
      suggestedAction = 'send_final_notice';
      nextReminderDate = addDays(new Date(), 7);
    } else if (daysOverdue >= 14 || reminderCount >= 2) {
      urgency = 'medium';
      suggestedAction = 'send_reminder';
      nextReminderDate = addDays(new Date(), 7);
    } else {
      urgency = 'low';
      suggestedAction = 'send_reminder';
      nextReminderDate = addDays(new Date(), 7);
    }

    // Generate AI message and subject
    const emailContext = {
      documentType: 'invoice' as const,
      documentNumber: invoice.invoiceNumber,
      clientName: client.name,
      total: `R ${parseFloat(invoice.total).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
      businessName: 'Simple Slips User', // Will be replaced with actual business name when sending
      dueDate: invoice.dueDate,
      amountPaid: `R ${parseFloat(invoice.amountPaid).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
      amountOutstanding: `R ${parseFloat(balance).toLocaleString('en-ZA', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
      isOverdue: true,
      daysOverdue,
      previousSentCount: reminderCount,
    };

    let aiMessage: string | undefined;
    let aiSubject: string | undefined;

    try {
      [aiSubject, aiMessage] = await Promise.all([
        aiEmailAssistant.generateSubjectLine(emailContext),
        aiEmailAssistant.draftEmailMessage(emailContext),
      ]);
    } catch (error: any) {
      log(`Error generating AI reminder message: ${error.message}`, 'smart-reminder');
    }

    return {
      invoice,
      client,
      daysOverdue,
      suggestedAction,
      nextReminderDate,
      urgency,
      aiMessage,
      aiSubject,
    };
  }

  /**
   * Mark reminder as sent and update invoice
   */
  async markReminderSent(invoiceId: number): Promise<void> {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const reminderCount = (invoice.reminderCount || 0) + 1;
    const nextReminderDate = this.calculateNextReminderDate(reminderCount);

    await db
      .update(invoices)
      .set({
        lastReminderSent: new Date(),
        reminderCount,
        nextReminderDate,
        status: 'overdue',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    log(`Reminder sent for invoice ${invoice.invoiceNumber}, count: ${reminderCount}`, 'smart-reminder');
  }

  /**
   * Calculate next reminder date based on reminder count
   */
  private calculateNextReminderDate(reminderCount: number): Date {
    if (reminderCount === 1) {
      return addDays(new Date(), 7); // Second reminder after 7 days
    } else if (reminderCount === 2) {
      return addDays(new Date(), 7); // Third reminder after 7 days
    } else {
      return addDays(new Date(), 14); // Subsequent reminders every 14 days
    }
  }

  /**
   * Predict payment dates using AI analysis of client payment patterns
   */
  async predictPaymentDate(invoiceId: number): Promise<PaymentPrediction | null> {
    try {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
      });

      if (!invoice) {
        return null;
      }

      // Get all previous invoices for this client
      const clientInvoices = await db.query.invoices.findMany({
        where: and(
          eq(invoices.clientId, invoice.clientId),
          eq(invoices.status, 'paid')
        ),
      });

      if (clientInvoices.length === 0) {
        // No payment history - predict based on due date + average
        return {
          invoiceId,
          predictedPaymentDate: addDays(invoice.dueDate, 7),
          confidence: 'low',
          reasoning: 'No payment history available. Estimated 7 days after due date.',
        };
      }

      // Calculate average days from due date to payment
      let totalDaysToPayment = 0;
      let paidInvoiceCount = 0;

      for (const paidInvoice of clientInvoices) {
        const payments = await db.query.invoicePayments.findMany({
          where: eq(invoicePayments.invoiceId, paidInvoice.id),
          orderBy: (invoicePayments, { desc }) => [desc(invoicePayments.paymentDate)],
        });

        if (payments.length > 0) {
          const lastPayment = payments[0]; // First item after ordering by desc
          const daysToPayment = differenceInDays(lastPayment.paymentDate, paidInvoice.dueDate);
          totalDaysToPayment += daysToPayment;
          paidInvoiceCount++;
        }
      }

      if (paidInvoiceCount === 0) {
        return {
          invoiceId,
          predictedPaymentDate: addDays(invoice.dueDate, 7),
          confidence: 'low',
          reasoning: 'No complete payment records available.',
        };
      }

      const averageDaysToPayment = Math.round(totalDaysToPayment / paidInvoiceCount);
      const predictedPaymentDate = addDays(invoice.dueDate, averageDaysToPayment);

      // Determine confidence based on consistency
      const confidence: 'high' | 'medium' | 'low' = 
        paidInvoiceCount >= 5 ? 'high' :
        paidInvoiceCount >= 3 ? 'medium' : 'low';

      return {
        invoiceId,
        predictedPaymentDate,
        confidence,
        reasoning: `Based on ${paidInvoiceCount} previous invoices, client typically pays ${averageDaysToPayment} days after due date.`,
      };
    } catch (error: any) {
      log(`Error predicting payment date: ${error.message}`, 'smart-reminder');
      return null;
    }
  }

  /**
   * Get dashboard statistics for reminders
   */
  async getDashboardStats(userId: number) {
    const overdueInvoices = await this.getOverdueInvoices(userId);
    const remindersNeeded = await this.getInvoicesNeedingReminders(userId);

    const totalOverdue = overdueInvoices.reduce((sum, inv) => {
      const balance = parseFloat(inv.total) - parseFloat(inv.amountPaid);
      return sum + balance;
    }, 0);

    const criticalCount = remindersNeeded.filter(r => r.urgency === 'critical').length;
    const highCount = remindersNeeded.filter(r => r.urgency === 'high').length;

    return {
      totalOverdueCount: overdueInvoices.length,
      totalOverdueAmount: totalOverdue,
      remindersNeededCount: remindersNeeded.length,
      criticalCount,
      highCount,
      reminders: remindersNeeded,
    };
  }
}

export const smartReminderService = new SmartReminderService();
