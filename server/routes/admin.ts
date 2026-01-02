import express from 'express';
import { db } from '../db/index';
import { students, branches, exams, examAttempts } from '../db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth';

const router = express.Router();

// GET /api/admin/stats - 전체 통계 조회
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { grade } = req.query;

    // Total students
    let studentQuery: any = db.select({ count: sql<number>`count(*)` }).from(students);
    if (grade && grade !== 'all') {
      studentQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.grade, grade as string));
    }
    const [studentCount] = await studentQuery;

    // Total branches
    const [branchCount] = await db.select({ count: sql<number>`count(*)` }).from(branches);

    // Total exams
    const [examCount] = await db.select({ count: sql<number>`count(*)` }).from(exams);

    // Average score
    const [avgScore] = await db
      .select({
        avg: sql<number>`avg(${examAttempts.score})`,
      })
      .from(examAttempts)
      .where(sql`${examAttempts.submittedAt} IS NOT NULL`);

    // Branch stats
    const branchList = await db.select().from(branches);

    const branchStats = [];
    for (const branch of branchList) {
      // Count students in branch
      let branchStudentQuery: any = db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.branchId, branch.id));

      if (grade && grade !== 'all') {
        branchStudentQuery = db
          .select({ count: sql<number>`count(*)` })
          .from(students)
          .where(and(eq(students.branchId, branch.id), eq(students.grade, grade as string)));
      }

      const [branchStudentCount] = await branchStudentQuery;

      // Count exam attempts
      const [branchExamCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(examAttempts)
        .innerJoin(students, eq(examAttempts.studentId, students.id))
        .where(eq(students.branchId, branch.id));

      // Average score for branch
      const [branchAvgScore] = await db
        .select({
          avg: sql<number>`avg(${examAttempts.score})`,
        })
        .from(examAttempts)
        .innerJoin(students, eq(examAttempts.studentId, students.id))
        .where(
          and(eq(students.branchId, branch.id), sql`${examAttempts.submittedAt} IS NOT NULL`)
        );

      branchStats.push({
        branchName: branch.name,
        studentCount: branchStudentCount.count || 0,
        examCount: branchExamCount.count || 0,
        averageScore: branchAvgScore.avg ? Math.round(branchAvgScore.avg) : 0,
      });
    }

    // Grade distribution (1-9)
    const gradeDistribution = [];
    for (let g = 1; g <= 9; g++) {
      const [count] = await db
        .select({ count: sql<number>`count(*)` })
        .from(examAttempts)
        .where(and(eq(examAttempts.grade, g), sql`${examAttempts.submittedAt} IS NOT NULL`));

      gradeDistribution.push({
        grade: g,
        count: count.count || 0,
      });
    }

    res.json({
      success: true,
      data: {
        totalStudents: studentCount.count || 0,
        totalBranches: branchCount.count || 0,
        totalExams: examCount.count || 0,
        averageScore: avgScore.avg ? Math.round(avgScore.avg) : 0,
        branchStats,
        gradeDistribution,
      },
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ message: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/recent-activity - 최근 활동 조회
router.get('/recent-activity', requireAdmin, async (_req, res) => {
  try {
    // Get recent exams
    const recentExams = await db
      .select({
        id: exams.id,
        title: exams.title,
        subject: exams.subject,
        createdAt: exams.createdAt,
      })
      .from(exams)
      .orderBy(sql`${exams.createdAt} DESC`)
      .limit(5);

    res.json({
      success: true,
      data: {
        recentExams,
      },
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ message: '최근 활동 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
