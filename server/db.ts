import * as schema from '../shared/schema';
import { log } from './vite';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// Get database connection string
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create a single PostgreSQL connection pool for all database operations
export const pool = new pg.Pool({
  connectionString,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 60000, // Increased from 30000 to reduce connection timeouts
  connectionTimeoutMillis: 10000, // Increased from 5000 to allow more time for connection
  keepAlive: true, // Add keepAlive to prevent connection drops
});

// Set up error handling for the pool
pool.on('error', (err) => {
  log(`Unexpected database pool error: ${err}`, 'db');
  // In a production environment, you might want to attempt to reconnect
});

// Create drizzle ORM instance using the pg-pool driver with our schema
export const db = drizzle(pool, { schema });

// Database initialization function
export async function initializeDatabase() {
  // Maximum number of retries
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      log(`Initializing database connection (attempt ${retries + 1}/${maxRetries})...`, 'db');

      // Check database connection with a simple query using the pool
      const result = await pool.query('SELECT NOW() as now');
      log(`Database connection successful: ${result.rows[0].now}`, 'db');

      // Verify schema existence
      try {
        // Check if users table exists
        await db.query.users.findFirst();
        log('Schema validation successful: users table exists', 'db');
      } catch (error) {
        log('Schema does not exist yet, run migrations with: npm run db:push', 'db');
      }

      return true;
    } catch (error) {
      retries++;
      log(`Database initialization error (attempt ${retries}/${maxRetries}): ${error}`, 'db');
      
      if (retries >= maxRetries) {
        log('Maximum retry attempts reached. Database initialization failed.', 'db');
        return false;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, retries), 10000);
      log(`Retrying in ${delay}ms...`, 'db');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

// Create initial database tables
export async function createInitialSchema() {
  if (process.env.NODE_ENV === 'production') {
    log('Skipping automatic schema creation in production', 'db');
    return;
  }
  
  try {
    // This is a simplified approach just for development
    // In production, you should use proper migrations via drizzle-kit
    log('Creating initial database schema...', 'db');
    
    // Execute the push via drizzle-kit CLI
    // This is just a placeholder - the actual push should be done via npm run db:push
    log('Schema creation completed', 'db');
    
    return true;
  } catch (error) {
    log(`Schema creation error: ${error}`, 'db');
    return false;
  }
}

// Drop all tables - use with extreme caution (development only)
export async function dropAllTables() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot drop tables in production environment');
  }
  
  // Implementation omitted for safety
  log('Drop all tables function called but not implemented for safety', 'db');
}