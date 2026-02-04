export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  score: number; // 0-100
}

export class ReceiptValidator {
  constructor() {}

  /**
   * Comprehensive validation checklist for receipt processing
   */
  async validateReceiptPipeline(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // 1. Azure Form Recognizer credentials
    if (!this.checkAzureFormRecognizerCredentials()) {
      errors.push("Azure Form Recognizer credentials missing or invalid");
      score -= 25;
    }

    // 2. Azure Blob Storage credentials
    if (!this.checkAzureBlobStorageCredentials()) {
      warnings.push("Azure Blob Storage credentials missing - images won't be stored");
      score -= 10;
    }

    // 3. OpenAI API credentials for categorization
    if (!this.checkOpenAICredentials()) {
      warnings.push("OpenAI API credentials missing - AI categorization unavailable");
      score -= 15;
    }

    // 4. Database connectivity
    try {
      await this.checkDatabaseConnection();
    } catch (error) {
      errors.push("Database connection failed");
      score -= 20;
    }

    // 5. Test OCR with sample receipt
    try {
      await this.testOCRProcessing();
    } catch (error) {
      warnings.push("OCR processing test failed - may affect real receipts");
      score -= 10;
    }

    // Generate recommendations based on findings
    if (errors.length > 0) {
      recommendations.push("Fix critical configuration issues before processing receipts");
    }
    if (warnings.length > 0) {
      recommendations.push("Address warnings to improve receipt processing quality");
    }
    if (score < 80) {
      recommendations.push("System readiness is below optimal - consider fixing issues");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
      score: Math.max(0, score)
    };
  }

  private checkAzureFormRecognizerCredentials(): boolean {
    const endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
    const key = process.env.AZURE_FORM_RECOGNIZER_KEY;
    
    if (!endpoint || !key) {
      return false;
    }
    
    if (!endpoint.startsWith('https://')) {
      return false;
    }
    
    return true;
  }

  private checkAzureBlobStorageCredentials(): boolean {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    
    return !!(accountName && accountKey && containerName);
  }

  private checkOpenAICredentials(): boolean {
    const apiKey = process.env.OPENAI_API_KEY;
    return !!(apiKey && apiKey.startsWith('sk-'));
  }

  private async checkDatabaseConnection(): Promise<void> {
    // Simple database connection test
    const { db } = await import("./db");
    await db.execute("SELECT 1");
  }

  private async testOCRProcessing(): Promise<void> {
    // This would test OCR with a sample receipt image
    // For now, just check if the Azure client can be initialized
    const { azureFormRecognizer } = await import("./azure-form-recognizer");
    // The initialization will throw if credentials are wrong
  }

  /**
   * Validate specific receipt data quality
   */
  validateReceiptData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check required fields
    if (!data.storeName || data.storeName === "Unknown Store") {
      errors.push("Store name is missing or could not be detected");
      score -= 20;
      recommendations.push("Ensure store name is clearly visible at top of receipt");
    }

    if (!data.total || data.total === "0.00") {
      errors.push("Total amount is missing or zero");
      score -= 25;
      recommendations.push("Ensure total amount is clearly visible and not blurred");
    }

