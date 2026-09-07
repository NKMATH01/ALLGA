/**
 * D-4 정리: 응시 기록이 전혀 없는 중복 배포만 삭제한다.
 *
 * 배경
 *   같은 시험("올가국어 2025 2차 미.수.등 [중3] 문항 분석")이 세 번 등록되어
 *   배포가 52건까지 불어났다. 그중 재등록본(f40165b2…)과 "미수등"(4fc68bc4…)의
 *   배포는 대부분 아무도 응시하지 않은 껍데기다. 이 스크립트는 그 껍데기만 지운다.
 *
 * 안전 장치
 *   - 기본 실행(인자 없음)은 **연습 실행**이다. 읽기 전용 트랜잭션 안에서 세어만 보고 끝난다.
 *   - `--apply` 를 줘야 실제로 지운다. 지우기 전에 대상 행 전체를 JSON 으로 백업한다.
 *   - exam_attempts.distribution_id / distribution_students.distribution_id /
 *     exam_distributions.parent_distribution_id 는 전부 ON DELETE CASCADE 다.
 *     즉 응시가 달린 배포를 지우면 학생 기록이 함께 사라진다. 그래서 선택 조건에서
 *     응시·배정·자식 배포가 하나라도 있는 배포를 반드시 제외한다.
 *   - 삭제 후 총계가 예상과 조금이라도 다르면 커밋하지 않고 롤백한다.
 *
 * 사용법
 *   npx tsx server/scripts/cleanup-d4-duplicate-distributions.ts            # 연습 실행
 *   npx tsx server/scripts/cleanup-d4-duplicate-distributions.ts --apply    # 실제 삭제
 */
import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

/** 정리 대상 시험: 재등록본과 "미수등". 원본(bd2f7c3f…)은 건드리지 않는다. */
const TARGET_EXAM_IDS = [
  'f40165b2-cb4b-4d5f-aab5-1115a32555c5',
  '4fc68bc4-fe0e-49a4-ac79-32a4db82b3bd',
];

/** 사전 조사로 확정한 삭제 대상 수. 이 수와 다르면 상황이 바뀐 것이므로 멈춘다. */
const EXPECTED_COUNT = 31;

/** 삭제 전 백업 파일. 이미 있으면 덮어쓰지 않고 중단한다. */
const BACKUP_PATH = 'docs/nk-team-routine/evidence/d4-deleted-distributions-2026-09-07.json';

type DistributionRow = {
  id: string;
  exam_id: string;
  branch_id: string;
  class_id: string | null;
  target_kind: string;
  parent_distribution_id: string | null;
  start_date: Date;
  end_date: Date;
  distributed_by: string;
  created_at: Date;
};

type Totals = {
  distributions: number;
  attempts: number;
  reports: number;
  assigned: number;
};

type Tx = postgres.TransactionSql<Record<string, never>>;

/**
 * 삭제 후보 선택. 연습 실행과 `--apply` 가 **같은 함수**를 쓴다 —
 * 두 경로가 다른 쿼리를 쓰면 연습 실행의 의미가 사라진다.
 */
async function selectDeletable(tx: Tx): Promise<DistributionRow[]> {
  return tx<DistributionRow[]>`
    select d.*
    from exam_distributions d
    where d.exam_id = any(${TARGET_EXAM_IDS})
      and not exists (select 1 from exam_attempts a where a.distribution_id = d.id)
      and not exists (select 1 from distribution_students s where s.distribution_id = d.id)
      and not exists (select 1 from exam_distributions c where c.parent_distribution_id = d.id)
    order by d.exam_id, d.branch_id
  `;
}

async function readTotals(tx: Tx): Promise<Totals> {
  const rows = await tx<Totals[]>`
    select
      (select count(*) from exam_distributions)::int   as distributions,
      (select count(*) from exam_attempts)::int        as attempts,
      (select count(*) from ai_reports)::int           as reports,
      (select count(*) from distribution_students)::int as assigned
  `;
  return rows[0];
}

function printTotals(label: string, totals: Totals): void {
  console.log(
    `${label}: exam_distributions ${totals.distributions} / exam_attempts ${totals.attempts} / ` +
      `ai_reports ${totals.reports} / distribution_students ${totals.assigned}`
  );
}

function printRows(rows: DistributionRow[]): void {
  console.log('');
  console.log('삭제 후보:');
  for (const row of rows) {
    console.log(
      `  ${row.id}  exam=${row.exam_id.slice(0, 8)}  branch=${row.branch_id}  ` +
        `kind=${row.target_kind}  created=${row.created_at.toISOString()}`
    );
  }
  console.log('');
}

/** 롤백을 일으키는 전용 오류. 메시지는 이미 출력한 뒤 던진다. */
class AbortTransaction extends Error {}

