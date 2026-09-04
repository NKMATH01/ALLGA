# olga-hardening — 2,000명 규모 대비 강화 계획

- **Feature**: olga-hardening
- **착수**: 2026-08-21
- **최종 갱신**: 2026-08-22 (Wave 10 커밋 마감 반영)
- **선행 사이클**: olga-system-v2 (Match Rate 90%, `docs/04-report/olga-system-v2.report.md`)
- **근거**: Claude × Codex 토론 합의 — **성적 무결성 최우선**
- **현재 HEAD**: `e720de5` (원격 미반영, `main...origin/main [ahead 19]`)

---

## 1. 배경

직전 사이클은 "설계 대비 정합성"을 목표로 했고 90%로 마감했다.
이번 사이클의 전제는 다르다. **사용자 2,000명 규모에서 실제로 견디는가**이다.

두 가지 특성이 설계를 지배한다.

- **버스트 트래픽**: 시험은 특정 시간대에 동시 시작·동시 제출된다. 평시 부하가 아니라 순간 피크가 기준이다.
- **성적은 되돌릴 수 없다**: 답안 유실·중복 제출·경합으로 인한 점수 오류는 사후 복구가 사실상 불가능하다. 성능보다 무결성이 앞선다.

착수 시점의 코드는 단일 사용자 흐름을 가정한 지점이 남아 있었다. 자동저장과 제출이 사전 조회 후 UPDATE 하는 read-then-write 구조라 동시 요청에 취약했고, `exam_attempts` 에 (학생, 배포) 유일성 제약이 없어 중복 응시 레코드가 생길 수 있었다. 이 둘은 Wave 1 에서 해소했다.

---

## 2. 실행 이력 (Wave 1 ~ 10)

착수 당시 계획은 Wave 4 까지였으나 실행은 Wave 10 까지 갔다. **아래는 계획이 아니라 실제로 커밋된 결과의 기록이다.**

> **번호 충돌 주의.** 최초 계획서의 "Wave 4 = 운영"과 실행상의 "Wave 4a = 자동저장·터치 타깃"은 서로 다른 것이다. 이 문서에서는 **실행 번호를 정본으로 삼고**, 최초 계획의 운영 항목은 3장(남은 일)로 옮겼다.

### Wave 1–2 — 무결성·권한·핫패스 · `627d86d`

| 항목 | 결과 |
|---|---|
| 자동저장 원자화 | `PUT /exam-attempts/:id` UPDATE 에 `isNull(submittedAt)` 조건, 0행이면 400 |
| 제출 멱등·원자화 | submit 최종 UPDATE 에 동일 조건, 0행이면 409 (더블클릭 대비) |
| 응시 시작 중복 방지 | `exam_attempts` UNIQUE(student_id, distribution_id) 마이그레이션 |
| 권한 구멍 2건 | parent 응시 조회 fallthrough 차단, 시험 시작 시 배포 대상·기간 검증 |
| 핫패스 | 근거 기반 복합 인덱스 7종, `/my-exams` N+1 배치화, 보고서 존재확인 projection |
| 커넥션 예산 | 앱 max 10 + 세션 max 5 명시 |

### Wave 3 — AI 보고서 큐·모바일 요약 · `9f7e9d1`

생성 큐(동시 2 worker, attempt 중복 잠금, queued/processing/done 폴링 계약), `GET /reports/:id/summary` + 모바일(<768) 요약 화면, `StatValue` 공통 컴포넌트로 거짓 0 제거(스켈레톤/에러/성공 3분리), 모바일 사이드바 초기값 뷰포트 분기, PII 디버그 로그 제거.

### Wave 4a–10 — 관리 화면 재편 · `d11a777` `752e892` `944ae9b` `743cef7` `e720de5`

> 아래 Wave 구분은 커밋 diff 와 `design-migration/wave*.png` 캡처 산출물을 근거로 정리한 것이다. 작업 중 Wave 단위 기록을 남기지 않아 사후 재구성했다.

