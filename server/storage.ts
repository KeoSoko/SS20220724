import {
  InsertUser,
  User,
  Receipt,
  InsertReceipt,
  Tag,
  InsertTag,
  AuthToken,
  EXPENSE_CATEGORIES,
  SubscriptionPlan,
  UserSubscription,
  PaymentTransaction,
  BillingEvent,
  InsertSubscriptionPlan,
  InsertUserSubscription,
  InsertPaymentTransaction,
  InsertBillingEvent,
  PromoCode,
  InsertPromoCode,
  EmailEvent,
  InsertEmailEvent,
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { log } from "./vite";
import { randomBytes } from "crypto";
import { getReportingCategory } from "./reporting-utils";

const MemoryStore = createMemoryStore(session);

// Enhanced storage interface with additional methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser?(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser?(id: number): Promise<void>;
  updateLastLogin?(id: number): Promise<void>;
  
  // Authentication security methods
  findUsersByEmail?(email: string): Promise<User[]>;
  findUserByResetToken?(token: string): Promise<User | undefined>;
  findUserByVerificationToken?(token: string): Promise<User | undefined>;
  storePasswordResetToken?(userId: number, token: string, expires: Date): Promise<void>;
  updateUserPassword?(userId: number, hashedPassword: string): Promise<void>;
  clearPasswordResetToken?(userId: number): Promise<void>;
  incrementLoginAttempts?(id: number): Promise<number>;
  resetLoginAttempts?(id: number): Promise<void>;
  lockUserAccount?(id: number, minutes: number): Promise<void>;
  isUserAccountLocked?(id: number): Promise<boolean>;
  incrementTokenVersion?(id: number): Promise<number>; // Increment JWT token version to invalidate old tokens
  
  // Receipt methods
  getReceipt(id: number): Promise<Receipt | undefined>;
  getReceiptsByUser(userId: number, limit?: number, offset?: number): Promise<Receipt[]>;
  createReceipt(receipt: InsertReceipt): Promise<Receipt>;
  updateReceipt(id: number, updates: Partial<InsertReceipt>): Promise<Receipt | undefined>;
  deleteReceipt(id: number): Promise<void>;
  findDuplicateReceipts?(userId: number, storeName: string, date: Date, total: string): Promise<Receipt[]>;
  
  // Tag methods
  getTagsByUser(userId: number): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: number): Promise<void>;
  
  // Receipt-tag relation methods
  addTagToReceipt?(receiptId: number, tagId: number): Promise<void>;
  removeTagFromReceipt?(receiptId: number, tagId: number): Promise<void>;
  getTagsForReceipt?(receiptId: number): Promise<Tag[]>;
  
  // Auth token methods
  createAuthToken?(userId: number, expiresInDays?: number): Promise<AuthToken>;
  getAuthTokenByToken?(token: string): Promise<AuthToken | undefined>;
  revokeAuthToken?(tokenId: string): Promise<void>;
  cleanupExpiredTokens?(): Promise<number>;
  
  // Analytics methods
  getCategorySummary(userId: number): Promise<{ category: string, count: number, total: number }[]>;
  getMonthlyExpenseSummary(userId: number): Promise<{ month: string, total: number }[]>;
  
  // Custom categories methods
  getCustomCategories?(userId: number): Promise<any[]>;
  createCustomCategory?(insertCustomCategory: any): Promise<any>;
  updateCustomCategory?(id: number, updates: any): Promise<any | undefined>;
  deleteCustomCategory?(id: number): Promise<void>;
  
  // Budget methods
  getBudgets?(userId: number): Promise<any[]>;
  createBudget?(insertBudget: any): Promise<any>;
  updateBudget?(id: number, updates: any): Promise<any | undefined>;
  deleteBudget?(id: number): Promise<void>;
  
  // Billing and subscription methods
  getSubscriptionPlans?(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan?(id: number): Promise<SubscriptionPlan | null>;
  getSubscriptionPlanByName?(name: string): Promise<SubscriptionPlan | null>;
  getSubscriptionPlanByGooglePlayProductId?(productId: string): Promise<SubscriptionPlan | null>;
  createSubscriptionPlan?(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  
  getUserSubscription?(userId: number): Promise<UserSubscription | null>;
  createUserSubscription?(subscription: InsertUserSubscription): Promise<UserSubscription>;
  updateUserSubscription?(id: number, updates: Partial<InsertUserSubscription>): Promise<UserSubscription | null>;
  
  getPaymentTransactions?(userId: number): Promise<PaymentTransaction[]>;
  createPaymentTransaction?(transaction: InsertPaymentTransaction): Promise<PaymentTransaction>;
  
  createBillingEvent?(event: InsertBillingEvent): Promise<BillingEvent>;
  
  // Trial and subscription management
  startFreeTrial?(userId: number): Promise<void>;
  updateUserSubscriptionStatus?(userId: number, status: string, platform?: string): Promise<void>;
  
  // Promo code methods
  getPromoCode?(code: string): Promise<PromoCode | null>;
  validatePromoCode?(code: string): Promise<PromoCode | null>;
  createPromoCode?(promoCode: InsertPromoCode): Promise<PromoCode>;
  usePromoCode?(userId: number, code: string, trialDays: number): Promise<void>;
  
  // Express session store
  sessionStore: session.Store;
  
  // Bulk deletion methods for account cleanup
  deleteReceiptsByUserId?(userId: number): Promise<void>;
  deleteTagsByUserId?(userId: number): Promise<void>;
  deleteBudgetsByUserId?(userId: number): Promise<void>;
  deleteCustomCategoriesByUserId?(userId: number): Promise<void>;
  deleteReceiptSharesByUserId?(userId: number): Promise<void>;

  // Email tracking methods
  createEmailEvent?(event: InsertEmailEvent): Promise<EmailEvent>;
  getEmailEvents?(filters?: { email?: string; eventType?: string; userId?: number; emailType?: string; limit?: number }): Promise<EmailEvent[]>;
  getEmailStats?(days?: number): Promise<{
    totalSent: number;
    delivered: number;
    bounced: number;
    spamReports: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    bounceRate: number;
  }>;
  getProblematicEmails?(): Promise<Array<{ email: string; bounceType: string; bounceReason: string; count: number }>>;

  // Database management (only for admin/development)
  initialize?(): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private receipts: Map<number, Receipt>;
  private tags: Map<number, Tag>;
  private receiptTagRelations: Map<string, { receiptId: number; tagId: number }>;
  private authTokens: Map<string, AuthToken>;
  private customCategories: Map<number, any>;
  
  private currentUserId: number;
  private currentReceiptId: number;
  private currentTagId: number;
  private currentCustomCategoryId: number;
  
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.receipts = new Map();
    this.tags = new Map();
    this.receiptTagRelations = new Map();
    this.authTokens = new Map();
    this.customCategories = new Map();
    
    this.currentUserId = 1;
    this.currentReceiptId = 1;
    this.currentTagId = 1;
    this.currentCustomCategoryId = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    
    log("Using in-memory storage implementation", "storage");
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`[MemStorage] Looking up user by username: "${username}"`);
    
    // Find user with exact case match
    const user = Array.from(this.users.values()).find(
      (user) => user.username === username
    );
    
    if (user) {
      console.log(`[MemStorage] Found exact match: "${user.username}" (ID: ${user.id})`);
      return user;
    }
    
    // Attempt case-insensitive match for diagnostic purposes only
    const caseInsensitiveMatch = Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
      
    if (caseInsensitiveMatch) {
      console.log(`[MemStorage] WARNING: Found case-insensitive match but not exact match: "${caseInsensitiveMatch.username}" for requested "${username}"`);
      // Critical: Do not return case-insensitive matches
      console.log(`[MemStorage] Enforcing exact case matching, returning undefined`);
      return undefined;
    }
    
    console.log(`[MemStorage] No user found with username: "${username}"`);
    return undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = Array.from(this.users.values()).find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    
    const user: User = { 
      id,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || null,
      fullName: insertUser.fullName || null,
      birthdate: null,
      gender: null,
      phoneNumber: null,
      address: null,
      profilePicture: null,
      isActive: true,
      lastLogin: null,
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      emailVerificationToken: insertUser.emailVerificationToken || null,
      emailVerifiedAt: insertUser.emailVerifiedAt || null,
      isEmailVerified: insertUser.isEmailVerified || false,
      rememberMeToken: null,
      sessionTimeout: insertUser.sessionTimeout || 60, // Default 60 minutes
      tokenVersion: 1, // Initial token version
      createdAt: now,
      updatedAt: null
    };
    
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(id: number): Promise<void> {
    this.users.delete(id);
  }
  
  // Bulk deletion methods for account cleanup
  async deleteReceiptsByUserId(userId: number): Promise<void> {
    const receiptsToDelete: number[] = [];
    this.receipts.forEach((receipt, id) => {
      if (receipt.userId === userId) {
        receiptsToDelete.push(id);
      }
    });
    
    receiptsToDelete.forEach(id => {
      this.deleteReceipt(id); // This also handles tag relations
    });
  }
  
  async deleteTagsByUserId(userId: number): Promise<void> {
    const tagsToDelete: number[] = [];
    this.tags.forEach((tag, id) => {
      if (tag.userId === userId) {
        tagsToDelete.push(id);
      }
    });
    
    tagsToDelete.forEach(id => {
      this.deleteTag(id); // This also handles receipt relations
    });
  }
  
  async deleteBudgetsByUserId(userId: number): Promise<void> {
    const budgetsToDelete: number[] = [];
    this.budgets.forEach((budget, id) => {
      if (budget.userId === userId) {
        budgetsToDelete.push(id);
      }
    });
    
    budgetsToDelete.forEach(id => {
      this.budgets.delete(id);
    });
  }
  
  async deleteCustomCategoriesByUserId(userId: number): Promise<void> {
    const categoriesToDelete: number[] = [];
    this.customCategories.forEach((category, id) => {
      if (category.userId === userId) {
        categoriesToDelete.push(id);
      }
    });
    
    categoriesToDelete.forEach(id => {
      this.customCategories.delete(id);
    });
  }
  
  async deleteReceiptSharesByUserId(userId: number): Promise<void> {
    const sharesToDelete: number[] = [];
    this.receiptShares.forEach((share, id) => {
      if (share.ownerId === userId || share.sharedWithId === userId) {
        sharesToDelete.push(id);
      }
    });
    
    sharesToDelete.forEach(id => {
      this.receiptShares.delete(id);
    });
  }
  
  async updateLastLogin(id: number): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLogin = new Date();
      this.users.set(id, user);
    }
  }
  
  // Authentication security methods
  async findUsersByEmail(email: string): Promise<User[]> {
    return Array.from(this.users.values())
      .filter(user => user.email === email);
  }
  
  async findUserByResetToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.passwordResetToken === token);
  }
  
  async findUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.emailVerificationToken === token);
  }
  
  async incrementLoginAttempts(id: number): Promise<number> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User not found: ${id}`);
    
    const attempts = (user.failedLoginAttempts || 0) + 1;
    user.failedLoginAttempts = attempts;
    this.users.set(id, user);
    
    return attempts;
  }
  
  async resetLoginAttempts(id: number): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    this.users.set(id, user);
  }
  
  async lockUserAccount(id: number, minutes: number): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + minutes);
    
    user.accountLockedUntil = lockUntil;
    this.users.set(id, user);
  }
  
  async isUserAccountLocked(id: number): Promise<boolean> {
    const user = this.users.get(id);
    if (!user || !user.accountLockedUntil) return false;
    
    return new Date(user.accountLockedUntil) > new Date();
  }
  
  async incrementTokenVersion(id: number): Promise<number> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User not found: ${id}`);
    
    // Increment token version
    const newVersion = (user.tokenVersion || 1) + 1;
    user.tokenVersion = newVersion;
    user.updatedAt = new Date();
    this.users.set(id, user);
    
    console.log(`[AUTH] Incremented token version for user ${user.username} to ${newVersion}`);
    return newVersion;
  }

  // Receipt methods
  async getReceipt(id: number): Promise<Receipt | undefined> {
    return this.receipts.get(id);
  }

  async getReceiptsByUser(userId: number, limit?: number, offset: number = 0): Promise<Receipt[]> {
    let receipts = Array.from(this.receipts.values())
      .filter(receipt => receipt.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort by creation date (newest first)
    
    if (offset > 0) {
      receipts = receipts.slice(offset);
    }
    
    if (limit) {
      receipts = receipts.slice(0, limit);
    }
    
    return receipts;
  }

  async createReceipt(insertReceipt: InsertReceipt): Promise<Receipt> {
    const id = this.currentReceiptId++;
    const now = new Date();
    
    const receipt: Receipt = {
      // Core fields matching schema order
      id,
      userId: insertReceipt.userId,
      storeName: insertReceipt.storeName,
      date: insertReceipt.date,
      total: insertReceipt.total,
      items: insertReceipt.items,
      
      // Optional fields with null defaults
      blobUrl: insertReceipt.blobUrl || null,
      blobName: insertReceipt.blobName || null,
      imageData: insertReceipt.imageData || null,
      
      category: insertReceipt.category || "other",
      subcategory: insertReceipt.subcategory || null,
      tags: insertReceipt.tags || [],
      notes: insertReceipt.notes || null,
      
      // Recurring transaction fields
      isRecurring: insertReceipt.isRecurring || false,
      frequency: insertReceipt.frequency || null,
      paymentMethod: insertReceipt.paymentMethod || null,
      
      // OCR metadata
      confidenceScore: insertReceipt.confidenceScore || null,
      rawOcrData: null, // Memory implementation doesn't store raw OCR data
      
      // Location data 
      latitude: null,
      longitude: null,
      
      // Budget and tax information
      budgetCategory: insertReceipt.budgetCategory || null,
      isTaxDeductible: insertReceipt.isTaxDeductible || false,
      taxCategory: insertReceipt.taxCategory || null,
      
      // Timestamps
      createdAt: now,
      updatedAt: null,
      processedAt: null,
    };
    
    this.receipts.set(id, receipt);
    return receipt;
  }

  async updateReceipt(id: number, updates: Partial<InsertReceipt>): Promise<Receipt | undefined> {
    const receipt = this.receipts.get(id);
    
    if (!receipt) {
      return undefined;
    }
    
    // Process updates with proper null handling
    const updatedFields: Partial<Receipt> = { updatedAt: new Date() };
    
    if ('storeName' in updates) updatedFields.storeName = updates.storeName!;
    if ('date' in updates) updatedFields.date = updates.date!;
    if ('total' in updates) updatedFields.total = updates.total!;
    if ('items' in updates) updatedFields.items = updates.items!;
    if ('blobUrl' in updates) updatedFields.blobUrl = updates.blobUrl || null;
    if ('blobName' in updates) updatedFields.blobName = updates.blobName || null;
    if ('imageData' in updates) updatedFields.imageData = updates.imageData || null;
    if ('category' in updates) updatedFields.category = updates.category || "other";
    if ('tags' in updates) updatedFields.tags = updates.tags || [];
    if ('notes' in updates) updatedFields.notes = updates.notes || null;
    if ('confidenceScore' in updates) updatedFields.confidenceScore = updates.confidenceScore || null;
    
    const updatedReceipt: Receipt = {
      ...receipt,
      ...updatedFields,
    };
    
    this.receipts.set(id, updatedReceipt);
    return updatedReceipt;
  }

  async deleteReceipt(id: number): Promise<void> {
    this.receipts.delete(id);
    
    // Also delete any tag relationships
    const relationsToDelete: string[] = [];
    this.receiptTagRelations.forEach((relation, key) => {
      if (relation.receiptId === id) {
        relationsToDelete.push(key);
      }
    });
    
    relationsToDelete.forEach(key => {
      this.receiptTagRelations.delete(key);
    });
  }

  async findDuplicateReceipts(userId: number, storeName: string, date: Date, total: string): Promise<Receipt[]> {
    const receipts = Array.from(this.receipts.values()).filter(r => r.userId === userId);
    const normalizedStoreName = storeName.toLowerCase().trim();
    const normalizedTotal = parseFloat(total.replace(/[^0-9.-]/g, '')) || 0;
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    return receipts.filter(r => {
      const receiptDate = new Date(r.date);
      receiptDate.setHours(0, 0, 0, 0);
      const receiptTotal = parseFloat(r.total.replace(/[^0-9.-]/g, '')) || 0;
      
      const storeMatch = r.storeName.toLowerCase().trim() === normalizedStoreName;
      const dateMatch = receiptDate.getTime() === targetDate.getTime();
      const totalMatch = Math.abs(receiptTotal - normalizedTotal) < 0.01;
      
      return storeMatch && dateMatch && totalMatch;
    });
  }

  // Tag methods
  async getTagsByUser(userId: number): Promise<Tag[]> {
    return Array.from(this.tags.values())
      .filter(tag => tag.userId === userId);
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const id = this.currentTagId++;
    const tag: Tag = {
      id,
      userId: insertTag.userId,
      name: insertTag.name,
      createdAt: new Date(),
    };
    this.tags.set(id, tag);
    return tag;
  }

  async deleteTag(id: number): Promise<void> {
    this.tags.delete(id);
    
    // Also delete any tag relationships
    const relationsToDelete: string[] = [];
    this.receiptTagRelations.forEach((relation, key) => {
      if (relation.tagId === id) {
        relationsToDelete.push(key);
      }
    });
    
    relationsToDelete.forEach(key => {
      this.receiptTagRelations.delete(key);
    });
  }
  
  // Receipt-tag relation methods
  async addTagToReceipt(receiptId: number, tagId: number): Promise<void> {
    const relationKey = `${receiptId}:${tagId}`;
    this.receiptTagRelations.set(relationKey, { receiptId, tagId });
  }
  
  async removeTagFromReceipt(receiptId: number, tagId: number): Promise<void> {
    const relationKey = `${receiptId}:${tagId}`;
    this.receiptTagRelations.delete(relationKey);
  }
  
  async getTagsForReceipt(receiptId: number): Promise<Tag[]> {
    const tagIds = Array.from(this.receiptTagRelations.values())
      .filter(relation => relation.receiptId === receiptId)
      .map(relation => relation.tagId);
    
    return tagIds.map(id => this.tags.get(id)!).filter(Boolean);
  }
  
  // Auth token methods
  async createAuthToken(userId: number, expiresInDays: number = 7): Promise<AuthToken> {
    const id = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('hex');
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    const authToken: AuthToken = {
      id,
      userId,
      token,
      expiresAt,
      lastUsed: null,
      createdAt: new Date(),
      isRevoked: false
    };
    
    this.authTokens.set(token, authToken);
    return authToken;
  }
  
  async getAuthTokenByToken(tokenValue: string): Promise<AuthToken | undefined> {
    const token = this.authTokens.get(tokenValue);
    
    if (token && !token.isRevoked && token.expiresAt > new Date()) {
      token.lastUsed = new Date();
      return token;
    }
    
    return undefined;
  }
  
  async revokeAuthToken(tokenId: string): Promise<void> {
    const tokenToRevoke = Array.from(this.authTokens.values())
      .find(token => token.id === tokenId);
    
    if (tokenToRevoke) {
      tokenToRevoke.isRevoked = true;
      this.authTokens.set(tokenToRevoke.token, tokenToRevoke);
    }
  }
  
  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date();
    const tokensToDelete: string[] = [];
    
    this.authTokens.forEach((token, key) => {
      if (token.isRevoked || token.expiresAt <= now) {
        tokensToDelete.push(key);
      }
    });
    
    tokensToDelete.forEach(key => {
      this.authTokens.delete(key);
    });
    
    return tokensToDelete.length;
  }

  // Analytics methods
  async getCategorySummary(userId: number): Promise<{ category: string, count: number, total: number }[]> {
    const receipts = await this.getReceiptsByUser(userId);
    
    const categoryMap = new Map<string, { category: string, count: number, total: number }>();
    
    EXPENSE_CATEGORIES.forEach(category => {
      categoryMap.set(category, { category, count: 0, total: 0 });
    });
    
    receipts.forEach(receipt => {
      const categoryLabel = getReportingCategory(receipt.category, receipt.notes);
      const total = parseFloat(receipt.total) || 0;
      const existing = categoryMap.get(categoryLabel) || { category: categoryLabel, count: 0, total: 0 };
      existing.count += 1;
      existing.total += total;
      categoryMap.set(categoryLabel, existing);
    });
    
    const customCategories = Array.from(categoryMap.values()).filter(entry => !EXPENSE_CATEGORIES.includes(entry.category as any));
    
    return [
      ...EXPENSE_CATEGORIES.map(category => categoryMap.get(category)!).filter(Boolean),
      ...customCategories.sort((a, b) => a.category.localeCompare(b.category))
    ];
  }

  async getMonthlyExpenseSummary(userId: number): Promise<{ month: string, total: number }[]> {
    const receipts = await this.getReceiptsByUser(userId);
    
    // Group receipts by month and year
    const monthlyData: Record<string, number> = {};
    
    receipts.forEach(receipt => {
      const date = receipt.date;
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const total = parseFloat(receipt.total) || 0;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = 0;
      }
      
      monthlyData[monthYear] += total;
    });
    
    // Convert to array and sort by date
    return Object.entries(monthlyData)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  // Custom categories methods
  async getCustomCategories(userId: number): Promise<any[]> {
    return Array.from(this.customCategories.values())
      .filter(category => category.userId === userId && category.isActive !== false);
  }

  async createCustomCategory(insertCustomCategory: any): Promise<any> {
    const customCategory = {
      id: this.currentCustomCategoryId++,
      ...insertCustomCategory,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.customCategories.set(customCategory.id, customCategory);
    return customCategory;
  }

  async updateCustomCategory(id: number, updates: any): Promise<any | undefined> {
    const existingCategory = this.customCategories.get(id);
    if (!existingCategory) {
      return undefined;
    }
    
    const updatedCategory = {
      ...existingCategory,
      ...updates,
      updatedAt: new Date()
    };
    
    this.customCategories.set(id, updatedCategory);
    return updatedCategory;
  }

  async deleteCustomCategory(id: number): Promise<void> {
    const category = this.customCategories.get(id);
    if (category) {
      category.isActive = false;
      category.updatedAt = new Date();
      this.customCategories.set(id, category);
    }
  }
}

// Import DatabaseStorage if DATABASE_URL is available
let databaseStorage: IStorage | null = null;

// Lazy-load database implementation if available
async function getDatabaseStorage(): Promise<IStorage | null> {
  if (process.env.DATABASE_URL) {
    // We need to use dynamic import to avoid loading dependencies if not needed
    try {
      const { DatabaseStorage } = await import('./database-storage');
      return new DatabaseStorage();
    } catch (error) {
      log(`Error loading database storage: ${error}`, 'storage');
      return null;
    }
  }
  return null;
}

// Create storage as a mutable variable, allowing for dynamic switching
let storageImpl: IStorage = new MemStorage();
log("Using in-memory storage implementation", "storage");

// Export a proxy to allow dynamic switching of implementation
export const storage: IStorage = new Proxy({} as IStorage, {
  get: (target, prop) => {
    return Reflect.get(storageImpl, prop);
  }
});

// Switch to database storage if available (async operation)
if (process.env.DATABASE_URL) {
  log("Database URL detected, attempting to switch to database storage...", "storage");
  getDatabaseStorage().then(dbStorage => {
    if (dbStorage) {
      storageImpl = dbStorage;
      log("Successfully switched to database storage", "storage");
    }
  });
}
