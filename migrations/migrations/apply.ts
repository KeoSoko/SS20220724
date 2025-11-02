import { sql } from "drizzle-orm";
import { db } from "../server/db";

async function migrate() {
  console.log("Adding new columns to users table...");
  
  // Add new columns to the users table
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS birthdate TEXT,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS profile_picture TEXT;
  `);
  
  console.log("Migration completed successfully!");
  process.exit(0);
}

migrate().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
