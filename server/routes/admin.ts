import express from 'express';
import { db } from '../db/index';
import { students, branches, exams, examAttempts } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '../middleware/auth';
import { log, errorFields } from '../utils/logger';

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

    // 지점별 집계를 지점 수만큼 반복 조회하면 N+1(지점당 3쿼리)이 된다.
    // GROUP BY 한 번씩으로 모아 받고 메모리에서 매핑한다.
    const studentCountRows = await db
      .select({
        branchId: students.branchId,
        count: sql<number>`count(*)`,
      })
      .from(students)
      .where(grade && grade !== 'all' ? eq(students.grade, grade as string) : undefined)
      .groupBy(students.branchId);

    const attemptAggRows = await db
      .select({
        branchId: students.branchId,
        attemptCount: sql<number>`count(*)`,
        avgScore: sql<number>`avg(${examAttempts.score}) filter (where ${examAttempts.submittedAt} is not null)`,
      })
      .from(examAttempts)
      .innerJoin(students, eq(examAttempts.studentId, students.id))
      .groupBy(students.branchId);

    const studentCountByBranch = new Map(
      studentCountRows.map((r) => [r.branchId, Number(r.count) || 0])
    );
    const attemptAggByBranch = new Map(
      attemptAggRows.map((r) => [
        r.branchId,
        { count: Number(r.attemptCount) || 0, avg: r.avgScore === null ? 0 : Number(r.avgScore) },
      ])
    );

    const branchStats = branchList.map((branch) => {
      const agg = attemptAggByBranch.get(branch.id);
      return {
        branchName: branch.name,
        studentCount: studentCountByBranch.get(branch.id) || 0,
        examCount: agg?.count || 0,
        averageScore: agg?.avg ? Math.round(agg.avg) : 0,
      };
    });

    // Grade distribution (1-9) — 9번 조회 대신 GROUP BY 한 번
    const gradeRows = await db
      .select({
        grade: examAttempts.grade,
        count: sql<number>`count(*)`,
      })
      .from(examAttempts)
      .where(sql`${examAttempts.submittedAt} IS NOT NULL`)
      .groupBy(examAttempts.grade);

    const countByGrade = new Map(gradeRows.map((r) => [Number(r.grade), Number(r.count) || 0]));
    const gradeDistribution = Array.from({ length: 9 }, (_, i) => ({
      grade: i + 1,
      count: countByGrade.get(i + 1) || 0,
    }));

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
    log.error('admin.get_admin_stats_failed', errorFields(error));
    res.status(500).json({ message: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/recent-activity 는 2026-09-07 제거.
// 대체: 없음 (부르는 화면이 없었다).

export default router;
