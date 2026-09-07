/**
 * E-3 정리: 중복 등록된 시험 2개를 지우고, 그 전에 더 나은 해설만 원본으로 옮긴다.
 *
 * 배경
 *   같은 시험("올가국어 2025 2차 미.수.등 [중3] 문항 분석")이 세 번 등록되어 있다.
 *     - 원본        bd2f7c3f…  배포 18 · 응시 17 · 보고서 9   ← 남긴다
 *     - 재등록본    f40165b2…  배포  1 · 응시  1 · 보고서 1   ← 지운다 (관리자 테스트)
 *     - "미수등"    4fc68bc4…  배포  2 · 응시  2 · 보고서 0   ← 지운다 (테스트)
 *   재등록본의 questions_data(45문항)는 원본과 37문항이 완전히 같고, 8문항만
 *   `explanation`·`commentary` 두 필드가 다르다(더 긴 해설). 채점에 쓰이는
 *   `correctAnswer`·`points`·`score`·`number` 등은 전부 동일하다.
 *   그래서 그 8문항의 해설만 원본으로 옮긴 뒤 나머지 두 시험을 지운다.
 *
 * 안전 장치
 *   - 기본 실행(인자 없음)은 **연습 실행**이다. 읽기 전용 트랜잭션 안에서 세어만 보고 끝난다.
 *   - `--apply` 를 줘야 실제로 쓴다. 쓰기 전에 대상 행 전체를 JSON 으로 백업한다.
 *   - exam_distributions.exam_id / exam_attempts.exam_id / ai_reports.exam_id 는
 *     전부 ON DELETE CASCADE 다. 즉 시험을 지우면 배포·응시·보고서가 함께 사라진다.
 *     D-4 와 달리 이번에는 그게 **의도된 동작**이다. 다만 "몇 건이 함께 사라지는가"를
 *     미리 세어 EXPECTED 와 대조하고, 삭제 후 총계가 1건이라도 어긋나면 롤백한다.
 *   - `--apply` 경로는 `select … from exams where id = any(…) for update` 로 세 시험 행을
 *     잠근 **뒤에** 모든 집계를 읽는다. 새 배포·응시·보고서 INSERT 는 FK 검사를 위해
 *     exams 행에 KEY SHARE 를 잡아야 하는데, 그것이 우리 FOR UPDATE 와 충돌하므로
 *     잠금 이후에는 대상 시험에 새 자식 행이 커밋될 수 없다. 즉 "세기 → 삭제" 사이에
 *     자식이 늘어나 조용히 CASCADE 로 사라지는 경쟁 조건이 닫힌다.
 *     (읽기 전용 트랜잭션에서는 `for update` 를 쓸 수 없으므로 연습 실행은 잠그지 않는다.)
 *   - 이식은 `explanation`·`commentary` **두 필드만** 건드린다. 그 외 필드가 하나라도
 *     다르면 채점 결과가 바뀔 위험이 있으므로 즉시 중단한다.
 *   - 채점 필드(`number`·`correctAnswer`·`points`·`score`)의 sha1 해시를 이식 전·후로
 *     계산하고, `--apply` 에서는 UPDATE 후 DB 에서 다시 읽어 한 번 더 대조한다.
 *   - 백업 파일은 flag 'wx' 로 배타 생성한다. 롤백되면 남은 백업 파일을 알려 준다.
 *
 * 사용법
 *   npx tsx server/scripts/cleanup-e3-duplicate-exams.ts            # 연습 실행
 *   npx tsx server/scripts/cleanup-e3-duplicate-exams.ts --apply    # 실제 이식·삭제
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** 남기는 시험. 이 시험의 questions_data 만 갱신된다. */
const ORIGINAL_EXAM_ID = 'bd2f7c3f-44e1-43fc-8116-117df23e0546';

