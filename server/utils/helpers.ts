import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeForJson(obj: any): string {
  const json = JSON.stringify(obj);
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022');
}

/**
 * 'YYYY-MM-DD' 문자열을 서버 로컬 타임존의 그 날 00:00:00 으로 해석한다.
 * `new Date('2026-08-20')` 은 UTC 자정으로 파싱되어 KST 에서는 09:00 이 되므로 직접 쓰지 않는다.
 * 이미 시각까지 포함한 문자열이나 Date 객체는 그대로 통과시킨다.
 * 파싱할 수 없으면 null 을 돌려준다(호출부에서 400 처리).
 */
export function parseLocalDateStart(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 'YYYY-MM-DD' 를 그 날의 마지막 순간(로컬 23:59:59.999)으로 해석한다.
 * 마감일 당일까지 응시를 허용하기 위한 용도.
 * 시각이 포함된 값은 그대로 둔다(이미 의도된 시각이므로).
 */
export function parseLocalDateEnd(value: unknown): Date | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const start = parseLocalDateStart(value);
    if (!start) return null;
    start.setHours(23, 59, 59, 999);
    return start;
  }
  return parseLocalDateStart(value);
}

/**
 * 저장된 마감 timestamp 를 "그 날 23:59:59.999" 로 확장한다.
 * 과거에 UTC 자정으로 저장된 레코드도 당일 마감으로 취급하기 위함.
 */
export function endOfLocalDay(value: Date | string): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * answers 의 `_` 접두 키는 **서버 전용 메타키**다.
 * 현재는 `_gradingMode` 하나뿐이고, 지점 수동 채점 경로(`attempts.ts` 의 branch-grade)
 * 에서만 서버가 직접 붙인다. 학생이 보내는 답안에는 있을 이유가 없다.
 */
export function hasReservedAnswerKey(answers: Record<string, unknown>): boolean {
  return Object.keys(answers).some((key) => key.startsWith('_'));
}

/**
 * 학생이 보낸 answers 에서 서버 전용 메타키(`_` 접두)를 걷어낸 새 객체를 만든다.
 *
 * 값을 검사해 걸러내는 대신 키만 보고 **무조건 제거**한다.
 * 이유: `gradeAnswers` 는 `_gradingMode === 'ox'` 를 보고 O/X 분기를 타서 값이 1 인
 * 문항을 전부 정답 처리한다. 학생이 제출 body 에 이 키를 끼워 넣으면 만점이 위조된다.
 * 허용 목록(whitelist)이 아니라 접두 규칙으로 막아야 앞으로 늘어날 메타키까지
 * 자동으로 차단된다. 채점 대상 키는 문항 번호이므로 `_` 로 시작할 일이 없다.
 *
 * 객체가 아니거나 배열이면 null 을 돌려준다(호출부에서 400 처리).
 */
export function sanitizeStudentAnswers(answers: unknown): Record<string, unknown> | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return null;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
    if (key.startsWith('_')) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/**
 * 배포 대상 종류. `exam_distributions.target_kind` 컬럼과 1:1 이다.
 *   'branch'   : 지점 전원 공개
 *   'class'    : classId 가 가리키는 반의 구성원
 *   'students' : distribution_students 에 배정된 학생만
 */
export type DistributionTargetKind = 'branch' | 'class' | 'students';

/**
 * 배포 생성·수정 입력으로부터 target_kind 를 정한다.
 *
 * 우선순위는 studentIds > classId 다. 둘 다 왔을 때 예전 코드가
 * "지정 학생 행을 넣고 class_id 도 채우는" 상태를 만들 수 있었는데,
 * 그 경우 판정은 학생 지정이 이겼다(class_id 를 보기 전에 지정 행을 먼저 봤다).
 * 그 동작을 그대로 옮긴다.
 */
export function resolveDistributionTargetKind(input: {
  classId: string | null | undefined;
  studentIds: readonly string[] | undefined;
}): DistributionTargetKind {
  if (input.studentIds && input.studentIds.length > 0) return 'students';
  if (input.classId) return 'class';
  return 'branch';
}

/**
 * 배포 1건이 학생 1명에게 적용되는지 판정한다. **판정은 이 함수 하나뿐이다.**
 *
 * 예전에는 라우트 세 곳(/my-exams, GET /students, GET /:id/students)이 각자
 * "class_id 가 없고 지정 행도 없으면 전원" 이라는 파생 규칙을 들고 있었다.
 * 그래서 배정 INSERT 가 실패하거나 지정 학생이 CASCADE 로 사라지면
 * "지정 0명" 이 "전원 공개" 와 구별되지 않았다.
 *
 * ⚠ 'students' 인데 assignedStudentIds 가 비어 있으면 **누구에게도 적용되지 않는다**.
 *    전원으로 승격시키지 않는다. 이것이 이 함수의 핵심 계약이다.
 */
export function distributionAppliesToStudent(input: {
  targetKind: DistributionTargetKind;
  classId: string | null;
  studentId: string;
  studentClassIds: ReadonlySet<string>;
  assignedStudentIds: ReadonlySet<string>;
}): boolean {
  switch (input.targetKind) {
    case 'branch':
      return true;
    case 'class':
      return !!input.classId && input.studentClassIds.has(input.classId);
    case 'students':
      return input.assignedStudentIds.has(input.studentId);
  }
}

/**
 * 채점 코어. 두 경로(학생 온라인 제출 / 지점 수동 O·X 입력)가 같은 함수를 쓴다.
 *
 * 채점 방식은 answers 의 `_gradingMode` 메타키로 갈린다.
 *   'ox'  : 값이 O=1 / X=0 (지점 수동 채점). 정답 번호와 비교하지 않는다.
 *   그 외 : 값이 학생이 고른 번호. question.correctAnswer 와 비교한다.
 *
 * 라우트에서 분리한 이유는 DB 없이 조합을 검증하기 위해서다. 판정 규칙 자체는
 * 분리 전과 동일하다.
 */
export interface GradeResult {
  score: number;
  correctCount: number;
}

export function gradeAnswers(questionsData: any[], answers: any): GradeResult {
  const isOx = answers?._gradingMode === 'ox';
  let score = 0;
  let correctCount = 0;

  for (const question of questionsData) {
    const questionNum = question.number || question.questionNumber;
    const studentAnswer = answers?.[questionNum];

    const correct = isOx
      ? Number(studentAnswer) === 1
      : studentAnswer === (question.correctAnswer || question.answer);

    if (correct) {
      score += question.points || question.score || 0;
      correctCount++;
    }
  }

  return { score, correctCount };
}

// 등급 산출 로직 (백분율 기준)
export function calculateGrade(percentage: number): number {
  if (percentage >= 96) return 1;
  if (percentage >= 89) return 2;
  if (percentage >= 77) return 3;
  if (percentage >= 60) return 4;
  if (percentage >= 40) return 5;
  if (percentage >= 25) return 6;
  if (percentage >= 15) return 7;
  if (percentage >= 8) return 8;
  return 9;
}
