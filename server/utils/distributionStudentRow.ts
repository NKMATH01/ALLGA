import type { students, users, examAttempts } from '../db/schema';

/**
 * 배포 1건에 속한 학생 1명의 응답 행을 만든다.
 * `/students`(배치)와 `/:id/students`(단건)가 같은 모양을 내야 하므로 한 곳에 모아둔다.
 * 두 곳이 각자 조립하면 필드가 조용히 갈라진다.
 */
export function buildDistributionStudentRow(
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
    score: attempt?.score ?? null,
    maxScore: attempt?.maxScore ?? null,
    grade: attempt?.grade ?? null,
    submittedAt: attempt?.submittedAt || null,
    hasAttempt: !!attempt,
    isSubmitted: !!(attempt && attempt.submittedAt),
    hasReport: !!report,
    reportId: report?.id || null,
  };
}
