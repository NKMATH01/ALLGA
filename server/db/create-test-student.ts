import { db } from './index';
import { users, students } from './schema';
import { hashPassword } from '../utils/helpers';

async function createTestStudent() {
  try {
    console.log('Creating test student...');

    const phone = '01012345678';
    const password = phone.slice(-4); // '5678'

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        username: phone, // Use phone as username
        passwordHash: await hashPassword(password),
        role: 'student',
        name: '테스트학생',
        phone: phone,
        branchId: 'allga-gangnam', // You may need to adjust this
      })
      .returning();

    console.log('User created:', user);

    // Create student
    const [student] = await db
      .insert(students)
      .values({
        userId: user.id,
        branchId: 'allga-gangnam', // You may need to adjust this
        school: '테스트중학교',
        grade: '중3',
        parentPhone: '01087654321',
      })
      .returning();

    console.log('Student created:', student);
    console.log('\n=== Test Student Login Info ===');
    console.log('Username (phone):', phone);
    console.log('Password:', password);
    console.log('================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test student:', error);
    process.exit(1);
  }
}

createTestStudent();
