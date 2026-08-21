import express from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db/index';
import { users, students, parents, branches } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyPassword } from '../utils/helpers';
import { requireAuth, requireAdmin, requireBranchManager } from '../middleware/auth';
import type { SessionUser } from '../middleware/auth';

const router = express.Router();

// 로그인 브루트포스 방어: IP 당 15분에 10회.
// TODO(보안): 아이디=전화번호 / 초기 비밀번호=전화번호 뒷 4자리 관례와
// seed 계정(allga/allga)은 기존 계정 데이터 이전이 필요해 이번 범위에서 제외했다.
// 레이트리밋만으로는 추측 가능한 비밀번호 자체를 해결하지 못한다.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' },
});

/**
 * impersonation 감사 로그. 원 신원과 대상 신원을 한 줄 구조화 로그로 남긴다.
 */
function logImpersonation(action: string, actor: SessionUser | undefined, target: Record<string, unknown>) {
  console.log(
    '[AUDIT][impersonation]',
    JSON.stringify({
      action,
      at: new Date().toISOString(),
      actor: actor ? { id: actor.id, username: actor.username, role: actor.role } : null,
      target,
    })
  );
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, userType } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // Check userType if provided
    if (userType && user.role !== userType) {
      return res.status(401).json({ message: '계정 유형이 올바르지 않습니다.' });
    }

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as any,
      branchId: user.branchId || undefined,
    };

    res.json({
      success: true,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({
    success: true,
    user: req.session.user || null,
    // 전환 중이면 원 신원을 함께 내려 UI 가 복귀 여부를 판단할 수 있게 한다
    originalUser: req.session.originalUser || null,
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.json({ success: true, message: '로그아웃되었습니다.' });
  });
});

// POST /api/auth/impersonate/restore - 원래 신원으로 복귀
// 주의: '/impersonate/:branchId' 보다 먼저 등록해야 한다.
// 뒤에 두면 :branchId 가 'restore' 를 먼저 잡아간다.
// requireAdmin 이 아니라 requireAuth 인 이유: 전환된 뒤 현재 세션 역할은
// student/parent/branch 이므로 admin 검사에 걸려 복귀할 수 없게 된다.
router.post('/impersonate/restore', requireAuth, (req, res) => {
  const originalUser = req.session.originalUser;

  if (!originalUser) {
    return res.status(400).json({ message: '복귀할 원래 계정 정보가 없습니다.' });
  }

  logImpersonation('impersonate_restore', originalUser, {
    from: req.session.user ? { id: req.session.user.id, role: req.session.user.role } : null,
  });

  req.session.user = originalUser;
  delete req.session.originalUser;

  res.json({
    success: true,
    message: `${originalUser.name} 계정으로 복귀했습니다.`,
    user: req.session.user,
  });
});

// POST /api/auth/impersonate/:branchId
// Admin impersonates as branch manager
router.post('/impersonate/:branchId', requireAdmin, async (req, res) => {
  try {
    const { branchId } = req.params;

    // Find branch and its manager
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);

    if (!branch) {
      return res.status(404).json({ message: '지점을 찾을 수 없습니다.' });
    }

    // Find branch manager user
    const [manager] = await db
      .select()
      .from(users)
      .where(and(eq(users.branchId, branchId), eq(users.role, 'branch')))
      .limit(1);

    if (!manager) {
      return res.status(404).json({ message: '지점 관리자를 찾을 수 없습니다.' });
    }

    // 원 신원 보존 (중첩 전환 시 최초 신원을 유지)
    const actor = req.session.user;
    if (!req.session.originalUser) {
      req.session.originalUser = actor;
    }

    // Update session
    req.session.user = {
      id: manager.id,
      username: manager.username,
      name: manager.name,
      role: 'branch',
      branchId: manager.branchId || undefined,
    };

    logImpersonation('impersonate_branch', req.session.originalUser, {
      branchId,
      branchName: branch.name,
      userId: manager.id,
      username: manager.username,
    });

    res.json({
      success: true,
      message: `${branch.name} 관리자로 전환되었습니다.`,
      user: req.session.user,
      originalUser: req.session.originalUser,
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ message: '전환 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/impersonate/student/:studentId
// Branch manager impersonates as student
router.post('/impersonate/student/:studentId', requireBranchManager, async (req, res) => {
  try {
    const { studentId } = req.params;
    const branchId = req.session.user?.branchId;

    // Find student
    const [student] = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(and(eq(students.id, studentId), eq(students.branchId, branchId!)))
      .limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생을 찾을 수 없습니다.' });
    }

    // 원 신원 보존
    if (!req.session.originalUser) {
      req.session.originalUser = req.session.user;
    }

    // Update session
    req.session.user = {
      id: student.user.id,
      username: student.user.username,
      name: student.user.name,
      role: 'student',
      branchId: student.user.branchId || undefined,
    };

    logImpersonation('impersonate_student', req.session.originalUser, {
      studentId,
      userId: student.user.id,
      username: student.user.username,
    });

    res.json({
      success: true,
      message: `${student.user.name} 학생으로 전환되었습니다.`,
      user: req.session.user,
      originalUser: req.session.originalUser,
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ message: '전환 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/impersonate/parent/:parentId
// Branch manager impersonates as parent
router.post('/impersonate/parent/:parentId', requireBranchManager, async (req, res) => {
  try {
    const { parentId } = req.params;
    const branchId = req.session.user?.branchId;

    // Find parent
    const [parent] = await db
      .select({
        parent: parents,
        user: users,
      })
      .from(parents)
      .innerJoin(users, eq(parents.userId, users.id))
      .where(and(eq(parents.id, parentId), eq(parents.branchId, branchId!)))
      .limit(1);

    if (!parent) {
      return res.status(404).json({ message: '학부모를 찾을 수 없습니다.' });
    }

    // 원 신원 보존
    if (!req.session.originalUser) {
      req.session.originalUser = req.session.user;
    }

    // Update session
    req.session.user = {
      id: parent.user.id,
      username: parent.user.username,
      name: parent.user.name,
      role: 'parent',
      branchId: parent.user.branchId || undefined,
    };

    logImpersonation('impersonate_parent', req.session.originalUser, {
      parentId,
      userId: parent.user.id,
      username: parent.user.username,
    });

    res.json({
      success: true,
      message: `${parent.user.name} 학부모로 전환되었습니다.`,
      user: req.session.user,
      originalUser: req.session.originalUser,
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ message: '전환 중 오류가 발생했습니다.' });
  }
});

export default router;
