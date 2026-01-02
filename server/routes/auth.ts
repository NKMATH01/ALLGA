import express from 'express';
import { db } from '../db/index';
import { users, students, parents, branches } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyPassword } from '../utils/helpers';
import { requireAuth, requireAdmin, requireBranchManager } from '../middleware/auth';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
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

    // Update session
    req.session.user = {
      id: manager.id,
      username: manager.username,
      name: manager.name,
      role: 'branch',
      branchId: manager.branchId || undefined,
    };

    res.json({
      success: true,
      message: `${branch.name} 관리자로 전환되었습니다.`,
      user: req.session.user,
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

    // Update session
    req.session.user = {
      id: student.user.id,
      username: student.user.username,
      name: student.user.name,
      role: 'student',
      branchId: student.user.branchId || undefined,
    };

    res.json({
      success: true,
      message: `${student.user.name} 학생으로 전환되었습니다.`,
      user: req.session.user,
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

    // Update session
    req.session.user = {
      id: parent.user.id,
      username: parent.user.username,
      name: parent.user.name,
      role: 'parent',
      branchId: parent.user.branchId || undefined,
    };

    res.json({
      success: true,
      message: `${parent.user.name} 학부모로 전환되었습니다.`,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ message: '전환 중 오류가 발생했습니다.' });
  }
});

export default router;
