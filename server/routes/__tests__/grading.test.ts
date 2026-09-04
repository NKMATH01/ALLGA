import { describe, it, expect } from 'vitest';
import {
  gradeAnswers,
  calculateGrade,
  hasReservedAnswerKey,
  sanitizeStudentAnswers,
} from '../../utils/helpers';

/*
  채점 코어 검증.

  두 경로가 같은 함수를 쓴다.
    학생 온라인 제출 : answers 값이 학생이 고른 번호 → correctAnswer 와 비교
    지점 수동 채점   : answers 에 _gradingMode:'ox' 가 있고 값이 O=1 / X=0

  이 분기를 잘못 타면 정답이 1번이 아닌 모든 문항이 오답 처리된다(과거 C1 결함).
*/

const questions = [
  { number: 1, correctAnswer: 3, points: 2 },
  { number: 2, correctAnswer: 1, points: 2 },
  { number: 3, correctAnswer: 5, points: 3 },
  { number: 4, correctAnswer: 2, points: 3 },
];
const TOTAL = 10;

describe('gradeAnswers — 일반 제출(정답 번호 비교)', () => {
  it('전부 정답', () => {
    const r = gradeAnswers(questions, { 1: 3, 2: 1, 3: 5, 4: 2 });
    expect(r).toEqual({ score: 10, correctCount: 4 });
  });

  it('전부 오답', () => {
    const r = gradeAnswers(questions, { 1: 1, 2: 2, 3: 1, 4: 1 });
    expect(r).toEqual({ score: 0, correctCount: 0 });
  });

  it('부분 정답 — 배점이 다른 문항 합산', () => {
    // 1번(2점) 정답, 3번(3점) 정답, 나머지 오답
    const r = gradeAnswers(questions, { 1: 3, 2: 5, 3: 5, 4: 4 });
    expect(r).toEqual({ score: 5, correctCount: 2 });
  });

  it('무응답(0)과 누락 키는 오답', () => {
    const r = gradeAnswers(questions, { 1: 0, 2: 1 });
    expect(r).toEqual({ score: 2, correctCount: 1 });
  });

  it('정답이 1번이 아닌 문항도 정상 인정된다 (C1 회귀 방지)', () => {
    // 정답이 3,1,5,2 인데 O/X 로 오인하면 2번만 맞다고 계산된다
    const r = gradeAnswers(questions, { 1: 3, 2: 1, 3: 5, 4: 2 });
    expect(r.correctCount).toBe(4);
    expect(r.correctCount).not.toBe(1);
  });

  it('question.answer / question.score 별칭도 인식', () => {
    const alt = [{ questionNumber: 1, answer: 4, score: 5 }];
    expect(gradeAnswers(alt, { 1: 4 })).toEqual({ score: 5, correctCount: 1 });
    expect(gradeAnswers(alt, { 1: 2 })).toEqual({ score: 0, correctCount: 0 });
  });
});

describe('gradeAnswers — 지점 수동 채점(O/X)', () => {
  it('O=1 만 정답으로 센다', () => {
    const answers = { _gradingMode: 'ox', 1: 1, 2: 0, 3: 1, 4: 0 };
    const r = gradeAnswers(questions, answers);
    // 1번(2점) + 3번(3점)
    expect(r).toEqual({ score: 5, correctCount: 2 });
  });

  it('정답 번호와 무관하게 판정한다', () => {
    // 값이 전부 1 이면 정답 번호가 무엇이든 전부 정답
    const answers = { _gradingMode: 'ox', 1: 1, 2: 1, 3: 1, 4: 1 };
    expect(gradeAnswers(questions, answers)).toEqual({ score: 10, correctCount: 4 });
  });

  it('문자열 "1" 도 정답으로 인정 (폼 값)', () => {
    const answers = { _gradingMode: 'ox', 1: '1', 2: '0' };
    expect(gradeAnswers(questions, answers)).toEqual({ score: 2, correctCount: 1 });
  });

  it('전부 X', () => {
    const answers = { _gradingMode: 'ox', 1: 0, 2: 0, 3: 0, 4: 0 };
    expect(gradeAnswers(questions, answers)).toEqual({ score: 0, correctCount: 0 });
  });

  it('_gradingMode 가 없으면 O/X 로 해석하지 않는다', () => {
    const answers = { 1: 1, 2: 1, 3: 1, 4: 1 };
    // 정답이 3,1,5,2 이므로 2번만 정답
    expect(gradeAnswers(questions, answers)).toEqual({ score: 2, correctCount: 1 });
  });
});

