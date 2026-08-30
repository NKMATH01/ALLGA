import express from 'express';
import { db } from '../db/index';
import { examDistributions, exams, distributionStudents, students, studentClasses, examAttempts, users, aiReports, branches, classes } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAdminOrBranch, requireBranchManager } from '../middleware/auth';
import { parseLocalDateStart, parseLocalDateEnd } from '../utils/helpers';
import { log, errorFields } from '../utils/logger';

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

/**
 * 배포 1건에 속한 학생 1명의 응답 행을 만든다.
 * `/students`(배치)와 `/:id/students`(단건)가 같은 모양을 내야 하므로 한 곳에 모아둔다.
 * 두 곳이 각자 조립하면 필드가 조용히 갈라진다.
 */
function buildDistributionStudentRow(
  row: { student: typeof students.$inferSelect; user: typeof users.$inferSelect },
  attempt: typeof examAttempts.$inferSelect | undefined,
  reportByAttemptId: Map<string, { id: string }>
) {
  // 보고서는 제출된 응시에 대해서만 조회했었다. 그 조건을 그대로 유지한다.
  const report = attempt && attempt.submittedAt ? reportByAttemptId.get(attempt.id) : undefined;

  return {
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
    hasReport: !!report,
    reportId: report?.id || null,
  };
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
    // 행마다 개별 조회하면 목록 길이만큼 왕복이 생기므로 id 중복 제거 후 한 번에 조회한다.
    const parentIds = Array.from(
      new Set(
        distributionList
          .map((row) => row.distribution.parentDistributionId)
          .filter((id): id is string => !!id)
      )
    );
    const parentRows = parentIds.length
      ? await db.select().from(examDistributions).where(inArray(examDistributions.id, parentIds))
      : [];
    const parentById = new Map(parentRows.map((parent) => [parent.id, parent]));

    const result = distributionList.map((row) => {
      const parentDistributionId = row.distribution.parentDistributionId;
      // 상위 배포가 없거나 참조가 끊겼으면 기존과 동일하게 null.
      const parentDistribution = parentDistributionId
        ? parentById.get(parentDistributionId) ?? null
        : null;

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
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error('distribution.get_distributions_failed', errorFields(error));
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
    log.error('distribution.create_distribution_failed', errorFields(error));
    res.status(500).json({ message: '시험 배포 중 오류가 발생했습니다.' });
  }
});

