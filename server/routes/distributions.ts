import express from 'express';
import { db } from '../db/index';
import { examDistributions, exams, distributionStudents, students, studentClasses, examAttempts, users, aiReports } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAdminOrBranch, requireBranchManager } from '../middleware/auth';

const router = express.Router();

// GET /api/distributions - 시험 배포 목록 조회
router.get('/', requireAdminOrBranch, async (req, res) => {
  try {
    const user = req.session.user!;

    // Filter by branch if branch manager
    let distributionList;
    if (user.role === 'branch') {
      distributionList = await db
        .select({
          distribution: examDistributions,
          exam: exams,
        })
        .from(examDistributions)
        .innerJoin(exams, eq(examDistributions.examId, exams.id))
        .where(eq(examDistributions.branchId, user.branchId!))
        .orderBy(examDistributions.createdAt);
    } else {
      distributionList = await db
        .select({
          distribution: examDistributions,
          exam: exams,
        })
        .from(examDistributions)
        .innerJoin(exams, eq(examDistributions.examId, exams.id))
        .orderBy(examDistributions.createdAt);
    }

    // Get parent distributions for those that have one
    const result = await Promise.all(
      distributionList.map(async (row) => {
        let parentDistribution = null;
        if (row.distribution.parentDistributionId) {
          const [parent] = await db
            .select()
            .from(examDistributions)
            .where(eq(examDistributions.id, row.distribution.parentDistributionId))
            .limit(1);
          parentDistribution = parent || null;
        }

        return {
          ...row.distribution,
          exam: {
            id: row.exam.id,
            title: row.exam.title,
            subject: row.exam.subject,
            totalQuestions: row.exam.totalQuestions,
            totalScore: row.exam.totalScore,
          },
          parentDistribution,
        };
      })
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get distributions error:', error);
    res.status(500).json({ message: '배포 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/distributions - 시험 배포
router.post('/', requireAdminOrBranch, async (req, res) => {
  try {
    const user = req.session.user!;
    const { examId, branchIds, classId, studentIds, startDate, endDate, parentDistributionId } = req.body;

    if (!examId || !startDate || !endDate) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: '시작일은 종료일보다 이전이어야 합니다.' });
    }

    const distributions = [];

    if (user.role === 'admin') {
      // Admin can distribute to multiple branches
      if (!branchIds || branchIds.length === 0) {
        return res.status(400).json({ message: '지점을 선택해주세요.' });
      }

      for (const branchId of branchIds) {
        const [distribution] = await db
          .insert(examDistributions)
          .values({
            examId,
            branchId,
            classId: classId || null,
            parentDistributionId: null,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            distributedBy: user.id,
          })
          .returning();

        distributions.push(distribution);
      }
    } else {
      // Branch manager can distribute to their branch with class or specific students
      const [distribution] = await db
        .insert(examDistributions)
        .values({
          examId,
          branchId: user.branchId!,
          classId: classId || null,
          parentDistributionId: parentDistributionId || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          distributedBy: user.id,
        })
        .returning();

      // If specific students are selected, create student assignments
      if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
        const studentAssignments = studentIds.map((studentId: string) => ({
          distributionId: distribution.id,
          studentId,
        }));

        await db.insert(distributionStudents).values(studentAssignments);
      }

      distributions.push(distribution);
    }

    res.status(201).json({
      success: true,
      distributions,
      message: studentIds && studentIds.length > 0
        ? `${studentIds.length}명의 학생에게 시험이 배포되었습니다.`
        : classId
        ? '반에 시험이 배포되었습니다.'
        : `${distributions.length}개 지점에 시험이 배포되었습니다.`,
    });
  } catch (error) {
    console.error('Create distribution error:', error);
    res.status(500).json({ message: '시험 배포 중 오류가 발생했습니다.' });
  }
});

// GET /api/distributions/:id - 배포 상세 조회
router.get('/:id', requireAdminOrBranch, async (req, res) => {
  try {
    const { id } = req.params;

    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, id))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: distribution,
    });
  } catch (error) {
    console.error('Get distribution error:', error);
    res.status(500).json({ message: '배포 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/distributions/:id - 지점내 배포 (반별/학생별)
router.put('/:id', requireAdminOrBranch, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user!;
    const { classId, studentIds } = req.body;

    // Get distribution
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, id))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // Branch manager can only update their branch distributions
    if (user.role === 'branch' && distribution.branchId !== user.branchId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    // Update distribution with classId
    await db
      .update(examDistributions)
      .set({ classId: classId || null })
      .where(eq(examDistributions.id, id));

    // Delete existing student assignments
    await db
      .delete(distributionStudents)
      .where(eq(distributionStudents.distributionId, id));

    // If specific students are selected, create student assignments
    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      const studentAssignments = studentIds.map((studentId: string) => ({
        distributionId: id,
        studentId,
      }));

      await db.insert(distributionStudents).values(studentAssignments);
    }

    res.json({
      success: true,
      message: studentIds && studentIds.length > 0
        ? `${studentIds.length}명의 학생에게 시험이 배포되었습니다.`
        : classId
        ? '반에 시험이 배포되었습니다.'
        : '배포가 업데이트되었습니다.',
    });
  } catch (error) {
    console.error('Update distribution error:', error);
    res.status(500).json({ message: '배포 업데이트 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/distributions/:id - 배포 삭제
router.delete('/:id', requireAdminOrBranch, async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(examDistributions).where(eq(examDistributions.id, id));

    res.json({
      success: true,
      message: '배포가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete distribution error:', error);
    res.status(500).json({ message: '배포 삭제 중 오류가 발생했습니다.' });
  }
});

// GET /api/distributions/:id/students - 배포된 시험의 학생 목록 및 응시 상태
router.get('/:id/students', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;

    // Get distribution
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(and(eq(examDistributions.id, id), eq(examDistributions.branchId, branchId)))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // Get exam
    const [exam] = await db
      .select()
      .from(exams)
      .where(eq(exams.id, distribution.examId))
      .limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // Get all students in this distribution
    let studentsList = [];

    if (distribution.classId) {
      // Class-specific distribution - need to join through studentClasses
      studentsList = await db
        .select({
          student: students,
          user: users,
        })
        .from(studentClasses)
        .innerJoin(students, eq(studentClasses.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(and(eq(students.branchId, branchId), eq(studentClasses.classId, distribution.classId)));
    } else {
      // Check if specific students
      const specificStudents = await db
        .select()
        .from(distributionStudents)
        .where(eq(distributionStudents.distributionId, id));

      if (specificStudents.length > 0) {
        // Get those specific students
        const studentIds = specificStudents.map(s => s.studentId);
        studentsList = await db
          .select({
            student: students,
            user: users,
          })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(and(eq(students.branchId, branchId), inArray(students.id, studentIds)));
      } else {
        // All students in branch
        studentsList = await db
          .select({
            student: students,
            user: users,
          })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(eq(students.branchId, branchId));
      }
    }

    // Get attempts for each student
    const result = [];
    for (const row of studentsList) {
      const [attempt] = await db
        .select()
        .from(examAttempts)
        .where(
          and(
            eq(examAttempts.studentId, row.student.id),
            eq(examAttempts.distributionId, id)
          )
        )
        .limit(1);

      // Check if AI report exists
      let hasReport = false;
      let reportId = null;
      if (attempt && attempt.submittedAt) {
        const [report] = await db
          .select()
          .from(aiReports)
          .where(eq(aiReports.attemptId, attempt.id))
          .limit(1);
        hasReport = !!report;
        reportId = report?.id || null;
      }

      result.push({
        studentId: row.student.id,
        studentName: row.user.name,
        studentPhone: row.user.phone,
        attemptId: attempt?.id || null,
        answers: attempt?.answers || null,
        score: attempt?.score || null,
        maxScore: attempt?.maxScore || null,
        grade: attempt?.grade || null,
        submittedAt: attempt?.submittedAt || null,
        hasAttempt: !!attempt,
        isSubmitted: !!(attempt && attempt.submittedAt),
        hasReport,
        reportId,
      });
    }

    res.json({
      success: true,
      data: {
        distribution,
        exam,
        students: result,
      },
    });
  } catch (error) {
    console.error('Get distribution students error:', error);
    res.status(500).json({ message: '학생 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
