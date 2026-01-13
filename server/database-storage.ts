import { 
  ExpenseCategory, 
  EXPENSE_CATEGORIES,
  User, 
  Receipt, 
  Tag, 
  InsertUser, 
  InsertReceipt, 
  InsertTag,
  AuthToken,
  InsertAuthToken,
  Budget,
  InsertBudget,
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
  users,
  receipts,
  tags,
  receiptTags,
  authTokens,
  customCategories,
  budgets,
  subscriptionPlans,
  userSubscriptions,
  paymentTransactions,
  billingEvents,
  promoCodes,
  emailEvents
} from "@shared/schema";

import { db, pool, initializeDatabase } from "./db";
import { and, asc, count, desc, eq, gte, lte, sql, or } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { log } from "./vite";
import { randomBytes } from "crypto";
import { IStorage } from "./storage";

// Create PostgreSQL session store
const PostgresSessionStore = connectPg(session);

/**
 * PostgreSQL implementation of the storage interface using Drizzle ORM
 * This implementation is designed for production use with the Neon serverless PostgreSQL
 */
export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    // Set up PostgreSQL session store for Express using the shared pool
    this.sessionStore = new PostgresSessionStore({
      pool: pool,
      tableName: 'sessions',
      createTableIfMissing: true
    });
    
    // Initialize database connection
    this.initialize().catch(err => {
      log(`Failed to initialize database: ${err}`, 'db');
    });
  }
  
  async initialize(): Promise<boolean> {
    return initializeDatabase();
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    // First get all users with a potential case-insensitive match
    console.log(`[DB] Looking up user by username: "${username}"`);
    
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    
    if (result.length === 0) {
      console.log(`[DB] No users found for username: "${username}"`);
      return undefined;
    }
    
    const user = result[0];
    
    // Critical check: Ensure exact case match
    const exactMatch = user.username === username;
    console.log(`[DB] Found username: "${user.username}", requested: "${username}", exactMatch: ${exactMatch}`);
    
    // Only return the user if the username matches exactly
    return exactMatch ? user : undefined;
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || null,
      fullName: insertUser.fullName || null,
      birthdate: insertUser.birthdate || null,
      gender: insertUser.gender || null,
      phoneNumber: insertUser.phoneNumber || null,
      address: insertUser.address || null,
      profilePicture: insertUser.profilePicture || null,
      isActive: true,
      emailVerificationToken: insertUser.emailVerificationToken || null,
      isEmailVerified: insertUser.isEmailVerified || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    return user;
  }
  
  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    
    return user;
  }
  
  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
  
  async updateLastLogin(id: number): Promise<void> {
    await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id));
  }

  // Authentication security methods
  async findUsersByEmail(email: string): Promise<User[]> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result;
  }

  async findUserByResetToken(token: string): Promise<User | undefined> {
    try {
      const result = await db.select()
        .from(users)
        .where(
          and(
            eq(users.passwordResetToken, token),
            gte(users.passwordResetExpires, new Date())
          )
        )
        .limit(1);
      return result[0];
    } catch (error) {
      log(`Error finding user by reset token: ${error}`, 'database');
      return undefined;
    }
  }

  async findUserByVerificationToken(token: string): Promise<User | undefined> {
    const result = await db.select().from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);
    return result[0];
  }

  // Store password reset token
  async storePasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
    try {
      await db.update(users)
        .set({ 
          passwordResetToken: token, 
          passwordResetExpires: expires 
        })
        .where(eq(users.id, userId));
      log(`Password reset token stored for user ${userId}`, 'database');
    } catch (error) {
      log(`Error storing password reset token: ${error}`, 'database');
      throw error;
    }
  }

  // Update user password
  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    try {
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId));
      log(`Password updated for user ${userId}`, 'database');
    } catch (error) {
      log(`Error updating user password: ${error}`, 'database');
      throw error;
    }
  }

  // Clear password reset token
  async clearPasswordResetToken(userId: number): Promise<void> {
    try {
      await db.update(users)
        .set({ 
          passwordResetToken: null, 
          passwordResetExpires: null 
        })
        .where(eq(users.id, userId));
      log(`Password reset token cleared for user ${userId}`, 'database');
    } catch (error) {
      log(`Error clearing password reset token: ${error}`, 'database');
      throw error;
    }
  }
  
  /**
   * Process tags for storage in the database
   * Returns a native JavaScript array for PostgreSQL JSONB column
   */
  private processTagsForStorage(tagData: any): string[] {
    log(`processTagsForStorage input: ${JSON.stringify(tagData)}, type: ${typeof tagData}`, 'debug');
    
    // Debug
    if (typeof tagData === 'string') {
      log(`WARNING: Tags is a string (${tagData.length} chars) - this should not happen!`, 'debug');
    } else if (Array.isArray(tagData)) {
      log(`INFO: Tags is already an array with ${tagData.length} elements`, 'debug');
    }
    
    try {
      // Initialize a properly formatted tags array
      let processedTags: string[] = [];
      
      // Case 1: tagData is already an array
      if (Array.isArray(tagData)) {
        // Make sure each tag is a string
        processedTags = tagData.map(tag => String(tag));
      }
      // Case 2: tagData is undefined or null
      else if (tagData === undefined || tagData === null) {
        // Already initialized as empty array
      }
      // Case 3: tagData is a string representation of an array
      else if (typeof tagData === 'string') {
        const trimmed = tagData.trim();
        
        if (trimmed === '' || trimmed === '[]') {
          // Already initialized as empty array
        } else {
          try {
            // Try to parse as JSON
            const parsedArray = JSON.parse(trimmed);
            
            if (Array.isArray(parsedArray)) {
              // Make sure each tag is a string
              processedTags = parsedArray.map(tag => String(tag));
            }
          } catch (e) {
            log(`Failed to parse tags as JSON: ${e}`, 'debug');
            
            // Try to parse with extra processing
            try {
              const withoutOuterQuotes = trimmed.replace(/^"|"$/g, '');
              
              if (withoutOuterQuotes.startsWith('[') && withoutOuterQuotes.endsWith(']')) {
                const parsedAlternative = JSON.parse(withoutOuterQuotes);
                
                if (Array.isArray(parsedAlternative)) {
                  processedTags = parsedAlternative.map(tag => String(tag));
                }
              }
            } catch (e2) {
              log(`All parsing attempts failed: ${e2}`, 'debug');
            }
          }
        }
      }
      
      log(`Final processed tags as native array, length: ${processedTags.length}`, 'debug');
      log(`Final processedTags value: ${JSON.stringify(processedTags)}`, 'debug');
      // Verify the return type to ensure it's a native array
      if (!Array.isArray(processedTags)) {
        log(`WARNING: processedTags is not an array! Type: ${typeof processedTags}`, 'debug');
      }
      return processedTags;
    } catch (error) {
      log(`Error processing tags for storage: ${error}`, 'debug');
      return [];
    }
  }
  
  /**
   * Process items for storage in the database
   * Returns a native JavaScript array for PostgreSQL JSONB column
   */
  private processItemsForStorage(items: any): Array<{name: string, price: string}> {
    log(`processItemsForStorage input: ${JSON.stringify(items)}, type: ${typeof items}`, 'debug');
    
    // Debug
    if (typeof items === 'string') {
      log(`WARNING: Items is a string (${items.length} chars) - this should not happen!`, 'debug');
    } else if (Array.isArray(items)) {
      log(`INFO: Items is already an array with ${items.length} elements`, 'debug');
    }
    
    try {
      // Initialize a properly formatted items array
      let processedItems: Array<{name: string, price: string}> = [];
      
      // Case 1: items is already an array
      if (Array.isArray(items)) {
        log(`Items is already an array with ${items.length} items`, 'debug');
        
        // Make sure each item has the correct format
        processedItems = items.map((item: any) => ({
          name: (item && typeof item === 'object' && item.name) ? String(item.name) : "Unknown Item",
          price: (item && typeof item === 'object' && item.price) ? String(item.price) : "0.00"
        }));
      }
      // Case 2: items is already a string but needs to be parsed to array
      else if (typeof items === 'string') {
        const trimmed = items.trim();
        log(`Items is a string: '${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}'`, 'debug');
        
        if (trimmed === '' || trimmed === '[]') {
          log(`Items is empty string or empty array string, using empty array`, 'debug');
          // Already initialized as empty array
        } else {
          try {
            // Try to parse as JSON
            const parsedArray = JSON.parse(trimmed);
            
            if (Array.isArray(parsedArray)) {
              log(`Successfully parsed items as JSON array with ${parsedArray.length} items`, 'debug');
              
              // Format each item properly
              processedItems = parsedArray.map((item: any) => ({
                name: (item && typeof item === 'object' && item.name) ? String(item.name) : "Unknown Item",
                price: (item && typeof item === 'object' && item.price) ? String(item.price) : "0.00"
              }));
            } else {
              log(`Parsed JSON is not an array, it's a: ${typeof parsedArray}`, 'debug');
              // Keep as empty array
            }
          } catch (e) {
            log(`Failed to parse items as JSON: ${e}`, 'debug');
            
            // Try to parse with extra processing for double-quoted strings
            try {
              // Remove outer quotes that might cause double-stringification issues
              const withoutOuterQuotes = trimmed.replace(/^"|"$/g, '');
              
              if (withoutOuterQuotes.startsWith('[') && withoutOuterQuotes.endsWith(']')) {
                const parsedAlternative = JSON.parse(withoutOuterQuotes);
                
                if (Array.isArray(parsedAlternative)) {
                  log(`Parsed items after removing outer quotes: ${parsedAlternative.length} items`, 'debug');
                  
                  // Format each item properly
                  processedItems = parsedAlternative.map((item: any) => ({
                    name: (item && typeof item === 'object' && item.name) ? String(item.name) : "Unknown Item",
                    price: (item && typeof item === 'object' && item.price) ? String(item.price) : "0.00"
                  }));
                } else {
                  log(`Alternative parsed result is not an array: ${typeof parsedAlternative}`, 'debug');
                  // Keep as empty array
                }
              }
            } catch (e2) {
              log(`All parsing attempts failed: ${e2}`, 'debug');
              // Keep as empty array
            }
          }
        }
      }
      // Case 3: items is undefined or null
      else if (items === undefined || items === null) {
        log(`Items is undefined or null, using empty array`, 'debug');
        // Already initialized as empty array
      }
      // Case 4: Any other type - log and use empty array
      else {
        log(`Items has unexpected type ${typeof items}, using empty array`, 'debug');
        // Already initialized as empty array
      }
      
      // Final safety check - if we still have no items, create a default one
      if (processedItems.length === 0) {
        log(`No valid items were found or processed, array is empty`, 'debug');
      }
      
      log(`Final processed items as native array, length: ${processedItems.length}`, 'debug');
      log(`Final processedItems value: ${JSON.stringify(processedItems)}`, 'debug');
      // Verify the return type to ensure it's a native array
      if (!Array.isArray(processedItems)) {
        log(`WARNING: processedItems is not an array! Type: ${typeof processedItems}`, 'debug');
      }
      return processedItems;
    } catch (error) {
      log(`Error processing items for storage: ${error}`, 'debug');
      return [];
    }
  }
  
  // Receipt methods
  async getReceipt(id: number): Promise<Receipt | undefined> {
    // Validate the ID early to prevent database errors
    if (isNaN(id) || id <= 0) {
      log(`Invalid receipt ID: ${id}, typeof: ${typeof id}`, 'db');
      throw new Error(`Invalid receipt ID: ${id}`);
    }
    
    try {
      log(`Getting receipt with ID: ${id}`, 'db');
      const result = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
      return result[0];
    } catch (error) {
      log(`Error in getReceipt(${id}): ${error}`, 'db');
      throw error;
    }
  }
  
  async getReceiptsByUser(userId: number, limit?: number, offset: number = 0): Promise<Receipt[]> {
    // Base query with required filters and sorting
    const baseQuery = db.select()
      .from(receipts)
      .where(eq(receipts.userId, userId))
      .orderBy(desc(receipts.createdAt));
      
    // Execute with limit and offset as needed
    if (limit) {
      return await baseQuery.limit(limit).offset(offset);
    } else {
      return await baseQuery.offset(offset);
    }
  }
  
  async createReceipt(insertReceipt: InsertReceipt): Promise<Receipt> {
    const now = new Date();
    
    try {
      log(`Creating receipt for userId: ${insertReceipt.userId}, store: ${insertReceipt.storeName}`, 'debug');
      
      // Process and validate the items field separately for better debugging
      const processedItems = this.processItemsForStorage(insertReceipt.items);
      log(`Processed items result type: ${typeof processedItems}, isArray: ${Array.isArray(processedItems)}`, 'debug');
      log(`Processed items content: ${JSON.stringify(processedItems)}`, 'debug');

      // Process tags using the helper method
      const processedTags = this.processTagsForStorage(insertReceipt.tags);
      log(`Processed tags result type: ${typeof processedTags}, isArray: ${Array.isArray(processedTags)}`, 'debug');
      log(`Processed tags content: ${JSON.stringify(processedTags)}`, 'debug');
      
      // Debug the processed values before constructing the object
      log(`Before creating insert object - processedItems type: ${typeof processedItems}`, 'debug');
      log(`Before creating insert object - processedItems is array: ${Array.isArray(processedItems)}`, 'debug');
      log(`Before creating insert object - processedTags type: ${typeof processedTags}`, 'debug');
      log(`Before creating insert object - processedTags is array: ${Array.isArray(processedTags)}`, 'debug');
      
      // Force the values to be native arrays if they're not already
      const itemsArray = Array.isArray(processedItems) ? processedItems : [];
      const tagsArray = Array.isArray(processedTags) ? processedTags : [];
      
      // Prepare the insert payload with thorough validation and explicit type enforcement
      const insertValues = {
        userId: insertReceipt.userId,
        storeName: insertReceipt.storeName,
        date: insertReceipt.date,
        total: insertReceipt.total,
        items: itemsArray, // Explicitly use the array variable
        
        blobUrl: insertReceipt.blobUrl || null,
        blobName: insertReceipt.blobName || null,
        imageData: insertReceipt.imageData || null,
        
        category: insertReceipt.category || 'other',
        tags: tagsArray, // Explicitly use the array variable
        notes: insertReceipt.notes || null,
        
        confidenceScore: insertReceipt.confidenceScore || null,
        rawOcrData: insertReceipt.rawOcrData || null,
        
        latitude: insertReceipt.latitude || null,
        longitude: insertReceipt.longitude || null,
        
        isTaxDeductible: insertReceipt.isTaxDeductible || false,
        isRecurring: insertReceipt.isRecurring || false,
        
        createdAt: now,
        updatedAt: now,
        processedAt: insertReceipt.rawOcrData ? now : null,
      };
      
      // Log the final insert values for debugging (excluding large fields like imageData)
      const logValues: Record<string, any> = { ...insertValues };
      if ('imageData' in logValues) logValues.imageData = logValues.imageData ? "[BINARY DATA]" : null;
      if ('rawOcrData' in logValues) logValues.rawOcrData = logValues.rawOcrData ? "[OCR DATA]" : null;
      log(`Final insert values: ${JSON.stringify(logValues)}`, 'debug');
      
      // Let's double-check the arrays right before insertion
      log(`Type check just before insert - items is ${typeof insertValues.items}, isArray: ${Array.isArray(insertValues.items)}`, 'db');
      log(`Type check just before insert - tags is ${typeof insertValues.tags}, isArray: ${Array.isArray(insertValues.tags)}`, 'db');
      
      try {
        // Using a direct parameterized query to handle the array types properly
        const query = `
          INSERT INTO receipts (
            "user_id", "store_name", "date", "total", "items", "blob_url", 
            "blob_name", "image_data", "category", "tags", "notes", 
            "confidence_score", "raw_ocr_data", "latitude", "longitude",
            "is_tax_deductible", "is_recurring",
            "created_at", "updated_at", "processed_at"
          ) VALUES (
            $1, $2, $3, $4, $5::jsonb, $6, 
            $7, $8, $9, $10, $11, 
            $12, $13, $14, $15,
            $16, $17, $18, $19, $20
          )
          RETURNING *;
        `;

        // Proper handling for specific PostgreSQL types
        // 1. For jsonb columns: If it's an object/array, stringify it to ensure proper JSON formatting
        // 2. For text[] columns: Ensure it's a native array (tags is already correct type)
        
        // For debugging
        log(`Items array before SQL, type: ${typeof itemsArray}, is array: ${Array.isArray(itemsArray)}`, 'db');
        log(`Tags array before SQL, type: ${typeof tagsArray}, is array: ${Array.isArray(tagsArray)}`, 'db');
        
        const values = [
          insertValues.userId,
          insertValues.storeName,
          insertValues.date,
          insertValues.total,
          JSON.stringify(itemsArray), // Explicitly stringify for JSONB
          insertValues.blobUrl,
          insertValues.blobName,
          insertValues.imageData,
          insertValues.category,
          tagsArray, // Native array for text[] column
          insertValues.notes,
          insertValues.confidenceScore,
          JSON.stringify(insertValues.rawOcrData || null), // Stringify for JSONB
          insertValues.latitude,
          insertValues.longitude,
          insertValues.isTaxDeductible,
          insertValues.isRecurring,
          insertValues.createdAt,
          insertValues.updatedAt,
          insertValues.processedAt
        ];

        log(`Executing direct SQL with explicit type casting`, 'db');
        const result = await pool.query(query, values);
        log(`Direct SQL query succeeded, rows: ${result.rows.length}`, 'db');
        
        // Return the newly created receipt
        const receipt = result.rows[0];
        log(`Receipt created successfully with ID: ${receipt?.id || 'unknown'}`, 'debug');
        return receipt;
      } catch (sqlError) {
        log(`Direct SQL query failed: ${sqlError}`, 'db');
        throw sqlError;
      }
    } catch (error) {
      // Detailed error logging
      log(`Error in createReceipt: ${error}`, 'db');
      
      // Additional error details for database errors
      if (error instanceof Error) {
        log(`Error name: ${error.name}, message: ${error.message}, stack: ${error.stack}`, 'db');
        
        // Check for specific database errors
        if (error.message.includes('malformed array literal')) {
          log('CRITICAL ERROR: Malformed array detected. This usually indicates an issue with the items field format.', 'db');
          log(`Items input was: ${JSON.stringify(insertReceipt.items)}`, 'db');
        }
      }
      
      // Re-throw the error for the caller to handle
      throw error;
    }
  }
  
  async updateReceipt(id: number, updates: Partial<InsertReceipt>): Promise<Receipt | undefined> {
    // Validate the ID early to prevent database errors
    if (isNaN(id) || id <= 0) {
      log(`Invalid receipt ID for update: ${id}, typeof: ${typeof id}`, 'db');
      throw new Error(`Invalid receipt ID: ${id}`);
    }
    
    // Prepare updates with appropriate defaults
    const updateValues: Record<string, any> = {
      updatedAt: new Date()
    };
    
    if ('storeName' in updates) updateValues.storeName = updates.storeName!;
    if ('date' in updates) updateValues.date = updates.date!;
    if ('total' in updates) updateValues.total = updates.total!;
    if ('items' in updates) {
      const processedItems = this.processItemsForStorage(updates.items);
      log(`Update method - processedItems type: ${typeof processedItems}, isArray: ${Array.isArray(processedItems)}`, 'debug');
      // Force to be a native array
      updateValues.items = Array.isArray(processedItems) ? processedItems : [];
    }
    if ('isTaxDeductible' in updates) updateValues.isTaxDeductible = updates.isTaxDeductible!;
    if ('isRecurring' in updates) updateValues.isRecurring = updates.isRecurring!;
    
    if ('blobUrl' in updates) updateValues.blobUrl = updates.blobUrl || null;
    if ('blobName' in updates) updateValues.blobName = updates.blobName || null;
    if ('imageData' in updates) updateValues.imageData = updates.imageData || null;
    if ('category' in updates) updateValues.category = updates.category || "other";
    
    // Process tags using the helper method
    if ('tags' in updates) {
      const processedTags = this.processTagsForStorage(updates.tags);
      log(`Processed tags for update type: ${typeof processedTags}, isArray: ${Array.isArray(processedTags)}`, 'debug');
      log(`Processed tags content: ${JSON.stringify(processedTags)}`, 'debug');
      // Force to be a native array
      updateValues.tags = Array.isArray(processedTags) ? processedTags : [];
    }
    if ('notes' in updates) updateValues.notes = updates.notes || null;
    if ('confidenceScore' in updates) updateValues.confidenceScore = updates.confidenceScore || null;
    if ('rawOcrData' in updates) {
      updateValues.rawOcrData = updates.rawOcrData || null;
      updateValues.processedAt = updates.rawOcrData ? new Date() : null;
    }
    if ('latitude' in updates) updateValues.latitude = updates.latitude || null;
    if ('longitude' in updates) updateValues.longitude = updates.longitude || null;
    
    // Let's double-check the arrays right before update
    if ('items' in updateValues) {
      log(`Type check before update - items is ${typeof updateValues.items}, isArray: ${Array.isArray(updateValues.items)}`, 'db');
    }
    if ('tags' in updateValues) {
      log(`Type check before update - tags is ${typeof updateValues.tags}, isArray: ${Array.isArray(updateValues.tags)}`, 'db');
    }
    
    try {
      // Build the update SQL query dynamically based on which fields are present
      let updateQuery = 'UPDATE receipts SET "updated_at" = $1';
      const queryParams: any[] = [updateValues.updatedAt];
      let paramIndex = 2;
      
      // Map updateValues to column names and parameter placeholders
      if ('storeName' in updateValues) {
        updateQuery += `, "store_name" = $${paramIndex++}`;
        queryParams.push(updateValues.storeName);
      }
      
      if ('date' in updateValues) {
        updateQuery += `, "date" = $${paramIndex++}`;
        queryParams.push(updateValues.date);
      }
      
      if ('total' in updateValues) {
        updateQuery += `, "total" = $${paramIndex++}`;
        queryParams.push(updateValues.total);
      }
      
      if ('items' in updateValues) {
        updateQuery += `, "items" = $${paramIndex++}::jsonb`;
        queryParams.push(JSON.stringify(updateValues.items)); // Stringify for JSONB
      }
      
      if ('blobUrl' in updateValues) {
        updateQuery += `, "blob_url" = $${paramIndex++}`;
        queryParams.push(updateValues.blobUrl);
      }
      
      if ('blobName' in updateValues) {
        updateQuery += `, "blob_name" = $${paramIndex++}`;
        queryParams.push(updateValues.blobName);
      }
      
      if ('imageData' in updateValues) {
        updateQuery += `, "image_data" = $${paramIndex++}`;
        queryParams.push(updateValues.imageData);
      }
      
      if ('category' in updateValues) {
        updateQuery += `, "category" = $${paramIndex++}`;
        queryParams.push(updateValues.category);
      }
      
      if ('tags' in updateValues) {
        updateQuery += `, "tags" = $${paramIndex++}`;
        queryParams.push(updateValues.tags); // Should already be a native array for text[]
      }
      
      if ('notes' in updateValues) {
        updateQuery += `, "notes" = $${paramIndex++}`;
        queryParams.push(updateValues.notes);
      }
      
      if ('confidenceScore' in updateValues) {
        updateQuery += `, "confidence_score" = $${paramIndex++}`;
        queryParams.push(updateValues.confidenceScore);
      }
      
      if ('rawOcrData' in updateValues) {
        updateQuery += `, "raw_ocr_data" = $${paramIndex++}::jsonb`;
        queryParams.push(JSON.stringify(updateValues.rawOcrData || null)); // Stringify for JSONB
      }
      
      if ('processedAt' in updateValues) {
        updateQuery += `, "processed_at" = $${paramIndex++}`;
        queryParams.push(updateValues.processedAt);
      }
      
      if ('latitude' in updateValues) {
        updateQuery += `, "latitude" = $${paramIndex++}`;
        queryParams.push(updateValues.latitude);
      }
      
      if ('longitude' in updateValues) {
        updateQuery += `, "longitude" = $${paramIndex++}`;
        queryParams.push(updateValues.longitude);
      }
      
      if ('isTaxDeductible' in updateValues) {
        updateQuery += `, "is_tax_deductible" = $${paramIndex++}`;
        queryParams.push(updateValues.isTaxDeductible);
      }
      
      if ('isRecurring' in updateValues) {
        updateQuery += `, "is_recurring" = $${paramIndex++}`;
        queryParams.push(updateValues.isRecurring);
      }
      
      // Add WHERE clause and RETURNING
      updateQuery += ` WHERE "id" = $${paramIndex} RETURNING *`;
      queryParams.push(id);
      
      log(`Executing direct SQL UPDATE with explicit type casting`, 'db');
      const result = await pool.query(updateQuery, queryParams);
      log(`Direct SQL UPDATE query succeeded, rows: ${result.rows.length}`, 'db');
      
      return result.rows[0];
    } catch (sqlError) {
      log(`Direct SQL UPDATE query failed: ${sqlError}`, 'db');
      throw sqlError;
    }
  }
  
  async deleteReceipt(id: number): Promise<void> {
    // Validate the ID early to prevent database errors
    if (isNaN(id) || id <= 0) {
      log(`Invalid receipt ID for deletion: ${id}, typeof: ${typeof id}`, 'db');
      throw new Error(`Invalid receipt ID: ${id}`);
    }
    
    try {
      log(`Deleting receipt with ID: ${id}`, 'db');
      await db.delete(receipts).where(eq(receipts.id, id));
    } catch (error) {
      log(`Error in deleteReceipt(${id}): ${error}`, 'db');
      throw error;
    }
  }
  
  async findDuplicateReceipts(userId: number, storeName: string, date: Date, total: string): Promise<Receipt[]> {
    try {
      const normalizedStoreName = storeName.toLowerCase().trim();
      const normalizedTotal = parseFloat(total.replace(/[^0-9.-]/g, '')) || 0;
      
      // Get all receipts for user and filter in memory for flexible matching
      const userReceipts = await db.select().from(receipts).where(eq(receipts.userId, userId));
      
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      
      const duplicates = userReceipts.filter(r => {
        const receiptDate = new Date(r.date);
        receiptDate.setHours(0, 0, 0, 0);
        const receiptTotal = parseFloat(r.total.replace(/[^0-9.-]/g, '')) || 0;
        
        const storeMatch = r.storeName.toLowerCase().trim() === normalizedStoreName;
        const dateMatch = receiptDate.getTime() === targetDate.getTime();
        const totalMatch = Math.abs(receiptTotal - normalizedTotal) < 0.01;
        
        return storeMatch && dateMatch && totalMatch;
      });
      
      log(`Found ${duplicates.length} potential duplicate receipts for store: ${storeName}, date: ${date}, total: ${total}`, 'db');
      return duplicates;
    } catch (error) {
      log(`Error in findDuplicateReceipts: ${error}`, 'db');
      return [];
    }
  }
  
  // Tag methods
  async getTagsByUser(userId: number): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.userId, userId));
  }
  
  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values({
      userId: insertTag.userId,
      name: insertTag.name,
      createdAt: new Date(),
    }).returning();
    
    return tag;
  }
  
  async deleteTag(id: number): Promise<void> {
    // Validate the ID early to prevent database errors
    if (isNaN(id) || id <= 0) {
      log(`Invalid tag ID for deletion: ${id}, typeof: ${typeof id}`, 'db');
      throw new Error(`Invalid tag ID: ${id}`);
    }
    
    try {
      log(`Deleting tag with ID: ${id}`, 'db');
      await db.delete(tags).where(eq(tags.id, id));
    } catch (error) {
      log(`Error in deleteTag(${id}): ${error}`, 'db');
      throw error;
    }
  }
  
  // Receipt-tag relation methods
  async addTagToReceipt(receiptId: number, tagId: number): Promise<void> {
    // Validate IDs early to prevent database errors
    if (isNaN(receiptId) || receiptId <= 0) {
      log(`Invalid receipt ID for tag association: ${receiptId}`, 'db');
      throw new Error(`Invalid receipt ID: ${receiptId}`);
    }
    
    if (isNaN(tagId) || tagId <= 0) {
      log(`Invalid tag ID for association: ${tagId}`, 'db');
      throw new Error(`Invalid tag ID: ${tagId}`);
    }
    
    try {
      // Check if the relationship already exists to avoid duplicates
      const existing = await db.select()
        .from(receiptTags)
        .where(and(
          eq(receiptTags.receiptId, receiptId),
          eq(receiptTags.tagId, tagId)
        ));
      
      if (existing.length === 0) {
        log(`Adding tag ${tagId} to receipt ${receiptId}`, 'db');
        await db.insert(receiptTags).values({
          receiptId,
          tagId
        });
      } else {
        log(`Tag ${tagId} already associated with receipt ${receiptId}`, 'db');
      }
    } catch (error) {
      log(`Error in addTagToReceipt(${receiptId}, ${tagId}): ${error}`, 'db');
      throw error;
    }
  }
  
  async removeTagFromReceipt(receiptId: number, tagId: number): Promise<void> {
    // Validate IDs early to prevent database errors
    if (isNaN(receiptId) || receiptId <= 0) {
      log(`Invalid receipt ID for tag removal: ${receiptId}`, 'db');
      throw new Error(`Invalid receipt ID: ${receiptId}`);
    }
    
    if (isNaN(tagId) || tagId <= 0) {
      log(`Invalid tag ID for removal: ${tagId}`, 'db');
      throw new Error(`Invalid tag ID: ${tagId}`);
    }
    
    try {
      log(`Removing tag ${tagId} from receipt ${receiptId}`, 'db');
      await db.delete(receiptTags)
        .where(and(
          eq(receiptTags.receiptId, receiptId),
          eq(receiptTags.tagId, tagId)
        ));
    } catch (error) {
      log(`Error in removeTagFromReceipt(${receiptId}, ${tagId}): ${error}`, 'db');
      throw error;
    }
  }
  
  async getTagsForReceipt(receiptId: number): Promise<Tag[]> {
    // Validate ID early to prevent database errors
    if (isNaN(receiptId) || receiptId <= 0) {
      log(`Invalid receipt ID for getting tags: ${receiptId}`, 'db');
      throw new Error(`Invalid receipt ID: ${receiptId}`);
    }
    
    try {
      log(`Getting tags for receipt ID: ${receiptId}`, 'db');
      return db.select({
        id: tags.id,
        userId: tags.userId,
        name: tags.name,
        createdAt: tags.createdAt
      })
      .from(receiptTags)
      .innerJoin(tags, eq(receiptTags.tagId, tags.id))
      .where(eq(receiptTags.receiptId, receiptId));
    } catch (error) {
      log(`Error in getTagsForReceipt(${receiptId}): ${error}`, 'db');
      throw error;
    }
  }
  
  // Auth token methods
  async createAuthToken(userId: number, expiresInDays: number = 7): Promise<AuthToken> {
    // Generate a secure random token
    const tokenValue = randomBytes(32).toString('hex');
    
    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    const [token] = await db.insert(authTokens).values({
      userId,
      token: tokenValue,
      expiresAt,
      createdAt: new Date(),
      isRevoked: false
    }).returning();
    
    return token;
  }
  
  async getAuthTokenByToken(tokenValue: string): Promise<AuthToken | undefined> {
    const result = await db.select()
      .from(authTokens)
      .where(and(
        eq(authTokens.token, tokenValue),
        eq(authTokens.isRevoked, false),
        gte(authTokens.expiresAt, new Date())
      ))
      .limit(1);
    
    if (result.length > 0) {
      // Update last used timestamp
      await db.update(authTokens)
        .set({ lastUsed: new Date() })
        .where(eq(authTokens.id, result[0].id));
      
      return result[0];
    }
    
    return undefined;
  }
  
  async revokeAuthToken(tokenId: string): Promise<void> {
    await db.update(authTokens)
      .set({ isRevoked: true })
      .where(eq(authTokens.id, tokenId));
  }
  
  async cleanupExpiredTokens(): Promise<number> {
    const result = await db.delete(authTokens)
      .where(or(
        lte(authTokens.expiresAt, new Date()),
        eq(authTokens.isRevoked, true)
      ))
      .returning({ id: authTokens.id });
    
    return result.length;
  }
  
  // Analytics methods
  async getCustomCategories(userId: number): Promise<any[]> {
    try {
      const userCustomCategories = await db
        .select()
        .from(customCategories)
        .where(and(
          eq(customCategories.userId, userId),
          eq(customCategories.isActive, true)
        ))
        .orderBy(asc(customCategories.displayName));
      
      // Transform the data to match frontend expectations
      const transformedCategories = userCustomCategories.map(cat => ({
        ...cat,
        displayName: cat.displayName // Ensure displayName field exists
      }));
      
      return transformedCategories;
    } catch (error) {
      console.error("Error fetching custom categories:", error);
      return [];
    }
  }

  async createCustomCategory(insertCustomCategory: any): Promise<any> {
    try {
      const [customCategory] = await db
        .insert(customCategories)
        .values({
          ...insertCustomCategory,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return customCategory;
    } catch (error) {
      console.error("Error creating custom category:", error);
      throw error;
    }
  }

  async updateCustomCategory(id: number, updates: any): Promise<any | undefined> {
    try {
      const [customCategory] = await db
        .update(customCategories)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(customCategories.id, id))
        .returning();
      
      return customCategory;
    } catch (error) {
      console.error("Error updating custom category:", error);
      return undefined;
    }
  }

  async deleteCustomCategory(id: number): Promise<void> {
    try {
      await db
        .update(customCategories)
        .set({ 
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(customCategories.id, id));
    } catch (error) {
      console.error("Error deleting custom category:", error);
      throw error;
    }
  }

  async getCategorySummary(userId: number): Promise<{ category: string, count: number, total: number }[]> {
    // Get category statistics from the database
    const categorySummary = await db
      .select({
        category: receipts.category,
        count: count(receipts.id),
        total: sql<number>`sum(cast(${receipts.total} as float))`,
      })
      .from(receipts)
      .where(eq(receipts.userId, userId))
      .groupBy(receipts.category);
    
    // Create a map for quick lookups
    const categoryMap = new Map<string, { category: string, count: number, total: number }>(
      categorySummary.map((summary: { category: string, count: number, total: number }) => [summary.category, summary])
    );
    
    // Ensure all categories are present even if they have no data
    return EXPENSE_CATEGORIES.map(category => {
      const existingData = categoryMap.get(category);
      return {
        category,
        count: existingData?.count || 0,
        total: existingData?.total || 0
      };
    });
  }
  
  async getMonthlyExpenseSummary(userId: number): Promise<{ month: string, total: number }[]> {
    // Extract year and month from timestamp and convert to YYYY-MM format
    const monthExpression = sql<string>`to_char(${receipts.date}, 'YYYY-MM')`;
    
    // Get monthly statistics from the database
    const monthlySummary = await db
      .select({
        month: monthExpression,
        total: sql<number>`sum(cast(${receipts.total} as float))`,
      })
      .from(receipts)
      .where(eq(receipts.userId, userId))
      .groupBy(monthExpression)
      .orderBy(asc(monthExpression));
    
    // Convert the unknown type to string for month
    return monthlySummary.map((item: { month: unknown, total: number }) => ({
      month: String(item.month),
      total: item.total
    }));
  }

  // Budget methods
  async getBudgets(userId: number): Promise<Budget[]> {
    try {
      const userBudgets = await db
        .select()
        .from(budgets)
        .where(and(
          eq(budgets.userId, userId),
          eq(budgets.isActive, true)
        ))
        .orderBy(asc(budgets.createdAt));
      
      return userBudgets;
    } catch (error) {
      log(`Error getting budgets for user ${userId}: ${error}`, 'db');
      throw error;
    }
  }

  async createBudget(insertBudget: InsertBudget): Promise<Budget> {
    try {
      const [budget] = await db
        .insert(budgets)
        .values({
          ...insertBudget,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      log(`Created budget: ${budget.name} for user ${insertBudget.userId}`, 'db');
      return budget;
    } catch (error) {
      log(`Error creating budget: ${error}`, 'db');
      throw error;
    }
  }

  async updateBudget(id: number, updates: Partial<InsertBudget>): Promise<Budget | undefined> {
    try {
      const [budget] = await db
        .update(budgets)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(budgets.id, id))
        .returning();
      
      return budget;
    } catch (error) {
      log(`Error updating budget ${id}: ${error}`, 'db');
      return undefined;
    }
  }

  async deleteBudget(id: number): Promise<void> {
    try {
      await db
        .update(budgets)
        .set({ 
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(budgets.id, id));
      
      log(`Deleted budget ${id}`, 'db');
    } catch (error) {
      log(`Error deleting budget ${id}: ${error}`, 'db');
      throw error;
    }
  }

  // Billing and subscription methods
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      return await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .orderBy(asc(subscriptionPlans.price));
    } catch (error) {
      log(`Error getting subscription plans: ${error}`, 'db');
      throw error;
    }
  }

  async getSubscriptionPlan(id: number): Promise<SubscriptionPlan | null> {
    try {
      const result = await db
        .select()
        .from(subscriptionPlans)
        .where(and(
          eq(subscriptionPlans.id, id),
          eq(subscriptionPlans.isActive, true)
        ))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      log(`Error getting subscription plan ${id}: ${error}`, 'db');
      return null;
    }
  }

  async getSubscriptionPlanByName(name: string): Promise<SubscriptionPlan | null> {
    try {
      const result = await db
        .select()
        .from(subscriptionPlans)
        .where(and(
          eq(subscriptionPlans.name, name),
          eq(subscriptionPlans.isActive, true)
        ))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      log(`Error getting subscription plan by name ${name}: ${error}`, 'db');
      return null;
    }
  }

  async getSubscriptionPlanByGooglePlayProductId(productId: string): Promise<SubscriptionPlan | null> {
    try {
      const result = await db
        .select()
        .from(subscriptionPlans)
        .where(and(
          eq(subscriptionPlans.googlePlayProductId, productId),
          eq(subscriptionPlans.isActive, true)
        ))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      log(`Error getting subscription plan by Google Play product ID ${productId}: ${error}`, 'db');
      return null;
    }
  }

  async createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    try {
      const [newPlan] = await db
        .insert(subscriptionPlans)
        .values({
          ...plan,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      log(`Created subscription plan: ${newPlan.name}`, 'db');
      return newPlan;
    } catch (error) {
      log(`Error creating subscription plan: ${error}`, 'db');
      throw error;
    }
  }

  async getUserSubscription(userId: number): Promise<UserSubscription | null> {
    try {
      const result = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      log(`Error getting user subscription for user ${userId}: ${error}`, 'db');
      return null;
    }
  }

  async createUserSubscription(subscription: InsertUserSubscription): Promise<UserSubscription> {
    try {
      const [newSubscription] = await db
        .insert(userSubscriptions)
        .values({
          ...subscription,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      log(`Created subscription for user ${subscription.userId}`, 'db');
      return newSubscription;
    } catch (error) {
      log(`Error creating user subscription: ${error}`, 'db');
      throw error;
    }
  }

  async updateUserSubscription(id: number, updates: Partial<InsertUserSubscription>): Promise<UserSubscription | null> {
    try {
      const [updatedSubscription] = await db
        .update(userSubscriptions)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(userSubscriptions.id, id))
        .returning();
      
      return updatedSubscription || null;
    } catch (error) {
      log(`Error updating user subscription ${id}: ${error}`, 'db');
      return null;
    }
  }

  async getPaymentTransactions(userId: number): Promise<PaymentTransaction[]> {
    try {
      return await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.userId, userId))
        .orderBy(desc(paymentTransactions.createdAt));
    } catch (error) {
      log(`Error getting payment transactions for user ${userId}: ${error}`, 'db');
      return [];
    }
  }

  async createPaymentTransaction(transaction: InsertPaymentTransaction): Promise<PaymentTransaction> {
    try {
      const [newTransaction] = await db
        .insert(paymentTransactions)
        .values({
          ...transaction,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      log(`Created payment transaction for user ${transaction.userId}, amount: ${transaction.amount}`, 'db');
      return newTransaction;
    } catch (error) {
      log(`Error creating payment transaction: ${error}`, 'db');
      throw error;
    }
  }

  async createBillingEvent(event: InsertBillingEvent): Promise<BillingEvent> {
    try {
      const [newEvent] = await db
        .insert(billingEvents)
        .values({
          ...event,
          createdAt: new Date()
        })
        .returning();
      
      return newEvent;
    } catch (error) {
      log(`Error creating billing event: ${error}`, 'db');
      throw error;
    }
  }

  // Trial and subscription management methods
  async startFreeTrial(userId: number): Promise<void> {
    try {
      // Set trial end date to 30 days from now
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      
      await db
        .update(users)
        .set({
          trialEndDate: trialEndsAt,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
      
      log(`Started 30-day free trial for user ${userId}, ends at: ${trialEndsAt}`, 'db');
    } catch (error) {
      log(`Error starting free trial for user ${userId}: ${error}`, 'db');
      throw error;
    }
  }

  async updateUserSubscriptionStatus(userId: number, status: string, platform?: string): Promise<void> {
    try {
      const updateData: any = {
        subscriptionStatus: status,
        updatedAt: new Date()
      };
      
      if (platform) {
        updateData.subscriptionPlatform = platform;
      }
      
      await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));
      
      log(`Updated subscription status for user ${userId}: ${status} (platform: ${platform || 'none'})`, 'db');
    } catch (error) {
      log(`Error updating subscription status for user ${userId}: ${error}`, 'db');
      throw error;
    }
  }

  // Promo code methods
  async getPromoCode(code: string): Promise<PromoCode | null> {
    try {
      const upperCode = code.toUpperCase();
      const result = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, upperCode))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      log(`Error getting promo code ${code}: ${error}`, 'db');
      return null;
    }
  }

  async validatePromoCode(code: string): Promise<PromoCode | null> {
    try {
      const upperCode = code.toUpperCase();
      const result = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.code, upperCode))
        .limit(1);
      
      const promoCode = result[0];
      
      if (!promoCode) {
        log(`Promo code ${code} not found`, 'db');
        return null;
      }
      
      // Check if code is active
      if (!promoCode.isActive) {
        log(`Promo code ${code} is not active`, 'db');
        return null;
      }
      
      // Check if code has expired
      if (promoCode.expiresAt && new Date(promoCode.expiresAt) < new Date()) {
        log(`Promo code ${code} has expired`, 'db');
        return null;
      }
      
      // Check if code has reached max uses
      if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
        log(`Promo code ${code} has reached max uses`, 'db');
        return null;
      }
      
      log(`Promo code ${code} validated successfully`, 'db');
      return promoCode;
    } catch (error) {
      log(`Error validating promo code ${code}: ${error}`, 'db');
      return null;
    }
  }

  async createPromoCode(insertPromoCode: InsertPromoCode): Promise<PromoCode> {
    try {
      const [newPromoCode] = await db
        .insert(promoCodes)
        .values({
          ...insertPromoCode,
          code: insertPromoCode.code.toUpperCase(),
          usedCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      log(`Created promo code: ${newPromoCode.code}`, 'db');
      return newPromoCode;
    } catch (error) {
      log(`Error creating promo code: ${error}`, 'db');
      throw error;
    }
  }

  async usePromoCode(userId: number, code: string, trialDays: number): Promise<void> {
    try {
      const upperCode = code.toUpperCase();
      
      // Calculate trial end date
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);
      
      // Update user with promo code and trial end date
      await db
        .update(users)
        .set({
          promoCodeUsed: upperCode,
          trialEndDate: trialEndDate,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));
      
      // Increment promo code used count
      await db
        .update(promoCodes)
        .set({
          usedCount: sql`${promoCodes.usedCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(promoCodes.code, upperCode));
      
      log(`Applied promo code ${code} to user ${userId}, trial ends: ${trialEndDate}`, 'db');
    } catch (error) {
      log(`Error using promo code ${code} for user ${userId}: ${error}`, 'db');
      throw error;
    }
  }

  /**
   * Email tracking methods
   */
  async createEmailEvent(event: InsertEmailEvent): Promise<EmailEvent> {
    try {
      const [newEvent] = await db
        .insert(emailEvents)
        .values(event)
        .returning();
      
      log(`Email event created: ${event.eventType} for ${event.email}`, 'email');
      return newEvent;
    } catch (error) {
      log(`Error creating email event: ${error}`, 'email');
      throw error;
    }
  }

  async getEmailEvents(filters?: { 
    email?: string; 
    eventType?: string; 
    userId?: number; 
    emailType?: string; 
    limit?: number 
  }): Promise<EmailEvent[]> {
    try {
      let query = db.select().from(emailEvents).$dynamic();
      
      if (filters?.email) {
        query = query.where(eq(emailEvents.email, filters.email));
      }
      if (filters?.eventType) {
        query = query.where(eq(emailEvents.eventType, filters.eventType));
      }
      if (filters?.userId) {
        query = query.where(eq(emailEvents.userId, filters.userId));
      }
      if (filters?.emailType) {
        query = query.where(eq(emailEvents.emailType, filters.emailType));
      }
      
      const events = await query
        .orderBy(desc(emailEvents.timestamp))
        .limit(filters?.limit || 100);
      
      return events;
    } catch (error) {
      log(`Error getting email events: ${error}`, 'email');
      throw error;
    }
  }

  async getEmailStats(days: number = 30): Promise<{
    totalSent: number;
    delivered: number;
    bounced: number;
    spamReports: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    bounceRate: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const events = await db
        .select()
        .from(emailEvents)
        .where(sql`${emailEvents.timestamp} >= ${startDate}`);
      
      const totalSent = events.length;
      const delivered = events.filter(e => e.eventType === 'delivered').length;
      const bounced = events.filter(e => e.eventType === 'bounce').length;
      const spamReports = events.filter(e => e.eventType === 'spamreport').length;
      const opened = events.filter(e => e.eventType === 'open').length;
      const clicked = events.filter(e => e.eventType === 'click').length;
      
      return {
        totalSent,
        delivered,
        bounced,
        spamReports,
        opened,
        clicked,
        deliveryRate: totalSent > 0 ? (delivered / totalSent) * 100 : 0,
        bounceRate: totalSent > 0 ? (bounced / totalSent) * 100 : 0,
      };
    } catch (error) {
      log(`Error getting email stats: ${error}`, 'email');
      throw error;
    }
  }

  async getProblematicEmails(): Promise<Array<{ 
    email: string; 
    bounceType: string; 
    bounceReason: string; 
    count: number 
  }>> {
    try {
      const bounces = await db
        .select({
          email: emailEvents.email,
          bounceType: emailEvents.bounceType,
          bounceReason: emailEvents.bounceReason,
        })
        .from(emailEvents)
        .where(eq(emailEvents.eventType, 'bounce'));
      
      // Group by email and count occurrences
      const grouped = bounces.reduce((acc, bounce) => {
        const key = bounce.email;
        if (!acc[key]) {
          acc[key] = {
            email: bounce.email,
            bounceType: bounce.bounceType || 'unknown',
            bounceReason: bounce.bounceReason || 'unknown',
            count: 0
          };
        }
        acc[key].count++;
        return acc;
      }, {} as Record<string, { email: string; bounceType: string; bounceReason: string; count: number }>);
      
      return Object.values(grouped).sort((a, b) => b.count - a.count);
    } catch (error) {
      log(`Error getting problematic emails: ${error}`, 'email');
      throw error;
    }
  }
}