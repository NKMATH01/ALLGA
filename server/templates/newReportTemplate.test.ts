import { describe, it, expect } from 'vitest';
import { generateReportHTML } from './newReportTemplate';

/*
  보고서 지면 회귀 방지 (분석서 U-17 / R-1).

  1) 채점 데이터가 없을 때 지면이 '0등급' 같은 없는 수치를 인쇄하면 안 된다.
     DESIGN.md 10.3 — 지면이 지어내는 수치는 없다. 없으면 '기준 축적 중'.
  2) 등급이 있을 때는 그 등급이 그대로 인쇄되어야 한다.
  3) 학생 이름에 스크립트가 들어와도 태그로 살아나면 안 된다(기존 이스케이프 유지).

  db 를 타지 않는 순수 렌더 함수라 vitest 에서 그대로 부른다.
*/

/** 렌더에 필요한 최소 입력. 개별 테스트에서 필요한 부분만 덮어쓴다. */
function baseData(overrides: Record<string, any> = {}) {
  return {
    metaVersion: 'v3',
    studentInfo: { name: '홍길동', school: '올가중', date: '2026-09-04', level: '중3' },
    scoreSummary: {
      grade: null,
      rawScore: null,
      rawScoreMax: 100,
      standardScore: null,
      percentile: null,
    },
    analysis: {
      olgaSummary: '요약',
      subjectDetails: [],
      strengths: [],
      weaknesses: [],
    },
    charts: { predictionChartData: null },
    questionAnalysis: [],
    difficultyStats: [],
    categoryPointsMap: [],
    categoryReference: [],
    difficultyReference: [],
    ...overrides,
  };
}

/**
 * 인쇄되는 지면만 남긴다. 인라인 스크립트에는 `=== undefined` 같은 코드가
 * 정상적으로 들어 있으므로 지면 검사에서 제외해야 한다.
 */
function printedPage(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

/**
 * 종합 판정 카드만 잘라낸다. 카드 바로 뒤의 등급 게이지는 A~R 네 구간을
 * 이름·구간과 함께 늘 그리는 '범례'라서, 판정 문구 검사에서는 빼야 한다.
 */
function verdictCard(html: string) {
  const start = html.indexOf('<div class="verdict ');
  const end = html.indexOf('<div class="ggauge"', start);
  return html.slice(start, end);
}

/** 소견 지면의 판정 머리만 잘라낸다. */
function opinionHead(html: string) {
  const start = html.indexOf('<div class="opinion-head ');
  const end = html.indexOf('<div class="opinion-body"', start);
  return html.slice(start, end);
}

describe('generateReportHTML — 없는 수치를 지면에 만들지 않는다', () => {
  it('등급·표준점수·백분위·예측 곡선이 모두 없으면 0등급/NaN/undefined 를 인쇄하지 않는다', () => {
    const page = printedPage(generateReportHTML(baseData()));

    expect(page).not.toContain('0등급');
    expect(page).not.toContain('NaN');
    expect(page).not.toContain('undefined');
    expect(page).toContain('기준 축적 중');
  });

  it('등급이 없으면 종합 판정도 비운다 (C 보완 필요 를 지어내지 않는다)', () => {
    const page = printedPage(generateReportHTML(baseData()));

    expect(page).toContain('판정 없음');

    const card = verdictCard(page);
    expect(card).not.toContain('보완 필요');
    expect(card).not.toContain('5 ~ 6등급');
    expect(card).toContain('판정 없음');
    expect(card).toContain('등급 기준 축적 중');

    const head = opinionHead(page);
    expect(head).not.toContain('보완 필요');
    expect(head).toContain('<span class="opinion-code">-</span>');
  });

  it('등급이 있으면 그 등급을 그대로 인쇄한다', () => {
    const html = generateReportHTML(
      baseData({
        scoreSummary: {
          grade: 3,
          rawScore: 78,
          rawScoreMax: 100,
          standardScore: null,
          percentile: 62,
        },
      })
    );

    expect(html).toContain('3등급');
    expect(html).not.toContain('0등급');

    const card = verdictCard(printedPage(html));
    expect(card).toContain('양호');
    expect(card).toContain('판정 기준 3 ~ 4등급');
    expect(card).not.toContain('판정 없음');
  });

  it('학생 이름에 스크립트가 들어와도 태그로 살아나지 않는다', () => {
    const html = generateReportHTML(
      baseData({
        studentInfo: {
          name: '</script><img src=x onerror=1>',
          school: '올가중',
          date: '2026-09-04',
          level: '중3',
        },
      })
    );

    expect(html.includes('<img src=x')).toBe(false);
    expect(html.includes('</script><img')).toBe(false);
  });
});
