import 'dotenv/config';
import { db } from './server/db/index';
import { users, students, examAttempts, exams, examDistributions } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function checkStudentData() {
  console.log('🔍 김기영 학생 데이터 확인 중...\n');

  try {
    // 1. 김기영 사용자 찾기
    const [user] = await db.select().from(users).where(eq(users.name, '김기영')).limit(1);
    
    if (!user) {
      console.log('❌ 김기영 학생을 찾을 수 없습니다.');
      return;
    }
    
    console.log('✅ 사용자 정보:', {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    });

    // 2. 학생 정보 찾기
    const [student] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
    
    if (!student) {
      console.log('❌ 학생 정보를 찾을 수 없습니다.');
      return;
    }
    
    console.log('\n✅ 학생 정보:', {
      id: student.id,
      branchId: student.branchId,
      grade: student.grade,
      classId: student.classId
    });

    // 3. 시험 응시 기록 찾기
    const attempts = await db.select().from(examAttempts).where(eq(examAttempts.studentId, student.id));
    
    console.log(`\n📝 시험 응시 기록: ${attempts.length}개`);
    
    for (const attempt of attempts) {
      console.log('\n---');
      console.log('응시 ID:', attempt.id);
      console.log('분배 ID:', attempt.distributionId);
      console.log('점수:', attempt.score);
      console.log('등급:', attempt.grade);
      console.log('정답 수:', attempt.correctCount);
      console.log('제출 시간:', attempt.submittedAt);
      console.log('상태:', attempt.status);
      
      // 해당 분배 정보 가져오기
      const [distribution] = await db.select().from(examDistributions).where(eq(examDistributions.id, attempt.distributionId)).limit(1);
      if (distribution) {
        const [exam] = await db.select().from(exams).where(eq(exams.id, distribution.examId)).limit(1);
        if (exam) {
          console.log('시험명:', exam.title);
          console.log('과목:', exam.subject);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

checkStudentData();
