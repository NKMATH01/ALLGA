import 'dotenv/config';
import { db } from '../db/index';
import { aiReports } from '../db/schema';

async function resetReports() {
  try {
    console.log('🗑️  기존 AI 보고서 삭제 중...');

    await db.delete(aiReports);

    console.log('✅ 모든 AI 보고서가 삭제되었습니다.');
    console.log('이제 프론트엔드에서 AI 분석 버튼을 눌러 새로운 4페이지 보고서를 생성하세요.');

    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

resetReports();
