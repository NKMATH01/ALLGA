import 'dotenv/config';
import { db } from './index';
import { users, branches, students, exams } from './schema';
import { hashPassword } from '../utils/helpers';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create admin user
    const adminPassword = await hashPassword('allga');
    const [admin] = await db
      .insert(users)
      .values({
        username: 'allga',
        passwordHash: adminPassword,
        role: 'admin',
        name: '시스템 관리자',
        email: 'admin@olga.com',
      })
      .returning();

    console.log('✅ Created admin user');

    // Create branch (강남점)
    const [gangnamBranch] = await db
      .insert(branches)
      .values({
        id: 'branch-gangnam',
        name: '강남점',
        address: '서울시 강남구 테헤란로 123',
        phone: '02-1234-5678',
        managerName: '김관리',
      })
      .returning();

    // Create branch manager for 강남점
    const branchPassword = await hashPassword('allga1');
    await db
      .insert(users)
      .values({
        username: 'allga1',
        passwordHash: branchPassword,
        role: 'branch',
        name: '김관리',
        email: 'gangnam@olga.com',
        branchId: gangnamBranch.id,
      })
      .returning();

    console.log('✅ Created branch and manager');

    // Create student
    const studentPassword = await hashPassword('password123');
    const [studentUser] = await db
      .insert(users)
      .values({
        username: 'kim_minsu',
        passwordHash: studentPassword,
        role: 'student',
        name: '김민수',
        email: 'minsu@example.com',
        phone: '010-9999-8888',
        branchId: gangnamBranch.id,
      })
      .returning();

    await db
      .insert(students)
      .values({
        userId: studentUser.id,
        branchId: gangnamBranch.id,
        school: '강남고등학교',
        grade: '고1',
        parentPhone: '010-1234-5678',
      })
      .returning();

    console.log('✅ Created student');

    // Create sample exam
    await db
      .insert(exams)
      .values({
        title: '수학 모의고사 1회',
        subject: '수학',
        grade: '고1',
        description: '1학기 중간고사 범위',
        totalQuestions: 30,
        totalScore: 100,
        questionsData: Array.from({ length: 30 }, (_, i) => ({
          questionNumber: i + 1,
          difficulty: i < 10 ? '하' : i < 20 ? '중' : '상',
          category: '대수',
          subcategory: '이차함수',
          correctAnswer: (i % 5) + 1,
          points: i >= 25 ? 4 : 3,
        })),
        examTrends: [
          {
            questionNumbers: '1,2,3,4,5',
            description: '이차함수의 기본 개념',
          },
          {
            questionNumbers: '6,7,8,9,10',
            description: '이차함수의 그래프',
          },
        ],
        overallReview: '전체적으로 균형잡힌 출제입니다. 기본 개념부터 심화 문제까지 골고루 출제되었습니다.',
        createdBy: admin.id,
      })
      .returning();

    console.log('✅ Created sample exam');

    console.log('\n✨ Seeding completed successfully!\n');
    console.log('📝 Test accounts:');
    console.log('   Admin: allga / allga');
    console.log('   Branch Manager: allga1 / allga1');
    console.log('   Student: kim_minsu / password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
