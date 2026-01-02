import express from 'express';
import { db } from '../db/index';
import { classes, studentClasses } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';

const router = express.Router();

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
    const { name, grade, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: '반 이름을 입력해주세요.' });
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

    res.status(201).json({
      success: true,
      data: newClass,
      message: '반이 생성되었습니다.',
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
