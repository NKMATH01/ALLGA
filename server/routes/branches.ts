import express from 'express';
import { db } from '../db/index';
import { branches, users } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';

const router = express.Router();

// GET /api/branches - 지점 목록 조회
router.get('/', requireAdmin, async (_req, res) => {
  try {
    // Get all branches with manager info, ordered by displayOrder
    const branchList = await db
      .select({
        branch: branches,
        manager: users,
      })
      .from(branches)
      .leftJoin(users, eq(users.branchId, branches.id))
      .where(eq(users.role, 'branch'))
      .orderBy(asc(branches.displayOrder));

    // Group by branch
    const branchesMap = new Map();
    for (const row of branchList) {
      if (!branchesMap.has(row.branch.id)) {
        branchesMap.set(row.branch.id, {
          ...row.branch,
          username: row.manager?.username,
          userId: row.manager?.id,
        });
      }
    }

    res.json({
      success: true,
      data: Array.from(branchesMap.values()),
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ message: '지점 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/branches - 지점 생성 (지점 관리자 계정 포함)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { id, name, address, phone, managerName, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    // Check if username already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: '이미 사용 중인 아이디입니다.' });
    }

    // Create branch
    const branchId = id || crypto.randomUUID();
    const [branch] = await db
      .insert(branches)
      .values({
        id: branchId,
        name,
        address,
        phone,
        managerName,
      })
      .returning();

    // Create branch manager user
    const passwordHash = await hashPassword(password);
    const [manager] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role: 'branch',
        name: managerName || name,
        branchId: branch.id,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: {
        ...branch,
        username: manager.username,
        userId: manager.id,
      },
      message: '지점이 등록되었습니다.',
    });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ message: '지점 등록 중 오류가 발생했습니다.' });
  }
});

// PUT /api/branches/:id - 지점 수정
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, managerName } = req.body;

    const [branch] = await db
      .update(branches)
      .set({ name, address, phone, managerName })
      .where(eq(branches.id, id))
      .returning();

    if (!branch) {
      return res.status(404).json({ message: '지점을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: branch,
      message: '지점이 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update branch error:', error);
    res.status(500).json({ message: '지점 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/branches/:id - 지점 삭제
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(branches).where(eq(branches.id, id));

    res.json({
      success: true,
      message: '지점이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete branch error:', error);
    res.status(500).json({ message: '지점 삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/branches/reorder - 지점 순서 변경
router.post('/reorder', requireAdmin, async (req, res) => {
  try {
    const { branchIds } = req.body; // Array of branch IDs in new order

    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      return res.status(400).json({ message: '유효한 지점 순서를 입력해주세요.' });
    }

    // Update each branch's displayOrder
    await Promise.all(
      branchIds.map((id, index) =>
        db
          .update(branches)
          .set({ displayOrder: index })
          .where(eq(branches.id, id))
      )
    );

    res.json({
      success: true,
      message: '지점 순서가 변경되었습니다.',
    });
  } catch (error) {
    console.error('Reorder branches error:', error);
    res.status(500).json({ message: '지점 순서 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
