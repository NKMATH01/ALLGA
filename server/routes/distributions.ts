import express from 'express';
import { db } from '../db/index';
import { examDistributions, exams, distributionStudents, students, studentClasses, examAttempts, users, aiReports, branches, classes } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAdminOrBranch, requireBranchManager } from '../middleware/auth';
import { parseLocalDateStart, parseLocalDateEnd } from '../utils/helpers';

/**
 * studentIds 가 전부 지정한 지점 소속인지 검증한다.
 * 문제가 있으면 오류 메시지를, 정상이면 null 을 돌려준다.
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

    // 날짜 파싱 (KST 기준 로컬 자정 / 당일 23:59:59) + NaN 거부
    const start = parseLocalDateStart(startDate);
    const end = parseLocalDateEnd(endDate);

    if (!start || !end) {
      return res.status(400).json({ message: '날짜 형식이 올바르지 않습니다. (예: 2026-08-20)' });
    }

    if (start >= end) {
      return res.status(400).json({ message: '시작일은 종료일보다 이전이어야 합니다.' });
    }

    // 시험 존재 검증
    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    const distributions = [];

    if (user.role === 'admin') {
      // Admin can distribute to multiple branches
      if (!branchIds || !Array.isArray(branchIds) || branchIds.length === 0) {
        return res.status(400).json({ message: '지점을 선택해주세요.' });
      }

      // 지점 존재 검증
      const foundBranches = await db
        .select({ id: branches.id })
        .from(branches)
        .where(inArray(branches.id, branchIds));

      if (foundBranches.length !== branchIds.length) {
        return res.status(404).json({ message: '존재하지 않는 지점이 포함되어 있습니다.' });
      }

      for (const branchId of branchIds) {
        const [distribution] = await db
          .insert(examDistributions)
          .values({
            examId,
            branchId,
            classId: classId || null,
            parentDistributionId: null,
            startDate: start,
            endDate: end,
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
          startDate: start,
          endDate: end,
          distributedBy: user.id,
        })
        .returning();

      // If specific students are selected, create student assignments
      if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
        // 지정 학생이 전부 본인 지점 소속인지 검증
        const studentError = await validateStudentsInBranch(studentIds, user.branchId!);
        if (studentError) {
          await db.delete(examDistributions).where(eq(examDistributions.id, distribution.id));
          return res.status(403).json({ message: studentError });
        }

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

    // 배정 대상이 배포 지점 소속인지 검증 (admin 도 배포 지점 기준으로 확인)
    const targetBranchId: string = distribution.branchId;

    if (classId) {
      const [cls] = await db
        .select()
        .from(classes)
        .where(and(eq(classes.id, classId), eq(classes.branchId, targetBranchId)))
        .limit(1);

      if (!cls) {
        return res.status(403).json({ message: '해당 지점의 반이 아닙니다.' });
      }
    }

    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      const studentError = await validateStudentsInBranch(studentIds, targetBranchId);
      if (studentError) {
        return res.status(403).json({ message: studentError });
      }
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
    const user = req.session.user!;

    // 배포 조회
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, id))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // 지점 관리자는 본인 지점의 배포만 삭제 가능
    if (user.role === 'branch' && distribution.branchId !== user.branchId) {
      return res.status(403).json({ message: '본인 지점의 배포만 삭제할 수 있습니다.' });
    }

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

    // TODO(N+1): 학생마다 examAttempts·aiReports 를 개별 조회한다.
    // studentIds 로 한 번에 받아 매핑해야 한다. (iteration 3 범위 외)
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
        // 존재 여부와 id 만 필요하다. 전체 행을 select 하면 htmlContent 가 함께 실려 온다.
        const [report] = await db
          .select({ id: aiReports.id })
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
