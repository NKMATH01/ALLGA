# 올가 팀 루틴 프로필

이 저장소에서 루틴을 돌릴 때 매번 다시 찾지 않으려고 적어 두는 고정값이다.
사실만 적고, 바뀌면 그 자리에서 고친다.

## 1. 실행·검증 명령

| 목적 | 명령 |
|---|---|
| 서버 기동 | `npm run dev:server` (`tsx watch server/index.ts`) |
| 클라이언트 기동 | `npm run dev:client` (`vite`) |
| 둘 다 | `npm run dev` (`concurrently -k`) |
| 서버 타입체크 | `npx tsc -p tsconfig.server.json --noEmit` |
| 클라이언트 타입체크 | `npx tsc -p tsconfig.json --noEmit` |
| 테스트 | `npm test` (= `vitest run`, `vitest.config.ts` 의 `include: server/**/*.test.ts`) |
| 하드코딩 hex | `grep -rnE "#[0-9a-fA-F]{3,8}\b" client/src --include=*.tsx --include=*.ts` |
| 빌드 | `npm run build` (client → server) |

주의 둘. `tsconfig.json` 은 client 전용 include 라서 서버 타입체크는 반드시
`tsconfig.server.json` 을 써야 한다. 빌드는 Node 22 LTS 에서 한다
(`package.json` 의 `engines` 주석: Node 24 는 `vite build` 가 rollup 네이티브
바인딩 크래시로 실패).

## 2. 스택

- 서버: Express + drizzle-orm / postgres.js, DB 는 Neon(PostgreSQL). 세션은 `connect-pg-simple`.
- 클라이언트: React + Vite + Tailwind, 데이터는 TanStack Query.
- 디자인 토큰: `client/src/index.css` 와 `tailwind.config.js`. 화면 코드에는 hex 를 쓰지 않고 토큰 클래스만 쓴다.
- 디자인 헌법: 루트 `DESIGN.md`. 12장이 검증 프로토콜이다.
- 마이그레이션: `drizzle/` (생성 `npm run db:generate`, 적용 `npm run db:migrate`).

## 3. 보호 구역 (건드리기 전에 반드시 확인)

- **채점**: `server/utils/helpers.ts` 의 `gradeAnswers`, `server/routes/attempts.ts`.
  온라인 제출과 O/X 수동 채점이 같은 함수를 쓴다. 분기 하나가 점수를 바꾼다.
- **권한**: `server/middleware/auth.ts` 의 `requireRole` 생성기, 대리 로그인은
  `server/routes/auth.ts` 의 impersonate 경로. 세션 없음은 401, 역할 불일치는 403 이다.
- **개인정보**: `users.username` 이 전화번호다. 로그·감사 기록에 넣지 않는다.
- **외부 키**: `GEMINI_API_KEY`. 값은 어디에도 인쇄하지 않고 존재 여부(boolean)만 남긴다.
- **운영 DB**: 쓰기는 마이그레이션으로만 하고, 실행 전 사용자 승인을 받는다.
  적용 전 읽기 전용 대조 → 적용 → 적용 후 행수·제약 재확인 순서를 지킨다.
  운영 데이터 삭제는 연습 실행·삭제 건수 상수 고정·교차 감사·백업 JSON 절차를 거친다(D-4 선례).
- **백업 파일**: 백업 JSON 에 학생 답안·보고서가 들어가면 `evidence/` 에 두되
  `.gitignore` 로 추적에서 제외한다(E-3 선례). id·날짜만 든 백업(D-4)은 커밋 가능하다.

## 4. 되돌릴 자리

git 이 유일한 되돌림 지점이다. 커밋 단위를 작게 끊고, 저장 지점 해시를
루틴 로그에 적는다.

커밋하지 않는 미커밋 잔여물(도구가 만드는 것들, 작업 산출물이 아니다):
`.agents/`, `.claude/`, `skills-lock.json`, `docs/.pdca-snapshots/`,
`docs/.bkit-memory.json`.

## 5. 쓰는 사람

학생, 학부모, 지점장, 총괄 관리자. 넷 다 화면이 다르고 권한이 다르다.
화면을 고칠 때는 네 입장 중 누구의 화면인지 먼저 정한다.

## 6. 이미 있는 규칙

- `~/.claude/CLAUDE.md`: 브레인(설계·검증) / 실행자(구현) 분업. 실행자 보고는
  의도이지 결과가 아니므로 브레인이 `git log`·`git status`·diff 로 직접 확인한다.
- `DESIGN.md` 12장: 게이트. 서버·클라이언트 타입체크 각 0, `vitest run` 통과,
  하드코딩 hex 0. 커밋마다 원문으로 확인한다.
