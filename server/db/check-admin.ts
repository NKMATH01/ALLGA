import 'dotenv/config';
import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';

async function checkAdmin() {
  try {
    console.log('관리자 계정 확인 중...\n');

    const admins = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'));

    if (admins.length === 0) {
      console.log('❌ 관리자 계정이 없습니다.');
      console.log('\n총괄 관리자를 생성하려면 다음 스크립트를 실행하세요:');
      console.log('npx tsx server/db/seed.ts');
    } else {
      console.log('✅ 관리자 계정 발견:\n');
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. 이름: ${admin.name}`);
        console.log(`   아이디: ${admin.username}`);
        console.log(`   활성화: ${admin.isActive ? 'O' : 'X'}`);
        console.log('');
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📋 로그인 정보:');
      console.log(`   URL: http://localhost:5173`);
      console.log(`   아이디: ${admins[0].username}`);
      console.log(`   비밀번호: admin (초기 비밀번호)`);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkAdmin();
