/**
 * Smart Search Integration Service
 * AI-powered cross-feature search functionality that connects receipt scanning and home page search
 */

export interface SearchContext {
  source: 'home' | 'scan' | 'receipts' | 'analytics' | 'budgets' | 'global';
  userId: number;
  currentData?: any[];
  filters?: SearchFilters;
}

export interface SearchFilters {
  dateRange?: { start: Date; end: Date };
  categories?: string[];
  amountRange?: { min: number; max: number };
  stores?: string[];
  tags?: string[];
  paymentMethods?: string[];
}

export interface SmartSearchResult {
  type: 'receipt' | 'category' | 'store' | 'insight' | 'action' | 'suggestion';
  id: string;
  title: string;
  description: string;
  relevance: number;
  data: any;
  actionUrl?: string;
  icon?: string;
  metadata?: {
    source: string;
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'semantic' | 'ai-generated' | 'suggestion';
  };
}

export interface SearchIntent {
  type: 'find' | 'analyze' | 'compare' | 'predict' | 'create' | 'export';
  target: 'receipts' | 'spending' | 'categories' | 'trends' | 'budgets';
  timeframe?: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  filters?: SearchFilters;
  naturalLanguage: string;
  confidence: number;
}

class SmartSearchIntegrationService {
  private readonly API_BASE = '/api';
  
