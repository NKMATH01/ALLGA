import 'dotenv/config';
import { db } from './index';
import { users, branches } from './schema';
import { hashPassword } from '../utils/helpers';

async function addBranches() {
  console.log('🏫 Adding new branches...');

  try {
    const branchesData = [
      {
        id: 'branch-eohak1',
        name: '어학원1',
        address: '서울시 강남구 어학로 100',
        phone: '02-2000-1001',
        managerName: '박어학',
        username: 'eohak1',
        password: 'eohak1!',
        email: 'eohak1@olga.com',
      },
      {
        id: 'branch-eohak2',
        name: '어학원2',
        address: '서울시 서초구 어학로 200',
        phone: '02-2000-1002',
        managerName: '이어학',
        username: 'eohak2',
        password: 'eohak2!',
        email: 'eohak2@olga.com',
      },
      {
        id: 'branch-eohak3',
        name: '어학원3',
        address: '서울시 송파구 어학로 300',
        phone: '02-2000-1003',
        managerName: '최어학',
        username: 'eohak3',
        password: 'eohak3!',
        email: 'eohak3@olga.com',
      },
      {
        id: 'branch-eohak4',
        name: '어학원4',
        address: '서울시 강동구 어학로 400',
        phone: '02-2000-1004',
        managerName: '정어학',
        username: 'eohak4',
        password: 'eohak4!',
        email: 'eohak4@olga.com',
      },
      {
        id: 'branch-eohak5',
        name: '어학원5',
        address: '서울시 노원구 어학로 500',
        phone: '02-2000-1005',
        managerName: '강어학',
        username: 'eohak5',
        password: 'eohak5!',
        email: 'eohak5@olga.com',
      },
    ];

    for (const branchData of branchesData) {
      // Create branch
      const [branch] = await db
        .insert(branches)
        .values({
          id: branchData.id,
          name: branchData.name,
          address: branchData.address,
          phone: branchData.phone,
          managerName: branchData.managerName,
        })
        .returning();

      // Create branch manager
      const branchPassword = await hashPassword(branchData.password);
      await db
        .insert(users)
        .values({
          username: branchData.username,
          passwordHash: branchPassword,
          role: 'branch',
          name: branchData.managerName,
          email: branchData.email,
          branchId: branch.id,
        })
        .returning();

      console.log(`✅ Created branch: ${branchData.name} (${branchData.username} / ${branchData.password})`);
    }

    console.log('\n✨ All branches added successfully!\n');
    console.log('📝 New branch accounts:');
    branchesData.forEach((b) => {
      console.log(`   ${b.name}: ${b.username} / ${b.password}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Adding branches failed:', error);
    process.exit(1);
  }
}

addBranches();
