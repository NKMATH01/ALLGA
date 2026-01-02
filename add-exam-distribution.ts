import 'dotenv/config';
import { db } from './server/db/index';
import { examDistributions, exams, students, users } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function addExamDistribution() {
  try {
    console.log('🔍 김기영 학생 정보 조회...');

    // Get Kim Giyoung's student info
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, '김기영'))
      .limit(1);

    if (!user) {
      console.error('❌ 김기영 사용자를 찾을 수 없습니다.');
      return;
    }

    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);

    if (!student) {
      console.error('❌ 김기영 학생 정보를 찾을 수 없습니다.');
      return;
    }

    console.log(`✅ 학생 정보: ${user.name} (ID: ${student.id}, Branch: ${student.branchId})`);

    // Get branch manager
    const [branchManager] = await db
      .select()
      .from(users)
      .where(eq(users.branchId, student.branchId))
      .limit(1);

    if (!branchManager) {
      console.error('❌ 지점 관리자를 찾을 수 없습니다.');
      return;
    }

    console.log(`✅ 지점 관리자: ${branchManager.name} (ID: ${branchManager.id})`);

    // Get all exams
    console.log('\n📚 사용 가능한 시험 목록 조회...');
    const allExams = await db.select().from(exams);

    console.log(`총 ${allExams.length}개의 시험이 있습니다:`);
    allExams.forEach((exam, idx) => {
      console.log(`${idx + 1}. ${exam.title} (${exam.subject}) - ID: ${exam.id}`);
    });

    // Get existing distributions for this student
    console.log('\n🔍 기존 배포 내역 확인...');
    const existingDistributions = await db
      .select({
        distribution: examDistributions,
        exam: exams,
      })
      .from(examDistributions)
      .innerJoin(exams, eq(examDistributions.examId, exams.id))
      .where(eq(examDistributions.branchId, student.branchId));

    console.log(`\n기존 배포된 시험 ${existingDistributions.length}개:`);
    existingDistributions.forEach((dist, idx) => {
      console.log(`${idx + 1}. ${dist.exam.title} - 배포 ID: ${dist.distribution.id}`);
    });

    // Find an exam that's not distributed yet
    const distributedExamIds = existingDistributions.map(d => d.distribution.examId);
    const availableExam = allExams.find(exam => !distributedExamIds.includes(exam.id));

    if (!availableExam) {
      console.log('\n⚠️ 모든 시험이 이미 배포되었습니다. 기존 시험을 다시 배포합니다.');
      // Use the first exam as fallback
      const examToDistribute = allExams[0];

      // Create new distribution
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7); // 7 days from now

      const [newDistribution] = await db
        .insert(examDistributions)
        .values({
          examId: examToDistribute.id,
          branchId: student.branchId,
          distributedBy: branchManager.id,
          startDate: now,
          endDate: endDate,
        })
        .returning();

      console.log(`\n✅ 시험 배포 완료!`);
      console.log(`시험: ${examToDistribute.title}`);
      console.log(`배포 ID: ${newDistribution.id}`);
      console.log(`시작일: ${newDistribution.startDate}`);
      console.log(`종료일: ${newDistribution.endDate}`);
    } else {
      console.log(`\n📝 새로 배포할 시험: ${availableExam.title}`);

      // Create new distribution
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7); // 7 days from now

      const [newDistribution] = await db
        .insert(examDistributions)
        .values({
          examId: availableExam.id,
          branchId: student.branchId,
          distributedBy: branchManager.id,
          startDate: now,
          endDate: endDate,
        })
        .returning();

      console.log(`\n✅ 시험 배포 완료!`);
      console.log(`시험: ${availableExam.title}`);
      console.log(`배포 ID: ${newDistribution.id}`);
      console.log(`시작일: ${newDistribution.startDate}`);
      console.log(`종료일: ${newDistribution.endDate}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

addExamDistribution();
