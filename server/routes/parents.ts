import express from 'express';
import { db } from '../db/index';
import { parents, users, studentParents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';

const router = express.Router();

// GET /api/parents - 학부모 목록 조회
router.get('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    const parentList = await db
      .select({
        parent: parents,
        user: users,
      })
      .from(parents)
      .innerJoin(users, eq(parents.userId, users.id))
      .where(eq(parents.branchId, branchId))
      .orderBy(users.name);

    res.json({
      success: true,
      data: parentList.map(row => ({
        ...row.parent,
        user: row.user,
      })),
    });
  } catch (error) {
    console.error('Get parents error:', error);
    res.status(500).json({ message: '학부모 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/parents - 학부모 생성 (학생 연결 포함)
router.post('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;
    const { username, password, name, phone, studentId } = req.body;

    if (!username || !password || !name || !studentId) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    // Check if username exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: '이미 사용 중인 아이디입니다.' });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role: 'parent',
        name,
        phone,
        branchId,
      })
      .returning();

    // Create parent
    const [parent] = await db
      .insert(parents)
      .values({
        userId: user.id,
        branchId,
      })
      .returning();

    // Link parent to student
    await db.insert(studentParents).values({
      studentId,
      parentId: parent.id,
    });

    res.status(201).json({
      success: true,
      data: {
        ...parent,
        user,
      },
      message: '학부모가 등록되었습니다.',
    });
  } catch (error) {
    console.error('Create parent error:', error);
    res.status(500).json({ message: '학부모 등록 중 오류가 발생했습니다.' });
  }
});

export default router;