| Wave | 내용 | 검증 산출물 |
|---|---|---|
| 4a | 시험 자동저장 화면 반영, 터치 타깃 390px 보정 | `wave4a-exam-autosave.png`, `wave4a-touch-390.png` |
| 5 | 학생 관리 화면 (데스크톱·모바일·폼 모달·회귀) | `wave5-students-*.png` (4) |
| 6 | GNB 요약, 관리 탭, 모바일 드로어, 학생 선택 상태 | `wave6-*.png` (4) |
| 7 | 답안 상세 패널 (O/X 수동 채점 분기 포함), 응시 이력 목록 | `wave7-*.png` (4) |
| 8 | 학생 헤더 요약 지표, 이력 행 액션 | `wave8-*.png` (4) |
| 9 | 반 관리, 배포 생성·목록, 보고서 섹션 | `wave9-*.png` (5) |
| 10 | 반-학생 배정 | `wave10-class-students.png` |

**Wave 를 가로지른 공통 작업**

- `vitest` 도입 (`npm test`), 채점 조합 단위 테스트 37건
- `server/utils/logger.ts` 이벤트 키 기반 구조적 로깅으로 라우트 전반 교체 (PII 미포함)
- `GET /health` — DB 장애 시에도 200 + `db:'down'`. 앱 생존과 의존성 상태를 분리해 알린다
- 채점 로직을 `helpers.gradeAnswers` 로 공용화 (온라인 제출 / 지점 O·X 수동 채점 단일 경로)
- 반 목록 학생 수 집계 N+1 제거 (leftJoin + GROUP BY), 반-학생 조회 API 추가
- `useModalA11y` 로 모달 포커스 트랩·Esc·aria 공통화
- DESIGN.md **11장(관리 화면 Operate 문법)** · **12장(검증 프로토콜)** 신설

**마감 검증 (2026-08-22, exit code 원문)**

```
npx tsc -p tsconfig.server.json --noEmit   → EXIT=0
npx tsc -p tsconfig.json --noEmit          → EXIT=0
npx vitest run                             → 2 files / 37 tests passed
```

---

## 3. 남은 일

### 3.1 성능 잔여 (최초 계획 Wave 2 의 미완분)

2026-08-22 코드 재확인 결과다. 계획서 착수 시점의 추정("attempts.ts 2곳, distributions.ts 1곳")과 실제 위치가 다르다.

| 항목 | 현재 상태 |
|---|---|
| `attempts.ts` `/branch/completed` 보고서 존재확인 | **해소.** 응시 건마다 직렬로 돌던 `aiReports` 조회를 `attemptId` `inArray` 단일 조회로 묶고 `{id, attemptId}` 만 projection 했다(`htmlContent` 가 행마다 실려오던 것도 함께 제거). `server/routes/attempts.ts:664` |
| `distributions.ts` 목록 상위배포 조회 | **해소.** 행마다 돌던 `parentDistribution` 조회를 id 중복 제거 후 `inArray` 단일 조회 + Map 매핑으로 바꿨다. 참조가 끊긴 경우의 `null` 처리는 그대로다. `server/routes/distributions.ts:56` |
| `distributions.ts` `/:id/students` 응시·보고서 조회 | **해소.** 학생마다 `examAttempts` 를 조회하고 제출 건은 다시 `aiReports` 를 조회해 학생 N명에 최대 2N 회 왕복이 났다. `studentId` `inArray` 로 응시 1회 + 제출 attempt id `inArray` 로 보고서 1회, 총 2회로 고정했다. 행 조립은 `buildDistributionStudentRow` 로 빼 배치 엔드포인트와 공유한다. `server/routes/distributions.ts:472` |
| `BranchDashboard` 전 배포 학생 조회 요청 N건 | **해소.** 대시보드가 배포마다 `/distributions/:id/students` 를 불러 배포 D개에 요청 D건이 나갔다. `GET /api/distributions/students` 배치 엔드포인트를 신설(라우트는 `/:id` 보다 **위**에 등록해야 한다)해 요청을 1건으로 줄였다. 항목 모양은 `{distribution, exam, students}` 로 동일해 호출부 12곳은 그대로다. 대신 배포 1건 실패를 `catch → null` 로 삼키던 동작이 사라져 이제는 쿼리 전체가 `allDistError` 경로로 간다(일부가 조용히 "학생 없음"으로 보이는 것보다 낫다). `client/src/pages/BranchDashboard.tsx:205` |
| `/my-exams` 루프 | **해소 확인.** `attempts.ts:63, 101` 의 루프는 쿼리를 돌지 않는 메모리 연산이다. 대상·반·응시·보고서를 각각 `inArray` 로 한 번씩 조회한 뒤 Map/Set 으로 조립한다 (Wave 1–2) |
| 목록 페이지네이션 | **미착수, 결정 필요.** `/branch/completed` 는 지점의 제출 건을 **전량** 반환한다(limit 없음). 페이징은 응답 계약이 바뀌어 화면도 함께 고쳐야 하므로 별도 판단이 필요하다. `reports.ts` 에는 목록 엔드포인트 자체가 없다(단건·요약·생성만) |
| 세션 스토어 부하 | **해소.** `connect-pg-simple` DB 스토어 사용, 커넥션 예산 명시 완료 |

