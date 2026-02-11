import { storage } from './storage.js';
import { db } from './db';
import { invoices, clients, users } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import type { Invoice, Receipt } from '../shared/schema.js';
import { getReportingCategory } from './reporting-utils.js';

export interface ProfitLossData {
  period: string;
  startDate: Date;
  endDate: Date;
  revenue: {
    total: number;
    count: number;
    byMonth: Array<{
      month: string;
      amount: number;
      invoiceCount: number;
    }>;
    topClients?: Array<{
      clientId: number;
      clientName: string;
      amount: number;
      invoiceCount: number;
    }>;
  };
  expenses: {
    total: number;
    count: number;
    byMonth: Array<{
      month: string;
      amount: number;
      receiptCount: number;
    }>;
    byCategory: Array<{
      category: string;
      amount: number;
      receiptCount: number;
      percentage: number;
    }>;
  };
  profit: {
    netProfit: number;
    profitMargin: number;
    byMonth: Array<{
      month: string;
      revenue: number;
      expenses: number;
      profit: number;
      margin: number;
    }>;
  };
  comparison?: {
    previousPeriod: {
      revenue: number;
      expenses: number;
      profit: number;
    };
    percentageChange: {
      revenue: number;
      expenses: number;
      profit: number;
    };
  };
}

export class ProfitLossService {
  /**
   * Get Profit & Loss data for a specific period
   */
  async getProfitLoss(
    userId: number,
    startDate: Date,
    endDate: Date,
    includePreviousPeriod: boolean = true
  ): Promise<ProfitLossData> {
    try {
      // Fetch user's workspaceId for workspace-scoped queries
      const [userData] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
      if (!userData) throw new Error(`User ${userId} not found`);
      const workspaceId = userData.workspaceId;

      // Fetch invoices and receipts for the period
      const allInvoices = await db.query.invoices.findMany({
        where: eq(invoices.workspaceId, workspaceId)
      });
      const receipts = await storage.getReceiptsByUser(userId, 10000);

      // Filter for date range and paid invoices only
      const periodInvoices = allInvoices.filter((inv: Invoice) => {
        const invDate = new Date(inv.date);
        return inv.status === 'paid' && 
               invDate >= startDate && 
               invDate <= endDate;
      });

      const periodReceipts = receipts.filter(rec => {
        const recDate = new Date(rec.date);
        return recDate >= startDate && recDate <= endDate;
      });

      // Calculate revenue
      const revenue = await this.calculateRevenue(userId, periodInvoices);
      
      // Calculate expenses
      const expenses = await this.calculateExpenses(periodReceipts);

      // Calculate profit
      const profit = this.calculateProfit(revenue, expenses);

      // Get comparison with previous period if requested
      let comparison;
      if (includePreviousPeriod) {
        const periodLength = endDate.getTime() - startDate.getTime();
        const prevStartDate = new Date(startDate.getTime() - periodLength);
        const prevEndDate = new Date(startDate.getTime());
        
        comparison = await this.getPeriodComparison(
          userId,
          prevStartDate,
          prevEndDate,
          { revenue: revenue.total, expenses: expenses.total, profit: profit.netProfit }
        );
      }

      return {
        period: this.getPeriodLabel(startDate, endDate),
        startDate,
        endDate,
        revenue,
        expenses,
        profit,
        comparison
      };
    } catch (error) {
      console.error('Failed to get profit & loss data:', error);
      throw new Error('Failed to calculate profit & loss');
    }
  }

  /**
   * Get monthly P&L data
   */
  async getMonthlyProfitLoss(userId: number, year?: number, month?: number): Promise<ProfitLossData> {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month !== undefined ? month : now.getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    return this.getProfitLoss(userId, startDate, endDate);
  }

  /**
   * Get quarterly P&L data
   */
  async getQuarterlyProfitLoss(userId: number, year?: number, quarter?: number): Promise<ProfitLossData> {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetQuarter = quarter || Math.floor(now.getMonth() / 3);

    const startMonth = targetQuarter * 3;
    const startDate = new Date(targetYear, startMonth, 1);
    const endDate = new Date(targetYear, startMonth + 3, 0, 23, 59, 59);

    return this.getProfitLoss(userId, startDate, endDate);
  }

  /**
   * Get yearly P&L data
   */
  async getYearlyProfitLoss(userId: number, year?: number): Promise<ProfitLossData> {
    const targetYear = year || new Date().getFullYear();
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

    return this.getProfitLoss(userId, startDate, endDate);
  }