/** 해설을 가져올 시험(= 재등록본). 이식이 끝나면 아래 DELETE_EXAM_IDS 로 함께 지워진다. */
const SOURCE_EXAM_ID = 'f40165b2-cb4b-4d5f-aab5-1115a32555c5';

/** 삭제 대상: 재등록본과 "미수등". */
const DELETE_EXAM_IDS = [
  'f40165b2-cb4b-4d5f-aab5-1115a32555c5',
  '4fc68bc4-fe0e-49a4-ac79-32a4db82b3bd',
];

/** 잠글 시험 3행. 원본 + 삭제 대상 2. */
const LOCK_EXAM_IDS = [ORIGINAL_EXAM_ID, ...DELETE_EXAM_IDS];

/** 두 시험의 questions_data 길이. 다르면 상황이 바뀐 것이므로 멈춘다. */
const EXPECTED_QUESTION_COUNT = 45;

/** 이식으로만 바뀌어도 되는 필드. 이 둘 말고 다른 필드가 다르면 중단한다. */
const TRANSPLANT_FIELDS = ['explanation', 'commentary'] as const;

/** 채점에 쓰이는 필드. 이식 전후로 해시가 같아야 한다. */
const GRADING_FIELDS = ['number', 'correctAnswer', 'points', 'score'] as const;

/** 사전 조사로 확정한 수. 하나라도 다르면 멈춘다. */
const EXPECTED = {
  transplant: 8,
  deleteExams: 2,
  deleteDists: 3,
  deleteAttempts: 3,
  deleteReports: 1,
};

/** 정리 전 총계. 여기서부터 시작하지 않으면 사전 조사 시점과 DB 가 달라진 것이다. */
const EXPECTED_BEFORE: Totals = {
  exams: 3,
  distributions: 21,
  attempts: 20,
  reports: 10,
  assigned: 0,
};

/** 정리 후 총계. 삭제 후 이 값과 정확히 같아야 커밋한다. */
const EXPECTED_AFTER: Totals = {
  exams: 1,
  distributions: 18,
  attempts: 17,
  reports: 9,
  assigned: 0,
};

/** 원본 시험이 잃어서는 안 되는 것들. 이식·삭제 후에도 그대로여야 한다. */
const EXPECTED_ORIGINAL = { distributions: 18, attempts: 17, reports: 9 };

/** 쓰기 전 백업 파일. 저장소 루트 기준 상대 경로이며, 이미 있으면 덮어쓰지 않고 중단한다. */
const BACKUP_PATH = 'docs/nk-team-routine/evidence/e3-exam-cleanup-2026-09-07.json';

type Question = Record<string, unknown>;

type Totals = {
  exams: number;
  distributions: number;
  attempts: number;
  reports: number;
  assigned: number;
};

type ChildCounts = {
  distributions: number;
  attempts: number;
  reports: number;
};

type FieldDiff = {
  field: string;
  beforeLength: number | string;
  afterLength: number | string;
  before: unknown;
  after: unknown;
};

type TransplantDiff = {
  index: number;
  number: unknown;
  fields: FieldDiff[];
};

type Plan = {
  originalQuestions: Question[];
  newQuestions: Question[];
  transplants: TransplantDiff[];
  gradingHashBefore: string;
  gradingHashAfter: string;
  deleteCounts: ChildCounts;
};

type Tx = postgres.TransactionSql<Record<string, never>>;

/** 롤백을 일으키는 전용 오류. 메시지는 이미 출력한 뒤 던진다. */
class AbortTransaction extends Error {}

/**
 * 저장소 루트(= 이 파일이 있는 server/scripts 의 두 단계 위).
 * cwd 에 기대면 어디서 실행하느냐에 따라 백업이 엉뚱한 곳에 떨어진다.
 * 루트로 보이는 곳에 package.json 이 없으면 경로 가정이 깨진 것이므로 중단한다.
 */
