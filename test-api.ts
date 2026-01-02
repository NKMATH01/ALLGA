import 'dotenv/config';
import { db } from './server/db/index';
import { students, users, examAttempts, examDistributions, exams } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function testAPI() {
  console.log('🔍 Testing API for 김기영...\n');

  // Find user
  const [user] = await db.select().from(users).where(eq(users.username, '01011111111')).limit(1);
  console.log('User:', user);

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  // Find student
  const [student] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  console.log('\nStudent:', student);

  if (!student) {
    console.log('❌ Student not found');
    return;
  }

  // Get distributions for this branch
  console.log('\n🔍 Finding distributions for branch:', student.branchId);
  const distributions = await db
    .select({
      distribution: examDistributions,
      exam: exams,
    })
    .from(examDistributions)
    .innerJoin(exams, eq(examDistributions.examId, exams.id))
    .where(eq(examDistributions.branchId, student.branchId));

  console.log(`\n📋 Found ${distributions.length} distributions:`);
  distributions.forEach((d, idx) => {
    console.log(`\n${idx + 1}. ${d.exam.title}`);
    console.log(`   Distribution ID: ${d.distribution.id}`);
    console.log(`   Class ID: ${d.distribution.classId || 'None (all students)'}`);
  });

  // Get attempts
  console.log('\n\n🔍 Finding attempts for student:', student.id);
  const attempts = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.studentId, student.id));

  console.log(`\n📝 Found ${attempts.length} attempts:`);
  attempts.forEach((a, idx) => {
    console.log(`\n${idx + 1}. Attempt ID: ${a.id}`);
    console.log(`   Distribution ID: ${a.distributionId}`);
    console.log(`   Score: ${a.score}`);
    console.log(`   Submitted: ${a.submittedAt}`);
  });

  process.exit(0);
}

testAPI().catch(console.error);