  /**
   * Calculate revenue from paid invoices
   */
  private async calculateRevenue(
    userId: number,
    invoices: Invoice[]
  ): Promise<ProfitLossData['revenue']> {
    const total = invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
    const count = invoices.length;

    // Group by month
    const monthlyMap = new Map<string, { amount: number; count: number }>();
    invoices.forEach(inv => {
      const monthKey = new Date(inv.date).toISOString().slice(0, 7);
      const existing = monthlyMap.get(monthKey) || { amount: 0, count: 0 };
      monthlyMap.set(monthKey, {
        amount: existing.amount + parseFloat(inv.total),
        count: existing.count + 1
      });
    });

    const byMonth = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        amount: data.amount,
        invoiceCount: data.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Get top clients
    const clientMap = new Map<number, { name: string; amount: number; count: number }>();
    for (const inv of invoices) {
      if (!inv.clientId) continue;
      
      const client = await db.query.clients.findFirst({
        where: eq(clients.id, inv.clientId)
      });
      if (!client) continue;

      const existing = clientMap.get(inv.clientId) || { 
        name: client.name, 
        amount: 0, 
        count: 0 
      };
      clientMap.set(inv.clientId, {
        name: existing.name,
        amount: existing.amount + parseFloat(inv.total),
        count: existing.count + 1
      });
    }

    const topClients = Array.from(clientMap.entries())
      .map(([clientId, data]) => ({
        clientId,
        clientName: data.name,
        amount: data.amount,
        invoiceCount: data.count
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      total,
      count,
      byMonth,
      topClients
    };
  }

  /**
   * Calculate expenses from receipts
   */
  private calculateExpenses(receipts: Receipt[]): ProfitLossData['expenses'] {
    const total = receipts.reduce((sum, rec) => sum + parseFloat(rec.total), 0);
    const count = receipts.length;

    // Group by month
    const monthlyMap = new Map<string, { amount: number; count: number }>();
    receipts.forEach(rec => {
      const monthKey = new Date(rec.date).toISOString().slice(0, 7);
      const existing = monthlyMap.get(monthKey) || { amount: 0, count: 0 };
      monthlyMap.set(monthKey, {
        amount: existing.amount + parseFloat(rec.total),
        count: existing.count + 1
      });
    });

    const byMonth = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        amount: data.amount,
        receiptCount: data.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number }>();
    receipts.forEach(rec => {
      const category = getReportingCategory(rec.category, rec.notes) || 'uncategorized';
      const existing = categoryMap.get(category) || { amount: 0, count: 0 };
      categoryMap.set(category, {
        amount: existing.amount + parseFloat(rec.total),
        count: existing.count + 1
      });
    });

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        receiptCount: data.count,
        percentage: total > 0 ? (data.amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      total,
      count,
      byMonth,
      byCategory
    };
  }

  /**
   * Calculate profit metrics
   */
  private calculateProfit(
    revenue: ProfitLossData['revenue'],
    expenses: ProfitLossData['expenses']
  ): ProfitLossData['profit'] {
    const netProfit = revenue.total - expenses.total;
    const profitMargin = revenue.total > 0 ? (netProfit / revenue.total) * 100 : 0;

    // Merge monthly data
    const monthlyData = new Map<string, { revenue: number; expenses: number }>();
    
    revenue.byMonth.forEach(item => {
      monthlyData.set(item.month, { 
        revenue: item.amount, 
        expenses: monthlyData.get(item.month)?.expenses || 0 
      });
    });

    expenses.byMonth.forEach(item => {
      const existing = monthlyData.get(item.month) || { revenue: 0, expenses: 0 };
      monthlyData.set(item.month, {
        revenue: existing.revenue,
        expenses: item.amount
      });
    });

    const byMonth = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        profit: data.revenue - data.expenses,
        margin: data.revenue > 0 ? ((data.revenue - data.expenses) / data.revenue) * 100 : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      netProfit,
      profitMargin,
      byMonth
    };
  }

  /**
   * Compare with previous period
   */
  private async getPeriodComparison(
    userId: number,
    prevStartDate: Date,
    prevEndDate: Date,
    currentPeriod: { revenue: number; expenses: number; profit: number }
  ): Promise<ProfitLossData['comparison']> {
    const prevData = await this.getProfitLoss(userId, prevStartDate, prevEndDate, false);

    const revenueChange = prevData.revenue.total > 0
      ? ((currentPeriod.revenue - prevData.revenue.total) / prevData.revenue.total) * 100
      : 0;

    const expensesChange = prevData.expenses.total > 0
      ? ((currentPeriod.expenses - prevData.expenses.total) / prevData.expenses.total) * 100
      : 0;

    const profitChange = prevData.profit.netProfit !== 0
      ? ((currentPeriod.profit - prevData.profit.netProfit) / Math.abs(prevData.profit.netProfit)) * 100
      : 0;

    return {
      previousPeriod: {
        revenue: prevData.revenue.total,
        expenses: prevData.expenses.total,
        profit: prevData.profit.netProfit
      },
      percentageChange: {
        revenue: revenueChange,
        expenses: expensesChange,
        profit: profitChange
      }
    };
  }

  /**
   * Get period label
   */
  private getPeriodLabel(startDate: Date, endDate: Date): string {
    const start = startDate.toISOString().slice(0, 10);
    const end = endDate.toISOString().slice(0, 10);
    return `${start} to ${end}`;
  }
}

export const profitLossService = new ProfitLossService();