function findRepoRoot(): string | null {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(scriptDir, '..', '..');
  return existsSync(resolve(root, 'package.json')) ? root : null;
}

/** 어느 DB 에 붙는지 한 줄로 알린다. 비밀번호·사용자 이름은 절대 찍지 않는다. */
function printConnectionTarget(databaseUrl: string): void {
  let host: string;
  let database: string;
  try {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, '') || '(이름 없음)';
  } catch {
    console.log('접속 대상: DATABASE_URL 을 해석하지 못했습니다 (형식 확인 필요).');
    return;
  }
  console.log(`접속 대상: host=${host} db=${database}`);
  if (host !== 'neon.tech' && !host.endsWith('.neon.tech')) {
    console.log(`경고: 호스트가 neon.tech 가 아닙니다 (${host}). 의도한 DB 가 맞는지 확인하세요.`);
  }
}

/**
 * 키 순서에 흔들리지 않는 직렬화. 두 JSON 값이 "같은가"를 판정하는 유일한 기준이다.
 * JSON.stringify 는 키 순서를 보존하므로 그대로 쓰면 순서만 다른 문항이 다르다고 나온다.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** 채점 필드만 뽑아 sha1. 이식 전후로 이 값이 같아야 한다. */
function gradingHash(questions: Question[]): string {
  const material = questions.map((question) => {
    const picked: Record<string, unknown> = {};
    for (const field of GRADING_FIELDS) picked[field] = question[field];
    return picked;
  });
  return createHash('sha1').update(stableStringify(material)).digest('hex');
}

/** 이식 대상 두 필드를 뺀 나머지 전부의 지문. 이게 다르면 채점이 바뀔 수 있다. */
function fingerprintExceptTransplantFields(question: Question): string {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(question)) {
    if (!(TRANSPLANT_FIELDS as readonly string[]).includes(key)) rest[key] = value;
  }
  return stableStringify(rest);
}

function valueLength(value: unknown): number | string {
  if (value === undefined) return '(없음)';
  if (value === null) return '(null)';
  if (typeof value === 'string') return value.length;
  return `(문자열 아님: ${typeof value})`;
}

function preview(value: unknown): string {
  if (value === undefined) return '(없음)';
  if (value === null) return '(null)';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length <= 60 ? flat : `${flat.slice(0, 60)}…`;
}

async function readTotals(tx: Tx): Promise<Totals> {
  const rows = await tx<Totals[]>`
    select
      (select count(*) from exams)::int                 as exams,
      (select count(*) from exam_distributions)::int    as distributions,
      (select count(*) from exam_attempts)::int         as attempts,
      (select count(*) from ai_reports)::int            as reports,
      (select count(*) from distribution_students)::int as assigned
  `;
  return rows[0];
}

async function readChildCounts(tx: Tx, examIds: string[]): Promise<ChildCounts> {
  const rows = await tx<ChildCounts[]>`
    select
      (select count(*) from exam_distributions where exam_id = any(${examIds}))::int as distributions,
      (select count(*) from exam_attempts      where exam_id = any(${examIds}))::int as attempts,
      (select count(*) from ai_reports         where exam_id = any(${examIds}))::int as reports
  `;
  return rows[0];
}

function printTotals(label: string, totals: Totals): void {
  console.log(
    `${label}: exams ${totals.exams} / exam_distributions ${totals.distributions} / ` +
      `exam_attempts ${totals.attempts} / ai_reports ${totals.reports} / ` +
      `distribution_students ${totals.assigned}`
  );
}

function totalsEqual(a: Totals, b: Totals): boolean {
  return (
    a.exams === b.exams &&
    a.distributions === b.distributions &&
    a.attempts === b.attempts &&
    a.reports === b.reports &&
    a.assigned === b.assigned
  );
}