### 3.2 운영 (최초 계획의 "Wave 4", 사용자 결정 필요)

- 전화번호 초기 비밀번호 데이터 이전 — 현재 `students.ts:159` 에서 전화번호를 username 으로 쓴다
- F011 알림(P2) 착수 여부
- v2 (Next.js + Supabase) 마이그레이션 재결정

### 3.3 저장소

- **push 여부** — 로컬이 `origin/main` 보다 19 커밋 앞서 있다. 아직 원격에 올리지 않았다
- `.agents/` · `.claude/` · `skills-lock.json` 을 `.gitignore` 에 등재할지 (현재 미추적 방치)
- **(2026-09-04 갱신)** 위 "19 커밋" 은 착수 시점의 기록이다. 현재 `origin/main` 은 `819b7d9`, 로컬 HEAD 는 이 문서 커밋 직전 기준 `4c2f6dc` 다. 미push 커밋 수는 `git status -sb` 로 확인한다. 원격에는 여전히 올리지 않았다

### 3.4 전체 점검(2026-09-04) 결함 수정 현황

`docs/03-analysis/olga-full-audit-2026-09-04.md` 가 확정한 높음 11건, 중간 4건(권한·감사), 중간 9건(화면·요청 마감)을 수정해 커밋했다. 높음 11건과 중간 4건은 push 했고(`origin/main` = `d45d54d`), 화면·요청 9건은 push 했고(`origin/main` = `1fe177b`), 데이터 구조 5건(D-1·D-2·D-5·D-6·D-7)은 아직 push 하지 않았다.

