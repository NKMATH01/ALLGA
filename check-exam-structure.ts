import 'dotenv/config';
import { db } from './server/db/index';
import { exams } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function checkExamStructure() {
  try {
    console.log('🔍 시험 데이터 구조 확인...');

    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.title, '올가국어 2025 2차 미.수.등 [중3] 문항 분석'))
      .limit(1);

    if (!exam) {
      console.error('❌ 시험을 찾을 수 없습니다.');
      return;
    }

    console.log(`✅ 시험: ${exam.title}`);
    console.log(`총 문제 수: ${exam.totalQuestions}`);

    const questionsData = exam.questionsData as any[];
    console.log(`\nquestionsData 배열 길이: ${questionsData.length}`);

    if (questionsData.length > 0) {
      console.log('\n첫 번째 문항 구조:');
      console.log(JSON.stringify(questionsData[0], null, 2));

      console.log('\n두 번째 문항 구조:');
      console.log(JSON.stringify(questionsData[1], null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

checkExamStructure();