// GET /api/distributions/students - 지점의 모든 배포에 대한 학생 목록·응시 상태를 한 번에 조회
//
// ⚠ 등록 순서 주의: 이 라우트는 반드시 아래 router.get('/:id', ...) 보다 위에 있어야 한다.
//    아래로 옮기면 '/students' 요청이 :id === 'students' 로 잡혀 404 로 조용히 깨진다.
//    (정렬·리팩터링 중에 순서를 바꾸지 말 것)
//
// 대시보드가 배포마다 /:id/students 를 부르면 배포 수만큼 요청이 나간다. 요청을 1건으로 줄인다.
router.get('/students', requireBranchManager, async (req, res) => {
  try {
    const branchId = req.session.user!.branchId!;

    // ① 지점의 배포 전체 + 시험 (1회). 정렬은 GET / 과 같게 createdAt 오름차순.
    //    exams 참조가 끊긴 배포를 감지해 로그로 남겨야 하므로 leftJoin 으로 읽고 조립 단계에서 거른다.
    const distributionRows = await db
      .select({
        distribution: examDistributions,
        exam: exams,
      })
      .from(examDistributions)
      .leftJoin(exams, eq(examDistributions.examId, exams.id))
      .where(eq(examDistributions.branchId, branchId))
      .orderBy(examDistributions.createdAt);

    type DistributionWithExam = {
      distribution: typeof examDistributions.$inferSelect;
      exam: typeof exams.$inferSelect;
    };

    const validRows: DistributionWithExam[] = [];
    for (const row of distributionRows) {
      if (!row.exam) {
        // 참조가 끊긴 배포 1건 때문에 지점 전체 조회를 500 으로 실패시키지 않는다.
        log.error('distribution.batch_students_exam_missing', {
          distributionId: row.distribution.id,
          examId: row.distribution.examId,
        });
        continue;
      }
      validRows.push({ distribution: row.distribution, exam: row.exam });
    }

    const distributionIds = validRows.map((row) => row.distribution.id);

    // ② 반 배포들의 반 구성원 (1회)
    const classIds = Array.from(
      new Set(
        validRows
          .map((row) => row.distribution.classId)
          .filter((classId): classId is string => !!classId)
      )
    );
    const classMemberRows = classIds.length
      ? await db
          .select({ classId: studentClasses.classId, studentId: studentClasses.studentId })
          .from(studentClasses)
          .where(inArray(studentClasses.classId, classIds))
      : [];
    const studentIdsByClassId = new Map<string, string[]>();
    for (const row of classMemberRows) {
      const list = studentIdsByClassId.get(row.classId);
      if (list) list.push(row.studentId);
      else studentIdsByClassId.set(row.classId, [row.studentId]);
    }

    // ③ 학생 지정 배포들의 지정 대상 (1회)
    const assignedRows = distributionIds.length
      ? await db
          .select({
            distributionId: distributionStudents.distributionId,
            studentId: distributionStudents.studentId,
          })
          .from(distributionStudents)
          .where(inArray(distributionStudents.distributionId, distributionIds))
      : [];
    const studentIdsByDistributionId = new Map<string, string[]>();
    for (const row of assignedRows) {
      const list = studentIdsByDistributionId.get(row.distributionId);
      if (list) list.push(row.studentId);
      else studentIdsByDistributionId.set(row.distributionId, [row.studentId]);
    }

    // ④ 지점 학생 전체 (1회). 다른 지점 학생은 여기서부터 들어오지 않는다.
    const branchStudents = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.branchId, branchId));
    const branchStudentById = new Map(branchStudents.map((row) => [row.student.id, row]));

    // ⑤ 응시 (1회).
    //    키는 반드시 (distributionId, studentId) 복합이다. studentId 만으로 잡으면
    //    제목·기간이 같은 다른 배포의 응시가 섞여 들어온다.
    const attemptKey = (distributionId: string, studentId: string) => `${distributionId}:${studentId}`;
    const attemptRows = distributionIds.length
      ? await db
          .select()
          .from(examAttempts)
          .where(inArray(examAttempts.distributionId, distributionIds))
      : [];
    const attemptByKey = new Map<string, (typeof attemptRows)[number]>();
    for (const attempt of attemptRows) {
      const key = attemptKey(attempt.distributionId, attempt.studentId);
      // 단건 조회의 .limit(1) 과 같게 먼저 들어온 것을 유지한다.
      if (!attemptByKey.has(key)) attemptByKey.set(key, attempt);
    }

    // ⑥ 보고서 (1회). 존재 여부와 id 만 필요하다(htmlContent 는 수십~수백 KB).
    const submittedAttemptIds = Array.from(attemptByKey.values())
      .filter((attempt) => attempt.submittedAt)
      .map((attempt) => attempt.id);
    const reportRows = submittedAttemptIds.length
      ? await db
          .select({ id: aiReports.id, attemptId: aiReports.attemptId })
          .from(aiReports)
          .where(inArray(aiReports.attemptId, submittedAttemptIds))
      : [];
    const reportByAttemptId = new Map<string, { id: string }>();
    for (const report of reportRows) {
      if (!reportByAttemptId.has(report.attemptId)) reportByAttemptId.set(report.attemptId, report);
    }

    // 조립. 배포별 대상 학생 결정 규칙은 /:id/students 와 동일하다.
    const data = validRows.map(({ distribution, exam }) => {
      let studentsList: (typeof branchStudents)[number][];

      if (distribution.classId) {
        // 반 배포 → 그 반에 속한 지점 학생
        studentsList = (studentIdsByClassId.get(distribution.classId) ?? [])
          .map((studentId) => branchStudentById.get(studentId))
          .filter((row): row is (typeof branchStudents)[number] => !!row);
      } else {
        const assigned = studentIdsByDistributionId.get(distribution.id) ?? [];
        if (assigned.length > 0) {
          // 학생 지정 배포 → 지정된 학생 중 지점 소속인 것만
          // (단건 조회의 inArray 는 중복 id 를 한 행으로 접으므로 여기서도 중복을 제거한다)
          studentsList = Array.from(new Set(assigned))
            .map((studentId) => branchStudentById.get(studentId))
            .filter((row): row is (typeof branchStudents)[number] => !!row);
        } else {
          // 그 외 → 지점 학생 전체
          studentsList = branchStudents;
        }
      }

      return {
        distribution,
        exam,
        students: studentsList.map((row) =>
          buildDistributionStudentRow(
            row,
            attemptByKey.get(attemptKey(distribution.id, row.student.id)),
            reportByAttemptId
          )
        ),
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    log.error('distribution.get_branch_distribution_students_failed', errorFields(error));
    res.status(500).json({ message: '학생 목록 조회 중 오류가 발생했습니다.' });
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
    log.error('distribution.get_distribution_failed', errorFields(error));
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
    log.error('distribution.update_distribution_failed', errorFields(error));
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
    log.error('distribution.delete_distribution_failed', errorFields(error));
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

    // 학생마다 examAttempts·aiReports 를 개별 조회하면 학생 N명에 최대 2N 회 왕복이 생긴다.
    // studentId 목록으로 두 테이블을 한 번씩만 읽고 메모리에서 매핑한다.
    const studentIds = studentsList.map((row) => row.student.id);
    const attemptRows = studentIds.length
      ? await db
          .select()
          .from(examAttempts)
          .where(
            and(
              inArray(examAttempts.studentId, studentIds),
              eq(examAttempts.distributionId, id)
            )
          )
      : [];

    // 기존 .limit(1) 은 "여러 건이면 아무거나 하나" 였으므로 먼저 들어온 것을 유지한다.
    const attemptByStudentId = new Map<string, (typeof attemptRows)[number]>();
    for (const attempt of attemptRows) {
      if (!attemptByStudentId.has(attempt.studentId)) {
        attemptByStudentId.set(attempt.studentId, attempt);
      }
    }

    // 존재 여부와 id 만 필요하다. 전체 행을 select 하면 htmlContent 가 함께 실려 온다.
    const submittedAttemptIds = Array.from(attemptByStudentId.values())
      .filter((attempt) => attempt.submittedAt)
      .map((attempt) => attempt.id);
    const reportRows = submittedAttemptIds.length
      ? await db
          .select({ id: aiReports.id, attemptId: aiReports.attemptId })
          .from(aiReports)
          .where(inArray(aiReports.attemptId, submittedAttemptIds))
      : [];
    const reportByAttemptId = new Map<string, { id: string }>();
    for (const report of reportRows) {
      if (!reportByAttemptId.has(report.attemptId)) {
        reportByAttemptId.set(report.attemptId, report);
      }
    }

    const result = studentsList.map((row) =>
      buildDistributionStudentRow(row, attemptByStudentId.get(row.student.id), reportByAttemptId)
    );

    res.json({
      success: true,
      data: {
        distribution,
        exam,
        students: result,
      },
    });
  } catch (error) {
    log.error('distribution.get_distribution_students_failed', errorFields(error));
    res.status(500).json({ message: '학생 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
