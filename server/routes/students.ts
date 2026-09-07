import express from 'express';
import crypto from 'crypto';
import { db } from '../db/index';
import { students, users, parents, studentParents } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';
import { log, errorFields } from '../utils/logger';

// 안전한 랜덤 비밀번호 생성 (8자리: 영문+숫자)
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  const randomBytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

const router = express.Router();

// GET /api/students/me - 현재 로그인한 학생 정보 조회
router.get('/me', async (req, res) => {
  try {
    // 세션 없음은 401, 역할 불일치는 403 (api-spec §12)
    if (!req.session.user) {
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    if (req.session.user.role !== 'student') {
      return res.status(403).json({ message: '학생 권한이 필요합니다.' });
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
    log.error('student.get_student_me_failed', errorFields(error));
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

    // 학부모 정보를 학생마다 조회하면 N+1 이므로 한 번에 가져와 매핑한다
    const listStudentIds = studentList.map((row) => row.student.id);

    const parentRows = listStudentIds.length
      ? await db
          .select({
            studentId: studentParents.studentId,
            parent: parents,
            user: users,
          })
          .from(studentParents)
          .innerJoin(parents, eq(studentParents.parentId, parents.id))
          .innerJoin(users, eq(parents.userId, users.id))
          .where(inArray(studentParents.studentId, listStudentIds))
      : [];

    // 학생당 첫 학부모만 사용 (기존 limit(1) 과 동일한 동작)
    const parentByStudent = new Map<string, (typeof parentRows)[number]>();
    for (const row of parentRows) {
      if (!parentByStudent.has(row.studentId)) {
        parentByStudent.set(row.studentId, row);
      }
    }

    const result = [];
    for (const row of studentList) {
      const parentInfo = parentByStudent.get(row.student.id);

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
    log.error('student.get_students_failed', errorFields(error));
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

    // 안전한 랜덤 비밀번호 생성 (8자리)
    const password = generateSecurePassword();

    const passwordHash = await hashPassword(password);

    // users → students 는 하나의 등록 절차다. 중간에 실패하면 고아 users 행이 남아
    // username(전화번호)만 점유되므로 트랜잭션으로 묶는다.
    const { user, student } = await db.transaction(async (tx) => {
      const [createdUser] = await tx
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

      const [createdStudent] = await tx
        .insert(students)
        .values({
          userId: createdUser.id,
          branchId,
          school,
          grade,
          parentPhone,
        })
        .returning();

      return { user: createdUser, student: createdStudent };
    });

    res.status(201).json({
      success: true,
      data: {
        ...student,
        user,
      },
      message: `학생이 등록되었습니다. 초기 비밀번호: ${password} (반드시 학생에게 전달 후 변경 안내)`,
    });
  } catch (error) {
    // 위 선조회와 INSERT 사이에 같은 연락처로 동시 요청이 들어오면
    // users_username_unique 위반이 난다. 500 이 아니라 선조회와 같은 400 으로 돌려준다.
    const code =
      (error as { code?: string })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505') {
      return res.status(400).json({ message: '이미 사용 중인 연락처입니다.' });
    }
    log.error('student.create_student_failed', errorFields(error));
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
    log.error('student.update_student_failed', errorFields(error));
    res.status(500).json({ message: '학생 수정 중 오류가 발생했습니다.' });
  }
});

// GET /api/branch-students 는 2026-09-07 제거.
// 대체: GET /api/students (지점 학생 목록).

// GET /api/branch-students/stats 는 2026-09-07 제거.
// 대체: GET /api/admin/stats (총괄), 지점 화면은 목록 응답으로 집계한다.

/*
  POST /:id/login-as 는 제거했다(P-4).

  originalUser 를 보존하지 않고 감사 로그도 남기지 않아, 한 번 쓰면 지점장이
  재로그인해야만 원래 화면으로 돌아올 수 있었다. 같은 일을 하는 온전한 경로가
  POST /api/auth/impersonate/student/:studentId 에 이미 있으므로(복귀 +
  [AUDIT] 기록) 열등한 경로를 남겨 두지 않는다.
*/

export default router;
