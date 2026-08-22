import express from 'express';
import { db } from '../db/index';
import {
  examAttempts,
  examDistributions,
  exams,
  students,
  studentClasses,
  aiReports,
  distributionStudents,
  users,
  parents,
  studentParents,
} from '../db/schema';
import { eq, and, isNotNull, isNull, inArray } from 'drizzle-orm';
import { requireStudent, requireBranchManager } from '../middleware/auth';
import { calculateGrade, endOfLocalDay, gradeAnswers } from '../utils/helpers';
import { log, errorFields } from '../utils/logger';

const router = express.Router();

// GET /api/my-exams - 학생에게 배포된 시험 목록
router.get('/my-exams', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user!.id;

    // Get student
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // Get ALL distributions for student's branch
    const now = new Date();
    const allDistributions = await db
      .select({
        distribution: examDistributions,
        exam: exams,
      })
      .from(examDistributions)
      .innerJoin(exams, eq(examDistributions.examId, exams.id))
      .where(eq(examDistributions.branchId, student.branchId));

    // 배포마다 개별 조회하면 요청당 쿼리가 배포 수에 비례해 늘어난다(N+1).
    // 필요한 부수 데이터를 배포 목록 기준으로 한 번씩만 가져와 Map 으로 조립한다.
    // 판정 로직과 응답 형태는 기존과 동일하다.
    const distributionIds = allDistributions.map((row) => row.distribution.id);

    // ① 개별 지정 대상: 배포별로 "지정이 존재하는가" 와 "내가 포함되는가" 두 가지가 필요하다.
    const targetRows = distributionIds.length
      ? await db
          .select({
            distributionId: distributionStudents.distributionId,
            studentId: distributionStudents.studentId,
          })
          .from(distributionStudents)
          .where(inArray(distributionStudents.distributionId, distributionIds))
      : [];

    const hasAnyTarget = new Set<string>();
    const targetsMe = new Set<string>();
    for (const t of targetRows) {
      hasAnyTarget.add(t.distributionId);
      if (t.studentId === student.id) targetsMe.add(t.distributionId);
    }

    // ② 내가 속한 반 목록 (반 배포 판정용)
    const myClassRows = await db
      .select({ classId: studentClasses.classId })
      .from(studentClasses)
      .where(eq(studentClasses.studentId, student.id));
    const myClassIds = new Set(myClassRows.map((c) => c.classId));

    // ③ 내 응시 기록 (해당 배포들에 한해)
    const attemptRows = distributionIds.length
      ? await db
          .select()
          .from(examAttempts)
          .where(
            and(
              eq(examAttempts.studentId, student.id),
              inArray(examAttempts.distributionId, distributionIds)
            )
          )
      : [];
    const attemptByDistribution = new Map(attemptRows.map((a) => [a.distributionId, a]));

    // ④ 보고서 존재 여부만 필요하므로 id 만 가져온다(htmlContent 는 수십~수백 KB).
    const attemptIds = attemptRows.map((a) => a.id);
    const reportRows = attemptIds.length
      ? await db
          .select({ attemptId: aiReports.attemptId })
          .from(aiReports)
          .where(inArray(aiReports.attemptId, attemptIds))
      : [];
    const attemptIdsWithReport = new Set(reportRows.map((r) => r.attemptId));

    // Filter distributions that apply to this student
    const result = [];
    for (const row of allDistributions) {
      let applies = false;

      // Check 1: Distribution has no classId (distributed to all students in branch)
      if (!row.distribution.classId) {
        if (!hasAnyTarget.has(row.distribution.id)) {
          // No specific students, so applies to all
          applies = true;
        } else {
          // Check if this student is in the list
          applies = targetsMe.has(row.distribution.id);
        }
      }
      // Check 2: Distribution is for a class - check if student is in that class
      else if (row.distribution.classId) {
        applies = myClassIds.has(row.distribution.classId);
      }

      if (!applies) continue;

      const attempt = attemptByDistribution.get(row.distribution.id);

      // Check if report exists
      const hasReport = attempt ? attemptIdsWithReport.has(attempt.id) : false;

      // Determine status
      let status = 'available';
      if (attempt) {
        if (attempt.submittedAt) {
          status = 'completed';
        } else {
          status = 'in_progress';
        }
      }

      // Check if exam is available (within date range)
      // But don't override 'completed' status for submitted exams
      if (status !== 'completed') {
        // 마감일은 그 날 23:59:59 까지 허용 (UTC 자정으로 저장된 레코드 보정)
        if (now < row.distribution.startDate) {
          status = 'upcoming';
        } else if (now > endOfLocalDay(row.distribution.endDate)) {
          status = 'expired';
        }
      }

      result.push({
        distribution: row.distribution,
        exam: {
          id: row.exam.id,
          title: row.exam.title,
          subject: row.exam.subject,
          totalQuestions: row.exam.totalQuestions,
          totalScore: row.exam.totalScore,
        },
        attempt: attempt
          ? {
              id: attempt.id,
              score: attempt.score,
              grade: attempt.grade,
              correctCount: attempt.correctCount,
              submittedAt: attempt.submittedAt,
            }
          : null,
        status,
        hasReport,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error('attempt.get_my_exams_failed', errorFields(error));
    res.status(500).json({ message: '시험 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/my-exams/:distributionId - 시험 상세 및 문제 조회
router.get('/my-exams/:distributionId', requireStudent, async (req, res) => {
  try {
    const { distributionId } = req.params;
    const userId = req.session.user!.id;

    // Get student
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // Get distribution
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, distributionId))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // Get exam
    const [exam] = await db.select().from(exams).where(eq(exams.id, distribution.examId)).limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // Remove correct answers from questions data (hide from student until submitted)
    const questionsData = (exam.questionsData as any[]).map(q => ({
      number: q.number || q.questionNumber,
      questionNumber: q.number || q.questionNumber,
      difficulty: q.difficulty,
      category: q.category,
      domain: q.domain,
      subcategory: q.subcategory,
      points: q.points,
      typeAnalysis: q.typeAnalysis,
    }));

    // Get attempt
    const [attempt] = await db
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.studentId, student.id), eq(examAttempts.distributionId, distributionId))
      )
      .limit(1);

    res.json({
      success: true,
      data: {
        exam: {
          ...exam,
          questionsData,
        },
        distribution,
        attempt: attempt || null,
      },
    });
  } catch (error) {
    log.error('attempt.get_exam_detail_failed', errorFields(error));
    res.status(500).json({ message: '시험 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/exam-attempts/:id - 시험 응시 상세 조회
router.get('/exam-attempts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!user) {
      return res.status(401).json({ message: '인증이 필요합니다.' });
    }

    // Get attempt
    const [attempt] = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({ message: '시험 응시를 찾을 수 없습니다.' });
    }

    // Get student
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, attempt.studentId))
      .limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // 권한 검사: 기본은 차단이고, 허용되는 역할만 명시적으로 통과시킨다.
    // (기존에는 어느 분기에도 걸리지 않는 역할이 그대로 통과했다)
    if (user.role === 'admin') {
      // 전체 열람 허용
    } else if (user.role === 'student') {
      // Students can only view their own attempts
      const [myStudent] = await db
        .select()
        .from(students)
        .where(eq(students.userId, user.id))
        .limit(1);

      if (!myStudent || myStudent.id !== attempt.studentId) {
        return res.status(403).json({ message: '권한이 없습니다.' });
      }
    } else if (user.role === 'branch') {
      // Branch managers can view attempts from their branch
      if (student.branchId !== user.branchId) {
        return res.status(403).json({ message: '권한이 없습니다.' });
      }
    } else if (user.role === 'parent') {
      // 자기 자녀의 응시만 열람 가능
      const [parent] = await db
        .select()
        .from(parents)
        .where(eq(parents.userId, user.id))
        .limit(1);

      if (!parent) {
        return res.status(403).json({ message: '권한이 없습니다.' });
      }

      const [link] = await db
        .select()
        .from(studentParents)
        .where(
          and(
            eq(studentParents.parentId, parent.id),
            eq(studentParents.studentId, attempt.studentId)
          )
        )
        .limit(1);

      if (!link) {
        return res.status(403).json({ message: '권한이 없습니다.' });
      }
    } else {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    log.error('attempt.get_attempt_failed', errorFields(error));
    res.status(500).json({ message: '시험 응시 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/exam-attempts - 시험 시작
router.post('/exam-attempts', requireStudent, async (req, res) => {
  try {
    const { distributionId } = req.body;
    const userId = req.session.user!.id;

    // Get student
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // Get distribution
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, distributionId))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // 이 학생이 해당 배포의 응시 대상인지 검증 (지점 → 반/개별 지정 순)
    if (distribution.branchId !== student.branchId) {
      return res.status(403).json({ message: '응시 대상이 아닌 시험입니다.' });
    }

    if (distribution.classId) {
      // 반 배포: 해당 반 소속이어야 한다
      const [enrolled] = await db
        .select()
        .from(studentClasses)
        .where(
          and(
            eq(studentClasses.studentId, student.id),
            eq(studentClasses.classId, distribution.classId)
          )
        )
        .limit(1);

      if (!enrolled) {
        return res.status(403).json({ message: '응시 대상이 아닌 시험입니다.' });
      }
    } else {
      // 개별 지정이 있으면 그 목록에 있어야 하고, 없으면 지점 전체 대상이다
      const [anyTarget] = await db
        .select()
        .from(distributionStudents)
        .where(eq(distributionStudents.distributionId, distributionId))
        .limit(1);

      if (anyTarget) {
        const [me] = await db
          .select()
          .from(distributionStudents)
          .where(
            and(
              eq(distributionStudents.distributionId, distributionId),
              eq(distributionStudents.studentId, student.id)
            )
          )
          .limit(1);

        if (!me) {
          return res.status(403).json({ message: '응시 대상이 아닌 시험입니다.' });
        }
      }
    }

    // 응시 기간 검증 (마감일은 그 날 23:59:59 까지 허용)
    const now = new Date();
    if (now < distribution.startDate) {
      return res.status(400).json({ message: '아직 응시 기간이 아닙니다.' });
    }
    if (now > endOfLocalDay(distribution.endDate)) {
      return res.status(400).json({ message: '응시 기간이 종료되었습니다.' });
    }

    // 동시 요청으로 중복 attempt 가 생기지 않도록 UNIQUE(student_id, distribution_id) 에 기댄다.
    // 충돌하면 삽입하지 않고 기존 레코드를 돌려준다(재진입을 실패로 만들지 않는다).
    const [inserted] = await db
      .insert(examAttempts)
      .values({
        examId: distribution.examId,
        studentId: student.id,
        distributionId,
        answers: {},
      })
      .onConflictDoNothing({
        target: [examAttempts.studentId, examAttempts.distributionId],
      })
      .returning();

    if (inserted) {
      return res.status(201).json({
        success: true,
        data: inserted,
      });
    }

    // 이미 존재 → 기존 응시 기록 반환 (200)
    const [existing] = await db
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.studentId, student.id), eq(examAttempts.distributionId, distributionId))
      )
      .limit(1);

    if (!existing) {
      return res.status(500).json({ message: '시험 시작 중 오류가 발생했습니다.' });
    }

    res.status(200).json({
      success: true,
      data: existing,
      message: '이미 시작한 시험입니다.',
    });
  } catch (error) {
    log.error('attempt.create_attempt_failed', errorFields(error));
    res.status(500).json({ message: '시험 시작 중 오류가 발생했습니다.' });
  }
});

// PUT /api/exam-attempts/:id - 답안 임시 저장
router.put('/exam-attempts/:id', requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const userId = req.session.user!.id;

    // 현재 로그인한 학생 정보 조회
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);
    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // 답안이 현재 학생의 것인지 검증
    const [existingAttempt] = await db
      .select()
      .from(examAttempts)
      .where(and(eq(examAttempts.id, id), eq(examAttempts.studentId, student.id)))
      .limit(1);

    if (!existingAttempt) {
      return res.status(403).json({ message: '본인의 답안만 수정할 수 있습니다.' });
    }

    if (existingAttempt.submittedAt) {
      return res.status(400).json({ message: '이미 제출된 시험은 수정할 수 없습니다.' });
    }

    // 위 사전 체크와 이 UPDATE 사이에 제출이 끼어들 수 있으므로(read-then-write 경합)
    // WHERE 에 submitted_at IS NULL 을 걸어 원자적으로 막는다. 사전 체크는 이중 방어로 유지.
    const [attempt] = await db
      .update(examAttempts)
      .set({ answers })
      .where(and(eq(examAttempts.id, id), isNull(examAttempts.submittedAt)))
      .returning();

    if (!attempt) {
      return res.status(400).json({ message: '이미 제출된 시험은 수정할 수 없습니다.' });
    }

    res.json({
      success: true,
      data: attempt,
      message: '답안이 저장되었습니다.',
    });
  } catch (error) {
    log.error('attempt.save_answers_failed', errorFields(error));
    res.status(500).json({ message: '답안 저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/exam-attempts/:id/submit - 시험 제출 및 자동 채점
router.post('/exam-attempts/:id/submit', requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const userId = req.session.user!.id;

    // answers 누락 시 채점 루프에서 500 이 나므로 400 으로 먼저 거른다
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ message: '답안 데이터가 올바르지 않습니다.' });
    }

    // 현재 로그인한 학생 정보 조회
    const [student] = await db.select().from(students).where(eq(students.userId, userId)).limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생 정보를 찾을 수 없습니다.' });
    }

    // Get attempt
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, id)).limit(1);

    if (!attempt) {
      return res.status(404).json({ message: '시험 응시를 찾을 수 없습니다.' });
    }

    // 본인의 답안인지 검증
    if (attempt.studentId !== student.id) {
      return res.status(403).json({ message: '본인의 답안만 제출할 수 있습니다.' });
    }

    if (attempt.submittedAt) {
      return res.status(400).json({ message: '이미 제출된 시험입니다.' });
    }

    // 응시 기간 검증 (마감일 당일 23:59:59까지 허용)
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(eq(examDistributions.id, attempt.distributionId))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    const deadline = endOfLocalDay(distribution.endDate);
    if (new Date() > deadline) {
      return res.status(400).json({ message: '응시 기간이 종료되었습니다.' });
    }

    // Get exam
    const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // Auto-grade (채점 코어는 helpers.gradeAnswers 로 공용화)
    const questionsData = exam.questionsData as any[];
    const { score, correctCount } = gradeAnswers(questionsData, answers);

    const maxScore = exam.totalScore;

    // totalScore 가 0 이하면 백분율이 NaN/Infinity 가 되어 9등급으로 저장된다.
    // 시험 데이터 자체의 문제이므로 채점하지 않고 400 으로 알린다.
    if (!maxScore || maxScore <= 0) {
      return res.status(400).json({
        message: '시험의 총점이 올바르지 않아 채점할 수 없습니다. 관리자에게 문의해주세요.',
      });
    }

    const percentage = (score / maxScore) * 100;
    const grade = calculateGrade(percentage);

    // 제출은 한 번만 성립해야 한다. 더블클릭·재시도로 두 요청이 동시에 오면
    // 사전 체크는 둘 다 통과할 수 있으므로 WHERE 에 submitted_at IS NULL 을 걸어
    // 실제로 행을 잡은 쪽만 채점 결과를 쓴다.
    const now = new Date();
    const [updatedAttempt] = await db
      .update(examAttempts)
      .set({
        answers,
        score,
        maxScore,
        grade,
        correctCount,
        submittedAt: now,
        gradedAt: now,
      })
      .where(and(eq(examAttempts.id, id), isNull(examAttempts.submittedAt)))
      .returning();

    if (!updatedAttempt) {
      return res.status(409).json({ message: '이미 제출 처리된 시험입니다.' });
    }

    res.json({
      success: true,
      data: {
        ...updatedAttempt,
        percentage: Math.round(percentage),
      },
      message: '시험이 제출되었습니다.',
    });
  } catch (error) {
    log.error('attempt.submit_exam_failed', errorFields(error));
    res.status(500).json({ message: '시험 제출 중 오류가 발생했습니다.' });
  }
});

