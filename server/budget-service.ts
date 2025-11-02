import { storage } from './storage.js';
import { emailService } from './email-service.js';
import type { Budget, InsertBudget, Receipt, ExpenseCategory } from '../shared/schema.js';

export interface BudgetAlert {
  budget: Budget;
  currentSpent: number;
  percentageUsed: number;
  alertType: 'warning' | 'exceeded';
}

export interface BudgetAnalytics {
  budgetId: number;
  budgetName: string;
  category: ExpenseCategory;
  monthlyLimit: number;
  currentSpent: number;
  remainingBudget: number;
  percentageUsed: number;
  daysLeftInMonth: number;
  dailyAverageSpent: number;
  projectedMonthlySpend: number;
  onTrack: boolean;
  receiptsCount: number;
}

export class BudgetService {
  /**
   * Check if any budgets are approaching or exceeding limits
   */
  async checkBudgetAlerts(userId: number): Promise<BudgetAlert[]> {
    try {
      const budgets = await this.getUserBudgets(userId);
      const alerts: BudgetAlert[] = [];
      
      for (const budget of budgets) {
        if (!budget.isActive) continue;
        
        const currentSpent = await this.getCurrentMonthSpending(userId, budget.category);
        const percentageUsed = (currentSpent / budget.monthlyLimit) * 100;
        
        // Check if budget alert should be triggered
        if (percentageUsed >= (budget.alertThreshold || 80)) {
          alerts.push({
            budget,
            currentSpent,
            percentageUsed,
            alertType: percentageUsed >= 100 ? 'exceeded' : 'warning'
          });
        }
      }
      
      return alerts;
    } catch (error) {
      console.error('Failed to check budget alerts:', error);
      return [];
    }
  }

  /**
   * Get comprehensive budget analytics for a user
   */
  async getBudgetAnalytics(userId: number): Promise<BudgetAnalytics[]> {
    try {
      const budgets = await this.getUserBudgets(userId);
      const analytics: BudgetAnalytics[] = [];
      
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const daysLeftInMonth = daysInMonth - dayOfMonth;
      
      for (const budget of budgets) {
        const currentSpent = await this.getCurrentMonthSpending(userId, budget.category);
        const receiptsCount = await this.getMonthlyReceiptCount(userId, budget.category);
        const percentageUsed = (currentSpent / budget.monthlyLimit) * 100;
        const remainingBudget = Math.max(0, budget.monthlyLimit - currentSpent);
        const dailyAverageSpent = currentSpent / dayOfMonth;
        const projectedMonthlySpend = dailyAverageSpent * daysInMonth;
        const onTrack = projectedMonthlySpend <= budget.monthlyLimit;
        
        analytics.push({
          budgetId: budget.id,
          budgetName: budget.name,
          category: budget.category,
          monthlyLimit: budget.monthlyLimit,
          currentSpent,
          remainingBudget,
          percentageUsed,
          daysLeftInMonth,
          dailyAverageSpent,
          projectedMonthlySpend,
          onTrack,
          receiptsCount
        });
      }
      
      return analytics.sort((a, b) => b.percentageUsed - a.percentageUsed);
    } catch (error) {
      console.error('Failed to get budget analytics:', error);
      return [];
    }
  }

  /**
   * Process a new receipt and check for budget impacts
   */
  async processReceiptForBudgets(userId: number, receipt: Receipt): Promise<BudgetAlert[]> {
    try {
      // Update budget spending
      await this.updateBudgetSpending(userId, receipt.category, parseFloat(receipt.total));
      
      // Check for alerts after the new spending
      return await this.checkBudgetAlerts(userId);
    } catch (error) {
      console.error('Failed to process receipt for budgets:', error);
      return [];
    }
  }