/**
 * 시험 3행의 questions_data 를 읽는다. `lock: true` 면 `for update` 로 잠근다.
 * 잠금은 `--apply` 에서만 쓴다 — 읽기 전용 트랜잭션에서는 허용되지 않는다.
 *
 * 이 잠금이 세 시험에 대한 새 배포·응시·보고서 INSERT 를 막는다(FK 의 KEY SHARE 와 충돌).
 * 그래서 아래의 모든 집계는 이 함수가 끝난 **뒤에** 읽어야 의미가 있다.
 */
async function loadQuestionsByExam(
  tx: Tx,
  options: { lock: boolean }
): Promise<Map<string, Question[]>> {
  const lock = options.lock ? tx`for update` : tx``;
  const rows = await tx<{ id: string; questions_data: unknown }[]>`
    select id, questions_data
    from exams
    where id = any(${LOCK_EXAM_IDS})
    order by id
    ${lock}
  `;
  if (rows.length !== LOCK_EXAM_IDS.length) {
    console.log(
      `대상 시험 ${LOCK_EXAM_IDS.length}개 중 ${rows.length}개만 있습니다 — 이미 정리되었거나 상황이 바뀐 것입니다.`
    );
    throw new AbortTransaction('exam rows missing');
  }

  const map = new Map<string, Question[]>();
  for (const row of rows) {
    const data = row.questions_data;
    if (!Array.isArray(data)) {
      console.log(`questions_data 가 배열이 아닙니다: exam=${row.id}`);
      throw new AbortTransaction('questions_data is not an array');
    }
    for (const [index, question] of data.entries()) {
      if (question === null || typeof question !== 'object' || Array.isArray(question)) {
        console.log(`문항이 객체가 아닙니다: exam=${row.id} index=${index}`);
        throw new AbortTransaction('question is not an object');
      }
    }
    map.set(row.id, data as Question[]);
  }
  return map;
}

/**
 * 연습 실행과 `--apply` 가 **같은 함수**로 계획을 세운다 —
 * 두 경로가 다른 계산을 쓰면 연습 실행의 의미가 사라진다.
 */
