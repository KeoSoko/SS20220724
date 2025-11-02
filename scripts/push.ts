import * as schema from '../shared/schema';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { log } from '../server/vite';

// This script creates the database tables directly
async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  try {
    console.log('Connecting to database...');
    
    // Create a dedicated pool for migrations
    const pool = new pg.Pool({ connectionString });
    const db = drizzle(pool, { schema });
    
    console.log('Dropping existing tables...');
    
    // Drop all tables in the correct order to avoid foreign key constraint issues
    await db.execute(/* SQL */ `
      DROP TABLE IF EXISTS receipt_tags CASCADE;
      DROP TABLE IF EXISTS auth_tokens CASCADE;
      DROP TABLE IF EXISTS tags CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    
    console.log('Creating tables...');
    
    // Use raw SQL to create tables
    await db.execute(/* SQL */ `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        full_name VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        store_name VARCHAR(255) NOT NULL,
        date TIMESTAMP NOT NULL,
        total VARCHAR(50) NOT NULL,
        items JSONB DEFAULT '[]',
        blob_url VARCHAR(500),
        blob_name VARCHAR(255),
        image_data TEXT,
        category VARCHAR(50) DEFAULT 'other',
        tags TEXT[] DEFAULT '{}',
        notes TEXT,
        confidence_score REAL,
        raw_ocr_data JSONB,
        latitude REAL,
        longitude REAL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS receipt_tags (
        receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (receipt_id, tag_id)
      );
      
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        last_used TIMESTAMP,
        is_revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('Schema push completed successfully');
    
    // Close pool
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Schema push failed:', error);
    process.exit(1);
  }
}

// Execute the schema push
main();