| ID | 결함 | 커밋 | 검증 수준 |
|---|---|---|---|
| S-1 | 학생 제출·자동저장 `_gradingMode` 주입 | `a02e956` | 단위 테스트(37→45, 주입 케이스 포함) + 코드 |
| P-1 | 정답키 노출 → `/exams*` requireAdminOrBranch + `GET /exam-attempts/:id/review` 신설 | `0602575` | **런타임**: 학생 세션 `GET /api/exams/:id` 403, 제출본 `/review` 200(+correctAnswer), 작성 중 `/review` 403, 오답 모달 해설 표시 |
| S-2 | branch-grade 제출본 덮어쓰기 → 409 + `isNull(submittedAt)` + 총점 가드 | `65de505` | 코드(쓰기 경로라 런타임 미실행) |
| P-3 | `POST /parents` 지점 검증 + 트랜잭션, `validateStudentsInBranch` → `server/utils/branchScope.ts` | `664c96a` | 코드 |
| U-1 | 시험 수정 폼 필드명 1:1, 원본 보존, NaN 차단, label 6개 연결 | `68955f8` | 코드(핸들러 name 7개 = 렌더 입력, `category_` 0건). DOM 재확인은 브라우저 도구 멈춤으로 미실시 |
| U-4 | PUT /distributions/:id startDate/endDate 수용(KST 검증), 클라이언트 전송, 모달 기본값=기존 기간 | `91496c2` | **런타임**: 모달 기본값 `2025-11-18T01:44`(=UTC 16:44+9h), 오늘 아님 |
| U-3 | 보고서 보기 `/api/reports/` (동기 `openReportWindow` 3곳) | `1444cb2` | **런타임**: `window.open('/api/reports/9e7e48a8-…')` 캡처 |
| U-5 | 드로어 a11y 를 `panelOpen` 에 배선(`panelIsDialog`), 죽은 `sidebarOpen` 제거 | `e06fca7` | 코드. 375px 런타임은 도구(hidden pane 에서 키 입력 미도달·에뮬레이션 멈춤)로 미실시 |
| U-6 | 로딩 3상태(`components/ui/list-state.tsx`), 학생 19·지점 21·관리자 9곳, 관리자 isLoading 구독 | `f337c3d` | **런타임**: 지점 로딩 중 `role=status` 스켈레톤 4~6개·"없습니다" 0, 로드 후 스켈레톤 0; 학생 화면 로드 후 거짓 문구 0 |
| S-3 | 답안 복원 실패 → 오류+재시도, `answersBlocked` 로 입력·저장·제출 차단 | `36b60cf` | 코드(실패 주입 불가) |
| S-4 | `exam_distributions.target_kind` 컬럼+CHECK+백필, 순수 함수 2개로 판정 단일화, POST 트랜잭션, 테스트 45→61 | `4c2f6dc` | **런타임**: 배치 `/distributions/students` 3건·33행·전부 branch(수정 전 33행과 동일), `/my-exams` 3건. **운영 DB 마이그레이션 0007 적용 완료(2026-09-04, 사용자 승인)**: `__drizzle_migrations` 8건, 52행 전부 `branch`, CHECK 존재, 행수 52/20/30/12/0/10 불변 |
| P-5 | 역할 미들웨어 4개를 `requireRole` 생성기로 통일(세션 없음 401·역할 불일치 403), `GET /students/me` 도 같은 분리 | `846e404` | **런타임**: 미인증 `GET /api/distributions`·`/admin/stats`·`/students`·`/exams`·`/students/me` 전부 401, 지점장 세션 `/api/admin/stats`·`/api/branches` 403. 신설 `server/middleware/auth.test.ts`(describe.each 로 미인증·역할별·허용)로 vitest 3파일 61건 → 4파일 83건 |
| P-6 | `logImpersonation` actor 와 impersonate 3경로 target 에서 `username` 제거(id·role 만) | `09aa2d3` | **런타임**: 서버 stdout `[AUDIT][impersonation]` 2줄(impersonate_student·impersonate_restore)에 `username` 0건, actor·target 은 id·role 만 |
| P-2 | `GET /distributions/:id` 지점 스코프. 타 지점은 403 아닌 404(존재 열거 오라클 차단), admin 은 제한 없음 | `42a70bd` | **런타임**: 지점장(allga1) 타 지점 배포 `72c94503-…` 404, 자기 지점 배포 `7bee1029-…` 200 |
| P-4 | 클라이언트 학생 전환을 `POST /auth/impersonate/student/:id` 로 교체, `POST /students/:id/login-as` 라우트 제거, `App.tsx` 가 버리던 `/auth/me` 의 `originalUser` 병합, `RestoreIdentityButton` 신설(학생·학부모 사이드바 푸터) | `320ad43` | **런타임**: `login-as` 404, impersonate 후 `user.role=student`·`originalUser.role=branch`, `/auth/me` 도 동일, `restore` 200 후 role=branch |
| U-7 | 관리자 배포 목록 지점 열 UUID → `GET /distributions` 응답에 `branchName` 추가(branchId 중복 제거 후 `inArray` 1회), 화면은 `branchName ?? branchId` | `2c50f2c` | **런타임**: admin `GET /api/distributions` 52행 전부 `branchName` 존재·null 0, 표본 `branch-songdo → 송도지점`, 기존 키 8개(id·examId·branchId·startDate·endDate·targetKind·exam·parentDistribution) 보존 |
| U-2 | 오답 모달이 `commentary` 만 읽어 현 파서의 `explanation` 해설이 "제공되지 않았습니다"로 표시 → 두 키 폴백 | `2c50f2c` | 코드(`explanation || commentary`, reports.ts 와 같은 폴백) |
| U-9 | `AIReportButton` 마운트마다 `GET /reports/attempt/:id` → `/my-exams` 의 `hasReport` 를 prop 으로 받아 초기 상태 결정, useEffect 삭제 | `401411f` | 코드: StudentDashboard 에서 `reports/attempt` GET 호출 0건(grep) |
| U-8 | 404 외 오류에서 `'checking'` 고착 → 호출 자체가 사라져 `'checking'` 상태·분기 제거 | `401411f` | 코드(원인 제거, `'checking'` 유니온 삭제) |
| U-10 | 지점 진입마다 미사용 `GET /branch-students/stats` → `useQuery` 블록 삭제(키 소비자 0 확인) | `401411f` | 코드(grep `branch-students/stats` 클라이언트 0건) |
| U-11 | 보고서 새 창이 await 뒤 `window.open` 으로 차단 → `openReportWindowSync` 로 클릭 동기 구간에 창 확보, `openFullReport(ref, win)`, 실패 시 `win.close()`. 호출부 학생·학부모·지점 3곳 + 요약 모달 1곳 | `2a28098`, `dc0ae42` | 코드(호출 4곳 전부 `win` 전달, 요약 뷰 경로는 창 안 열음). 실브라우저 팝업 재현은 미실시 |
| U-12 | 학생 `<h1>` 2개·학부모 0개 → 사이드바 브랜드 `<p>`, 학부모 상단 제목 `<h1>` | `0a5e03c` | grep: 네 대시보드 실제 `<h1>` 요소 각 1(Admin 의 추가 2건은 주석 문자열) |
| U-13 | 보고서 배포 카드 `div onClick` → `role="button" tabIndex=0 onKeyDown(Enter·Space)` + aria-label, 삭제 아이콘 버튼 aria-label | `0a5e03c` | 코드. 같은 파일의 다른 아이콘 버튼은 텍스트 라벨 동반이라 대상 없음 |
| U-19 | `BranchDashboard` `console.log` 16줄(학생 객체·답안, 3줄은 매 렌더) 삭제 | `0a5e03c` | grep: `client/src/pages`·`client/src/lib` 의 `console.log` 0건 |
| D-6 | 학생 등록 users→students INSERT 비트랜잭션(실패 시 고아 users·username 점유) → `db.transaction`, 동시 중복은 23505 → 400 | `ef84fbe` | 코드(parents.ts 와 같은 패턴) |
| D-7 | 0005 `ADD CONSTRAINT` 무가드 → `DO $$ … EXCEPTION WHEN duplicate_object OR duplicate_table` 가드 | `d85dfd4` | 코드. 마이그레이터는 created_at 만 비교하므로 적용된 운영 DB 에 영향 없음 |
| D-1 | `users.branch_id` FK 없음 → `REFERENCES branches(id) ON DELETE SET NULL`(스펙의 CASCADE 대신, 지점 삭제 시 계정을 비활성으로 남기는 설계와 일치) | `bee869f` | **운영 DB 0008 적용**: `pg_constraint` 에 FK 실존, 고아 0 |
| D-2 | 중간 테이블 UNIQUE 없음 → `student_classes(student_id,class_id)`·`student_parents(student_id,parent_id)` UNIQUE, 반 생성 시 studentIds 중복 제거 | `bee869f` | **운영 DB 0008 적용**: UNIQUE 2개 실존, 중복 0 |
| D-5 | `updated_at` 미갱신 → users·branches `$onUpdate(() => new Date())` | `bee869f` | 코드(SQL 변화 없음) |

