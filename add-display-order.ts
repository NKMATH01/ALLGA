import 'dotenv/config';
import { db } from './server/db/index';
import { sql } from 'drizzle-orm';

async function addDisplayOrder() {
  try {
    console.log('🔄 Adding display_order column to branches table...');

    await db.execute(sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0 NOT NULL`);

    console.log('✅ Column added successfully!');

    // Set initial display order based on creation date
    console.log('🔢 Setting initial display order...');
    await db.execute(sql`
      UPDATE branches
      SET display_order = subquery.row_num
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
        FROM branches
      ) as subquery
      WHERE branches.id = subquery.id
    `);

    console.log('✅ Initial display order set!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addDisplayOrder();
