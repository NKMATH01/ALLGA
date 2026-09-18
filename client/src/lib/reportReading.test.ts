import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportReadingView } from '../components/ReportReadingView';
import type { ReportSummary } from './reportClient';
const report: ReportSummary = {
  reportId: 'sample', attemptId: 'sample', generatedAt: '2026-09-08',
  verdict: { grade: 9, rawScore: 0, rawScoreMax: 100, percentile: 0, studentName: '예시 학생', examDate: '2026-09-08', overallReference: null },
  abnormal: [], keyFinding: null, recommendations: [],
};
const render = (data: ReportSummary) => renderToStaticMarkup(React.createElement(ReportReadingView, { summary: data }));
describe('웹 보고서 읽기', () => {
  it('0점과 백분위 0을 결측값과 구분한다', () => {
    const html = render(report);
    expect(html).toContain('0</strong>');
    expect(html).toContain('9등급');
    expect(html).toContain('백분위');
  });
  it('참고치 이탈이 없을 때 강점이나 약점을 지어내지 않는다', () => {
    expect(render(report)).toContain('참고 범위를 벗어난 항목이 없습니다');
    expect(render(report)).toContain('등록된 학습 제안이 없습니다');
  });
  it('보완 영역과 강점을 구분하고 원문을 안전한 텍스트로 렌더한다', () => {
    const html = render({ ...report, keyFinding: '<script>alert(1)</script>', abnormal: [
      { name: '독서', kind: 'category', studentRate: 25, low: 40, high: 80, direction: 'below' },
      { name: '문학', kind: 'category', studentRate: 95, low: 40, high: 80, direction: 'above' },
    ] });
    expect(html).toContain('보완할 영역'); expect(html).toContain('강점으로 나타난 영역');
    expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
  });
});