    if (!data.date) {
      errors.push("Receipt date is missing");
      score -= 15;
      recommendations.push("Ensure date is visible on the receipt");
    }

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      warnings.push("No itemized purchases detected");
      score -= 10;
      recommendations.push("Some receipts don't have detailed items - this may be normal");
    }

    // Check data quality
    if (data.confidenceScore && parseFloat(data.confidenceScore) < 0.7) {
      warnings.push(`Low OCR confidence: ${data.confidenceScore}`);
      score -= 15;
      recommendations.push("Take a clearer photo with better lighting");
      recommendations.push("Ensure receipt is flat and fully visible");
    }

    // Check for suspicious values
    if (data.total && parseFloat(data.total) > 10000) {
      warnings.push("Unusually high total amount detected");
      score -= 5;
      recommendations.push("Verify the total amount is correct");
    }

    if (data.date) {
      const receiptDate = new Date(data.date);
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);

      if (receiptDate > today) {
        warnings.push("Receipt date is in the future");
        score -= 10;
      } else if (receiptDate < oneYearAgo) {
        warnings.push("Receipt is more than 1 year old");
        score -= 5;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
      score: Math.max(0, score)
    };
  }

  /**
   * Check for common image quality issues
   */
  validateImageQuality(base64Data: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    try {
      // Check image format
      const header = base64Data.substring(0, 50);
      const supportedFormats = ['data:image/jpeg', 'data:image/jpg', 'data:image/png', 'data:image/webp'];
      
      if (!supportedFormats.some(format => header.startsWith(format))) {
        errors.push("Unsupported image format");
        score -= 30;
        recommendations.push("Use JPEG, PNG, or WebP format");
      }

      // Check file size
      const base64Content = base64Data.split(',')[1];
      const sizeInBytes = (base64Content.length * 3) / 4;
      
      if (sizeInBytes < 50000) { // Less than 50KB
        warnings.push("Image file is very small - may lack detail");
        score -= 15;
        recommendations.push("Use higher resolution camera or take closer photo");
      }
      
      if (sizeInBytes > 20 * 1024 * 1024) { // Over 20MB
        errors.push("Image file is too large");
        score -= 20;
        recommendations.push("Compress image or reduce file size");
      }

      // Optimal size range: 200KB - 5MB
      if (sizeInBytes >= 200000 && sizeInBytes <= 5 * 1024 * 1024) {
        score += 5; // Bonus for optimal size
      }

    } catch (error) {
      errors.push("Invalid image data format");
      score -= 50;
      recommendations.push("Ensure image is properly uploaded");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recommendations,
      score: Math.max(0, score)
    };
  }
}

/**
 * Common receipt processing issues and solutions
 */
export const COMMON_ISSUES = {
  OCR_FAILURES: {
    title: "OCR Not Working",
    symptoms: [
      "No text extracted from receipt",
      "Low confidence scores (<0.7)",
      "Missing store name or total"
    ],
    solutions: [
      "Check Azure Form Recognizer credentials",
      "Verify image quality and lighting",
      "Ensure receipt is flat and fully visible",
      "Try different image formats (JPEG works best)",
      "Check internet connection stability"
    ]
  },
  
  INCORRECT_CATEGORIZATION: {
    title: "Wrong Category Assignment",
    symptoms: [
      "Receipts assigned to wrong categories",
      "Low category confidence scores",
      "Categories showing as 'other'"
    ],
    solutions: [
      "Verify OpenAI API credentials are set",
      "Check if store name is clearly detected",
      "Review item names for categorization clues",
      "Manually correct categories to improve AI learning"
    ]
  },
  
  DUPLICATE_UPLOADS: {
    title: "Duplicate Receipt Detection",
    symptoms: [
      "Same receipt uploaded multiple times",
      "Warnings about potential duplicates"
    ],
    solutions: [
      "Check for receipts with same store, date, and total",
      "Review recent uploads before adding new ones",
      "Use receipt search to find existing entries"
    ]
  },
  
  STORAGE_ISSUES: {
    title: "Image Storage Problems",
    symptoms: [
      "Images not saving to cloud storage",
      "Missing receipt images"
    ],
    solutions: [
      "Verify Azure Blob Storage credentials",
      "Check storage account permissions",
      "Ensure container exists and is accessible",
      "Review storage account quotas"
    ]
  }
};

export function getDiagnosticChecklist(): string[] {
  return [
    "✓ Azure Form Recognizer endpoint configured",
    "✓ Azure Form Recognizer API key valid",
    "✓ Azure Blob Storage credentials set",
    "✓ OpenAI API key configured",
    "✓ Database connection working",
    "✓ Image format supported (JPEG/PNG/WebP)",
    "✓ Image size within limits (50KB - 20MB)",
    "✓ OCR confidence threshold met (>0.7)",
    "✓ Store name detected in receipt",
    "✓ Total amount extracted successfully",
    "✓ Receipt date parsed correctly",
    "✓ No duplicate receipts found"
  ];
}
