import OpenAI from 'openai';
import { storage } from './storage.ts';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TaxQuestion {
  id: string;
  userId: number;
  question: string;
  response: string;
  category: 'deductions' | 'deadlines' | 'documentation' | 'calculations' | 'general';
  confidence: number;
  timestamp: Date;
  followUpSuggestions: string[];
}

export interface TaxContext {
  userId: number;
  ytdDeductible: number;
  totalReceipts: number;
  deductibleReceipts: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  currentTaxYear: number;
  daysUntilDeadline: number;
}

export class TaxAIAssistant {
  /**
   * Process tax-related questions with South African tax law context
   */
  async askTaxQuestion(
    userId: number,
    question: string,
    context?: TaxContext
  ): Promise<TaxQuestion> {
    try {
      // Get user's receipt data for context
      const userReceipts = await storage.getReceiptsByUser(userId, 100);
      const userCategories = await storage.getCategorySummary(userId);
      
      // Build comprehensive context
      const taxContext = context || await this.buildTaxContext(userId);
      
      const systemPrompt = `You are a South African tax information bot providing general information based on publicly available SARS documentation for the 2024-2025 tax year.

⚠️ IMPORTANT: All information provided is sourced from publicly available SARS documentation and is for informational purposes only. Simple Slips is not a registered tax practitioner. Users must consult qualified tax professionals and official SARS resources for tax advice and filing assistance.

Current South African Tax Information (Source: www.sars.gov.za):
- Tax year: March 2025 - February 2026
- Filing deadline: October 31, 2025 (individuals), July 31, 2025 (provisional taxpayers) - Source: SARS Tax Calendar
- Individual tax brackets (2024/25) - Source: SARS Tax Tables:
  * R0 - R237,100: 18%
  * R237,101 - R370,500: 26%
  * R370,501 - R512,800: 31%
  * R512,801 - R673,000: 36%
  * R673,001 - R857,900: 39%
  * R857,901 - R1,817,000: 41%
  * R1,817,001+: 45%

Common Deductions (Source: SARS Guide for Individual Taxpayers):
- Medical expenses (above medical aid contributions)
- Retirement contributions (27.5% of income, max R350,000)
- Travel allowance (actual costs vs. SARS rate)
- Home office expenses (if working from home)
- Educational expenses
- Charitable donations (max 10% of taxable income)

Source: www.sars.gov.za - Individual Income Tax Guide

User's Current Tax Situation:
- Total deductible amount: R${taxContext.ytdDeductible.toLocaleString()}
- Deductible receipts: ${taxContext.deductibleReceipts}
- Total receipts: ${taxContext.totalReceipts}
- Main expense categories: ${userCategories.map(c => `${c.category}: R${c.total.toLocaleString()}`).join(', ')}
- Days until tax season: ${taxContext.daysUntilDeadline}

Guidelines:
1. Provide South African tax information based on publicly available SARS documentation
2. Always cite SARS (www.sars.gov.za) as the official source for all tax information
3. Suggest record-keeping and organizational actions based on user's receipt data
4. ALWAYS include clear disclaimers that this is informational only, not professional tax advice
5. Direct users to consult registered tax practitioners for tax advice and filing assistance
6. Provide follow-up questions as things the USER can ask YOU (not questions you're asking them)
7. Focus on helping users understand publicly available SARS information about deductions
8. Explain information from SARS documentation - not personalized tax strategies
9. Always remind users Simple Slips is not a registered tax practitioner and is not affiliated with SARS or government entities

IMPORTANT: Follow-up suggestions should be phrased as questions the user can ask you, such as:
- "What medical expenses are deductible?"
- "How do I calculate home office deductions?"
- "What documentation do I need for travel expenses?"

NOT as questions directed at the user like:
- "Do you have medical aid contributions?"
- "Have you incurred any out-of-pocket medical expenses?"

MANDATORY: Every response must include source attribution and disclaimers with clickable links.

Respond in JSON format with:
{
  "response": "General tax information based on publicly available SARS documentation. Always end with: 'Source: <a href=\"https://www.sars.gov.za\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-blue-600 hover:text-blue-800 underline\">www.sars.gov.za</a>. This information is for general reference only - consult a registered tax practitioner for professional tax advice and filing assistance.'",
  "category": "deductions|deadlines|documentation|calculations|general",
  "confidence": 0.0-1.0,
  "followUpSuggestions": ["Question user can ask about topic 1", "Question user can ask about topic 2"],
  "actionItems": ["Specific organizational or record-keeping action user should take"],
  "warningsOrDisclaimer": "⚠️ This information is for general reference only. Simple Slips is not a registered tax practitioner and is not affiliated with SARS. Consult a registered tax practitioner and visit www.sars.gov.za for professional tax advice."
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500
      });

      const aiResponse = JSON.parse(response.choices[0].message.content || '{}');

      const taxQuestion: TaxQuestion = {
        id: `tax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        question,
        response: aiResponse.response || 'Unable to process your question at this time.',
        category: aiResponse.category || 'general',
        confidence: aiResponse.confidence || 0.7,
        timestamp: new Date(),
        followUpSuggestions: aiResponse.followUpSuggestions || []
      };

      // Store the question and response for learning
      await this.storeTaxQuestion(taxQuestion);

      return taxQuestion;

    } catch (error) {
      console.error('[TAX AI] Error processing tax question:', error);
      
      // Fallback response
      return {
        id: `tax_error_${Date.now()}`,
        userId,
        question,
        response: 'I apologize, but I\'m unable to process your tax question right now. Please try again or consult with a registered tax practitioner for professional tax advice.',
        category: 'general',
        confidence: 0.1,
        timestamp: new Date(),
        followUpSuggestions: [
          'Can you rephrase your question?',
          'Would you like general tax filing information?'
        ]
      };
    }
  }

  /**
   * Get personalized record-keeping suggestions based on user's receipt patterns
   */
  async getPersonalizedTaxTips(userId: number): Promise<string[]> {
    try {
      const context = await this.buildTaxContext(userId);
      const userCategories = await storage.getCategorySummary(userId);

      const systemPrompt = `Based on this South African user's expense patterns, provide 3-5 record-keeping and organizational suggestions to help them track expenses that may be relevant for tax purposes in the 2024-2025 tax year. Focus on documentation and organization, not tax strategy.

User's Data:
- Total tracked expenses: R${context.ytdDeductible.toLocaleString()}
- Categories: ${userCategories.map(c => `${c.category}: R${c.total.toLocaleString()}`).join(', ')}
- Receipt count: ${context.totalReceipts}

Respond with JSON array of specific, organizational suggestions:
["Suggestion 1", "Suggestion 2", "Suggestion 3"]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 800
      });

      const result = JSON.parse(response.choices[0].message.content || '{"tips": []}');
      return result.tips || result || [];

    } catch (error) {
      console.error('[TAX AI] Error generating tax tips:', error);
      return [
        'Keep records of medical expense receipts separate from medical aid contributions',
        'Track and organize business travel and home office expense receipts if you work from home',
        'Maintain organized records of retirement contribution statements for reference'
      ];
    }
  }

  /**
   * Analyze receipts for potential missed deductions
   */
  async analyzeMissedDeductions(userId: number): Promise<{
    potentialDeductions: Array<{
      category: string;
      amount: number;
      description: string;
      action: string;
    }>;
    totalPotential: number;
    confidence: number;
  }> {
    try {
      const receipts = await storage.getReceiptsByUser(userId, 200);
      const categories = await storage.getCategorySummary(userId);

      const systemPrompt = `Analyze this South African taxpayer's receipts for potential missed tax deductions in 2024-2025.

Receipt data: ${JSON.stringify(categories)}

Look for:
1. Medical expenses that might qualify for deduction
2. Work-related expenses
3. Educational expenses
4. Charitable donations
5. Home office expenses
6. Professional development costs

Respond in JSON format:
{
  "potentialDeductions": [
    {
      "category": "Medical",
      "amount": 1500,
      "description": "Medical expenses above medical aid contributions",
      "action": "Collect medical certificates and statements"
    }
  ],
  "totalPotential": 5000,
  "confidence": 0.8
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      return JSON.parse(response.choices[0].message.content || '{"potentialDeductions": [], "totalPotential": 0, "confidence": 0}');

    } catch (error) {
      console.error('[TAX AI] Error analyzing missed deductions:', error);
      return {
        potentialDeductions: [],
        totalPotential: 0,
        confidence: 0
      };
    }
  }

  /**
   * Build tax context from user's data
   */
  private async buildTaxContext(userId: number): Promise<TaxContext> {
    const receipts = await storage.getReceiptsByUser(userId, 200);
    const categories = await storage.getCategorySummary(userId);
    
    const currentDate = new Date();
    const taxYearEnd = new Date(2025, 1, 28); // Feb 28, 2025
    const daysUntilDeadline = Math.max(0, Math.ceil((taxYearEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate deductible amounts
    const deductibleCategories = ['Medical', 'Education', 'Charity', 'Professional Development'];
    const ytdDeductible = categories
      .filter(c => deductibleCategories.includes(c.category))
      .reduce((sum, c) => sum + c.total, 0);

    const deductibleReceipts = receipts.filter(r => 
      deductibleCategories.includes(r.category)
    ).length;

    return {
      userId,
      ytdDeductible,
      totalReceipts: receipts.length,
      deductibleReceipts,
      categoryBreakdown: categories.map(c => ({
        category: c.category,
        amount: c.total,
        count: c.count
      })),
      currentTaxYear: 2025,
      daysUntilDeadline
    };
  }

  /**
   * Store tax question for future learning and analytics
   */
  private async storeTaxQuestion(question: TaxQuestion): Promise<void> {
    // In a real implementation, you'd store this in a database
    // For now, we'll just log it
    console.log('[TAX AI] Stored tax question:', {
      id: question.id,
      category: question.category,
      confidence: question.confidence,
      timestamp: question.timestamp
    });
  }

  /**
   * Get common tax questions and answers
   */
  async getCommonTaxQuestions(): Promise<Array<{
    question: string;
    category: string;
    quickAnswer: string;
  }>> {
    return [
      {
        question: "What medical expenses can I deduct?",
        category: "deductions",
        quickAnswer: "Medical expenses above your medical aid contributions and 3 times monthly medical aid contributions."
      },
      {
        question: "When is the tax filing deadline?",
        category: "deadlines", 
        quickAnswer: "October 31, 2025 for individuals, July 31, 2025 for provisional taxpayers."
      },
      {
        question: "How much can I contribute to retirement funds?",
        category: "deductions",
        quickAnswer: "Up to 27.5% of your income or R350,000, whichever is lower."
      },
      {
        question: "Can I claim home office expenses?",
        category: "deductions",
        quickAnswer: "Yes, if you work from home regularly. You can claim a portion of utilities, rent, and office equipment."
      },
      {
        question: "What documents do I need for tax filing?",
        category: "documentation",
        quickAnswer: "IRP5, medical certificates, retirement fund certificates, and receipts for deductible expenses."
      }
    ];
  }
}

export const taxAIAssistant = new TaxAIAssistant();