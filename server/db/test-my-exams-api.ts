import 'dotenv/config';
import { db } from './index';
import { users, students, examAttempts, examDistributions, exams, distributionStudents, studentClasses } from './schema';
import { eq, and } from 'drizzle-orm';

async function testMyExamsAPI() {
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

    const userId = user.id;
    console.log('김민준 사용자 ID:', userId);

    // Get student
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);

    if (!student) {
      console.log('학생 정보를 찾을 수 없습니다.');
      process.exit(1);
    }

    console.log('학생 ID:', student.id);
    console.log('지점 ID:', student.branchId);

    // Get ALL distributions for student's branch
    const now = new Date();
    const allDistributions = await db
      .select({
        distribution: examDistributions,
        exam: exams,
      })
      .from(examDistributions)
      .innerJoin(exams, eq(examDistributions.examId, exams.id))
      .where(eq(examDistributions.branchId, student.branchId));

    console.log('\n총 배포 수:', allDistributions.length);

    // Filter distributions that apply to this student
    const result = [];
    for (const row of allDistributions) {
      let applies = false;

      console.log('\n--- 배포 체크:', row.distribution.id);
      console.log('시험:', row.exam.title);
      console.log('클래스 ID:', row.distribution.classId || '전체');

      // Check 1: Distribution has no classId (distributed to all students in branch)
      if (!row.distribution.classId) {
        // Check if there are specific students selected
        const [studentDist] = await db
          .select()
          .from(distributionStudents)
          .where(eq(distributionStudents.distributionId, row.distribution.id))
          .limit(1);

        if (!studentDist) {
          // No specific students, so applies to all
          applies = true;
          console.log('-> 전체 학생에게 배포됨');
        } else {
          // Check if this student is in the list
          const [myDist] = await db
            .select()
            .from(distributionStudents)
            .where(
              and(
                eq(distributionStudents.distributionId, row.distribution.id),
                eq(distributionStudents.studentId, student.id)
              )
            )
            .limit(1);
          applies = !!myDist;
          console.log('-> 특정 학생:', applies ? '포함됨' : '포함 안됨');
        }
      }
      // Check 2: Distribution is for a class - check if student is in that class
      else if (row.distribution.classId) {
        const [studentClass] = await db
          .select()
          .from(studentClasses)
          .where(
            and(
              eq(studentClasses.studentId, student.id),
              eq(studentClasses.classId, row.distribution.classId)
            )
          )
          .limit(1);
        applies = !!studentClass;
        console.log('-> 클래스 소속:', applies ? '예' : '아니오');
      }

      if (!applies) {
        console.log('=> 이 학생에게 배포되지 않음');
        continue;
      }

      console.log('=> 이 학생에게 배포됨!');

      // Get attempt
      const [attempt] = await db
        .select()
        .from(examAttempts)
        .where(
          and(
            eq(examAttempts.studentId, student.id),
            eq(examAttempts.distributionId, row.distribution.id)
          )
        )
        .limit(1);

      // Determine status
      let status = 'available';
      if (attempt) {
        if (attempt.submittedAt) {
          status = 'completed';
        } else {
          status = 'in_progress';
        }
      }

      // Check if exam is available (within date range)
      if (now < row.distribution.startDate) {
        status = 'upcoming';
      } else if (now > row.distribution.endDate) {
        status = 'expired';
      }

      console.log('응시 상태:', status);
      if (attempt) {
        console.log('점수:', attempt.score);
        console.log('정답 수:', attempt.correctCount);
      }

      result.push({
        distribution: row.distribution,
        exam: {
          id: row.exam.id,
          title: row.exam.title,
          subject: row.exam.subject,
          totalQuestions: row.exam.totalQuestions,
          totalScore: row.exam.totalScore,
        },
        attempt: attempt
          ? {
              id: attempt.id,
              score: attempt.score,
              grade: attempt.grade,
              correctCount: attempt.correctCount,
              submittedAt: attempt.submittedAt,
            }
          : null,
        status,
      });
    }

    console.log('\n\n=== 최종 결과 ===');
    console.log('총 배포된 시험 수:', result.length);
    console.log('\n상세:');
    result.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.exam.title}`);
      console.log('   상태:', item.status);
      console.log('   배포 ID:', item.distribution.id);
      if (item.attempt) {
        console.log('   점수:', item.attempt.score);
        console.log('   정답:', item.attempt.correctCount);
        console.log('   등급:', item.attempt.grade);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

testMyExamsAPI();