describe('sanitizeStudentAnswers — 학생 입력의 서버 메타키 차단 (S-1)', () => {
  it('_gradingMode 를 제거한다', () => {
    const cleaned = sanitizeStudentAnswers({ _gradingMode: 'ox', 1: 3, 2: 1 });
    expect(cleaned).toEqual({ 1: 3, 2: 1 });
    expect(cleaned).not.toHaveProperty('_gradingMode');
  });

  it('_ 로 시작하는 키는 값과 무관하게 전부 제거한다', () => {
    const cleaned = sanitizeStudentAnswers({ _gradingMode: 'normal', _foo: 1, __proto: 'x', 1: 3 });
    expect(Object.keys(cleaned!)).toEqual(['1']);
  });

  it('메타키가 없으면 원본 그대로', () => {
    expect(sanitizeStudentAnswers({ 1: 3, 2: 1, 3: 5 })).toEqual({ 1: 3, 2: 1, 3: 5 });
  });

  it('객체가 아니거나 배열이면 null (호출부 400)', () => {
    expect(sanitizeStudentAnswers(null)).toBeNull();
    expect(sanitizeStudentAnswers(undefined)).toBeNull();
    expect(sanitizeStudentAnswers('ox')).toBeNull();
    expect(sanitizeStudentAnswers(42)).toBeNull();
    expect(sanitizeStudentAnswers([1, 2, 3])).toBeNull();
  });

  it('hasReservedAnswerKey 가 거부 대상을 가려낸다', () => {
    expect(hasReservedAnswerKey({ _gradingMode: 'ox', 1: 1 })).toBe(true);
    expect(hasReservedAnswerKey({ 1: 1, 2: 2 })).toBe(false);
    expect(hasReservedAnswerKey({})).toBe(false);
  });
});

describe('주입된 _gradingMode 는 채점에 영향을 주지 않는다 (S-1 회귀)', () => {
  it('전 문항 1 + _gradingMode:ox 를 학생이 보내도 정제 후에는 정답 번호로만 채점된다', () => {
    // 정답은 3,1,5,2 이므로 2번(2점) 하나만 맞다
    const injected = { _gradingMode: 'ox', 1: 1, 2: 1, 3: 1, 4: 1 };

    // 정제 전(취약 상태)이라면 만점이 됐다 — 대조군
    expect(gradeAnswers(questions, injected)).toEqual({ score: 10, correctCount: 4 });

    // 정제 후
    const cleaned = sanitizeStudentAnswers(injected)!;
    expect(gradeAnswers(questions, cleaned)).toEqual({ score: 2, correctCount: 1 });
  });

  it('정제 후 등급도 만점 등급이 아니다', () => {
    const injected = { _gradingMode: 'ox', 1: 1, 2: 1, 3: 1, 4: 1 };
    const cleaned = sanitizeStudentAnswers(injected)!;
    const { score } = gradeAnswers(questions, cleaned);
    expect(calculateGrade((score / TOTAL) * 100)).not.toBe(1);
  });
});

describe('서버가 붙인 _gradingMode 는 그대로 동작한다 (지점 수동 채점 경로)', () => {
  it('branch-grade 는 정제된 답안에 서버가 메타키를 붙여 O/X 로 채점한다', () => {
    // 라우트: const gradedAnswers = { ...answers, _gradingMode: 'ox' }
    const branchInput = { 1: 1, 2: 0, 3: 1, 4: 0 };
    const gradedAnswers = { ...branchInput, _gradingMode: 'ox' };
    expect(gradeAnswers(questions, gradedAnswers)).toEqual({ score: 5, correctCount: 2 });
  });
});

describe('채점 → 등급 (라우트가 조합하는 흐름)', () => {
  const toGrade = (score: number) => calculateGrade((score / TOTAL) * 100);

  it('만점은 1등급', () => {
    const { score } = gradeAnswers(questions, { 1: 3, 2: 1, 3: 5, 4: 2 });
    expect(toGrade(score)).toBe(1);
  });

  it('0점은 9등급', () => {
    const { score } = gradeAnswers(questions, {});
    expect(score).toBe(0);
    expect(toGrade(score)).toBe(9);
  });

  it('5/10 = 50% 는 5등급', () => {
    const { score } = gradeAnswers(questions, { _gradingMode: 'ox', 1: 1, 3: 1 });
    expect(score).toBe(5);
    expect(toGrade(score)).toBe(5);
  });
});

describe('조건부 UPDATE 분기 (0행 = 이미 처리됨)', () => {
  /*
    라우트는 조건부 UPDATE 의 반환 행으로 분기한다.
      PUT  /exam-attempts/:id        0행 -> 400 (이미 제출된 시험은 수정 불가)
      POST /exam-attempts/:id/submit 0행 -> 409 (이미 제출 처리됨)
    DB 없이 그 분기 규칙만 함수로 확인한다.
  */
  const autosaveStatus = (updatedRow: unknown) => (updatedRow ? 200 : 400);
  const submitStatus = (updatedRow: unknown) => (updatedRow ? 200 : 409);

  it('자동저장: 행을 잡으면 200, 못 잡으면 400', () => {
    expect(autosaveStatus({ id: 'a' })).toBe(200);
    expect(autosaveStatus(undefined)).toBe(400);
  });

  it('제출: 행을 잡으면 200, 못 잡으면 409', () => {
    expect(submitStatus({ id: 'a' })).toBe(200);
    expect(submitStatus(undefined)).toBe(409);
  });

  it('동시 제출 2건 중 하나만 200, 나머지는 409', () => {
    // UPDATE ... WHERE submitted_at IS NULL 은 한 쪽만 행을 잡는다
    const rows = [{ id: 'a' }, undefined];
    const statuses = rows.map(submitStatus);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
  });
});
