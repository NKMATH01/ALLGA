import express from 'express';
import { db } from '../db/index';
import { parents, users, studentParents, students, examAttempts, exams } from '../db/schema';
import { eq, and, inArray, isNotNull, desc, sql } from 'drizzle-orm';
import { requireBranchManager, requireAuth } from '../middleware/auth';
import { hashPassword } from '../utils/helpers';

const router = express.Router();

/**
 * 세션 사용자(학부모)에 해당하는 parents 행을 찾는다.
 * role 이 parent 가 아니거나 parents 행이 없으면 null.
 */
async function getSessionParent(req: express.Request) {
  const user = req.session.user;
  if (!user || user.role !== 'parent') return null;

  const [parent] = await db.select().from(parents).where(eq(parents.userId, user.id)).limit(1);
  return parent || null;
}

// GET /api/parents/me/children - 로그인한 학부모의 자녀 목록
router.get('/me/children', requireAuth, async (req, res) => {
  try {
    const parent = await getSessionParent(req);
    if (!parent) {
      return res.status(403).json({ message: '학부모 권한이 필요합니다.' });
    }

    const rows = await db
      .select({
        student: students,
        user: users,
      })
      .from(studentParents)
      .innerJoin(students, eq(studentParents.studentId, students.id))
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(studentParents.parentId, parent.id))
      .orderBy(users.name);

    // 자녀별 완료 응시 수를 한 번에 집계 (자녀 수만큼 쿼리하지 않는다)
    const studentIds = rows.map((r) => r.student.id);
    const countRows = studentIds.length
      ? await db
          .select({
            studentId: examAttempts.studentId,
            count: sql<number>`count(*)`,
          })
          .from(examAttempts)
          .where(
            and(inArray(examAttempts.studentId, studentIds), isNotNull(examAttempts.submittedAt))
          )
          .groupBy(examAttempts.studentId)
      : [];

    const countByStudent = new Map(countRows.map((r) => [r.studentId, Number(r.count) || 0]));

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.student.id,
        name: r.user.name,
        grade: r.student.grade,
        school: r.student.school,
        attemptCount: countByStudent.get(r.student.id) || 0,
      })),
    });
  } catch (error) {
    console.error('Get my children error:', error);
    res.status(500).json({ message: '자녀 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/parents/me/children/:studentId/attempts - 자녀의 완료된 응시 목록
router.get('/me/children/:studentId/attempts', requireAuth, async (req, res) => {
  try {
    const { studentId } = req.params;

    const parent = await getSessionParent(req);
    if (!parent) {
      return res.status(403).json({ message: '학부모 권한이 필요합니다.' });
    }

    // 본인 자녀인지 검증
    const [link] = await db
      .select()
      .from(studentParents)
      .where(and(eq(studentParents.parentId, parent.id), eq(studentParents.studentId, studentId)))
      .limit(1);

    if (!link) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const rows = await db
      .select({
        attempt: examAttempts,
        exam: exams,
      })
      .from(examAttempts)
      .innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(and(eq(examAttempts.studentId, studentId), isNotNull(examAttempts.submittedAt)))
      .orderBy(desc(examAttempts.submittedAt));

    res.json({
      success: true,
      data: rows.map((r) => ({
        attemptId: r.attempt.id,
        examTitle: r.exam.title,
        examSubject: r.exam.subject,
        score: r.attempt.score,
        maxScore: r.attempt.maxScore,
        grade: r.attempt.grade,
        submittedAt: r.attempt.submittedAt,
      })),
    });
  } catch (error) {
    console.error('Get child attempts error:', error);
    res.status(500).json({ message: '성적 조회 중 오류가 발생했습니다.' });
  }
});

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