async function dryRun(sql: postgres.Sql<Record<string, never>>): Promise<number> {
  console.log('== 연습 실행 (읽기 전용, 아무것도 쓰지 않음) ==');

  const selected = await sql.begin(async (tx) => {
    await tx`set transaction read only`;
    const totals = await readTotals(tx as Tx);
    printTotals('현재 총계', totals);
    const rows = await selectDeletable(tx as Tx);
    printRows(rows);
    return rows;
  });

  console.log(`선택 ${selected.length}건 (기대 ${EXPECTED_COUNT})`);
  if (selected.length !== EXPECTED_COUNT) {
    console.log('MISMATCH — 삭제 대상 수가 기대와 다릅니다. --apply 를 실행하지 마세요.');
    return 1;
  }
  console.log('OK — 실제 삭제는 `--apply` 로 실행합니다.');
  return 0;
}

async function apply(sql: postgres.Sql<Record<string, never>>): Promise<number> {
  console.log('== 실제 삭제 (--apply) ==');

  try {
    await sql.begin(async (tx) => {
      const before = await readTotals(tx as Tx);
      printTotals('삭제 전 총계', before);

      // (a) 같은 쿼리로 다시 선택
      const rows = await selectDeletable(tx as Tx);
      printRows(rows);
      console.log(`선택 ${rows.length}건 (기대 ${EXPECTED_COUNT})`);
      if (rows.length !== EXPECTED_COUNT) {
        console.log('MISMATCH — 롤백합니다.');
        throw new AbortTransaction('selection count mismatch');
      }

      const ids = rows.map((row) => row.id);

      // (b) 방어적 재확인: 선택된 id 에 딸린 응시·배정·자식 배포가 정말 0인가
      const guardRows = await tx<{ attempts: number; assigned: number; children: number }[]>`
        select
          (select count(*) from exam_attempts        where distribution_id        = any(${ids}))::int as attempts,
          (select count(*) from distribution_students where distribution_id       = any(${ids}))::int as assigned,
          (select count(*) from exam_distributions   where parent_distribution_id = any(${ids}))::int as children
      `;
      const guard = guardRows[0];
      console.log(
        `방어 확인: 응시 ${guard.attempts} / 배정 ${guard.assigned} / 자식 배포 ${guard.children} (모두 0이어야 함)`
      );
      if (guard.attempts !== 0 || guard.assigned !== 0 || guard.children !== 0) {
        console.log('CASCADE 위험 — 롤백합니다.');
        throw new AbortTransaction('cascade guard failed');
      }

      // (c) 삭제 전에 백업
      const backupAbs = resolve(process.cwd(), BACKUP_PATH);
      if (existsSync(backupAbs)) {
        console.log(`백업 파일이 이미 있습니다: ${backupAbs} — 덮어쓰지 않고 롤백합니다.`);
        throw new AbortTransaction('backup file already exists');
      }
      mkdirSync(dirname(backupAbs), { recursive: true });
      writeFileSync(
        backupAbs,
        `${JSON.stringify(
          { deletedAt: new Date().toISOString(), targetExamIds: TARGET_EXAM_IDS, rows },
          null,
          2
        )}\n`,
        'utf8'
      );
      console.log(`백업 저장: ${backupAbs}`);

      // (d) 삭제
      const deleted = await tx`delete from exam_distributions where id = any(${ids})`;
      console.log(`삭제된 행: ${deleted.count}`);
      if (deleted.count !== EXPECTED_COUNT) {
        console.log('삭제 행수가 기대와 다릅니다 — 롤백합니다.');
        throw new AbortTransaction('delete count mismatch');
      }

      // (e) 후 총계 검증: 배포만 31 줄고 나머지는 그대로여야 한다
      const after = await readTotals(tx as Tx);
      printTotals('삭제 후 총계', after);
      const ok =
        after.distributions === before.distributions - EXPECTED_COUNT &&
        after.attempts === before.attempts &&
        after.reports === before.reports &&
        after.assigned === before.assigned;
      if (!ok) {
        console.log('총계 검증 실패 — 롤백합니다.');
        throw new AbortTransaction('totals verification failed');
      }

      // (f) 커밋 후 출력할 값
      return { before, after, backupAbs };
    }).then((result) => {
      console.log('');
      console.log('커밋 완료.');
      printTotals('전', result.before);
      printTotals('후', result.after);
      console.log(`백업 경로: ${result.backupAbs}`);
    });
    return 0;
  } catch (error) {
    if (error instanceof AbortTransaction) {
      console.log(`롤백됨: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
    console.error(`알 수 없는 인자: ${args.join(' ')}`);
    console.error('사용법: cleanup-d4-duplicate-distributions.ts [--apply]');
    return 1;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    return 1;
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    return args[0] === '--apply' ? await apply(sql) : await dryRun(sql);
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error('실패:', error);
    process.exit(1);
  });