// GET /api/exam-attempts/branch/completed - 지점의 채점 완료된 시험 목록
router.get('/branch/completed', async (req, res) => {
  try {
    const user = req.session.user;

    if (!user || (user.role !== 'branch' && user.role !== 'admin')) {
      return res.status(403).json({ message: '지점 관리자 또는 총괄 관리자만 접근 가능합니다.' });
    }

    const branchId = user.branchId;

    if (!branchId && user.role === 'branch') {
      return res.status(400).json({ message: '지점 정보가 없습니다.' });
    }

    // Get completed attempts for the branch
    const completedAttempts = await db
      .select({
        attempt: examAttempts,
        exam: exams,
        student: students,
        user: users,
      })
      .from(examAttempts)
      .innerJoin(exams, eq(examAttempts.examId, exams.id))
      .innerJoin(students, eq(examAttempts.studentId, students.id))
      .innerJoin(users, eq(students.userId, users.id))
      // admin 은 전체 지점을 본다. branchId 로 무조건 필터하면
      // admin 의 branchId 가 undefined 라 결과가 비어버린다.
      .where(
        user.role === 'admin'
          ? isNotNull(examAttempts.submittedAt)
          : and(eq(students.branchId, branchId!), isNotNull(examAttempts.submittedAt))
      );

    // TODO(N+1): 응시 건마다 aiReports 를 개별 조회한다.
    // attemptId 목록으로 inArray 배치 조회 후 매핑해야 한다. (iteration 3 범위 외)
    const result = [];
    for (const row of completedAttempts) {
      if (!row.attempt.submittedAt) continue;

      // 존재 여부와 id 만 필요하다. select() 로 전체 행을 가져오면
      // htmlContent(수십~수백 KB)가 매 행마다 네트워크로 실려 온다.
      const [report] = await db
        .select({ id: aiReports.id })
        .from(aiReports)
        .where(eq(aiReports.attemptId, row.attempt.id))
        .limit(1);

      result.push({
        attemptId: row.attempt.id,
        studentId: row.student.id,
        studentName: row.user.name,
        examId: row.exam.id,
        examTitle: row.exam.title,
        examSubject: row.exam.subject,
        score: row.attempt.score,
        maxScore: row.attempt.maxScore,
        grade: row.attempt.grade,
        submittedAt: row.attempt.submittedAt,
        hasReport: !!report,
        reportId: report?.id || null,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error('attempt.get_branch_completed_attempts_failed', errorFields(error));
    res.status(500).json({ message: '시험 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/exam-attempts/branch-create - 지점 관리자가 학생 답안 생성 (응시하지 않은 학생용)
router.post('/exam-attempts/branch-create', requireBranchManager, async (req, res) => {
  try {
    const { studentId, distributionId } = req.body;
    const branchId = req.session.user!.branchId!;

    // Verify student belongs to this branch
    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.branchId, branchId)))
      .limit(1);

    if (!student) {
      return res.status(404).json({ message: '학생을 찾을 수 없습니다.' });
    }

    // Get distribution
    const [distribution] = await db
      .select()
      .from(examDistributions)
      .where(and(eq(examDistributions.id, distributionId), eq(examDistributions.branchId, branchId)))
      .limit(1);

    if (!distribution) {
      return res.status(404).json({ message: '배포를 찾을 수 없습니다.' });
    }

    // Check if attempt already exists
    const [existing] = await db
      .select()
      .from(examAttempts)
      .where(and(eq(examAttempts.studentId, studentId), eq(examAttempts.distributionId, distributionId)))
      .limit(1);

    if (existing) {
      return res.status(400).json({ message: '이미 시험 응시 기록이 있습니다.' });
    }

    // Create attempt
    const [attempt] = await db
      .insert(examAttempts)
      .values({
        examId: distribution.examId,
        studentId,
        distributionId,
        answers: {},
      })
      .returning();

    res.status(201).json({
      success: true,
      data: attempt,
      message: '답안이 생성되었습니다.',
    });
  } catch (error) {
    log.error('attempt.branch_create_attempt_failed', errorFields(error));
    res.status(500).json({ message: '답안 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/exam-attempts/:id/branch-grade - 지점 관리자가 답안 입력 및 채점
router.put('/exam-attempts/:id/branch-grade', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    const branchId = req.session.user!.branchId!;

    // Get attempt
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, id)).limit(1);

    if (!attempt) {
      return res.status(404).json({ message: '시험 응시를 찾을 수 없습니다.' });
    }

    // Verify student belongs to this branch
    const [student] = await db
      .select()
      .from(students)
      .where(and(eq(students.id, attempt.studentId), eq(students.branchId, branchId)))
      .limit(1);

    if (!student) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    // Get exam
    const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // 지점 수동 채점은 O/X 방식: 클라이언트가 문항별로 O=1 / X=0 을 보낸다.
    // (정답 번호가 아니므로 correctAnswer 와 비교하지 않는다)
    // O/X 방식으로 채점되었음을 기록 (학생 온라인 제출에는 이 키가 없다)
    const gradedAnswers = { ...answers, _gradingMode: 'ox' };

    const questionsData = exam.questionsData as any[];
    const { score, correctCount } = gradeAnswers(questionsData, gradedAnswers);

    const maxScore = exam.totalScore;
    const percentage = (score / maxScore) * 100;
    const grade = calculateGrade(percentage);

    // Update attempt
    const now = new Date();
    const [updatedAttempt] = await db
      .update(examAttempts)
      .set({
        answers: gradedAnswers,
        score,
        maxScore,
        grade,
        correctCount,
        submittedAt: now,
        gradedAt: now,
      })
      .where(eq(examAttempts.id, id))
      .returning();

    res.json({
      success: true,
      data: {
        ...updatedAttempt,
        percentage: Math.round(percentage),
      },
      message: '답안이 입력되고 채점되었습니다.',
    });
  } catch (error) {
    log.error('attempt.branch_grade_attempt_failed', errorFields(error));
    res.status(500).json({ message: '답안 채점 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/exam-attempts/:id - 답안 삭제
router.delete('/exam-attempts/:id', requireBranchManager, async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = req.session.user!.branchId!;

    // Get attempt
    const [attempt] = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .limit(1);

    if (!attempt) {
      return res.status(404).json({ message: '답안을 찾을 수 없습니다.' });
    }

    // Get student to check branch
    const [studentRecord] = await db
      .select()
      .from(students)
      .where(eq(students.id, attempt.studentId))
      .limit(1);

    if (!studentRecord || studentRecord.branchId !== branchId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    // Delete AI report if exists
    await db
      .delete(aiReports)
      .where(eq(aiReports.attemptId, id));

    // Delete attempt
    await db
      .delete(examAttempts)
      .where(eq(examAttempts.id, id));

    res.json({
      success: true,
      message: '답안이 삭제되었습니다.',
    });
  } catch (error) {
    log.error('attempt.delete_attempt_failed', errorFields(error));
    res.status(500).json({ message: '답안 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
