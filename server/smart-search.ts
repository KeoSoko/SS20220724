import { aiCategorizationService } from './ai-categorization.js';
import { storage } from './storage.js';
import type { Receipt } from '../shared/schema.js';

export interface SearchFilters {
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  categories?: string[];
  stores?: string[];
  paymentMethods?: string[];
  tags?: string[];
  isTaxDeductible?: boolean;
}

export interface SearchResult {
  receipts: Receipt[];
  totalCount: number;
  facets: {
    categories: { name: string; count: number }[];
    stores: { name: string; count: number }[];
    paymentMethods: { name: string; count: number }[];
    priceRanges: { range: string; count: number }[];
  };
}

export class SmartSearchService {
  /**
   * Perform intelligent search across receipts
   */
  async searchReceipts(
    userId: number,
    query: string,
    filters: SearchFilters = {},
    limit: number = 50,
    offset: number = 0
  ): Promise<SearchResult> {
    try {
      // Get all user receipts
      const allReceipts = await storage.getReceiptsByUser(userId, 10000);
      
      // Apply filters first
      let filteredReceipts = this.applyFilters(allReceipts, filters);
      
      // If there's a search query, use text search (AI search will be implemented later)
      if (query.trim()) {
        console.log(`[SmartSearch] Searching for: "${query}" in ${filteredReceipts.length} receipts`);
        
        // Use basic text search for now (more reliable)
        filteredReceipts = this.performBasicTextSearch(filteredReceipts, query);
        
        console.log(`[SmartSearch] Found ${filteredReceipts.length} matching receipts`);
        
        // Future: Enable AI search when API is available
        // try {
        //   const aiResults = await aiCategorizationService.smartSearch(query, filteredReceipts);
        //   if (aiResults.length > 0) {
        //     const relevanceMap = new Map(aiResults.map(r => [r.receiptId, r.relevance]));
        //     filteredReceipts = filteredReceipts
        //       .filter(r => relevanceMap.has(r.id))
        //       .sort((a, b) => (relevanceMap.get(b.id) || 0) - (relevanceMap.get(a.id) || 0));
        //   }
        // } catch (error) {
        //   console.log('[SmartSearch] AI search unavailable, using text search');
        // }
      }
      
      // Generate facets for filtering UI
      const facets = this.generateFacets(filteredReceipts);
      
      // Apply pagination
      const paginatedReceipts = filteredReceipts.slice(offset, offset + limit);
      
      return {
        receipts: paginatedReceipts,
        totalCount: filteredReceipts.length,
        facets
      };
    } catch (error) {
      console.error('Smart search failed:', error);
      return {
        receipts: [],
        totalCount: 0,
        facets: { categories: [], stores: [], paymentMethods: [], priceRanges: [] }
      };
    }
  }

