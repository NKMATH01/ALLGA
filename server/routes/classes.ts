import express from 'express';
import { db } from '../db/index';
import { classes, studentClasses, students } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';

const router = express.Router();

/**
 * studentIds 가 전부 지정 지점 소속인지 검증. 문제가 있으면 메시지, 정상이면 null.
 */
async function validateStudentsInBranch(studentIds: string[], branchId: string): Promise<string | null> {
  const rows = await db
    .select({ id: students.id })
    .from(students)
    .where(and(inArray(students.id, studentIds), eq(students.branchId, branchId)));

  if (rows.length !== studentIds.length) {
    return '본인 지점에 속하지 않은 학생이 포함되어 있습니다.';
  }
  return null;
}

// GET /api/classes - 반 목록 조회
router.get('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    const classList = await db
      .select()
      .from(classes)
      .where(eq(classes.branchId, branchId))
      .orderBy(classes.createdAt);

    res.json({
      success: true,
      data: classList,
    });
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ message: '반 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/classes - 반 생성
router.post('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;
    const { name, grade, description, studentIds } = req.body;

    if (!name) {
      return res.status(400).json({ message: '반 이름을 입력해주세요.' });
    }

    // 배정할 학생이 있으면 반 생성 전에 지점 소속을 먼저 검증
    const hasStudents = Array.isArray(studentIds) && studentIds.length > 0;
    if (hasStudents) {
      const studentError = await validateStudentsInBranch(studentIds, branchId);
      if (studentError) {
        return res.status(403).json({ message: studentError });
      }
    }

    const [newClass] = await db
      .insert(classes)
      .values({
        name,
        branchId,
        grade,
        description,
      })
      .returning();

    // 클라이언트가 보낸 studentIds 를 실제로 배정 (기존에는 무시되고 있었음)
    if (hasStudents) {
      await db.insert(studentClasses).values(
        studentIds.map((studentId: string) => ({ studentId, classId: newClass.id }))
      );
    }

    res.status(201).json({
      success: true,
      data: newClass,
      message: hasStudents
        ? `반이 생성되고 학생 ${studentIds.length}명이 배정되었습니다.`
        : '반이 생성되었습니다.',
    });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ message: '반 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/classes/:id - 반 수정
router.put('/:id', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;
    const { name, grade, description } = req.body;

    const [updatedClass] = await db
      .update(classes)
      .set({ name, grade, description })
      .where(and(eq(classes.id, id), eq(classes.branchId, branchId)))
      .returning();

    if (!updatedClass) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: updatedClass,
      message: '반이 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({ message: '반 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/classes/:classId/students/:studentId - 학생 배정
router.post('/:classId/students/:studentId', requireBranchManager, async (req, res) => {
  try {
    const { classId, studentId } = req.params;
    const branchId = req.session.user!.branchId!;

    // 반과 학생이 모두 본인 지점 소속인지 검증
    const [cls] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.branchId, branchId)))
      .limit(1);

    if (!cls) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }

    const studentError = await validateStudentsInBranch([studentId], branchId);
    if (studentError) {
      return res.status(403).json({ message: studentError });
    }

    // Check if already assigned
    const [existing] = await db
      .select()
      .from(studentClasses)
      .where(and(eq(studentClasses.studentId, studentId), eq(studentClasses.classId, classId)))
      .limit(1);

    if (existing) {
      return res.status(400).json({ message: '이미 배정된 학생입니다.' });
    }

    await db.insert(studentClasses).values({
      studentId,
      classId,
    });

    res.status(201).json({
      success: true,
      message: '학생이 반에 배정되었습니다.',
    });
  } catch (error) {
    console.error('Assign student error:', error);
    res.status(500).json({ message: '학생 배정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/classes/:classId/students/:studentId - 학생 제거
router.delete('/:classId/students/:studentId', requireBranchManager, async (req, res) => {
  try {
    const { classId, studentId } = req.params;
    const branchId = req.session.user!.branchId!;

    // 본인 지점의 반인지 검증
    const [cls] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.branchId, branchId)))
      .limit(1);

    if (!cls) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }

    await db
      .delete(studentClasses)
      .where(and(eq(studentClasses.studentId, studentId), eq(studentClasses.classId, classId)));

    res.json({
      success: true,
      message: '학생이 반에서 제거되었습니다.',
    });
  } catch (error) {
    console.error('Remove student error:', error);
    res.status(500).json({ message: '학생 제거 중 오류가 발생했습니다.' });
  }
});

export default router;
