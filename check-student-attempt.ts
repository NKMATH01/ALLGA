import 'dotenv/config';
import { db } from './server/db/index';
import { examAttempts, students, users, exams } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function checkStudentAttempt() {
  try {
    console.log('🔍 김민수 학생 정보 조회...');

    // Get Kim Minsu's user info
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, '김민수'))
      .limit(1);

    if (!user) {
      console.error('❌ 김민수 사용자를 찾을 수 없습니다.');
      return;
    }

    console.log(`✅ 사용자: ${user.name} (ID: ${user.id})`);

    // Get student info
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);

    if (!student) {
      console.error('❌ 김민수 학생 정보를 찾을 수 없습니다.');
      return;
    }

    console.log(`✅ 학생 ID: ${student.id}`);

    // Get attempts
    const attempts = await db
      .select({
        attempt: examAttempts,
        exam: exams,
      })
      .from(examAttempts)
      .innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(eq(examAttempts.studentId, student.id));

    console.log(`\n📝 총 ${attempts.length}개의 시험 응시 내역:`);

    for (const { attempt, exam } of attempts) {
      console.log(`\n시험: ${exam.title}`);
      console.log(`응시 ID: ${attempt.id}`);
      console.log(`점수: ${attempt.score}/${attempt.maxScore}`);
      console.log(`정답 수: ${attempt.correctCount}`);

      const answers = attempt.answers as any;
      const wrongAnswers: number[] = [];
      const questionsData = exam.questionsData as any[];

      // Find wrong answers
      questionsData.forEach((q: any) => {
        const studentAnswer = answers[q.questionNumber];
        if (studentAnswer !== q.correctAnswer) {
          wrongAnswers.push(q.questionNumber);
        }
      });

      console.log(`틀린 문항: ${wrongAnswers.join(', ')}`);

      // Check if questions have commentary
      const questionsWithCommentary = questionsData.filter((q: any) =>
        wrongAnswers.includes(q.questionNumber) && q.commentary
      );

      console.log(`해설이 있는 틀린 문항: ${questionsWithCommentary.length}개`);

      // Sample first wrong question's commentary
      if (questionsWithCommentary.length > 0) {
        const firstWrong = questionsWithCommentary[0];
        console.log(`\n[${firstWrong.questionNumber}번 문항 해설 샘플]`);
        console.log(`난이도: ${firstWrong.difficulty}`);
        console.log(`대분류: ${firstWrong.category}`);
        console.log(`소분류: ${firstWrong.subcategory}`);
        console.log(`해설 길이: ${firstWrong.commentary?.length || 0}자`);
        console.log(`해설 앞부분: ${firstWrong.commentary?.substring(0, 200)}...`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

checkStudentAttempt();