async function buildPlan(tx: Tx, options: { lock: boolean }): Promise<Plan> {
  const byExam = await loadQuestionsByExam(tx, options);
  const original = byExam.get(ORIGINAL_EXAM_ID)!;
  const source = byExam.get(SOURCE_EXAM_ID)!;

  // 1) 길이 확인
  console.log(`문항 수: 원본 ${original.length} / 재등록본 ${source.length} (기대 ${EXPECTED_QUESTION_COUNT})`);
  if (original.length !== EXPECTED_QUESTION_COUNT || source.length !== EXPECTED_QUESTION_COUNT) {
    console.log('문항 수가 기대와 다릅니다 — 중단합니다.');
    throw new AbortTransaction('question count mismatch');
  }

  // 2) 배열 인덱스 + number 둘 다로 짝을 확인한다. 하나라도 어긋나면 매칭 가정이 깨진 것이다.
  for (let index = 0; index < original.length; index += 1) {
    const left = original[index].number;
    const right = source[index].number;
    if (left === undefined || right === undefined || stableStringify(left) !== stableStringify(right)) {
      console.log(`문항 번호가 어긋납니다: index=${index} 원본=${String(left)} 재등록본=${String(right)}`);
      throw new AbortTransaction('question number mismatch');
    }
  }

  // 3) 이식 대상 두 필드 말고 다른 필드가 다르면 채점이 바뀔 수 있으므로 중단
  for (let index = 0; index < original.length; index += 1) {
    if (
      fingerprintExceptTransplantFields(original[index]) !==
      fingerprintExceptTransplantFields(source[index])
    ) {
      console.log(
        `문항 ${String(original[index].number)}(index=${index}) 이 ` +
          `${TRANSPLANT_FIELDS.join('·')} 이외의 필드에서 다릅니다 — 중단합니다.`
      );
      throw new AbortTransaction('non-transplant field differs');
    }
  }

  // 4) 이식 대상 = 두 필드 중 하나라도 다른 문항
  const transplants: TransplantDiff[] = [];
  for (let index = 0; index < original.length; index += 1) {
    const fields: FieldDiff[] = [];
    for (const field of TRANSPLANT_FIELDS) {
      const before = original[index][field];
      const after = source[index][field];
      if (stableStringify(before) === stableStringify(after)) continue;
      fields.push({
        field,
        beforeLength: valueLength(before),
        afterLength: valueLength(after),
        before,
        after,
      });
    }
    if (fields.length > 0) {
      transplants.push({ index, number: original[index].number, fields });
    }
  }

  console.log('');
  console.log(`이식 대상 ${transplants.length}문항 (기대 ${EXPECTED.transplant}):`);
  for (const item of transplants) {
    console.log(`  문항 ${String(item.number)} (index=${item.index})`);
    for (const diff of item.fields) {
      console.log(`    ${diff.field}: 길이 ${diff.beforeLength} → ${diff.afterLength}`);
      console.log(`      전: ${preview(diff.before)}`);
      console.log(`      후: ${preview(diff.after)}`);
    }
  }
  console.log('');
  if (transplants.length !== EXPECTED.transplant) {
    console.log('이식 대상 수가 기대와 다릅니다 — 중단합니다.');
    throw new AbortTransaction('transplant count mismatch');
  }

  // 5) 새 questions_data: 원본 복사 후 대상 문항의 두 필드만 재등록본 값으로 교체
  const newQuestions: Question[] = original.map((question) => ({ ...question }));
  for (const item of transplants) {
    const from = source[item.index];
    const into = newQuestions[item.index];
    for (const field of TRANSPLANT_FIELDS) {
      if (field in from) into[field] = from[field];
      else delete into[field];
    }
  }

  // 6) 채점 필드 해시가 교체 전후로 같아야 한다
  const gradingHashBefore = gradingHash(original);
  const gradingHashAfter = gradingHash(newQuestions);
  console.log(`채점 필드 해시(sha1): 전 ${gradingHashBefore}`);
  console.log(`채점 필드 해시(sha1): 후 ${gradingHashAfter}`);
  if (gradingHashBefore !== gradingHashAfter) {
    console.log('채점 필드가 바뀌었습니다 — 중단합니다.');
    throw new AbortTransaction('grading hash changed');
  }

  // 이식 이외의 변화가 없는지 한 번 더: 이식 대상 문항 말고는 지문이 같아야 한다
  for (let index = 0; index < original.length; index += 1) {
    const isTarget = transplants.some((item) => item.index === index);
    if (isTarget) continue;
    if (stableStringify(original[index]) !== stableStringify(newQuestions[index])) {
      console.log(`이식 대상이 아닌 문항 index=${index} 이 바뀌었습니다 — 중단합니다.`);
      throw new AbortTransaction('untouched question changed');
    }
  }

  // 7) 삭제 대상 시험의 자식 행 수
  const deleteCounts = await readChildCounts(tx, DELETE_EXAM_IDS);
  console.log(
    `삭제 대상(${DELETE_EXAM_IDS.length}개 시험)의 자식 행: 배포 ${deleteCounts.distributions} / ` +
      `응시 ${deleteCounts.attempts} / 보고서 ${deleteCounts.reports} ` +
      `(기대 ${EXPECTED.deleteDists}/${EXPECTED.deleteAttempts}/${EXPECTED.deleteReports}, CASCADE 로 함께 삭제됨)`
  );
  if (
    deleteCounts.distributions !== EXPECTED.deleteDists ||
    deleteCounts.attempts !== EXPECTED.deleteAttempts ||
    deleteCounts.reports !== EXPECTED.deleteReports
  ) {
    console.log('삭제로 함께 사라질 행 수가 기대와 다릅니다 — 중단합니다.');
    throw new AbortTransaction('cascade count mismatch');
  }

  // 8) 원본 시험이 잃어서는 안 되는 것들
  const originalCounts = await readChildCounts(tx, [ORIGINAL_EXAM_ID]);
  console.log(
    `원본 시험의 자식 행: 배포 ${originalCounts.distributions} / 응시 ${originalCounts.attempts} / ` +
      `보고서 ${originalCounts.reports} ` +
      `(기대 ${EXPECTED_ORIGINAL.distributions}/${EXPECTED_ORIGINAL.attempts}/${EXPECTED_ORIGINAL.reports}, 불변이어야 함)`
  );
  if (
    originalCounts.distributions !== EXPECTED_ORIGINAL.distributions ||
    originalCounts.attempts !== EXPECTED_ORIGINAL.attempts ||
    originalCounts.reports !== EXPECTED_ORIGINAL.reports
  ) {
    console.log('원본 시험의 자식 행 수가 기대와 다릅니다 — 중단합니다.');
    throw new AbortTransaction('original child count mismatch');
  }

  return {
    originalQuestions: original,
    newQuestions,
    transplants,
    gradingHashBefore,
    gradingHashAfter,
    deleteCounts,
  };
}

