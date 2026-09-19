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
  it('0명 지점은 차트에서 제외하고 표시 개수를 밝힌다', () => {
    const html = render({ branches: [{ branchName: '운영 지점', studentCount: 11, examCount: 3 }, { branchName: '빈 지점', studentCount: 0, examCount: 0 }], grades: [], loading: false, error: false, onRetry: () => {} });
    expect(html).toContain('운영 지점'); expect(html).not.toContain('빈 지점');
    expect(html).toContain('표시 1개 / 전체 2개 지점(0은 제외)');
  });
  it('모든 지점이 0이면 지점 수를 밝힌 빈 상태만 보여준다', () => {
    const html = render({ branches: [{ branchName: '첫 지점', studentCount: 0, examCount: 0 }, { branchName: '둘째 지점', studentCount: 0, examCount: 0 }], grades: [], loading: false, error: false, onRetry: () => {} });
    expect(html).toContain('지점 2개 모두 아직 기록이 없습니다');
    expect(html).not.toContain('등록된 지점이 없습니다'); expect(html).not.toContain('표시 0개');
  });
  it('조회 실패 시 이전 차트를 정상 결과처럼 표시하지 않는다', () => {
    const html = render({ branches: [{ branchName: '이전 지점', studentCount: 11, examCount: 3 }], grades: [], loading: false, error: true, onRetry: () => {} });
    expect(html).toContain('다시 시도'); expect(html).not.toContain('이전 지점');
  });
});
