import express from 'express';
import { db } from '../db/index';
import { classes, studentClasses, students, users } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireBranchManager } from '../middleware/auth';
import { validateStudentsInBranch } from '../utils/branchScope';
import { log, errorFields } from '../utils/logger';

const router = express.Router();

// GET /api/classes - 반 목록 조회
router.get('/', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    // 목록에서 반마다 학생 수를 따로 조회하면 N+1 이 된다.
    // leftJoin + GROUP BY 로 한 번에 집계한다(배정 0명인 반도 남도록 left).
    // 기존 응답 필드는 그대로 두고 studentCount 만 추가한다.
    const classList = await db
      .select({
        id: classes.id,
        name: classes.name,
        branchId: classes.branchId,
        grade: classes.grade,
        description: classes.description,
        isActive: classes.isActive,
        createdAt: classes.createdAt,
        studentCount: sql<number>`count(${studentClasses.studentId})`,
      })
      .from(classes)
      .leftJoin(studentClasses, eq(studentClasses.classId, classes.id))
      .where(eq(classes.branchId, branchId))
      .groupBy(classes.id)
      .orderBy(classes.createdAt);

    res.json({
      success: true,
      data: classList.map((c) => ({ ...c, studentCount: Number(c.studentCount) || 0 })),
    });
  } catch (error) {
    log.error('class.get_classes_failed', errorFields(error));
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
    log.error('class.create_class_failed', errorFields(error));
    res.status(500).json({ message: '반 생성 중 오류가 발생했습니다.' });
  }
});

// GET /api/classes/:classId/students - 반에 배정된 학생 목록
router.get('/:classId/students', requireBranchManager, async (req, res) => {
  try {
    const { classId } = req.params;
    const branchId = req.session.user!.branchId!;

    // 반이 본인 지점 소속인지 먼저 확인한다(타 지점 반의 학생 명단이 새지 않도록)
    const [cls] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!cls) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }
    if (cls.branchId !== branchId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    // student_classes ⨝ students ⨝ users 단일 쿼리
    const rows = await db
      .select({
        id: students.id,
        name: users.name,
        grade: students.grade,
        school: students.school,
      })
      .from(studentClasses)
      .innerJoin(students, eq(studentClasses.studentId, students.id))
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(studentClasses.classId, classId))
      .orderBy(users.name);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    log.error('class.get_class_students_failed', errorFields(error));
    res.status(500).json({ message: '반 학생 목록 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/classes/:id - 반 수정
router.put('/:id', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;
    const { name, grade, description, studentIds } = req.body;

    // studentIds 는 "보냈을 때만" 반영한다. 안 보낸 요청은 메타만 수정하던
    // 기존 동작 그대로여야 한다(하위 호환).
    const hasStudentIds = Array.isArray(studentIds);

    if (hasStudentIds && studentIds.length > 0) {
      const studentError = await validateStudentsInBranch(studentIds, branchId);
      if (studentError) {
        return res.status(403).json({ message: studentError });
      }
    }

    const updatedClass = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(classes)
        .set({ name, grade, description })
        .where(and(eq(classes.id, id), eq(classes.branchId, branchId)))
        .returning();

      if (!row) return null;

      if (hasStudentIds) {
        const current = await tx
          .select({ studentId: studentClasses.studentId })
          .from(studentClasses)
          .where(eq(studentClasses.classId, id));

        const currentIds = new Set(current.map((c) => c.studentId));
        const nextIds = new Set<string>(studentIds);

        // 전체 삭제 후 재삽입하지 않는다. 그 사이 다른 요청이 끼어들면
        // 배정이 통째로 사라질 수 있고, 그대로 남는 배정의 enrolledAt 도 리셋된다.
        const toAdd = [...nextIds].filter((sid) => !currentIds.has(sid));
        const toRemove = [...currentIds].filter((sid) => !nextIds.has(sid));

        if (toAdd.length > 0) {
          await tx
            .insert(studentClasses)
            .values(toAdd.map((studentId) => ({ studentId, classId: id })));
        }
        if (toRemove.length > 0) {
          await tx
            .delete(studentClasses)
            .where(
              and(eq(studentClasses.classId, id), inArray(studentClasses.studentId, toRemove))
            );
        }
      }

      return row;
    });

    if (!updatedClass) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: updatedClass,
      message: '반이 수정되었습니다.',
    });
  } catch (error) {
    log.error('class.update_class_failed', errorFields(error));
    res.status(500).json({ message: '반 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/classes/:id - 반 삭제
router.delete('/:id', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;
    const force = req.query.force === 'true';

    const [cls] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);

    if (!cls) {
      return res.status(404).json({ message: '반을 찾을 수 없습니다.' });
    }
    if (cls.branchId !== branchId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const assigned = await db
      .select({ studentId: studentClasses.studentId })
      .from(studentClasses)
      .where(eq(studentClasses.classId, id));

    // 배정된 학생이 있으면 기본적으로 거부한다. 반이 사라지면 반 배포도 함께
    // 끊기므로, 의도한 삭제인지 한 번 확인받는다.
    if (assigned.length > 0 && !force) {
      return res.status(409).json({
        message: `학생 ${assigned.length}명이 배정되어 있습니다.`,
        studentCount: assigned.length,
        hint: '그래도 삭제하려면 force=true 로 다시 요청하세요.',
      });
    }

    await db.delete(classes).where(eq(classes.id, id));

    res.json({
      success: true,
      message: '반이 삭제되었습니다.',
      removedAssignments: assigned.length,
    });
  } catch (error) {
    log.error('class.delete_class_failed', errorFields(error));
    res.status(500).json({ message: '반 삭제 중 오류가 발생했습니다.' });
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
    log.error('class.assign_student_failed', errorFields(error));
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
    log.error('class.remove_student_failed', errorFields(error));
    res.status(500).json({ message: '학생 제거 중 오류가 발생했습니다.' });
  }
});

export default router;
