import 'dotenv/config';
import { db } from './index';
import { distributionStudents } from './schema';
import { eq } from 'drizzle-orm';

async function fixDistributionStudents() {
  try {
    console.log('첫 번째 배포의 특정 학생 목록 제거...');

    const distributionId = '72c94503-11aa-4af4-a96c-99cadb8e9560';

    // 이 배포의 모든 특정 학생 목록 삭제 (전체 학생에게 배포되도록)
    await db
      .delete(distributionStudents)
      .where(eq(distributionStudents.distributionId, distributionId));

    console.log('✅ 완료! 이제 첫 번째 배포가 전체 학생에게 배포됩니다.');

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

fixDistributionStudents();
