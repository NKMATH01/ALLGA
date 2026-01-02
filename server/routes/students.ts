import express from 'express';
import { db } from '../db/index';
import { students, users, parents, studentParents, examAttempts, exams } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';

const router = express.Router();

// GET /api/students/me - 현재 로그인한 학생 정보 조회
router.get('/me', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      return res.status(401).json({ message: '학생 계정으로 로그인해주세요.' });
    }

    const userId = req.session.user.id;

    // Get student info with branch
    const [studentData] = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.userId, userId))
      .limit(1);

    if (!studentData) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // Get branch info if exists
    let branchInfo = null;
    if (studentData.student.branchId) {
      const { branches } = await import('../db/schema');
      const [branch] = await db
        .select()
        .from(branches)
        .where(eq(branches.id, studentData.student.branchId))
        .limit(1);

      branchInfo = branch;
    }

    res.json({
      success: true,
      data: {
        ...studentData.student,
        user: studentData.user,
        branch: branchInfo,
      },
    });
  } catch (error) {
    console.error('Get student me error:', error);
    res.status(500).json({ message: '학생 정보 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/students - 학생 목록 조회
router.get('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    const studentList = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.branchId, branchId))
      .orderBy(students.enrollmentDate);

    // Get parent info for each student
    const result = [];
    for (const row of studentList) {
      const [parentInfo] = await db
        .select({
          parent: parents,
          user: users,
        })
        .from(studentParents)
        .innerJoin(parents, eq(studentParents.parentId, parents.id))
        .innerJoin(users, eq(parents.userId, users.id))
        .where(eq(studentParents.studentId, row.student.id))
        .limit(1);

      result.push({
        ...row.student,
        user: row.user,
        parent: parentInfo
          ? {
              id: parentInfo.parent.id,
              userId: parentInfo.parent.userId,
              user: {
                name: parentInfo.user.name,
                phone: parentInfo.user.phone,
              },
            }
          : null,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: '학생 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/students - 학생 생성
router.post('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;
    const { name, phone, school, grade, parentPhone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    // Validate phone number
    if (phone.length < 4) {
      return res.status(400).json({ message: '연락처는 최소 4자리 이상이어야 합니다.' });
    }

    // Use phone as username
    const username = phone;

    // Check if username exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ message: '이미 사용 중인 연락처입니다.' });
    }

    // Generate password from last 4 digits of phone
    const password = phone.slice(-4);

    // Create user
    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        role: 'student',
        name,
        phone,
        branchId,
      })
      .returning();

    // Create student
    const [student] = await db
      .insert(students)
      .values({
        userId: user.id,
        branchId,
        school,
        grade,
        parentPhone,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: {
        ...student,
        user,
      },
      message: '학생이 등록되었습니다. (초기 비밀번호: 연락처 끝 4자리)',
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ message: '학생 등록 중 오류가 발생했습니다.' });
  }
});

// PUT /api/students/:id - 학생 수정 (비밀번호 재설정 포함)
router.put('/:id', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;
    const { name, phone, school, grade, parentPhone, password } = req.body;

    // Get student
    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.branchId, branchId)))
      .limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생을 찾을 수 없습니다.' });
    }

    // Get current user info
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, student.userId))
      .limit(1);

    if (!currentUser) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // Update user
    const userUpdate: any = { name };

    // If phone changed, update phone and username
    if (phone && phone !== currentUser.phone) {
      if (phone.length < 4) {
        return res.status(400).json({ message: '연락처는 최소 4자리 이상이어야 합니다.' });
      }

      // Check if new phone already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, phone))
        .limit(1);

      if (existingUser && existingUser.id !== student.userId) {
        return res.status(400).json({ message: '이미 사용 중인 연락처입니다.' });
      }

      userUpdate.phone = phone;
      userUpdate.username = phone;
    }

    // Update password if provided
    if (password && password.trim() !== '') {
      userUpdate.passwordHash = await hashPassword(password);
    }

    await db.update(users).set(userUpdate).where(eq(users.id, student.userId));

    // Update student
    const [updatedStudent] = await db
      .update(students)
      .set({ school, grade, parentPhone })
      .where(eq(students.id, id))
      .returning();

    res.json({
      success: true,
      data: updatedStudent,
      message: password && password.trim() !== ''
        ? '학생 정보가 수정되었습니다. (비밀번호가 변경되었습니다.)'
        : '학생 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ message: '학생 수정 중 오류가 발생했습니다.' });
  }
});

// GET /api/branch-students - 지점 학생 목록 (성적 포함)
router.get('/branch-students', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    const studentList = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.branchId, branchId));

    const result = [];
    for (const row of studentList) {
      // Get latest exam attempt
      const [latestAttempt] = await db
        .select({
          attempt: examAttempts,
          exam: exams,
        })
        .from(examAttempts)
        .innerJoin(exams, eq(examAttempts.examId, exams.id))
        .where(eq(examAttempts.studentId, row.student.id))
        .orderBy(desc(examAttempts.submittedAt))
        .limit(1);

      result.push({
        id: row.student.id,
        name: row.user.name,
        grade: row.student.grade,
        latestExam: latestAttempt
          ? {
              title: latestAttempt.exam.title,
              score: latestAttempt.attempt.score,
              maxScore: latestAttempt.attempt.maxScore,
              grade: latestAttempt.attempt.grade,
              percentage:
                latestAttempt.attempt.maxScore
                  ? Math.round(
                      (latestAttempt.attempt.score! / latestAttempt.attempt.maxScore) * 100
                    )
                  : 0,
              submittedAt: latestAttempt.attempt.submittedAt,
            }
          : null,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get branch students error:', error);
    res.status(500).json({ message: '학생 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/branch-students/stats - 지점 통계
router.get('/stats', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    // Get total students
    const totalStudents = await db
      .select()
      .from(students)
      .where(eq(students.branchId, branchId));

    // Get total exams attempted
    const totalAttempts = await db
      .select()
      .from(examAttempts)
      .innerJoin(students, eq(examAttempts.studentId, students.id))
      .where(eq(students.branchId, branchId));

    // Get completed attempts
    const completedAttempts = totalAttempts.filter(a => a.exam_attempts.submittedAt !== null);

    // Calculate average score
    const avgScore = completedAttempts.length > 0
      ? completedAttempts.reduce((sum, a) => sum + (a.exam_attempts.score || 0), 0) / completedAttempts.length
      : 0;

    res.json({
      success: true,
      data: {
        totalStudents: totalStudents.length,
        totalAttempts: totalAttempts.length,
        completedAttempts: completedAttempts.length,
        avgScore: Math.round(avgScore * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Get branch stats error:', error);
    res.status(500).json({ message: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/students/:id/login-as - 학생 계정으로 로그인
router.post('/:id/login-as', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;

    // Get student
    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.branchId, branchId)))
      .limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생을 찾을 수 없습니다.' });
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, student.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // Update session to login as student
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role as any,
      name: user.name,
      branchId: user.branchId || undefined,
    };

    res.json({
      success: true,
      user: req.session.user,
      message: `${user.name} 학생으로 로그인되었습니다.`,
    });
  } catch (error) {
    console.error('Login as student error:', error);
    res.status(500).json({ message: '학생 로그인 중 오류가 발생했습니다.' });
  }
});

export default router;
