import { describe, it, expect } from 'vitest';
import { calculateGrade, parseLocalDateStart, parseLocalDateEnd, endOfLocalDay } from './helpers';

/*
  등급 컷과 날짜 해석은 성적에 직접 영향을 준다.
  경계에서 한 칸 밀리면 학생 등급이 통째로 바뀌므로 컷마다 ±0.5 를 확인한다.
*/

describe('calculateGrade — 등급 컷 경계', () => {
  // [컷, 컷에서의 등급, 컷 바로 아래 등급]
  const cuts: Array<[number, number, number]> = [
    [96, 1, 2],
    [89, 2, 3],
    [77, 3, 4],
    [60, 4, 5],
    [40, 5, 6],
    [25, 6, 7],
    [15, 7, 8],
    [8, 8, 9],
  ];

  for (const [cut, atCut, belowCut] of cuts) {
    it(`${cut}% 이상은 ${atCut}등급, 미만은 ${belowCut}등급`, () => {
      expect(calculateGrade(cut)).toBe(atCut);
      expect(calculateGrade(cut + 0.5)).toBe(atCut);
      expect(calculateGrade(cut - 0.5)).toBe(belowCut);
    });
  }

  it('양 끝값', () => {
    expect(calculateGrade(100)).toBe(1);
    expect(calculateGrade(0)).toBe(9);
    expect(calculateGrade(7.9)).toBe(9);
  });
});

describe('parseLocalDateStart — KST 로컬 자정 해석', () => {
  it("'YYYY-MM-DD' 를 UTC 자정이 아니라 로컬 자정으로 읽는다", () => {
    const d = parseLocalDateStart('2026-08-20')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-based
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('new Date("YYYY-MM-DD") 의 UTC 파싱과 다르다 (KST 기준)', () => {
    const ours = parseLocalDateStart('2026-08-20')!;
    const naive = new Date('2026-08-20');
    // KST(UTC+9) 에서 naive 는 09:00 이 된다. 우리 것은 00:00 이어야 한다.
    if (ours.getTimezoneOffset() !== 0) {
      expect(ours.getTime()).not.toBe(naive.getTime());
    }
    expect(ours.getHours()).toBe(0);
  });

  it('시각이 포함된 문자열은 그대로 통과', () => {
    const d = parseLocalDateStart('2026-08-20T13:45:00')!;
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(45);
  });

  it('Date 객체는 그대로', () => {
    const src = new Date(2026, 7, 20, 5, 6, 7);
    expect(parseLocalDateStart(src)!.getTime()).toBe(src.getTime());
  });

  it('파싱 불가는 null', () => {
    expect(parseLocalDateStart('nope')).toBeNull();
    expect(parseLocalDateStart('')).toBeNull();
    expect(parseLocalDateStart(null)).toBeNull();
    expect(parseLocalDateStart(undefined)).toBeNull();
    expect(parseLocalDateStart(new Date('bad'))).toBeNull();
  });
});

describe('parseLocalDateEnd — 마감일은 그 날 끝까지', () => {
  it("'YYYY-MM-DD' 는 23:59:59.999 로", () => {
    const d = parseLocalDateEnd('2026-08-20')!;
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });

  it('마감일 당일 낮은 아직 기간 안', () => {
    const end = parseLocalDateEnd('2026-08-20')!;
    const duringThatDay = new Date(2026, 7, 20, 14, 0, 0);
    expect(duringThatDay <= end).toBe(true);
  });

  it('마감 다음날 0시는 기간 밖', () => {
    const end = parseLocalDateEnd('2026-08-20')!;
    const nextDay = new Date(2026, 7, 21, 0, 0, 0);
    expect(nextDay > end).toBe(true);
  });

  it('시각이 포함된 값은 그 시각 그대로 (임의 확장 금지)', () => {
    const d = parseLocalDateEnd('2026-08-20T10:00:00')!;
    expect(d.getHours()).toBe(10);
  });
});

describe('endOfLocalDay — 저장된 timestamp 를 그 날 끝으로', () => {
  it('UTC 자정으로 저장된 값도 당일 마감으로 취급', () => {
    const stored = new Date(2026, 7, 20, 9, 0, 0); // KST 09:00 로 밀린 값
    const end = endOfLocalDay(stored);
    expect(end.getDate()).toBe(20);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('원본을 변형하지 않는다', () => {
    const stored = new Date(2026, 7, 20, 9, 0, 0);
    const before = stored.getTime();
    endOfLocalDay(stored);
    expect(stored.getTime()).toBe(before);
  });
});
