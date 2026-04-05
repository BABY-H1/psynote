/**
 * Migration: Add password_hash to users table for self-hosted auth (replace Supabase)
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration 006: self-hosted auth...');

    // Add password_hash column
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`;
    console.log('  ✓ Added password_hash column');

    // Set default password for all existing demo users (password: "demo123")
    const hash = await bcrypt.hash('demo123', 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE password_hash IS NULL`;
    console.log('  ✓ Set default password "demo123" for all existing users');

    console.log('Migration 006 complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
