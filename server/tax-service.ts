import { db } from "./db";
import { receipts, taxSettings, users, sarsExpenseCategories, receiptAuditTrail } from "@shared/schema";
import { eq, sql, and, gte, lte, desc, asc } from "drizzle-orm";
import { exportService } from "./export-service";
import { emailService } from "./email-service";
import { format, startOfMonth, endOfMonth, addMonths, isAfter, isBefore, parseISO } from 'date-fns';
import { formatReportingCategory, getReportingCategory } from "./reporting-utils";

export interface TaxDashboardData {
  ytdDeductible: number;
  projectedAnnual: number;
  estimatedSavings: number;
  quarterlyEstimate: number;
  currentQuarter: number;
  deductibleReceipts: number;
  totalReceipts: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  thresholdProgress: Array<{
    name: string;
    threshold: number;
    current: number;
    percentage: number;
  }>;
  alerts: Array<{
    type: 'warning' | 'info' | 'success';
    message: string;
    action?: string;
  }>;
  yearEndOpportunities: Array<{
    description: string;
    potentialSavings: number;
    deadline: string;
  }>;
  currentTaxYear: number;
  taxYearStart: Date;
  taxYearEnd: Date;
  daysRemaining: number;
  progressPercentage: number;
}

export interface TaxSettings {
  taxBracket: number;
  isBusinessOwner: boolean;
  businessType: string;
  estimatedIncome: number;
  filingStatus: string;
  taxYear: number;
  homeOfficePercentage?: number;
  businessCarPercentage?: number;
  businessPhonePercentage?: number;
  vatNumber?: string;
}

// Helper function to normalize null values to undefined for TypeScript compatibility
const normalizeTaxSettings = (settings: any): TaxSettings => {
  return {
    ...settings,
    homeOfficePercentage: settings.homeOfficePercentage ?? undefined,
    businessCarPercentage: settings.businessCarPercentage ?? undefined,
    businessPhonePercentage: settings.businessPhonePercentage ?? undefined,
    vatNumber: settings.vatNumber ?? undefined,
  };
};

// South African tax year (March to February)
const getTaxYearDates = (taxYear: number) => {
  const startDate = new Date(taxYear - 1, 2, 1); // March 1 of previous year
  const endDate = new Date(taxYear, 1, 28); // February 28 of current year
  return { startDate, endDate };
};

// Deductibility assessment for South African tax compliance
export interface DeductibilityInfo {
  type: 'full' | 'partial' | 'conditional' | 'none';
  percentage: number;
  requiresBusinessPercentage: boolean;
  sarsCode?: string;
  sarsDescription?: string;
  complianceIssues: string[];
}

// Receipt completeness for SARS compliance
export interface ReceiptComplianceCheck {
  isComplete: boolean;
  missingFields: string[];
  requiresVAT: boolean;
  hasVATNumber: boolean;
  auditReadiness: 'ready' | 'incomplete' | 'flagged';
}

export class TaxService {
  /**
   * Get comprehensive tax dashboard data
   */
  async getTaxDashboard(userId: number): Promise<TaxDashboardData> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Determine current South African tax year
    const taxYear = currentDate.getMonth() >= 2 ? currentYear + 1 : currentYear; // March onwards = next tax year
    const { startDate: yearStart, endDate: yearEnd } = getTaxYearDates(taxYear);
    
    // Get current quarter
    const currentQuarter = Math.ceil((currentDate.getMonth() + 1) / 3);
    
