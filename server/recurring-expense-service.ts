import { storage } from "./storage";
import { Receipt } from "../shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { receipts, users } from "../shared/schema";

interface RecurringPattern {
  storeName: string;
  category: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  averageAmount: number;
  confidence: number;
  lastSeen: Date;
  occurrences: number;
  nextExpectedDate?: Date;
  variance: number; // Amount variance percentage
}

interface RecurringExpenseMatch {
  isRecurring: boolean;
  pattern?: RecurringPattern;
  confidence: number;
  suggestedFrequency?: string;
  similarReceipts: Receipt[];
}

export class RecurringExpenseService {
  private readonly COMMON_RECURRING_STORES = new Set([
    // Subscriptions
    'netflix', 'spotify', 'dstv', 'showmax', 'apple', 'google', 'microsoft',
    // Utilities
    'eskom', 'city power', 'municipal', 'water board', 'telkom', 'vodacom', 'mtn', 'cell c',
    // Insurance
    'discovery', 'momentum', 'santam', 'outsurance', 'old mutual', 'sanlam',
    // Banking
    'fnb', 'standard bank', 'absa', 'nedbank', 'capitec',
    // Gym & Fitness
    'virgin active', 'planet fitness', 'anytime fitness',
    // Transport
    'uber', 'bolt', 'gautrain', 'metrobus'
  ]);

  private readonly RECURRING_CATEGORIES = new Set([
    'utilities', 'telecommunications', 'insurance', 'banking_fees', 
    'entertainment', 'healthcare', 'municipal_services', 'rent'
  ]);

  /**
   * Analyze a new receipt to determine if it's part of a recurring expense pattern
   */
  async analyzeRecurringPattern(userId: number, newReceipt: Receipt): Promise<RecurringExpenseMatch> {
    try {
      // Get user's workspace ID
      const [userRecord] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
      if (!userRecord) throw new Error(`User ${userId} not found`);
      const workspaceId = userRecord.workspaceId;
      
      // Get user's historical receipts (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      
      // Get historical receipts from database
      const historicalReceipts: Receipt[] = await db.select()
        .from(receipts)
        .where(
          and(
            eq(receipts.workspaceId, workspaceId),
            gte(receipts.date, twelveMonthsAgo)
          )
        )
        .orderBy(sql`${receipts.date} DESC`);

      // Find similar receipts by store name
      const similarReceipts = this.findSimilarReceipts(newReceipt, historicalReceipts);
      
      if (similarReceipts.length < 2) {
        return {
          isRecurring: false,
          confidence: 0,
          similarReceipts: []
        };
      }

      // Analyze the pattern
      const pattern = this.analyzePattern(newReceipt, similarReceipts);
      
      return {
        isRecurring: pattern.confidence > 0.7,
        pattern,
        confidence: pattern.confidence,
        suggestedFrequency: pattern.frequency,
        similarReceipts: similarReceipts.slice(0, 5) // Return top 5 similar receipts
      };
    } catch (error) {
      console.error('Error analyzing recurring pattern:', error);
      return {
        isRecurring: false,
        confidence: 0,
        similarReceipts: []
      };
    }
  }

