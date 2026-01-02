import 'dotenv/config';
import { db } from './server/db/index';
import { examDistributions, exams, branches, users } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function distributeToAllBranches() {
  try {
    console.log('🔍 모든 지점 조회...');

    // Get all branches
    const allBranches = await db.select().from(branches);
    console.log(`총 ${allBranches.length}개의 지점이 있습니다:`);
    allBranches.forEach((branch, idx) => {
      console.log(`${idx + 1}. ${branch.name} (ID: ${branch.id})`);
    });

    // Get all exams
    console.log('\n📚 모든 시험 조회...');
    const allExams = await db.select().from(exams);
    console.log(`총 ${allExams.length}개의 시험이 있습니다:`);
    allExams.forEach((exam, idx) => {
      console.log(`${idx + 1}. ${exam.title} (${exam.subject}) - ID: ${exam.id}`);
    });

    // Get existing distributions
    console.log('\n🔍 기존 배포 내역 확인...');
    const existingDistributions = await db
      .select()
      .from(examDistributions);

    console.log(`기존 배포 ${existingDistributions.length}개`);

    // Get admin user for distributedBy
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    if (!adminUser) {
      console.error('❌ 관리자 계정을 찾을 수 없습니다.');
      return;
    }

    console.log(`\n✅ 배포자: ${adminUser.name} (ID: ${adminUser.id})`);

    // Distribute each exam to each branch
    console.log('\n📤 모든 지점에 모든 시험 배포 중...');

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 days from now

    let createdCount = 0;
    let skippedCount = 0;

    for (const exam of allExams) {
      for (const branch of allBranches) {
        // Check if already distributed
        const existing = existingDistributions.find(
          d => d.examId === exam.id && d.branchId === branch.id
        );

        if (existing) {
          console.log(`⏭️  건너뜀: ${exam.title} → ${branch.name} (이미 배포됨)`);
          skippedCount++;
          continue;
        }

        // Create distribution
        await db.insert(examDistributions).values({
          examId: exam.id,
          branchId: branch.id,
          distributedBy: adminUser.id,
          startDate: now,
          endDate: endDate,
        });

        console.log(`✅ 배포 완료: ${exam.title} → ${branch.name}`);
        createdCount++;
      }
    }

    console.log('\n🎉 배포 완료!');
    console.log(`새로 배포: ${createdCount}개`);
    console.log(`건너뜀: ${skippedCount}개`);
    console.log(`총 배포 건수: ${createdCount + skippedCount}개`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

distributeToAllBranches();
