import { EXPENSE_CATEGORIES } from '@shared/schema';

type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

interface SmartPrediction {
  category: ExpenseCategory;
  confidence: number;
  reasoning: string;
  suggestedTags?: string[];
}

/**
 * Smart categorization based on store names and patterns
 */
export function predictCategory(storeName: string, amount?: number): SmartPrediction {
  const name = storeName.toLowerCase().trim();
  
  // High confidence store patterns
  const storePatterns = [
    // Groceries
    {
      pattern: /checkers|pick.*pay|woolworths|spar|food.*lovers|game.*stores/i,
      category: 'groceries' as ExpenseCategory,
      confidence: 0.9,
      reasoning: 'Major grocery store chain'
    },
    // Fuel/Transportation
    {
      pattern: /bp|shell|sasol|caltex|engen|total/i,
      category: 'fuel' as ExpenseCategory,
      confidence: 0.95,
      reasoning: 'Known fuel station brand'
    },
    // Dining
    {
      pattern: /kfc|mcdonald|steers|nando|wimpy|spur|ocean.*basket/i,
      category: 'dining_takeaways' as ExpenseCategory,
      confidence: 0.9,
      reasoning: 'Restaurant chain'
    },
    // Coffee
    {
      pattern: /starbucks|vida.*cafe|seattle.*coffee|mugg.*bean/i,
      category: 'dining_takeaways' as ExpenseCategory,
      confidence: 0.85,
      reasoning: 'Coffee shop chain',
      tags: ['coffee']
    },
    // Pharmacies
    {
      pattern: /clicks|dis.*chem|link.*pharmacy/i,
      category: 'pharmacy_medication' as ExpenseCategory,
      confidence: 0.9,
      reasoning: 'Pharmacy chain'
    },
    // Clothing
    {
      pattern: /mrp|edgars|truworths|foschini|ackermans/i,
      category: 'clothing_shopping' as ExpenseCategory,
      confidence: 0.85,
      reasoning: 'Clothing retailer',
      tags: ['clothing']
    },
    // Electronics
    {
      pattern: /game|incredible.*connection|takealot|musica/i,
      category: 'clothing_shopping' as ExpenseCategory,
      confidence: 0.8,
      reasoning: 'Electronics retailer',
      tags: ['electronics']
    }
  ];

  // Check store patterns first
  for (const { pattern, category, confidence, reasoning, tags } of storePatterns) {
    if (pattern.test(name)) {
      return {
        category,
        confidence,
        reasoning,
        suggestedTags: tags
      };
    }
  }

  // Keyword-based categorization
  const keywordPatterns = [
    {
      keywords: ['cafe', 'restaurant', 'bistro', 'grill', 'kitchen', 'diner'],
      category: 'dining_takeaways' as ExpenseCategory,
      confidence: 0.7,
      reasoning: 'Contains dining-related keywords'
    },
    {
      keywords: ['supermarket', 'market', 'grocery', 'fresh', 'butchery'],
      category: 'groceries' as ExpenseCategory,
      confidence: 0.75,
      reasoning: 'Contains grocery-related keywords'
    },
    {
      keywords: ['garage', 'station', 'petrol', 'fuel'],
      category: 'fuel' as ExpenseCategory,
      confidence: 0.8,
      reasoning: 'Contains fuel-related keywords'
    },
    {
      keywords: ['pharmacy', 'chemist', 'clinic', 'medical', 'health'],
      category: 'pharmacy_medication' as ExpenseCategory,
      confidence: 0.75,
      reasoning: 'Contains medical-related keywords'
    },
    {
      keywords: ['store', 'shop', 'mall', 'retail', 'boutique'],
      category: 'clothing_shopping' as ExpenseCategory,
      confidence: 0.6,
      reasoning: 'Contains shopping-related keywords'
    },
    {
      keywords: ['transport', 'taxi', 'uber', 'bolt', 'bus'],
      category: 'transport_public_taxi' as ExpenseCategory,
      confidence: 0.8,
      reasoning: 'Contains transport-related keywords'
    }
  ];

  for (const { keywords, category, confidence, reasoning } of keywordPatterns) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return {
        category,
        confidence,
        reasoning
      };
    }
  }

  // Amount-based heuristics
  if (amount) {
    if (amount < 20) {
      return {
        category: 'dining_takeaways',
        confidence: 0.4,
        reasoning: 'Small amount suggests snack or coffee',
        suggestedTags: ['small-purchase']
      };
    }
    
    if (amount > 1000) {
      return {
        category: 'other',
        confidence: 0.5,
        reasoning: 'Large amount suggests major purchase',
        suggestedTags: ['large-purchase']
      };
    }
  }

  // Fallback
  return {
    category: 'other',
    confidence: 0.1,
    reasoning: 'Unable to determine category automatically'
  };
}