async function dryRun(sql: postgres.Sql<Record<string, never>>, databaseUrl: string): Promise<number> {
  printConnectionTarget(databaseUrl);
  console.log('== 연습 실행 (읽기 전용, 아무것도 쓰지 않음) ==');

  try {
    await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      const totals = await readTotals(tx as Tx);
      printTotals('현재 총계', totals);
      if (!totalsEqual(totals, EXPECTED_BEFORE)) {
        printTotals('기대 총계', EXPECTED_BEFORE);
        console.log('정리 전 총계가 사전 조사와 다릅니다 — 중단합니다.');
        throw new AbortTransaction('before totals mismatch');
      }
      console.log('');
      // 읽기 전용 트랜잭션이라 잠그지 않는다. 잠금은 --apply 에서만.
      await buildPlan(tx as Tx, { lock: false });
      printTotals('정리 후 기대 총계', EXPECTED_AFTER);
    });
  } catch (error) {
    if (error instanceof AbortTransaction) {
      console.log('');
      console.log(`MISMATCH (${error.message}) — --apply 를 실행하지 마세요.`);
      return 1;
    }
    throw error;
  }

  console.log('');
  console.log('OK — 실제 이식·삭제는 `--apply` 로 실행합니다. (감사 2건 통과 전에는 실행 금지)');
  return 0;
}

