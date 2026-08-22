import express from 'express';
import { db } from '../db/index';
import { branches, users, students, examAttempts } from '../db/schema';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';
import { log, errorFields } from '../utils/logger';

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
      // role 조건을 on 절에 둔다. where 로 빼면 지점장 계정이 없는 지점이
      // LEFT JOIN 인데도 결과에서 통째로 빠진다(사실상 INNER JOIN).
      .leftJoin(users, and(eq(users.branchId, branches.id), eq(users.role, 'branch')))
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
    log.error('branch.get_branches_failed', errorFields(error));
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
    log.error('branch.create_branch_failed', errorFields(error));
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
    log.error('branch.update_branch_failed', errorFields(error));
    res.status(500).json({ message: '지점 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/branches/:id - 지점 삭제
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    // 존재하지 않는 id 에 성공 응답하지 않는다
    const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    if (!branch) {
      return res.status(404).json({ message: '지점을 찾을 수 없습니다.' });
    }

    // 지점 소속 학생과 그 응시 기록 규모 확인
    const branchStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.branchId, id));

    const studentIds = branchStudents.map((s) => s.id);
    const attempts = studentIds.length
      ? await db
          .select({ id: examAttempts.id })
          .from(examAttempts)
          .where(inArray(examAttempts.studentId, studentIds))
      : [];

    if (attempts.length > 0 && !force) {
      return res.status(409).json({
        message: `응시 기록 ${attempts.length}건이 존재합니다. 삭제하면 학생 ${studentIds.length}명의 성적과 AI 보고서도 함께 삭제됩니다.`,
        attemptCount: attempts.length,
        studentCount: studentIds.length,
        hint: '그래도 삭제하려면 force=true 로 다시 요청하세요.',
      });
    }

    // users.branchId 에는 FK 가 없어 지점 삭제 시 고아행이 남는다.
    // 계정을 지우면 감사 추적이 끊기므로 비활성 처리만 한다.
    const orphanRoles = ['branch', 'student', 'parent'];
    const deactivated = await db
      .update(users)
      .set({ isActive: false })
      .where(and(eq(users.branchId, id), inArray(users.role, orphanRoles)))
      .returning({ id: users.id });

    await db.delete(branches).where(eq(branches.id, id));

    res.json({
      success: true,
      message: '지점이 삭제되었습니다.',
      deletedAttempts: attempts.length,
      deletedStudents: studentIds.length,
      deactivatedUsers: deactivated.length,
    });
  } catch (error) {
    log.error('branch.delete_branch_failed', errorFields(error));
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
    log.error('branch.reorder_branches_failed', errorFields(error));
    res.status(500).json({ message: '지점 순서 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