    // Get user's workspace ID
    const [userRecord] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRecord) throw new Error(`User ${userId} not found`);
    const workspaceId = userRecord.workspaceId;
    
    // Get user's tax settings
    const userTaxSettings = await this.getUserTaxSettings(userId);
    
    // Get YTD receipts
    const ytdReceipts = await db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.workspaceId, workspaceId),
          gte(receipts.date, yearStart),
          lte(receipts.date, yearEnd)
        )
      );

    // Calculate YTD deductible amount
    const deductibleReceipts = ytdReceipts.filter(r => r.isTaxDeductible);
    const ytdDeductible = deductibleReceipts.reduce((sum, r) => sum + parseFloat(r.total), 0);
    
    // Project annual amount based on SA tax year progress (March to February)
    const taxYearDays = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceStart = Math.floor((currentDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    const progressRatio = Math.max(daysSinceStart / taxYearDays, 0.1); // Minimum 10% to avoid division issues
    const projectedAnnual = progressRatio > 0 ? ytdDeductible / progressRatio : ytdDeductible;
    
    // Calculate estimated savings
    const estimatedSavings = projectedAnnual * (userTaxSettings.taxBracket / 100);
    
    // Calculate quarterly estimate for business owners
    const quarterlyEstimate = userTaxSettings.isBusinessOwner ? 
      (userTaxSettings.estimatedIncome * 0.25 * (userTaxSettings.taxBracket / 100)) : 0;
    
    // Category breakdown
    const categoryBreakdown = this.calculateCategoryBreakdown(deductibleReceipts);
    
    // Threshold progress
    const thresholdProgress = this.calculateThresholdProgress(ytdDeductible, userTaxSettings);
    
    // Generate smart alerts
    const alerts = this.generateTaxAlerts(ytdDeductible, projectedAnnual, userTaxSettings, currentDate);
    
    // Year-end opportunities
    const yearEndOpportunities = this.generateYearEndOpportunities(
      ytdDeductible, 
      projectedAnnual, 
      userTaxSettings, 
      currentDate
    );

    return {
      ytdDeductible,
      projectedAnnual,
      estimatedSavings,
      quarterlyEstimate,
      currentQuarter,
      deductibleReceipts: deductibleReceipts.length,
      totalReceipts: ytdReceipts.length,
      categoryBreakdown,
      thresholdProgress,
      alerts,
      yearEndOpportunities,
      currentTaxYear: taxYear,
      taxYearStart: yearStart,
      taxYearEnd: yearEnd,
      daysRemaining: Math.ceil((yearEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)),
      progressPercentage: Math.round((daysSinceStart / taxYearDays) * 100),
    };
  }

  /**
   * Get user's tax settings
   */
  async getUserTaxSettings(userId: number): Promise<TaxSettings> {
    const settings = await db
      .select()
      .from(taxSettings)
      .where(eq(taxSettings.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      // Create default settings
      const defaultSettings = {
        userId,
        taxBracket: 18,
        isBusinessOwner: false,
        businessType: 'sole_proprietor',
        estimatedIncome: 0,
        filingStatus: 'single',
        taxYear: new Date().getFullYear(),
      };
      
      await db.insert(taxSettings).values(defaultSettings);
      return normalizeTaxSettings(defaultSettings);
    }

    return normalizeTaxSettings(settings[0]);
  }

  /**
   * Update user's tax settings
   */
  async updateTaxSettings(userId: number, updates: Partial<TaxSettings>): Promise<TaxSettings> {
    const existing = await this.getUserTaxSettings(userId);
    
    // Normalize the updates to handle null values from the frontend
    const normalizedUpdates = normalizeTaxSettings(updates);
    
    const updatedSettings = { ...existing, ...normalizedUpdates, updatedAt: new Date() };
    
    await db
      .update(taxSettings)
      .set(updatedSettings)
      .where(eq(taxSettings.userId, userId));
    
    return normalizeTaxSettings(updatedSettings);
  }

  /**
   * Generate comprehensive audit preparation kit
   */
  async generateAuditKit(userId: number): Promise<Buffer> {
    const currentYear = new Date().getFullYear();
    
    // Get user's workspace ID
    const [userRecord] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRecord) throw new Error(`User ${userId} not found`);
    const workspaceId = userRecord.workspaceId;
    
    // Get all deductible receipts for the year
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    
    const deductibleReceipts = await db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.workspaceId, workspaceId),
          eq(receipts.isTaxDeductible, true),
          gte(receipts.date, yearStart),
          lte(receipts.date, yearEnd)
        )
      );

    // Generate comprehensive PDF with all receipts and documentation
    const taxReportResult = await exportService.generateTaxReport(userId, currentYear);
    return taxReportResult.pdf;
  }

  /**
   * Calculate category breakdown for deductible expenses
   */
  private calculateCategoryBreakdown(deductibleReceipts: any[]): Array<{
    category: string;
    amount: number;
    count: number;
  }> {
    const breakdown = new Map<string, { amount: number; count: number }>();
    
    deductibleReceipts.forEach(receipt => {
      const category = getReportingCategory(receipt.category, receipt.reportLabel);
      const amount = parseFloat(receipt.total);
      
      if (breakdown.has(category)) {
        const existing = breakdown.get(category)!;
        breakdown.set(category, {
          amount: existing.amount + amount,
          count: existing.count + 1
        });
      } else {
        breakdown.set(category, { amount, count: 1 });
      }
    });
    
    return Array.from(breakdown.entries())
      .map(([category, data]) => ({
        category: formatReportingCategory(category),
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Calculate progress toward common tax deduction thresholds
   */
  private calculateThresholdProgress(ytdDeductible: number, settings: TaxSettings): Array<{
    name: string;
    threshold: number;
    current: number;
    percentage: number;
  }> {
    const thresholds = [
      { name: 'Medical Aid Contributions', threshold: 30000 },
      { name: 'Business Expenses', threshold: 50000 },
      { name: 'Home Office Deduction', threshold: 15000 },
      { name: 'Professional Development', threshold: 10000 },
    ];

    return thresholds.map(threshold => ({
      name: threshold.name,
      threshold: threshold.threshold,
      current: Math.min(ytdDeductible, threshold.threshold),
      percentage: Math.min((ytdDeductible / threshold.threshold) * 100, 100)
    }));
  }

  /**
   * Generate smart tax alerts based on current status
   */
  private generateTaxAlerts(
    ytdDeductible: number,
    projectedAnnual: number,
    settings: TaxSettings,
    currentDate: Date
  ): Array<{ type: 'warning' | 'info' | 'success'; message: string; action?: string }> {
    const alerts = [];
    
    // Calculate days until SA tax year end (February 28/29)
    const currentYear = currentDate.getFullYear();
    const taxYear = currentDate.getMonth() >= 2 ? currentYear + 1 : currentYear;
    const { endDate: taxYearEnd } = getTaxYearDates(taxYear);
    const daysUntilYearEnd = Math.ceil((taxYearEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Tax season alerts - SA tax season starts in July
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const isJulyToOctober = currentMonth >= 7 && currentMonth <= 10; // July to October
    
    if (isJulyToOctober) {
      // During tax filing season (July to October) - show filing deadline reminder
      const currentYear = currentDate.getFullYear();
      const filingYear = currentYear - 1; // Filing previous year's return
      alerts.push({
        type: 'info' as const,
        message: `Tax Filing Season: File your ${filingYear} tax return by October 31. Keep collecting receipts for ${currentYear} deductions.`,
        action: 'File Tax Return'
      });
    } else if (daysUntilYearEnd <= 90) {
      // Approaching tax year end (approaching February)
      alerts.push({
        type: 'warning' as const,
        message: `Tax Year Ending Soon: ${daysUntilYearEnd} days left to maximize current year deductions.`,
        action: 'Review Opportunities'
      });
    }
    
    // Quarterly estimate alerts for business owners
    if (settings.isBusinessOwner && [3, 6, 9, 12].includes(currentDate.getMonth() + 1)) {
      alerts.push({
        type: 'info' as const,
        message: 'Quarterly tax estimate due this month',
        action: 'Calculate Payment'
      });
    }
    
    // Threshold proximity alerts
    const medicalThreshold = 30000;
    if (ytdDeductible >= medicalThreshold * 0.8 && ytdDeductible < medicalThreshold) {
      alerts.push({
        type: 'info' as const,
        message: `You're R${(medicalThreshold - ytdDeductible).toFixed(0)} away from medical deduction threshold`,
        action: 'Review Medical Expenses'
      });
    }
    
    // Success alerts
    if (ytdDeductible > 50000) {
      alerts.push({
        type: 'success' as const,
        message: 'Excellent! You\'ve maximized your deductible expenses this year'
      });
    }
    
    return alerts;
  }

  /**
   * Generate legitimate tax optimization opportunities
   */
  private generateYearEndOpportunities(
    ytdDeductible: number,
    projectedAnnual: number,
    settings: TaxSettings,
    currentDate: Date
  ): Array<{ description: string; potentialSavings: number; deadline: string }> {
    const opportunities = [];
    const currentYear = currentDate.getFullYear();
    const taxYear = currentDate.getMonth() >= 2 ? currentYear + 1 : currentYear;
    const { endDate: taxYearEnd } = getTaxYearDates(taxYear);
    const taxRate = settings.taxBracket / 100;
    
    // Only show opportunities if we're near tax year end
    const daysUntilTaxYearEnd = Math.ceil((taxYearEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilTaxYearEnd <= 90) {
      // Medical expenses - legitimate current year expenses
      if (ytdDeductible < 30000) {
        opportunities.push({
          description: 'Review outstanding medical expenses from current tax year',
          potentialSavings: Math.min(30000 - ytdDeductible, 5000) * taxRate,
          deadline: `February ${taxYear}`
        });
      }
      
      // Retirement contributions - must be made within tax year
      opportunities.push({
        description: 'Complete retirement annuity contributions before tax year ends',
        potentialSavings: 27500 * taxRate,
        deadline: `February ${taxYear}`
      });
      
      // Professional development - must be incurred and paid within tax year
      opportunities.push({
        description: 'Complete professional development courses within current tax year',
        potentialSavings: 5000 * taxRate,
        deadline: `February ${taxYear}`
      });
    }
    
    return opportunities.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  /**
   * Send quarterly tax reminder notifications
   */
  async sendQuarterlyReminders(userId: number): Promise<void> {
    const settings = await this.getUserTaxSettings(userId);
    
    if (settings.isBusinessOwner) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (user.length > 0 && user[0].email) {
        const taxEstimate = settings.estimatedIncome * 0.25 * (Number(settings.taxBracket) / 100);
        await emailService.sendBudgetAlert(
          user[0].email,
          'Quarterly Tax Estimate',
          'tax',
          taxEstimate,
          taxEstimate,
          100
        );
      }
    }
  }

  /**
   * Assess deductibility of an expense based on South African tax law
   */
  async assessDeductibility(category: string, amount: number, userSettings: TaxSettings): Promise<DeductibilityInfo> {
    const sarsMapping = await db
      .select()
      .from(sarsExpenseCategories)
      .where(eq(sarsExpenseCategories.category, category))
      .limit(1);
    
    if (sarsMapping.length === 0) {
      return {
        type: 'none',
        percentage: 0,
        requiresBusinessPercentage: false,
        complianceIssues: ['Category not recognized for tax deduction']
      };
    }
    
    const mapping = sarsMapping[0];
    const complianceIssues: string[] = [];
    
    // Calculate deductibility percentage based on type
    let percentage = 0;
    switch (mapping.deductibilityType) {
      case 'full':
        percentage = 100;
        break;
      case 'partial':
        if (category === 'Home Office' && userSettings.homeOfficePercentage) {
          percentage = userSettings.homeOfficePercentage;
        } else if (category === 'Utilities' && userSettings.businessCarPercentage) {
          percentage = userSettings.businessCarPercentage;
        } else {
          complianceIssues.push('Business percentage not configured');
        }
        break;
      case 'conditional':
        if (category === 'Transport' && userSettings.businessCarPercentage) {
          percentage = userSettings.businessCarPercentage;
        } else if (category === 'Communication' && userSettings.businessPhonePercentage) {
          percentage = userSettings.businessPhonePercentage;
        } else {
          complianceIssues.push('Business use percentage required');
        }
        break;
      case 'none':
        percentage = 0;
        complianceIssues.push('Personal expense - not deductible');
        break;
    }
    
    return {
      type: mapping.deductibilityType as 'full' | 'partial' | 'conditional' | 'none',
      percentage,
      requiresBusinessPercentage: mapping.businessPercentageRequired || false,
      sarsCode: mapping.sarsCode,
      sarsDescription: mapping.sarsDescription,
      complianceIssues
    };
  }

  /**
   * Check receipt completeness for SARS compliance
   */
  async checkReceiptCompliance(receipt: any, userSettings: TaxSettings): Promise<ReceiptComplianceCheck> {
    const missingFields: string[] = [];
    const isVATRegistered = !!userSettings.vatNumber;
    const requiresVAT = parseFloat(receipt.total) > 20; // VAT receipts required for amounts over R20
    
    // Check required fields
    if (!receipt.storeName || receipt.storeName.trim() === '') {
      missingFields.push('Store name');
    }
    if (!receipt.date) {
      missingFields.push('Transaction date');
    }
    if (!receipt.total || parseFloat(receipt.total) <= 0) {
      missingFields.push('Total amount');
    }
    if (!receipt.category) {
      missingFields.push('Expense category');
    }
    
    // Check VAT number for VAT-registered businesses
    const hasVATNumber = receipt.vatNumber || receipt.storeName?.includes('VAT');
    if (isVATRegistered && requiresVAT && !hasVATNumber) {
      missingFields.push('VAT number on receipt');
    }
    
    // Assess audit readiness
    let auditReadiness: 'ready' | 'incomplete' | 'flagged' = 'ready';
    if (missingFields.length > 0) {
      auditReadiness = 'incomplete';
    }
    if (parseFloat(receipt.total) > 5000 && !receipt.imageUrl) {
      auditReadiness = 'flagged';
      missingFields.push('Receipt image for high-value transaction');
    }
    
    return {
      isComplete: missingFields.length === 0,
      missingFields,
      requiresVAT,
      hasVATNumber,
      auditReadiness
    };
  }

  /**
   * Get tax year organization (March-February)
   */
  async getTaxYearReceipts(userId: number, taxYear: number): Promise<{
    receipts: any[];
    monthlyBreakdown: Array<{
      month: string;
      deductibleAmount: number;
      totalAmount: number;
      receiptCount: number;
    }>;
    provisionalTaxEstimate: number;
  }> {
    // Get user's workspace ID
    const [userRecord] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRecord) throw new Error(`User ${userId} not found`);
    const workspaceId = userRecord.workspaceId;
    
    const { startDate, endDate } = getTaxYearDates(taxYear);
    
    const yearReceipts = await db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.workspaceId, workspaceId),
          gte(receipts.date, startDate),
          lte(receipts.date, endDate)
        )
      )
      .orderBy(desc(receipts.date));
    
    // Calculate monthly breakdown
    const monthlyBreakdown = [];
    for (let i = 0; i < 12; i++) {
      const monthStart = addMonths(startDate, i);
      const monthEnd = endOfMonth(monthStart);
      const monthName = format(monthStart, 'MMM yyyy');
      
      const monthReceipts = yearReceipts.filter(r => 
        isAfter(r.date, monthStart) && isBefore(r.date, monthEnd)
      );
      
      const deductibleAmount = monthReceipts
        .filter(r => r.isTaxDeductible)
        .reduce((sum, r) => sum + parseFloat(r.total), 0);
      
      const totalAmount = monthReceipts
        .reduce((sum, r) => sum + parseFloat(r.total), 0);
      
      monthlyBreakdown.push({
        month: monthName,
        deductibleAmount,
        totalAmount,
        receiptCount: monthReceipts.length
      });
    }
    
    // Calculate provisional tax estimate (for business owners)
    const totalDeductible = yearReceipts
      .filter(r => r.isTaxDeductible)
      .reduce((sum, r) => sum + parseFloat(r.total), 0);
    
    const provisionalTaxEstimate = totalDeductible * 0.25; // Approximate 25% savings
    
    return {
      receipts: yearReceipts,
      monthlyBreakdown,
      provisionalTaxEstimate
    };
  }

  /**
   * Create audit trail entry for tax compliance
   */
  async createAuditTrail(
    receiptId: number,
    userId: number,
    action: string,
    fieldChanged?: string,
    oldValue?: string,
    newValue?: string,
    reason?: string
  ): Promise<void> {
    await db.insert(receiptAuditTrail).values({
      receiptId,
      userId,
      action,
      fieldChanged,
      oldValue,
      newValue,
      reason
    });
  }

  /**
   * Get audit trail for a receipt
   */
  async getReceiptAuditTrail(receiptId: number): Promise<any[]> {
    return await db
      .select()
      .from(receiptAuditTrail)
      .where(eq(receiptAuditTrail.receiptId, receiptId))
      .orderBy(desc(receiptAuditTrail.timestamp));
  }

  /**
   * Generate annual tax pack for SARS submission
   */
  async generateAnnualTaxPack(userId: number, taxYear: number): Promise<{
    summaryReport: Buffer;
    categoryBreakdown: any[];
    complianceReport: any[];
    auditTrail: any[];
  }> {
    const { receipts: yearReceipts, monthlyBreakdown } = await this.getTaxYearReceipts(userId, taxYear);
    
    // Category breakdown for SARS
    const categoryBreakdown = this.calculateCategoryBreakdown(
      yearReceipts.filter(r => r.isTaxDeductible)
    );
    
    // Compliance report
    const userSettings = await this.getUserTaxSettings(userId);
    const complianceReport = [];
    
    for (const receipt of yearReceipts) {
      const compliance = await this.checkReceiptCompliance(receipt, userSettings);
      if (!compliance.isComplete) {
        complianceReport.push({
          receiptId: receipt.id,
          storeName: receipt.storeName,
          date: receipt.date,
          amount: receipt.total,
          issues: compliance.missingFields
        });
      }
    }
    
    // Generate comprehensive PDF report
    const taxReportResult = await exportService.generateTaxReport(userId, taxYear);
    const summaryReport = taxReportResult.pdf;
    
    // Get audit trail for all receipts
    const auditTrail = await db
      .select()
      .from(receiptAuditTrail)
      .where(eq(receiptAuditTrail.userId, userId))
      .orderBy(desc(receiptAuditTrail.timestamp));
    
    return {
      summaryReport,
      categoryBreakdown,
      complianceReport,
      auditTrail
    };
  }
}

export const taxService = new TaxService();