  /**
   * Get search suggestions based on user's receipt history
   */
  async getSearchSuggestions(userId: number, partialQuery: string): Promise<string[]> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 1000);
      const suggestions = new Set<string>();
      
      const query = partialQuery.toLowerCase();
      const queryTerms = query.split(' ').filter(term => term.length > 0);
      
      // Extract suggestions from store names
      receipts.forEach(receipt => {
        const storeName = receipt.storeName.toLowerCase();
        
        // Match individual terms or full query
        if (storeName.includes(query) || queryTerms.some(term => storeName.includes(term))) {
          suggestions.add(receipt.storeName);
        }
        
        // Extract suggestions from items
        receipt.items.forEach(item => {
          const itemName = item.name.toLowerCase();
          if (itemName.includes(query) || queryTerms.some(term => itemName.includes(term))) {
            suggestions.add(item.name);
          }
        });
        
        // Add category suggestions
        const category = receipt.category.toLowerCase();
        if (category.includes(query) || queryTerms.some(term => category.includes(term))) {
          suggestions.add(receipt.category);
        }
      });
      
      // Add common search patterns for multi-word queries
      if (queryTerms.length > 1) {
        const storeNames = Array.from(new Set(receipts.map(r => r.storeName)));
        const categories = Array.from(new Set(receipts.map(r => r.category)));
        
        // Suggest store names with time periods
        storeNames.forEach(store => {
          if (queryTerms.some(term => store.toLowerCase().includes(term))) {
            suggestions.add(store);
          }
        });
        
        // Suggest categories with time periods
        categories.forEach(category => {
          if (queryTerms.some(term => category.toLowerCase().includes(term))) {
            suggestions.add(category);
          }
        });
      }
      
      return Array.from(suggestions).slice(0, 10);
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Find similar receipts based on content
   */
  async findSimilarReceipts(userId: number, receiptId: number, limit: number = 5): Promise<Receipt[]> {
    try {
      const targetReceipt = await storage.getReceipt(receiptId);
      if (!targetReceipt) return [];
      
      const allReceipts = await storage.getReceiptsByUser(userId, 1000);
      const otherReceipts = allReceipts.filter(r => r.id !== receiptId);
      
      // Calculate similarity scores
      const similarities = otherReceipts.map(receipt => ({
        receipt,
        score: this.calculateSimilarity(targetReceipt, receipt)
      }));
      
      // Sort by similarity and return top results
      return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.receipt);
    } catch (error) {
      console.error('Failed to find similar receipts:', error);
      return [];
    }
  }

  /**
   * Get spending insights based on search patterns
   */
  async getSpendingInsights(userId: number, category?: string): Promise<{
    averageSpending: number;
    topStores: { name: string; amount: number; frequency: number }[];
    spendingTrend: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
  }> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 1000);
      const filteredReceipts = category 
        ? receipts.filter(r => r.category === category)
        : receipts;
      
      // Calculate average spending
      const totalAmount = filteredReceipts.reduce((sum, r) => sum + parseFloat(r.total), 0);
      const averageSpending = totalAmount / filteredReceipts.length;
      
      // Get top stores
      const storeMap = new Map<string, { amount: number; frequency: number }>();
      filteredReceipts.forEach(receipt => {
        const store = receipt.storeName;
        const current = storeMap.get(store) || { amount: 0, frequency: 0 };
        storeMap.set(store, {
          amount: current.amount + parseFloat(receipt.total),
          frequency: current.frequency + 1
        });
      });
      
      const topStores = Array.from(storeMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      
      // Analyze spending trend (simplified)
      const spendingTrend = this.analyzeSpendingTrend(filteredReceipts);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(filteredReceipts, topStores);
      
      return {
        averageSpending,
        topStores,
        spendingTrend,
        recommendations
      };
    } catch (error) {
      console.error('Failed to get spending insights:', error);
      return {
        averageSpending: 0,
        topStores: [],
        spendingTrend: 'stable',
        recommendations: []
      };
    }
  }

  // Private helper methods
  private applyFilters(receipts: Receipt[], filters: SearchFilters): Receipt[] {
    return receipts.filter(receipt => {
      if (filters.startDate && receipt.date < filters.startDate) return false;
      if (filters.endDate && receipt.date > filters.endDate) return false;
      
      const amount = parseFloat(receipt.total);
      if (filters.minAmount && amount < filters.minAmount) return false;
      if (filters.maxAmount && amount > filters.maxAmount) return false;
      
      if (filters.categories && !filters.categories.includes(receipt.category)) return false;
      if (filters.stores && !filters.stores.includes(receipt.storeName)) return false;
      if (filters.paymentMethods && receipt.paymentMethod && !filters.paymentMethods.includes(receipt.paymentMethod)) return false;
      if (filters.isTaxDeductible !== undefined && receipt.isTaxDeductible !== filters.isTaxDeductible) return false;
      
      return true;
    });
  }

  private performBasicTextSearch(receipts: Receipt[], query: string): Receipt[] {
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    
    return receipts.filter(receipt => {
      const searchableText = [
        receipt.storeName,
        receipt.category,
        receipt.notes || '',
        receipt.subcategory || '',
        receipt.paymentMethod || '',
        ...receipt.items.map(item => item.name)
      ].join(' ').toLowerCase();
      
      // More flexible search: if any search term matches, include the receipt
      const exactMatch = searchTerms.every(term => searchableText.includes(term));
      const partialMatch = searchTerms.some(term => searchableText.includes(term));
      
      console.log(`[Search] Receipt "${receipt.storeName}" searchable: "${searchableText.substring(0, 50)}..." terms: [${searchTerms.join(', ')}] exactMatch: ${exactMatch}, partialMatch: ${partialMatch}`);
      
      // Use partial match for more flexible search results
      return partialMatch;
    });
  }

  private generateFacets(receipts: Receipt[]) {
    const categories = new Map<string, number>();
    const stores = new Map<string, number>();
    const paymentMethods = new Map<string, number>();
    const priceRanges = new Map<string, number>();
    
    receipts.forEach(receipt => {
      // Categories
      categories.set(receipt.category, (categories.get(receipt.category) || 0) + 1);
      
      // Stores
      stores.set(receipt.storeName, (stores.get(receipt.storeName) || 0) + 1);
      
      // Payment methods
      if (receipt.paymentMethod) {
        paymentMethods.set(receipt.paymentMethod, (paymentMethods.get(receipt.paymentMethod) || 0) + 1);
      }
      
      // Price ranges
      const amount = parseFloat(receipt.total);
      const range = this.getPriceRange(amount);
      priceRanges.set(range, (priceRanges.get(range) || 0) + 1);
    });
    
    return {
      categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      stores: Array.from(stores.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      paymentMethods: Array.from(paymentMethods.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      priceRanges: Array.from(priceRanges.entries()).map(([range, count]) => ({ range, count }))
    };
  }

  private calculateSimilarity(receipt1: Receipt, receipt2: Receipt): number {
    let score = 0;
    
    // Same store = high similarity
    if (receipt1.storeName === receipt2.storeName) score += 0.4;
    
    // Same category = medium similarity
    if (receipt1.category === receipt2.category) score += 0.3;
    
    // Similar amount = low similarity
    const amount1 = parseFloat(receipt1.total);
    const amount2 = parseFloat(receipt2.total);
    const amountDiff = Math.abs(amount1 - amount2) / Math.max(amount1, amount2);
    if (amountDiff < 0.2) score += 0.2;
    
    // Similar items = medium similarity
    const items1 = receipt1.items.map(i => i.name.toLowerCase());
    const items2 = receipt2.items.map(i => i.name.toLowerCase());
    const items2Set = new Set(items2);
    const commonItems = items1.filter(x => items2Set.has(x));
    const itemSimilarity = commonItems.length / Math.max(items1.length, items2.length);
    score += itemSimilarity * 0.1;
    
    return score;
  }

  private getPriceRange(amount: number): string {
    if (amount < 50) return 'Under R50';
    if (amount < 100) return 'R50 - R100';
    if (amount < 250) return 'R100 - R250';
    if (amount < 500) return 'R250 - R500';
    if (amount < 1000) return 'R500 - R1000';
    return 'Over R1000';
  }

  private analyzeSpendingTrend(receipts: Receipt[]): 'increasing' | 'decreasing' | 'stable' {
    if (receipts.length < 4) return 'stable';
    
    // Sort by date
    const sortedReceipts = receipts.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Compare first and second half
    const midpoint = Math.floor(sortedReceipts.length / 2);
    const firstHalf = sortedReceipts.slice(0, midpoint);
    const secondHalf = sortedReceipts.slice(midpoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, r) => sum + parseFloat(r.total), 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, r) => sum + parseFloat(r.total), 0) / secondHalf.length;
    
    const change = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private generateRecommendations(receipts: Receipt[], topStores: any[]): string[] {
    const recommendations: string[] = [];
    
    if (topStores.length > 0) {
      const topStore = topStores[0];
      recommendations.push(`You spend most at ${topStore.name}. Consider looking for alternatives or special offers.`);
    }
    
    // Add more intelligent recommendations based on spending patterns
    const categorySpending = new Map<string, number>();
    receipts.forEach(receipt => {
      const current = categorySpending.get(receipt.category) || 0;
      categorySpending.set(receipt.category, current + parseFloat(receipt.total));
    });
    
    const sortedCategories = Array.from(categorySpending.entries()).sort((a, b) => b[1] - a[1]);
    if (sortedCategories.length > 0) {
      const topCategory = sortedCategories[0];
      recommendations.push(`${topCategory[0]} is your highest spending category at R${topCategory[1].toFixed(2)}.`);
    }
    
    return recommendations;
  }
}

export const smartSearchService = new SmartSearchService();