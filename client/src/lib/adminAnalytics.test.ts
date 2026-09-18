import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminAnalytics } from '../components/AdminAnalytics';
const render = (props: React.ComponentProps<typeof AdminAnalytics>) => renderToStaticMarkup(React.createElement(AdminAnalytics, props));
describe('관리자 분석 화면', () => {
  it('기록이 없으면 가짜 차트 대신 빈 상태를 표시한다', () => {
    expect(render({ branches: [], grades: [], loading: false, error: false, onRetry: () => {} })).toContain('표시할 등급 기록이 없습니다');
  });
  it('지점 학생 수와 등급별 응시 건수를 실제 데이터로 표시한다', () => {
    const html = render({ branches: [{ branchName: '예시 지점', studentCount: 11, examCount: 3 }], grades: [{ grade: 4, count: 2 }], loading: false, error: false, onRetry: () => {} });
    expect(html).toContain('예시 지점'); expect(html).toContain('11'); expect(html).toContain('4등급'); expect(html).toContain('2건');
  });
  it('조회 실패 시 이전 차트를 정상 결과처럼 표시하지 않는다', () => {
    const html = render({ branches: [{ branchName: '이전 지점', studentCount: 11, examCount: 3 }], grades: [], loading: false, error: true, onRetry: () => {} });
    expect(html).toContain('다시 시도'); expect(html).not.toContain('이전 지점');
  });
});