  /**
   * Parse natural language query into structured search intent
   */
  async parseSearchIntent(query: string, context: SearchContext): Promise<SearchIntent> {
    const lowerQuery = query.toLowerCase().trim();
    
    // Detect intent type
    const intentPatterns = {
      find: /\b(find|show|search|get|see|display|list)\b/i,
      analyze: /\b(analyze|breakdown|summary|pattern|trend|insights?)\b/i,
      compare: /\b(compare|vs|versus|difference|against)\b/i,
      predict: /\b(predict|forecast|estimate|project|expect)\b/i,
      create: /\b(create|add|new|make|generate|build)\b/i,
      export: /\b(export|download|save|backup|pdf|csv)\b/i,
    };
    
    // Detect target
    const targetPatterns = {
      receipts: /\b(receipt|purchase|transaction|expense|bill|invoice)\b/i,
      spending: /\b(spend|spent|spending|money|cost|price|amount|total)\b/i,
      categories: /\b(categor|food|dining|transport|shopping|entertainment|business|health|travel)\b/i,
      trends: /\b(trend|pattern|history|over time|monthly|weekly|growth|decline)\b/i,
      budgets: /\b(budget|limit|allowance|plan|goal|target)\b/i,
    };
    
    // Detect timeframe
    const timePatterns = {
      today: /\b(today|now)\b/i,
      week: /\b(this week|weekly|past week|last week)\b/i,
      month: /\b(this month|monthly|past month|last month)\b/i,
      quarter: /\b(quarter|q1|q2|q3|q4|3 months)\b/i,
      year: /\b(this year|yearly|annual|past year|last year)\b/i,
    };
    
    // Extract amounts and ranges
    const amountMatches = query.match(/(?:R|ZAR|rand?s?)\s*(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s*(?:R|ZAR|rand?s?)/gi);
    const amounts = amountMatches?.map(match => parseFloat(match.replace(/[^\d.]/g, ''))) || [];
    
    // Determine intent
    const intent = Object.keys(intentPatterns).find(key => 
      intentPatterns[key as keyof typeof intentPatterns].test(lowerQuery)
    ) as keyof typeof intentPatterns || 'find';
    
    // Determine target
    const target = Object.keys(targetPatterns).find(key => 
      targetPatterns[key as keyof typeof targetPatterns].test(lowerQuery)
    ) as keyof typeof targetPatterns || 'receipts';
    
    // Determine timeframe
    const timeframe = Object.keys(timePatterns).find(key => 
      timePatterns[key as keyof typeof timePatterns].test(lowerQuery)
    ) as keyof typeof timePatterns;
    
    // Build filters
    const filters: SearchFilters = {};
    
    if (amounts.length > 0) {
      if (amounts.length === 1) {
        if (query.includes('>') || query.includes('over') || query.includes('above')) {
          filters.amountRange = { min: amounts[0], max: Infinity };
        } else if (query.includes('<') || query.includes('under') || query.includes('below')) {
          filters.amountRange = { min: 0, max: amounts[0] };
        }
      } else if (amounts.length === 2) {
        filters.amountRange = { min: Math.min(...amounts), max: Math.max(...amounts) };
      }
    }
    
    // Extract store names
    const commonStores = ['woolworths', 'checkers', 'pick n pay', 'spar', 'shoprite', 'dis-chem', 'clicks', 'pnp', 'kfc', 'mcdonald', 'steers', 'nando', 'pizza', 'uber', 'bolt'];
    const storeMatches = commonStores.filter(store => lowerQuery.includes(store));
    if (storeMatches.length > 0) {
      filters.stores = storeMatches;
    }
    
    // Calculate confidence based on how well we parsed the query
    let confidence = 0.5; // Base confidence
    if (intentPatterns[intent].test(lowerQuery)) confidence += 0.2;
    if (targetPatterns[target].test(lowerQuery)) confidence += 0.2;
    if (timeframe) confidence += 0.1;
    if (amounts.length > 0 || storeMatches.length > 0) confidence += 0.1;
    
    return {
      type: intent,
      target,
      timeframe,
      filters,
      naturalLanguage: query,
      confidence: Math.min(confidence, 1.0)
    };
  }
  
  /**
   * Execute smart search based on parsed intent
   */
  async executeSmartSearch(intent: SearchIntent, context: SearchContext): Promise<SmartSearchResult[]> {
    const results: SmartSearchResult[] = [];
    
    try {
      // Build API parameters based on intent
      const params = new URLSearchParams();
      params.append('q', intent.naturalLanguage);
      params.append('intent', intent.type);
      params.append('target', intent.target);
      params.append('source', context.source);
      
      if (intent.timeframe) {
        params.append('timeframe', intent.timeframe);
      }
      
      if (intent.filters) {
        if (intent.filters.amountRange) {
          if (intent.filters.amountRange.min > 0) {
            params.append('minAmount', intent.filters.amountRange.min.toString());
          }
          if (intent.filters.amountRange.max < Infinity) {
            params.append('maxAmount', intent.filters.amountRange.max.toString());
          }
        }
        
        if (intent.filters.stores?.length) {
          params.append('stores', intent.filters.stores.join(','));
        }
        
        if (intent.filters.categories?.length) {
          params.append('categories', intent.filters.categories.join(','));
        }
      }
      
      // Call the smart search API
      const response = await fetch(`${this.API_BASE}/smart-search?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      // Transform API results into SmartSearchResult format
      return this.transformSearchResults(data, intent, context);
      
    } catch (error) {
      console.error('Smart search execution failed:', error);
      
      // Fallback to context-aware suggestions
      return this.generateFallbackResults(intent, context);
    }
  }
  
  /**
   * Transform API results into standardized format
   */
  private transformSearchResults(data: any, intent: SearchIntent, context: SearchContext): SmartSearchResult[] {
    const results: SmartSearchResult[] = [];
    
    // Transform receipts
    if (data.receipts?.length) {
      data.receipts.forEach((receipt: any, index: number) => {
        results.push({
          type: 'receipt',
          id: `receipt-${receipt.id}`,
          title: receipt.storeName,
          description: `R${receipt.total} • ${new Date(receipt.date).toLocaleDateString()} • ${receipt.category}`,
          relevance: Math.max(0.9 - (index * 0.1), 0.1),
          data: receipt,
          actionUrl: `/receipt/${receipt.id}`,
          icon: 'receipt',
          metadata: {
            source: 'database',
            confidence: 0.9,
            matchType: 'exact'
          }
        });
      });
    }
    
    // Transform insights
    if (data.insights?.length) {
      data.insights.forEach((insight: any, index: number) => {
        results.push({
          type: 'insight',
          id: `insight-${index}`,
          title: insight.title,
          description: insight.description,
          relevance: 0.8 - (index * 0.1),
          data: insight,
          actionUrl: insight.actionUrl,
          icon: 'lightbulb',
          metadata: {
            source: 'ai-analysis',
            confidence: insight.confidence || 0.8,
            matchType: 'ai-generated'
          }
        });
      });
    }
    
    // Add actionable suggestions based on intent
    if (intent.type === 'create' && intent.target === 'budgets') {
      results.push({
        type: 'action',
        id: 'create-budget',
        title: 'Create New Budget',
        description: 'Set up a budget based on your spending patterns',
        relevance: 0.9,
        data: { action: 'create-budget' },
        actionUrl: '/budgets/create',
        icon: 'plus-circle',
        metadata: {
          source: 'system',
          confidence: 1.0,
          matchType: 'exact'
        }
      });
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
  
  /**
   * Generate fallback results when API fails
   */
  private generateFallbackResults(intent: SearchIntent, context: SearchContext): SmartSearchResult[] {
    const results: SmartSearchResult[] = [];
    
    // Context-aware suggestions based on current page
    switch (context.source) {
      case 'home':
        results.push({
          type: 'action',
          id: 'scan-receipt',
          title: 'Scan New Receipt',
          description: 'Add receipts to find more results',
          relevance: 0.8,
          data: { action: 'scan' },
          actionUrl: '/upload',
          icon: 'camera',
          metadata: {
            source: 'fallback',
            confidence: 0.8,
            matchType: 'suggestion'
          }
        });
        break;
        
      case 'scan':
        results.push({
          type: 'suggestion',
          id: 'search-existing',
          title: 'Search Existing Receipts',
          description: 'Find similar receipts you\'ve already scanned',
          relevance: 0.8,
          data: { suggestion: 'search' },
          actionUrl: '/search',
          icon: 'search',
          metadata: {
            source: 'fallback',
            confidence: 0.8,
            matchType: 'suggestion'
          }
        });
        break;
    }
    
    // Add general suggestions based on intent
    if (intent.target === 'spending' || intent.target === 'trends') {
      results.push({
        type: 'action',
        id: 'view-analytics',
        title: 'View Spending Analytics',
        description: 'Analyze your spending patterns and trends',
        relevance: 0.7,
        data: { action: 'analytics' },
        actionUrl: '/analytics',
        icon: 'bar-chart',
        metadata: {
          source: 'fallback',
          confidence: 0.7,
          matchType: 'suggestion'
        }
      });
    }
    
    return results;
  }
  
  /**
   * Get search suggestions based on partial input
   */
  async getSuggestions(partialQuery: string, context: SearchContext): Promise<string[]> {
    if (partialQuery.length < 2) return [];
    
    try {
      const response = await fetch(`${this.API_BASE}/search/suggestions?q=${encodeURIComponent(partialQuery)}&source=${context.source}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const suggestions = await response.json();
        return suggestions.slice(0, 8);
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    }
    
    // Fallback suggestions
    return this.generateContextSuggestions(partialQuery, context);
  }
  
  /**
   * Generate context-aware suggestions
   */
  private generateContextSuggestions(query: string, context: SearchContext): string[] {
    const lowerQuery = query.toLowerCase();
    const suggestions: string[] = [];
    
    // Common search patterns
    const patterns = [
      { trigger: 'food', suggestions: ['food this month', 'food under R100', 'food expenses this week'] },
      { trigger: 'coffee', suggestions: ['coffee purchases', 'coffee shops this month', 'coffee expenses'] },
      { trigger: 'grocery', suggestions: ['grocery stores', 'grocery spending this month', 'grocery receipts'] },
      { trigger: 'petrol', suggestions: ['petrol expenses', 'fuel costs this month', 'petrol stations'] },
      { trigger: 'restaurant', suggestions: ['restaurant visits', 'dining expenses', 'restaurant spending'] },
      { trigger: 'shopping', suggestions: ['shopping expenses', 'retail purchases', 'shopping this month'] },
      { trigger: 'medical', suggestions: ['medical expenses', 'pharmacy purchases', 'health spending'] },
      { trigger: 'uber', suggestions: ['uber rides', 'transport costs', 'rideshare expenses'] },
      { trigger: 'over', suggestions: ['over R100', 'over R500', 'over R1000'] },
      { trigger: 'under', suggestions: ['under R50', 'under R100', 'under R200'] },
      { trigger: 'this', suggestions: ['this month', 'this week', 'this year'] },
      { trigger: 'last', suggestions: ['last month', 'last week', 'last year'] },
    ];
    
    // Find matching patterns
    for (const pattern of patterns) {
      if (lowerQuery.includes(pattern.trigger)) {
        suggestions.push(...pattern.suggestions.filter(s => 
          s.toLowerCase().includes(lowerQuery) && !suggestions.includes(s)
        ));
      }
    }
    
    // Add amount-based suggestions if query contains numbers
    const hasNumbers = /\d/.test(query);
    if (hasNumbers) {
      suggestions.push(
        `${query} and above`,
        `${query} and below`,
        `between R${query} and R${parseInt(query) * 2}`
      );
    }
    
    return suggestions.slice(0, 8);
  }
  
  /**
   * Track search interactions for improving AI
   */
  async trackSearchInteraction(searchId: string, action: 'view' | 'click' | 'dismiss', resultId?: string): Promise<void> {
    try {
      await fetch(`${this.API_BASE}/search/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          searchId,
          action,
          resultId,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to track search interaction:', error);
    }
  }
}

export const smartSearchIntegration = new SmartSearchIntegrationService();