async function apply(
  sql: postgres.Sql<Record<string, never>>,
  databaseUrl: string,
  repoRoot: string
): Promise<number> {
  printConnectionTarget(databaseUrl);
  console.log('== 실제 이식·삭제 (--apply) ==');

  /** 백업 파일을 실제로 쓴 뒤 롤백되면, 남은 파일을 사용자에게 알려야 한다. */
  let writtenBackupPath: string | null = null;

  const warnLeftoverBackup = (): void => {
    if (writtenBackupPath) {
      console.log(
        `백업 파일 ${writtenBackupPath} 는 남아 있습니다. 실제 변경은 되지 않았으니 파일을 지우고 재실행하세요.`
      );
    }
  };

  try {
    await sql
      .begin(async (tx) => {
        // (a) 세 시험 행을 for update 로 잠근다. 이 뒤에는 대상 시험에 새 배포·응시·보고서가
        //     커밋될 수 없다(FK 의 KEY SHARE 가 우리 FOR UPDATE 와 충돌). 그래서 모든 집계는
        //     이 잠금 뒤에 읽는다.
        // (b) 잠금 상태에서 1~5 를 그대로 다시 계산·검증한다.
        const plan = await buildPlan(tx as Tx, { lock: true });

        const before = await readTotals(tx as Tx);
        printTotals('변경 전 총계', before);
        if (!totalsEqual(before, EXPECTED_BEFORE)) {
          printTotals('기대 총계', EXPECTED_BEFORE);
          console.log('변경 전 총계가 사전 조사와 다릅니다 — 롤백합니다.');
          throw new AbortTransaction('before totals mismatch');
        }

        // (c) 쓰기 전에 백업. flag 'wx' 로 배타 생성한다 — 존재 확인과 쓰기 사이의 틈을 없앤다.
        const backupAbs = resolve(repoRoot, BACKUP_PATH);
        if (existsSync(backupAbs)) {
          // 빠른 실패용 선검사. 진짜 방어는 아래 'wx' 다.
          console.log(`백업 파일이 이미 있습니다: ${backupAbs} — 덮어쓰지 않고 롤백합니다.`);
          throw new AbortTransaction('backup file already exists');
        }

        const originalExamRows = await tx`
          select * from exams where id = ${ORIGINAL_EXAM_ID}
        `;
        const deletedExamRows = await tx`
          select * from exams where id = any(${DELETE_EXAM_IDS}) order by id
        `;
        const deletedDistributionRows = await tx`
          select * from exam_distributions where exam_id = any(${DELETE_EXAM_IDS}) order by id
        `;
        const deletedAttemptRows = await tx`
          select * from exam_attempts where exam_id = any(${DELETE_EXAM_IDS}) order by id
        `;
        const deletedReportRows = await tx`
          select * from ai_reports where exam_id = any(${DELETE_EXAM_IDS}) order by id
        `;
        const deletedAssignmentRows = await tx`
          select s.*
          from distribution_students s
          join exam_distributions d on d.id = s.distribution_id
          where d.exam_id = any(${DELETE_EXAM_IDS})
          order by s.distribution_id
        `;

        mkdirSync(dirname(backupAbs), { recursive: true });
        try {
          writeFileSync(
            backupAbs,
            `${JSON.stringify(
              {
                changedAt: new Date().toISOString(),
                originalExamId: ORIGINAL_EXAM_ID,
                sourceExamId: SOURCE_EXAM_ID,
                deletedExamIds: DELETE_EXAM_IDS,
                gradingHash: plan.gradingHashBefore,
                transplants: plan.transplants,
                originalExamBeforeUpdate: originalExamRows,
                deletedExams: deletedExamRows,
                deletedDistributions: deletedDistributionRows,
                deletedAttempts: deletedAttemptRows,
                deletedReports: deletedReportRows,
                deletedAssignments: deletedAssignmentRows,
              },
              null,
              2
            )}\n`,
            { encoding: 'utf8', flag: 'wx' }
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            console.log('백업 파일이 이미 있습니다. 내용을 확인해 정리한 뒤 재실행하세요.');
            throw new AbortTransaction('backup file already exists');
          }
          throw error;
        }
        writtenBackupPath = backupAbs;
        console.log(`백업 저장: ${backupAbs}`);

        // (d) 원본 해설 이식
        const updated = await tx`
          update exams
          set questions_data = ${tx.json(plan.newQuestions as unknown as postgres.JSONValue)}
          where id = ${ORIGINAL_EXAM_ID}
        `;
        console.log(`갱신된 행: ${updated.count} (기대 1)`);
        if (updated.count !== 1) {
          console.log('갱신 행수가 기대와 다릅니다 — 롤백합니다.');
          throw new AbortTransaction('update count mismatch');
        }

        // (e) 중복 시험 삭제. 배포·응시·보고서는 ON DELETE CASCADE 로 함께 사라진다.
        const deleted = await tx`
          delete from exams where id = any(${DELETE_EXAM_IDS})
        `;
        console.log(`삭제된 시험: ${deleted.count} (기대 ${EXPECTED.deleteExams})`);
        if (deleted.count !== EXPECTED.deleteExams) {
          console.log('삭제 행수가 기대와 다릅니다 — 롤백합니다.');
          throw new AbortTransaction('delete count mismatch');
        }

        // (f) 후 검증: 총계·원본 자식 행·채점 해시 — 하나라도 다르면 롤백
        const after = await readTotals(tx as Tx);
        printTotals('변경 후 총계', after);
        if (!totalsEqual(after, EXPECTED_AFTER)) {
          printTotals('기대 총계', EXPECTED_AFTER);
          console.log('총계 검증 실패 — 롤백합니다.');
          throw new AbortTransaction('after totals verification failed');
        }

        const afterOriginalCounts = await readChildCounts(tx as Tx, [ORIGINAL_EXAM_ID]);
        console.log(
          `변경 후 원본 시험의 자식 행: 배포 ${afterOriginalCounts.distributions} / ` +
            `응시 ${afterOriginalCounts.attempts} / 보고서 ${afterOriginalCounts.reports}`
        );
        if (
          afterOriginalCounts.distributions !== EXPECTED_ORIGINAL.distributions ||
          afterOriginalCounts.attempts !== EXPECTED_ORIGINAL.attempts ||
          afterOriginalCounts.reports !== EXPECTED_ORIGINAL.reports
        ) {
          console.log('원본 시험의 배포·응시·보고서가 바뀌었습니다 — 롤백합니다.');
          throw new AbortTransaction('original child count changed');
        }

        // DB 에서 다시 읽어 확인한다. JSON 왕복에서 무언가 틀어졌으면 여기서 잡힌다.
        const rereadRows = await tx<{ questions_data: unknown }[]>`
          select questions_data from exams where id = ${ORIGINAL_EXAM_ID}
        `;
        const reread = rereadRows[0]?.questions_data;
        if (!Array.isArray(reread) || reread.length !== EXPECTED_QUESTION_COUNT) {
          console.log('갱신 후 questions_data 를 다시 읽지 못했거나 길이가 다릅니다 — 롤백합니다.');
          throw new AbortTransaction('reread questions_data invalid');
        }
        const rereadHash = gradingHash(reread as Question[]);
        console.log(`변경 후 채점 필드 해시(sha1): ${rereadHash}`);
        if (rereadHash !== plan.gradingHashBefore) {
          console.log('채점 필드 해시가 달라졌습니다 — 롤백합니다.');
          throw new AbortTransaction('grading hash changed after update');
        }
        if (stableStringify(reread) !== stableStringify(plan.newQuestions)) {
          console.log('갱신된 questions_data 가 계획과 다릅니다 — 롤백합니다.');
          throw new AbortTransaction('reread questions_data differs from plan');
        }

        // (g) 커밋 후 출력할 값
        return { before, after, backupAbs, gradingHash: rereadHash, plan };
      })
      .then((result) => {
        console.log('');
        console.log('커밋 완료.');
        printTotals('전', result.before);
        printTotals('후', result.after);
        console.log(`이식 문항: ${result.plan.transplants.map((item) => String(item.number)).join(', ')}`);
        console.log(`채점 필드 해시(불변): ${result.gradingHash}`);
        console.log(`백업 경로: ${result.backupAbs}`);
      });
    return 0;
  } catch (error) {
    if (error instanceof AbortTransaction) {
      console.log(`롤백됨: ${error.message}`);
      warnLeftoverBackup();
      return 1;
    }
    warnLeftoverBackup();
    throw error;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
    console.error(`알 수 없는 인자: ${args.join(' ')}`);
    console.error('사용법: cleanup-e3-duplicate-exams.ts [--apply]');
    return 1;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    return 1;
  }

  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    console.error('저장소 루트를 찾지 못했습니다 (server/scripts 두 단계 위에 package.json 이 없음).');
    return 1;
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return args[0] === '--apply'
      ? await apply(sql, databaseUrl, repoRoot)
      : await dryRun(sql, databaseUrl);
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('실패:', error);
    process.exitCode = 1;
  });