  /**
   * Send budget alert notifications
   */
  async sendBudgetAlertNotifications(userId: number, alerts: BudgetAlert[]): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.email) return;
      
      const userPrefs = await this.getUserPreferences(userId);
      if (!userPrefs?.budgetAlerts) return;
      
      for (const alert of alerts) {
        await emailService.sendBudgetAlert(
          user.email,
          alert.budget.name,
          alert.budget.category,
          alert.currentSpent,
          alert.budget.monthlyLimit,
          alert.percentageUsed
        );
      }
    } catch (error) {
      console.error('Failed to send budget alert notifications:', error);
    }
  }

  /**
   * Get spending trends and patterns
   */
  async getSpendingTrends(userId: number, months: number = 6): Promise<{
    monthlyTrends: Array<{
      month: string;
      totalSpent: number;
      categoryBreakdown: Record<ExpenseCategory, number>;
    }>;
    categoryTrends: Array<{
      category: ExpenseCategory;
      trend: 'increasing' | 'decreasing' | 'stable';
      percentageChange: number;
    }>;
  }> {
    try {
      const monthlyData = await this.getMonthlySpendingHistory(userId, months);
      const categoryTrends = await this.analyzeCategoryTrends(monthlyData);
      
      return {
        monthlyTrends: monthlyData,
        categoryTrends
      };
    } catch (error) {
      console.error('Failed to get spending trends:', error);
      return { monthlyTrends: [], categoryTrends: [] };
    }
  }

  /**
   * Get merchant analysis for spending patterns
   */
  async getMerchantAnalysis(userId: number): Promise<Array<{
    storeName: string;
    totalSpent: number;
    visitCount: number;
    averageSpent: number;
    category: ExpenseCategory;
    lastVisit: Date;
    frequencyDays: number;
  }>> {
    try {
      // This would be implemented in the storage layer
      // For now, return basic structure
      const receipts = await storage.getReceiptsByUser(userId, 1000);
      
      const merchantMap = new Map();
      
      receipts.forEach(receipt => {
        const store = receipt.storeName.toLowerCase();
        if (!merchantMap.has(store)) {
          merchantMap.set(store, {
            storeName: receipt.storeName,
            totalSpent: 0,
            visitCount: 0,
            category: receipt.category,
            visits: []
          });
        }
        
        const merchant = merchantMap.get(store);
        merchant.totalSpent += parseFloat(receipt.total);
        merchant.visitCount += 1;
        merchant.visits.push(receipt.date);
      });
      
      return Array.from(merchantMap.values()).map(merchant => ({
        ...merchant,
        averageSpent: merchant.totalSpent / merchant.visitCount,
        lastVisit: new Date(Math.max(...merchant.visits.map((d: Date) => d.getTime()))),
        frequencyDays: this.calculateVisitFrequency(merchant.visits)
      })).sort((a, b) => b.totalSpent - a.totalSpent);
    } catch (error) {
      console.error('Failed to get merchant analysis:', error);
      return [];
    }
  }

  // Private helper methods
  private async getUserBudgets(userId: number): Promise<Budget[]> {
    if (storage.getBudgets) {
      return await storage.getBudgets(userId);
    }
    // Fallback for storage implementations without budget support
    return [];
  }

  private async getCurrentMonthSpending(userId: number, category: ExpenseCategory): Promise<number> {
    const receipts = await storage.getReceiptsByUser(userId, 1000);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return receipts
      .filter(receipt => {
        const receiptDate = new Date(receipt.date);
        return receiptDate.getMonth() === currentMonth && 
               receiptDate.getFullYear() === currentYear &&
               receipt.category === category;
      })
      .reduce((total, receipt) => total + parseFloat(receipt.total), 0);
  }

  private async getMonthlyReceiptCount(userId: number, category: ExpenseCategory): Promise<number> {
    const receipts = await storage.getReceiptsByUser(userId, 1000);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return receipts.filter(receipt => {
      const receiptDate = new Date(receipt.date);
      return receiptDate.getMonth() === currentMonth && 
             receiptDate.getFullYear() === currentYear &&
             receipt.category === category;
    }).length;
  }

  private async updateBudgetSpending(userId: number, category: ExpenseCategory, amount: number): Promise<void> {
    // This would update the current_spent field in the budgets table
    // Implementation would be in the storage layer
  }

  private async getUserPreferences(userId: number): Promise<any> {
    // This would get user preferences from storage
    // For now, return default preferences
    return { budgetAlerts: true };
  }

  private async getMonthlySpendingHistory(userId: number, months: number): Promise<any[]> {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    
    try {
      // Get monthly spending data from actual receipts
      const result = await db.execute(sql`
        SELECT 
          to_char(date_trunc('month', date), 'YYYY-MM') AS month,
          SUM(CAST(total AS DECIMAL)) AS total_spent,
          category,
          SUM(CAST(total AS DECIMAL)) AS category_total
        FROM receipts
        WHERE user_id = ${userId}
          AND date >= NOW() - INTERVAL '6 months'
        GROUP BY month, category
        ORDER BY month DESC
      `);

      // Process results into monthly trends format
      const monthlyMap = new Map<string, { month: string; totalSpent: number; categoryBreakdown: Record<string, number> }>();
      
      result.rows.forEach((row: any) => {
        const month = row.month;
        
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, {
            month,
            totalSpent: 0,
            categoryBreakdown: {}
          });
        }
        
        const monthData = monthlyMap.get(month)!;
        monthData.totalSpent += Number(row.total_spent);
        monthData.categoryBreakdown[row.category] = Number(row.category_total);
      });

      return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    } catch (error) {
      console.error('Error getting monthly spending history:', error);
      return [];
    }
  }

  private async analyzeCategoryTrends(monthlyData: any[]): Promise<any[]> {
    if (monthlyData.length < 2) return [];
    
    const categoryTrends: any[] = [];
    const categories = new Set<string>();
    
    // Collect all unique categories
    monthlyData.forEach(month => {
      Object.keys(month.categoryBreakdown || {}).forEach(cat => categories.add(cat));
    });
    
    // Analyze trend for each category
    categories.forEach(category => {
      const categorySpending = monthlyData.map(month => 
        month.categoryBreakdown[category] || 0
      ).filter(amount => amount > 0);
      
      if (categorySpending.length < 2) return;
      
      // Simple trend analysis: compare first half vs second half
      const midpoint = Math.floor(categorySpending.length / 2);
      const firstHalf = categorySpending.slice(0, midpoint);
      const secondHalf = categorySpending.slice(midpoint);
      
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      const percentageChange = ((secondAvg - firstAvg) / firstAvg) * 100;
      
      let trend: 'increasing' | 'decreasing' | 'stable';
      if (percentageChange > 10) trend = 'increasing';
      else if (percentageChange < -10) trend = 'decreasing';
      else trend = 'stable';
      
      categoryTrends.push({
        category,
        trend,
        percentageChange: Math.round(percentageChange)
      });
    });
    
    return categoryTrends;
  }

  private calculateVisitFrequency(visits: Date[]): number {
    if (visits.length < 2) return 0;
    
    const sortedVisits = visits.sort((a, b) => a.getTime() - b.getTime());
    const totalDays = (sortedVisits[sortedVisits.length - 1].getTime() - sortedVisits[0].getTime()) / (1000 * 60 * 60 * 24);
    
    return totalDays / (visits.length - 1);
  }
}

export const budgetService = new BudgetService();