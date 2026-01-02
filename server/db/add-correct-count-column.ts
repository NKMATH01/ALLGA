import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function addCorrectCountColumn() {
  try {
    console.log('correct_count 컬럼을 추가합니다...');
    await sql`ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS correct_count integer`;
    console.log('컬럼 추가 완료!');
  } catch (error) {
    console.error('오류:', error);
  } finally {
    await sql.end();
  }
}

addCorrectCountColumn();
