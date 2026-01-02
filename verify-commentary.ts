import 'dotenv/config';
import { db } from './server/db/index';
import { exams } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function verifyCommentary() {
  try {
    console.log('🔍 시험 데이터 확인...');

    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.title, '올가국어 2025 2차 미.수.등 [중3] 문항 분석'))
      .limit(1);

    if (!exam) {
      console.error('❌ 시험을 찾을 수 없습니다.');
      return;
    }

    const questionsData = exam.questionsData as any[];

    console.log(`총 문항 수: ${questionsData.length}`);

    // Check first 5 questions
    for (let i = 0; i < 5; i++) {
      const q = questionsData[i];
      console.log(`\n[${q.number}번 문항]`);
      console.log(`난이도: ${q.difficulty}`);
      console.log(`explanation: ${q.explanation ? q.explanation.substring(0, 100) : 'NONE'}`);
      console.log(`commentary: ${q.commentary ? q.commentary.substring(0, 100) : 'NONE'}`);
      console.log(`정답: ${q.correctAnswer}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

verifyCommentary();