/**
 * Suggest smart tags based on store name and amount
 */
export function suggestTags(storeName: string, amount: number, category: ExpenseCategory): string[] {
  const tags: string[] = [];
  const name = storeName.toLowerCase();

  // Amount-based tags
  if (amount < 50) tags.push('small-purchase');
  else if (amount > 500) tags.push('large-purchase');

  // Category-specific tags
  switch (category) {
    case 'dining_takeaways':
      if (name.includes('coffee') || name.includes('cafe')) tags.push('coffee');
      if (name.includes('takeaway') || name.includes('delivery')) tags.push('takeaway');
      break;
    case 'groceries':
      if (amount > 300) tags.push('weekly-shop');
      break;
    case 'transport_public_taxi':
    case 'fuel':
      tags.push('vehicle-expense');
      break;
    case 'pharmacy_medication':
      if (name.includes('pharmacy')) tags.push('medication');
      break;
  }

  // Time-based suggestions (would be enhanced with actual date)
  const hour = new Date().getHours();
  if (category === 'dining_takeaways') {
    if (hour < 10) tags.push('breakfast');
    else if (hour < 15) tags.push('lunch');
    else tags.push('dinner');
  }

  return tags;
}

/**
 * Smart form pre-filling based on recent receipts
 */
export interface SmartDefaults {
  category?: ExpenseCategory;
  tags?: string[];
  isPersonal?: boolean;
  notes?: string;
}

export function getSmartDefaults(
  storeName: string, 
  amount: number,
  recentReceipts?: Array<{ storeName: string; category: ExpenseCategory; tags: string[] }>
): SmartDefaults {
  const prediction = predictCategory(storeName, amount);
  
  // Check recent receipts for this store
  const recentFromStore = recentReceipts?.find(
    receipt => receipt.storeName.toLowerCase() === storeName.toLowerCase()
  );

  if (recentFromStore) {
    return {
      category: recentFromStore.category,
      tags: recentFromStore.tags,
      isPersonal: true, // Default assumption
      notes: `Previous purchase from ${storeName}`
    };
  }

  return {
    category: prediction.category,
    tags: suggestTags(storeName, amount, prediction.category),
    isPersonal: true
  };
}

/**
 * Natural language search query parsing
 */
export function parseSearchQuery(query: string): {
  category?: ExpenseCategory;
  store?: string;
  amountRange?: { min?: number; max?: number };
  dateRange?: { start?: Date; end?: Date };
  tags?: string[];
} {
  const result: any = {};
  const lowerQuery = query.toLowerCase();

  // Amount parsing
  const amountMatch = lowerQuery.match(/(?:under|less than|below)\s*r?(\d+)/);
  if (amountMatch) {
    result.amountRange = { max: parseInt(amountMatch[1]) };
  }

  const overMatch = lowerQuery.match(/(?:over|more than|above)\s*r?(\d+)/);
  if (overMatch) {
    result.amountRange = { min: parseInt(overMatch[1]) };
  }

  // Date parsing
  if (lowerQuery.includes('last week')) {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    result.dateRange = { start: lastWeek };
  }

  if (lowerQuery.includes('this month')) {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    result.dateRange = { start: thisMonth };
  }

  // Category detection
  const categories = ['food', 'dining', 'groceries', 'fuel', 'shopping', 'medical', 'transport'];
  for (const category of categories) {
    if (lowerQuery.includes(category)) {
      result.category = category;
      break;
    }
  }

  return result;
}