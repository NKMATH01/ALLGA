import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GroupResults } from '../components/branch/GroupResults';

type Props = ComponentProps<typeof GroupResults>;
const props: Props = {
  title: '합성 테스트반', mode: 'class',
  students: [
    { id: 'zero', user: { name: '합성영점학생' } },
    { id: 'pending', user: { name: '합성미응시학생' } },
    { id: 'outside', user: { name: '합성비대상학생' } },
  ],
  distributions: [
    { distribution: { id: 'distribution-a' }, exam: { title: '합성 시험 A' }, students: [
      { studentId: 'zero', score: 0, maxScore: 100, grade: 9, hasAttempt: true, isSubmitted: true, hasReport: true },
      { studentId: 'pending', score: null, hasAttempt: false, isSubmitted: false },
    ] },
    { distribution: { id: 'distribution-b' }, exam: { title: '합성 시험 B' }, students: [
      { studentId: 'zero', score: 87, maxScore: 90, grade: 2, hasAttempt: true, isSubmitted: true, hasReport: false },
      { studentId: 'outside', score: 73, maxScore: 90, grade: 3, hasAttempt: true, isSubmitted: true },
    ] },
  ],
  distributionId: 'distribution-a', loading: false, error: false,
  onDistribution: () => {}, onStudent: () => {}, onRetry: () => {},
};
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(GroupResults, { ...props, ...overrides }));
const studentRow = (html: string, name: string) => html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.find((row) => row.includes(name)) || '';

describe('GroupResults synthetic roster rendering', () => {
  it('renders submitted zero as a numeric score with grade and report state', () => {
    const row = studentRow(render(), '합성영점학생');
    expect(row).toContain('0 / 100');
    expect(row).toContain('9등급');
    expect(row).toContain('제출 완료');
    expect(row).toContain('보고서 완료');
  });

  it('distinguishes unattempted and outside-distribution students without borrowing scores', () => {
    const html = render();
    const pending = studentRow(html, '합성미응시학생');
    const outside = studentRow(html, '합성비대상학생');
    expect(pending).toContain('미응시');
    expect(pending).not.toContain('제출 완료');
    expect(outside).toContain('배포 대상 아님');
    expect(outside).not.toContain('73');
    expect(outside).not.toContain('3등급');
  });

  it('uses only the selected distribution when the same student has two results', () => {
    const first = studentRow(render(), '합성영점학생');
    const second = studentRow(render({ distributionId: 'distribution-b' }), '합성영점학생');
    expect(first).not.toContain('87 / 90');
    expect(second).toContain('87 / 90');
    expect(second).toContain('2등급');
    expect(second).toContain('미생성');
    expect(second).not.toContain('0 / 100');
    expect(second).not.toContain('보고서 완료');
  });

  it('shows the empty roster explanation instead of an empty score table', () => {
    const html = render({ students: [] });
    expect(html).toContain('현재 소속 학생이 없습니다.');
    expect(html).not.toContain('<table');
  });

  it('shows loading status and withholds potentially stale scores', () => {
    const html = render({ loading: true });
    expect(html).toContain('role="status"');
    expect(html).toContain('불러오는 중');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('0 / 100');
  });

  it('shows an error and recovery button instead of displaying cached scores as current', () => {
    const html = render({ error: true });
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*>다시 시도<\/button>/);
    expect(html).not.toContain('<table');
  });

  it('requires a valid distribution selection before displaying any student scores', () => {
    for (const distributionId of [null, 'removed-distribution']) {
      const html = render({ distributionId });
      expect(html).toContain('시험을 선택하면');
      expect(html).not.toContain('<table');
    }
  });
});
