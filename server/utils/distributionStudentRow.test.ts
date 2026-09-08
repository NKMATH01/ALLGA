import { describe, expect, it } from 'vitest';
import { buildDistributionStudentRow } from './distributionStudentRow';

type StudentRow = Parameters<typeof buildDistributionStudentRow>[0];
type Attempt = NonNullable<Parameters<typeof buildDistributionStudentRow>[1]>;

const row = {
  student: { id: 'student-1' },
  user: { name: '학생', phone: null },
} as StudentRow;

const submittedAt = new Date('2026-09-08T00:00:00Z');
const submitted = {
  id: 'attempt-1', answers: { '1': 2 }, score: 0, maxScore: 100,
  grade: 9, submittedAt,
} as Attempt;

describe('buildDistributionStudentRow response contract', () => {
  it('preserves a submitted zero score, submission state, and report', () => {
    expect(buildDistributionStudentRow(row, submitted, new Map([
      ['attempt-1', { id: 'report-1' }],
    ]))).toEqual({
      studentId: 'student-1', studentName: '학생', studentPhone: null,
      attemptId: 'attempt-1', answers: { '1': 2 }, score: 0, maxScore: 100,
      grade: 9, submittedAt, hasAttempt: true, isSubmitted: true,
      hasReport: true, reportId: 'report-1',
    });
  });

  it('keeps missing attempts and their scores null', () => {
    expect(buildDistributionStudentRow(row, undefined, new Map())).toMatchObject({
      attemptId: null, answers: null, score: null, maxScore: null, grade: null,
      submittedAt: null, hasAttempt: false, isSubmitted: false,
      hasReport: false, reportId: null,
    });
  });

  it('keeps an unsubmitted ungraded attempt null and hides its report', () => {
    const attempt = { ...submitted, score: null, maxScore: null, grade: null, submittedAt: null };
    expect(buildDistributionStudentRow(row, attempt, new Map([
      ['attempt-1', { id: 'report-1' }],
    ]))).toMatchObject({
      score: null, maxScore: null, grade: null, submittedAt: null,
      hasAttempt: true, isSubmitted: false, hasReport: false, reportId: null,
    });
  });

  it('preserves a zero maximum score and a nullable grade', () => {
    expect(buildDistributionStudentRow(row, { ...submitted, maxScore: 0, grade: null }, new Map()))
      .toMatchObject({ score: 0, maxScore: 0, grade: null });
  });
});
