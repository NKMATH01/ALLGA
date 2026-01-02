import 'dotenv/config';
import { db } from './server/db/index';
import { students, users, examAttempts, examDistributions, exams } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function fixDistributions() {
  console.log('🔧 Fixing distributions for 김기영...\n');

  // Find user
  const [user] = await db.select().from(users).where(eq(users.username, '01011111111')).limit(1);
  if (!user) {
    console.log('❌ User not found');
    return;
  }

  // Find student
  const [student] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
  if (!student) {
    console.log('❌ Student not found');
    return;
  }

  console.log(`✅ Found student: ${user.name} (Branch: ${student.branchId})`);

  // Get student's attempts
  const attempts = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.studentId, student.id));

  console.log(`\n📝 Found ${attempts.length} attempts`);

  // For each attempt, ensure there's a distribution
  for (const attempt of attempts) {
    console.log(`\n📋 Processing attempt ${attempt.id}...`);

    // Check if distribution exists
    const [existingDist] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, attempt.distributionId))
      .limit(1);

    if (existingDist) {
      console.log(`  ✅ Distribution already exists: ${existingDist.id}`);
      console.log(`     Start: ${existingDist.startDate}`);
      console.log(`     End: ${existingDist.endDate}`);
      console.log(`     Branch: ${existingDist.branchId}`);
    } else {
      console.log(`  ⚠️  Distribution ${attempt.distributionId} not found!`);

      // Get exam info
      const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);

      if (exam) {
        console.log(`  📝 Creating distribution for exam: ${exam.title}`);

        // Create distribution
        const now = new Date();
        const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

        await db.insert(examDistributions).values({
          id: attempt.distributionId,
          examId: exam.id,
          branchId: student.branchId,
          startDate,
          endDate,
          classId: null, // Distribute to all students in branch
        });

        console.log(`  ✅ Distribution created!`);
      }
    }
  }

  console.log('\n✅ Done!');
  process.exit(0);
}

fixDistributions().catch(console.error);
