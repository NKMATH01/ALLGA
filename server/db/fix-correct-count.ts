import 'dotenv/config';
import { db } from './index';
import { examAttempts, exams } from './schema';
import { eq, isNotNull } from 'drizzle-orm';

async function fixCorrectCount() {
  console.log('기존 시험 결과의 correctCount를 업데이트합니다...');

  // Get all submitted attempts
  const attempts = await db
    .select()
    .from(examAttempts)
    .where(isNotNull(examAttempts.submittedAt));

  console.log(`총 ${attempts.length}개의 제출된 시험을 찾았습니다.`);

  for (const attempt of attempts) {
    // Get exam
    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.id, attempt.examId))
      .limit(1);

    if (!exam) {
      console.log(`시험 ID ${attempt.examId}를 찾을 수 없습니다. 건너뜁니다.`);
      continue;
    }

    // Calculate correctCount
    let correctCount = 0;
    const questionsData = exam.questionsData as any[];
    const answers = attempt.answers as any;

    for (const question of questionsData) {
      const questionNum = question.number || question.questionNumber;
      const studentAnswer = answers[questionNum];
      // studentAnswer가 1이면 정답으로 처리
      if (studentAnswer === 1) {
        correctCount++;
      }
    }

    // Update attempt
    await db
      .update(examAttempts)
      .set({ correctCount })
      .where(eq(examAttempts.id, attempt.id));

    console.log(`답안 ID ${attempt.id}: correctCount = ${correctCount} 업데이트 완료`);
  }

  console.log('모든 correctCount 업데이트 완료!');
  process.exit(0);
}

fixCorrectCount().catch((error) => {
  console.error('오류 발생:', error);
  process.exit(1);
});
