import 'dotenv/config';
import { db } from './server/db/index';
import { students, users, branches, examDistributions } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function updateBranch() {
  console.log('🔧 Updating branch to 송도지점...\n');

  // Find or create 송도지점
  const [songdoBranch] = await db.select().from(branches).where(eq(branches.name, '송도지점')).limit(1);

  let branchId = songdoBranch?.id;

  if (!songdoBranch) {
    console.log('Creating 송도지점...');
    const [newBranch] = await db.insert(branches).values({
      id: 'branch-songdo',
      name: '송도지점',
      address: '인천시 연수구 송도동',
      phone: '032-1234-5678',
    }).returning();
    branchId = newBranch.id;
    console.log('✅ 송도지점 created:', branchId);
  } else {
    console.log('✅ 송도지점 found:', branchId);
  }

  // Update user
  const [user] = await db.select().from(users).where(eq(users.username, '01011111111')).limit(1);
  if (user) {
    await db.update(users).set({ branchId }).where(eq(users.id, user.id));
    console.log('✅ Updated user branchId');
  }

  // Update student
  const [student] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  if (student) {
    await db.update(students).set({ branchId }).where(eq(students.id, student.id));
    console.log('✅ Updated student branchId');
  }

  // Update distributions
  await db.update(examDistributions)
    .set({ branchId })
    .where(eq(examDistributions.branchId, 'branch-gangnam'));
  console.log('✅ Updated distributions branchId');

  console.log('\n✅ Done! 김기영 학생이 송도지점으로 변경되었습니다.');
  process.exit(0);
}

updateBranch().catch(console.error);