  /**
   * Find receipts similar to the current one
   */
  private findSimilarReceipts(receipt: Receipt, historicalReceipts: Receipt[]): Receipt[] {
    const currentStoreNormalized = this.normalizeStoreName(receipt.storeName);
    const currentAmount = parseFloat(receipt.total);
    
    return historicalReceipts
      .filter(r => {
        const storeNormalized = this.normalizeStoreName(r.storeName);
        const amount = parseFloat(r.total);
        
        // Store name similarity
        const storeMatch = this.calculateStringSimilarity(currentStoreNormalized, storeNormalized) > 0.8;
        
        // Amount similarity (within 20% variance)
        const amountMatch = Math.abs(amount - currentAmount) / currentAmount < 0.2;
        
        return storeMatch && amountMatch;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Analyze the pattern from similar receipts
   */
  private analyzePattern(currentReceipt: Receipt, similarReceipts: Receipt[]): RecurringPattern {
    const allReceipts = [currentReceipt, ...similarReceipts];
    const amounts = allReceipts.map(r => parseFloat(r.total));
    const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    // Calculate variance
    const variance = Math.sqrt(
      amounts.reduce((acc, amount) => acc + Math.pow(amount - averageAmount, 2), 0) / amounts.length
    ) / averageAmount;

    // Analyze frequency
    const frequency = this.detectFrequency(allReceipts);
    
    // Calculate confidence based on various factors
    const confidence = this.calculateConfidence(
      currentReceipt,
      similarReceipts,
      frequency,
      variance
    );

    return {
      storeName: currentReceipt.storeName,
      category: currentReceipt.category,
      frequency,
      averageAmount,
      confidence,
      lastSeen: currentReceipt.date,
      occurrences: allReceipts.length,
      nextExpectedDate: this.calculateNextExpectedDate(currentReceipt.date, frequency),
      variance
    };
  }

  /**
   * Detect the frequency pattern from receipt dates
   */
  private detectFrequency(receipts: Receipt[]): 'weekly' | 'monthly' | 'quarterly' | 'yearly' {
    if (receipts.length < 2) return 'monthly';
    
    const sortedReceipts = receipts.sort((a, b) => a.date.getTime() - b.date.getTime());
    const intervals: number[] = [];
    
    for (let i = 1; i < sortedReceipts.length; i++) {
      const daysDiff = Math.abs(
        (sortedReceipts[i].date.getTime() - sortedReceipts[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }
    
    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    
    if (averageInterval <= 10) return 'weekly';
    if (averageInterval <= 45) return 'monthly';
    if (averageInterval <= 120) return 'quarterly';
    return 'yearly';
  }

  /**
   * Calculate confidence score for recurring pattern
   */
  private calculateConfidence(
    currentReceipt: Receipt,
    similarReceipts: Receipt[],
    frequency: string,
    variance: number
  ): number {
    let confidence = 0;
    
    // Base confidence from number of occurrences
    confidence += Math.min(similarReceipts.length * 0.15, 0.4);
    
    // Store name recognition bonus
    const normalizedStore = this.normalizeStoreName(currentReceipt.storeName);
    if (this.COMMON_RECURRING_STORES.has(normalizedStore)) {
      confidence += 0.3;
    }
    
    // Category bonus
    if (this.RECURRING_CATEGORIES.has(currentReceipt.category)) {
      confidence += 0.2;
    }
    
    // Low variance bonus (consistent amounts)
    if (variance < 0.1) {
      confidence += 0.2;
    } else if (variance < 0.2) {
      confidence += 0.1;
    }
    
    // Frequency consistency bonus
    if (frequency === 'monthly' && similarReceipts.length >= 3) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate when the next occurrence is expected
   */
  private calculateNextExpectedDate(lastDate: Date, frequency: string): Date {
    const nextDate = new Date(lastDate);
    
    switch (frequency) {
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
    
    return nextDate;
  }

  /**
   * Get all recurring patterns for a user
   */
  async getUserRecurringPatterns(userId: number): Promise<RecurringPattern[]> {
    try {
      // Get user's workspace ID
      const [userRecord] = await db.select({ workspaceId: users.workspaceId }).from(users).where(eq(users.id, userId)).limit(1);
      if (!userRecord) throw new Error(`User ${userId} not found`);
      const workspaceId = userRecord.workspaceId;
      
      // Get all user receipts from database
      const userReceipts: Receipt[] = await db.select()
        .from(receipts)
        .where(eq(receipts.workspaceId, workspaceId))
        .orderBy(sql`${receipts.date} DESC`);

      // Group receipts by normalized store name
      const storeGroups = new Map<string, Receipt[]>();
      
      for (const receipt of userReceipts) {
        const normalizedStore = this.normalizeStoreName(receipt.storeName);
        if (!storeGroups.has(normalizedStore)) {
          storeGroups.set(normalizedStore, []);
        }
        storeGroups.get(normalizedStore)!.push(receipt);
      }

      const patterns: RecurringPattern[] = [];
      
      for (const [storeName, receipts] of Array.from(storeGroups.entries())) {
        if (receipts.length >= 3) { // At least 3 occurrences to be considered recurring
          const pattern = this.analyzePattern(receipts[0], receipts.slice(1));
          if (pattern.confidence > 0.6) {
            patterns.push(pattern);
          }
        }
      }

      return patterns.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error getting user recurring patterns:', error);
      return [];
    }
  }

  /**
   * Update a receipt to mark it as recurring
   */
  async markAsRecurring(receiptId: number, frequency: string): Promise<boolean> {
    try {
      const receipt = await storage.getReceipt(receiptId);
      if (!receipt) return false;

      const updates = {
        isRecurring: true,
        frequency
      };

      const updatedReceipt = await storage.updateReceipt(receiptId, updates);
      return !!updatedReceipt;
    } catch (error) {
      console.error('Error marking receipt as recurring:', error);
      return false;
    }
  }

  /**
   * Get upcoming recurring expenses for a user
   */
  async getUpcomingRecurringExpenses(userId: number): Promise<Array<{
    pattern: RecurringPattern;
    daysUntilDue: number;
    isOverdue: boolean;
  }>> {
    try {
      const patterns = await this.getUserRecurringPatterns(userId);
      const today = new Date();
      
      return patterns
        .filter(p => p.nextExpectedDate)
        .map(pattern => {
          const daysUntilDue = Math.ceil(
            (pattern.nextExpectedDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          return {
            pattern,
            daysUntilDue,
            isOverdue: daysUntilDue < 0
          };
        })
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    } catch (error) {
      console.error('Error getting upcoming recurring expenses:', error);
      return [];
    }
  }

  /**
   * Normalize store name for comparison
   */
  private normalizeStoreName(storeName: string): string {
    return storeName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

export const recurringExpenseService = new RecurringExpenseService();