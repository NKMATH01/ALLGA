import 'dotenv/config';
import { db } from './index';
import { users, students, examAttempts, examDistributions, exams } from './schema';
import { eq } from 'drizzle-orm';

async function checkStudentData() {
  try {
    // 김민준 찾기
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, '김민준'))
      .limit(1);

    if (!user) {
      console.log('김민준 학생을 찾을 수 없습니다.');
      process.exit(0);
    }

    console.log('\n=== 김민준 학생 정보 ===');
    console.log('사용자 ID:', user.id);
    console.log('이름:', user.name);
    console.log('전화번호:', user.phone);
    console.log('지점 ID:', user.branchId);

    // 학생 정보
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);

    if (student) {
      console.log('학생 ID:', student.id);
      console.log('학년:', student.grade);
    }

    // 시험 응시 기록
    const attempts = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.studentId, student.id));

    console.log('\n=== 시험 응시 기록 ===');
    console.log('총 응시 횟수:', attempts.length);
    for (const attempt of attempts) {
      const [exam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, attempt.examId))
        .limit(1);

      console.log('\n응시 ID:', attempt.id);
      console.log('시험:', exam?.title);
      console.log('점수:', attempt.score);
      console.log('정답 수:', attempt.correctCount);
      console.log('제출 여부:', attempt.submittedAt ? '제출됨' : '진행중');
    }

    // 지점의 모든 배포
    const distributions = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.branchId, user.branchId!));

    console.log('\n=== 지점의 시험 배포 ===');
    console.log('총 배포 수:', distributions.length);
    for (const dist of distributions) {
      const [exam] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, dist.examId))
        .limit(1);

      console.log('\n배포 ID:', dist.id);
      console.log('시험:', exam?.title);
      console.log('시작일:', dist.startDate);
      console.log('종료일:', dist.endDate);
      console.log('클래스 ID:', dist.classId || '전체 학생');
    }

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkStudentData();