정적 확정만 된 항목(S-2·P-3·U-1·U-5·S-3)의 런타임 확인은 다음 기회에 한다.

미수정으로 남은 중간·낮음 결함(D-4, D-8, U-14~U-18, U-20, U-21, R-1~R-3)은 보고서 §4 를 참조한다. D-4(16지점 × 2건 동일 배포)는 데이터 삭제라 별도 결정으로 남겼다.

중간 4건 수정 뒤에도 남은 항목 2건을 기록한다. `server/routes/attempts.ts:733` 의 `GET /api/branch/completed`(클라이언트 호출 0건인 죽은 엔드포인트)는 인라인 검사라 미인증 요청에 여전히 403 을 낸다. P-5 의 미들웨어 범위 밖이다. `PUT /distributions/:id` 는 타 지점 배포에 404 가 아닌 403 을 내므로 존재 열거 오라클이 남아 있다(쓰기 전에 끊기므로 부작용은 없다). 묶음 F 뒤 새로 관찰된 접근성 항목 1건: `BranchDashboard` O/X 수동 채점 컨트롤이 시각적으로 숨긴 radio + 아이콘만 든 label 이라 접근 가능한 이름이 없다(U-13 범위 밖, 미수정).

---

## 4. 성공 기준

| 기준 | 측정 | 상태 |
|---|---|---|
| 동시 제출로 점수가 덮이지 않는다 | 같은 attempt 이중 submit → 두 번째 409 | 달성 (Wave 1) |
| 제출 후 답안이 변경되지 않는다 | 제출 완료 attempt 에 PUT → 400 | 달성 (Wave 1) |
| 중복 응시 레코드가 생기지 않는다 | UNIQUE 제약 존재 + 재시작이 기존 레코드 반환 | 달성 (Wave 1) |
| 권한 경계가 새지 않는다 | parent 가 타 학생 attempt 조회 → 403 | 달성 (Wave 1) |
| 모바일 첫 화면이 가려지지 않는다 | 390px 진입 시 사이드바 닫힘 | 달성 (Wave 3·4a) |
| 채점 규칙이 두 경로에서 갈리지 않는다 | 온라인·O/X 가 같은 함수를 쓴다 + 단위 테스트 | 달성 (Wave 4~10) |
| 로그에 학생 개인정보가 남지 않는다 | 구조적 로그의 필드에 이름·답안·전화 없음 | 달성 (Wave 3·4~10) |
| 회귀 없음 | 서버·클라이언트 `tsc --noEmit` EXIT=0, `vitest run` 통과 | 달성 (2026-08-22) |
| 목록 조회가 행 수에 비례해 느려지지 않는다 | 배포 목록 쿼리 수가 행 수와 무관 | **미달성** (3.1 참조) |
| 학생이 채점 메타키로 점수를 위조할 수 없다 | 제출 body 에 `_gradingMode` 가 있으면 400 | 달성 (`a02e956`, 테스트) |
| 학생·학부모가 정답키를 조회할 수 없다 | 학생 세션 `GET /api/exams/:id` → 403 | 달성 (`0602575`, 런타임) |
| 배포 대상이 비어도 전원 공개로 승격되지 않는다 | `target_kind` 컬럼 + 순수 함수 판정 | 달성 (`4c2f6dc`, 런타임 파리티) |

---

## 5. 제약

- 마이그레이션 대상은 실서버(Neon)다. 스키마 변경 전 **중복 현황 조회를 선행**하고, 중복이 있으면 적용하지 않고 보고한다.
- 기존 디자인 토큰 체계(DESIGN.md)와 iteration 1~4 의 수정 로직은 보존한다.
- 빌드는 Node 22 LTS 에서 수행한다(Node 24 는 `vite build` 크래시).
- 실행자의 "검증 통과" 보고는 신뢰하지 않는다. **exit code 원문**으로 재확인한다. 서버는 `tsconfig.server.json` 이다(`tsconfig.json` 은 client 전용 include).
