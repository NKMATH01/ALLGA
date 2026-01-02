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
} from '../db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { requireStudent, requireBranchManager } from '../middleware/auth';
import { calculateGrade } from '../utils/helpers';

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

    // Filter distributions that apply to this student
    const result = [];
    for (const row of allDistributions) {
      let applies = false;

      // Check 1: Distribution has no classId (distributed to all students in branch)
      if (!row.distribution.classId) {
        // Check if there are specific students selected
        const [studentDist] = await db
          .select()
          .from(distributionStudents)
          .where(eq(distributionStudents.distributionId, row.distribution.id))
          .limit(1);

        if (!studentDist) {
          // No specific students, so applies to all
          applies = true;
        } else {
          // Check if this student is in the list
          const [myDist] = await db
            .select()
            .from(distributionStudents)
            .where(
              and(
                eq(distributionStudents.distributionId, row.distribution.id),
                eq(distributionStudents.studentId, student.id)
              )
            )
            .limit(1);
          applies = !!myDist;
        }
      }
      // Check 2: Distribution is for a class - check if student is in that class
      else if (row.distribution.classId) {
        const [studentClass] = await db
          .select()
          .from(studentClasses)
          .where(
            and(
              eq(studentClasses.studentId, student.id),
              eq(studentClasses.classId, row.distribution.classId)
            )
          )
          .limit(1);
        applies = !!studentClass;
      }

      if (!applies) continue;

      // Get attempt
      const [attempt] = await db
        .select()
        .from(examAttempts)
        .where(
          and(
            eq(examAttempts.studentId, student.id),
            eq(examAttempts.distributionId, row.distribution.id)
          )
        )
        .limit(1);

      // Check if report exists
      let hasReport = false;
      if (attempt) {
        const [report] = await db
          .select()
          .from(aiReports)
          .where(eq(aiReports.attemptId, attempt.id))
          .limit(1);
        hasReport = !!report;
      }

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
        if (now < row.distribution.startDate) {
          status = 'upcoming';
        } else if (now > row.distribution.endDate) {
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
    console.error('Get my exams error:', error);
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
    console.error('Get exam detail error:', error);
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

    // Check permissions
    if (user.role === 'student') {
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
    }
    // Admin can view all

    res.json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    console.error('Get attempt error:', error);
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

    // Check if already attempted
    const [existing] = await db
      .select()
      .from(examAttempts)
      .where(
        and(eq(examAttempts.studentId, student.id), eq(examAttempts.distributionId, distributionId))
      )
      .limit(1);

    if (existing) {
      return res.status(400).json({ message: '이미 시험을 시작했습니다.' });
    }

    // Create attempt
    const [attempt] = await db
      .insert(examAttempts)
      .values({
        examId: distribution.examId,
        studentId: student.id,
        distributionId,
        answers: {},
      })
      .returning();

    res.status(201).json({
      success: true,
      data: attempt,
    });
  } catch (error) {
    console.error('Create attempt error:', error);
    res.status(500).json({ message: '시험 시작 중 오류가 발생했습니다.' });
  }
});

// PUT /api/exam-attempts/:id - 답안 임시 저장
router.put('/exam-attempts/:id', requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    const [attempt] = await db
      .update(examAttempts)
      .set({ answers })
      .where(eq(examAttempts.id, id))
      .returning();

    if (!attempt) {
      return res.status(404).json({ message: '시험 응시를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: attempt,
      message: '답안이 저장되었습니다.',
    });
  } catch (error) {
    console.error('Save answers error:', error);
    res.status(500).json({ message: '답안 저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/exam-attempts/:id/submit - 시험 제출 및 자동 채점
router.post('/exam-attempts/:id/submit', requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    // Get attempt
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, id)).limit(1);

    if (!attempt) {
      return res.status(404).json({ message: '시험 응시를 찾을 수 없습니다.' });
    }

    if (attempt.submittedAt) {
      return res.status(400).json({ message: '이미 제출된 시험입니다.' });
    }

    // Get exam
    const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);

    if (!exam) {
      return res.status(404).json({ message: '시험을 찾을 수 없습니다.' });
    }

    // Auto-grade
    let score = 0;
    let correctCount = 0;
    const questionsData = exam.questionsData as any[];

    for (const question of questionsData) {
      const questionNum = question.number || question.questionNumber;
      const studentAnswer = answers[questionNum];
      // studentAnswer가 1이면 정답으로 처리
      if (studentAnswer === 1) {
        score += question.points || question.score || 0;
        correctCount++;
      }
    }

    const maxScore = exam.totalScore;
    const percentage = (score / maxScore) * 100;
    const grade = calculateGrade(percentage);

    // Update attempt
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
      .where(eq(examAttempts.id, id))
      .returning();

    res.json({
      success: true,
      data: {
        ...updatedAttempt,
        percentage: Math.round(percentage),
      },
      message: '시험이 제출되었습니다.',
    });
  } catch (error) {
    console.error('Submit exam error:', error);
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
      .where(
        and(
          eq(students.branchId, branchId!),
          isNotNull(examAttempts.submittedAt)
        )
      );

    // Check if AI report exists for each attempt
    const result = [];
    for (const row of completedAttempts) {
      if (!row.attempt.submittedAt) continue;

      const [report] = await db
        .select()
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
    console.error('Get branch completed attempts error:', error);
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
    console.error('Branch create attempt error:', error);
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

    // Auto-grade
    let score = 0;
    let correctCount = 0;
    const questionsData = exam.questionsData as any[];

    for (const question of questionsData) {
      const questionNum = question.number || question.questionNumber;
      const studentAnswer = answers[questionNum];
      // studentAnswer가 1이면 정답으로 처리
      if (studentAnswer === 1) {
        score += question.points || question.score || 0;
        correctCount++;
      }
    }

    const maxScore = exam.totalScore;
    const percentage = (score / maxScore) * 100;
    const grade = calculateGrade(percentage);

    // Update attempt
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
    console.error('Branch grade attempt error:', error);
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
    console.error('Delete attempt error:', error);
    res.status(500).json({ message: '답안 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
