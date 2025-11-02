import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../shared/schema';

// Main migration function
async function main() {
  // Validate DATABASE_URL
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  // Create PostgreSQL connection pool
  const pool = new pg.Pool({ connectionString });
  
  // Initialize Drizzle ORM
  const db = drizzle(pool, { schema });
  
  console.log('Starting database migration...');
  
  try {
    // Run migrations
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Execute the migration
main();