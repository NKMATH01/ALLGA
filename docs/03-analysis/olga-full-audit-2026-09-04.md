# 올가 미수등 시스템 전체 점검 보고서 (결과물 · 데이터 구조 · 기능)

- **점검일**: 2026-09-04
- **대상**: HEAD `399e9fc` (`origin/main` = `819b7d9`, 2커밋 미push), 운영 DB Neon `ep-winter-field-…ap-southeast-1` (읽기만)
- **방식**: 읽기 전용 탐색 에이전트 3개(스키마·서버·클라이언트)의 보고를 **점검자가 파일:행을 직접 열어 재확인**한 것만 결함으로 채택. 런타임은 실서버(5000)·실클라이언트(5173)에서 GET·세션 전환만 수행. 응시 시작·자동저장·제출·채점·삭제·보고서 생성 등 **상태를 바꾸는 API는 한 번도 호출하지 않았다.**
- **기준선**: `docs/03-analysis/olga-system-v2.analysis.md` (Critical 7 · Major 18 · Match Rate 90% 마감), `docs/02-design/api-spec.md`, `data-model.md`, `DESIGN.md` 12장·부록.
- **코드 변경**: 없음. 이 문서 1개가 유일한 산출물. 종료 시 `git status`는 시작 시점과 동일(추적 파일 변경 0).

---

## 1. 건강 판정 보드

판정 규칙: **위험** = 높음 결함 1건 이상 / **주의** = 중간 결함 1건 이상 또는 미검증 30% 초과 / **양호** = 그 외.

| 축 | 판정 | 결정 근거 | 가장 심한 결함 |
|---|---|---|---|
| 성적 무결성 (채점·제출·자동저장) | **위험** | 학생이 제출 body 한 줄로 만점 위조 가능(정적 확정). 지점 채점이 제출본을 덮어씀. 답안 복원 실패 시 기존 답안 소실 | S-1 `_gradingMode` 주입 |
| 권한 경계 (지점 스코프·역할·정답 노출) | **위험** | 학생 세션에서 정답키 GET 200 **런타임 재현**. 지점장이 타 지점 배포 조회 200 **런타임 재현**. 학부모 등록 API가 타 지점 학생 링크 허용 | P-1 정답키 노출 |
| 데이터 정합 (스키마↔DB↔스펙, 고아·인코딩) | 주의 | 스키마=마이그레이션=운영 DB 완전 일치, UNIQUE 5·인덱스 7 실존, 고아 0, U+FFFD 0. 그러나 `users.branch_id` FK 없음, 중간 테이블 UNIQUE 없음(스펙에는 있음), 배포 52건 전부 "지점 전원 공개"이고 16개 지점에 동일 배포 2건씩 중복 | D-3 배포 대상 의미론 |
| 빌드·기동·의존성 | 양호 | `npm run build` EXIT=0(Node 22.23.2), `vitest` 37/37, `/health` `{"ok":true,"db":"up"}`, tsc 서버·클라 0 | (낮음) 751kB 단일 청크, `engines` 강제 수단 없음 |
| 화면·지면 헌법 (DESIGN.md 12장·부록, 보고서 10장) | **위험** | 시험 수정 폼이 존재하지 않는 필드를 읽어 편집 유실(런타임 DOM 확인). 지점내 배포 모달 기간 입력 무효. 보고서 보기가 SPA 404 경로(런타임 캡처). 모바일 드로어 Esc 무반응(런타임 재현). 로딩 중 "없습니다" 확정 문구(런타임 재현) | U-1 시험 수정 편집 유실 |

**한 줄 요약**: 토큰·타입·빌드·스키마처럼 **기계가 지켜주는 층은 건강**하고, **사람이 짠 경계(권한·입력 검증·필드명 계약)에 높음 결함 11건**이 몰려 있다. 그중 3건(S-1, P-1, P-2)은 운영 DB에서 지금 재현 가능하다.

(2026-09-04 수정 후) 높음 11건 전부 수정 커밋됐다. §10 을 참조한다. 판정 보드는 점검 시점 기준을 그대로 둔다.

---

## 2. 커버리지 지도

| 사용자 흐름 | 검증 수준 | 내용 / 미검증 사유 |
|---|---|---|
| 로그인·세션 | 런타임 | admin 1회 + branch 2회 로그인(예산 10/15분, `RateLimit: limit=10, remaining=9`). 미인증 401/403 5경로 확인 |
| 지점 학생·반·배포 관리 | 런타임(조회·모달 열기) | 4뷰 전환, 학생 관리·배포·보고서 섹션, 지점내 배포 모달 DOM. **저장·삭제는 미실행** |
| 응시 시작 → 자동저장 → 제출 | 정적 + 오프라인 | 조건부 UPDATE·409·`onConflictDoNothing` 코드 확인, vitest 37건(채점 분기·조건부 UPDATE 규칙·등급 컷·KST), UNIQUE 제약 운영 DB 실존 확인. **POST/PUT은 미실행(쓰기)** |
| 지점 수동 채점 | 정적 | `branch-grade`·`branch-create` 코드 검토만 |
| 보고서 생성 | **미검증** | Gemini 비용 + DB 쓰기. 큐 코드(`finally` 해제·메모리 큐)는 정적 검토 |
| 보고서 열람 | 런타임 + 오프라인 | 지점 "보고서 보기" 경로 캡처, 학부모 데스크톱 팝업 경로, 학생 요약 GET 4건. 템플릿 오프라인 렌더(XSS·참고치 없음·등급 없음) |
| 학부모 열람 | 런타임 | impersonate → 자녀 1명·성적 3건·복귀 |
| 관리자 배포·시험 | 런타임(조회) | 배포 목록 20행/쪽 페이저, 시험 상세→수정 모달 입력 320개 DOM. **생성·업로드 미실행** |

---

## 3. 영역별 결과표

### A. 데이터 구조

| 항목 | 판정 | 근거 |
|---|---|---|
| 스키마 ↔ 마이그레이션 ↔ 운영 DB | 통과 | `_journal` 7항목 = `drizzle.__drizzle_migrations` 7행(id 1~7, 마지막 2건 2026-08-21). `pg_constraint`: `exam_attempts_student_distribution_unique` 존재. 인덱스 7개 전부 존재 |
| UNIQUE 5개 (스펙 §5.2) | 통과 | users.username, students.user_id, parents.user_id, ai_reports.attempt_id, exam_attempts(student,distribution) |
| 스펙에 있고 구현에 없는 제약 | **미달** | `student_parents(student,parent)`·`student_classes(student,class)` UNIQUE 없음(data-model:195,214). `users.branch_id` FK 없음(§5.1 CASCADE 미충족). 현재 중복 쌍 0, 고아 0 |
| 실데이터 무결성 | 통과 | 제출됐는데 score null 0 / role=student인데 students 없음 0 / U+FFFD 9컬럼 0(반 이름 복구 후 잔여 없음) |
| 배포 대상 의미론 | **미달** | 52건 전부 `ALL_BRANCH`(class_id null + distribution_students 0행). "지정 0명"과 "전원"이 같은 상태 |
| 중복 배포 | 주의 | 동일 제목·기간 배포가 **16개 지점에 각 2건** — 일괄 배포가 두 번 실행된 흔적 |
| `updated_at` | **미달** | users 30/30 `updated_at == created_at`. `$onUpdate` 없음 |
| JSON 계약 | **미달** | `questions_data` 생산 3경로가 다른 키(`number`/`questionNumber`, `score+points`/`points`, `explanation`/`commentary`) → U-2·S-5 |
| 커넥션 예산 | 통과 | 앱 max 10(`db/index.ts:20`) + 세션 max 5(`index.ts:56-59`) |
| **읽기 전용 세션 강제** | **실패(방법론)** | `connection:{default_transaction_read_only:'on'}`이 Neon 풀러에서 무시됨(`show` 결과 `off`). 실행한 문장은 SELECT와 `where false` UPDATE 1건뿐이라 피해 없음. 향후 `sql.begin(tx => tx\`set transaction read only\`)`로 대체 |

### B. 서버 기능·권한

| 항목 | 판정 | 근거 |
|---|---|---|
| 라우트 전수 | 59 + `/health` | 마운트 `index.ts:98-108`. `students.ts`가 `/api/students`와 `/api/branch-students`에 **이중 마운트** |
| 미인증 응답 코드 | **미달** | `requireAuth`만 401. `requireAdmin`/`requireBranchManager`/`requireAdminOrBranch`/`requireStudent`는 세션 없음도 **403**(`middleware/auth.ts:26-52`). 런타임: `/api/distributions`, `/api/admin/stats`, `/api/students` 미인증 → 403. 스펙 §12 UNAUTHORIZED=401 위반, 클라이언트 401 인터셉터가 세션 만료를 못 잡음 |
| 역할 경계 | 통과 | 학생 세션 `/students`,`/classes`,`/admin/stats`,`/distributions` 403. 지점 세션 `/admin/stats`,`/branches` 403. admin `/distributions/students` 403 |
| 지점 스코프 | **미달** | P-2 `GET /distributions/:id` 타 지점 200 (런타임). P-3 `POST /parents` 지점 미검증 |
| 정답키 보호 | **미달** | P-1 (런타임: 학생 `GET /api/exams/4fc68bc4…` → 200, `correctAnswer` [2,3,4]). 대조: `/my-exams/:id`는 정답 제거 ✅ |
| 성적 무결성 방어 | 부분 | 자동저장 `isNull` UPDATE(`attempts.ts:497-500`) ✅, 제출 409(`:608-613`) ✅, 시작 `onConflictDoNothing`(`:431-433`) ✅ / `branch-grade` 조건 없음(S-2), `_gradingMode` 미차단(S-1), `branch-create` check-then-insert(S-6) |
| 채점 단일 경로 | 부분 | 라우트는 `gradeAnswers` 2곳만 ✅ / 판정식 복제 3벌(S-5) |
| 보고서 큐 | 통과(설계 한계) | `finally`에서 슬롯·잠금 해제(`reports.ts:314-318`) → 고착 없음. 메모리 큐·상태 컬럼 없음·90초 폴링은 한계로 기록(R-2) |
| 라우트 순서 | 통과 | 실운영 충돌 없음. `reports.ts` `/attempt/:id`가 `/:reportId/summary` 아래(UUID라 무해, 낮음) |
| 죽은 엔드포인트 | 12개 | §7 참조. `/api/branch/completed`(주석은 `/api/exam-attempts/…`로 오기; 후자는 404) |
| 헬스·빌드·테스트 | 통과 | `{"ok":true,"db":"up"}`, BUILD_EXIT=0, 37/37 |

### C. 클라이언트 결과물

| 항목 | 판정 | 근거 |
|---|---|---|
| hex 0건 | 통과(주석 1) | DESIGN.md 12장 명령 그대로 실행 시 `BranchDashboard.tsx:3469` 주석 안 `#FFF` 1건 매치 → 코드 0건. 12장 명령이 주석을 거르지 못함(낮음) |
| em/en-dash·이모지 | 통과 | 클라이언트·DESIGN.md 0건 |
| tsc | 통과 | 서버 0 / 클라이언트 0 |
| 375px 가로 스크롤 | 통과 | 지점·학생 `scrollWidth-clientWidth = 0` |
| 그라디언트 0 | 통과 | 5화면 전부 0 |
| 자동 애니메이션 | 통과 | 로딩 후 `getAnimations().running = 0` (로딩 중 스켈레톤만) |
| 본문 그린 ≤2 | 통과 | admin 0 / branch 0 / student 1 / parent 1. 크롬 2(1.3 개정 기준) |
| `[role=dialog]` aria-modal | 통과(커스텀) | 커스텀 모달 전부 `aria-modal=true`. Radix 오답 모달은 `aria-modal` 미설정(낮음) |
| `<h1>` 1개 | **미달** | admin 1 ✅ / branch 1 ✅ / **student 2**("ALLGA","안녕하세요…") / **parent 0** |
| 아이콘 버튼 라벨 | **미달** | 지점 보고서 섹션 카드의 삭제 아이콘 버튼 3개 라벨 없음(런타임). 헤더 아이콘 버튼은 aria-label 있음 ✅ |
| 키보드 접근 | **미달** | 보고서 섹션 배포 카드 = `DIV` onClick, role/tabindex 없음(런타임) |
| 폼 라벨 연결 | **미달** | 시험 수정 모달 `label` 6/6 `for` 없음(런타임 DOM) |
| 표 첫 열 sticky | **미달** | admin 표 sticky ✅ / branch 학생·응시·배포 표 및 parent 표 전부 `static`(런타임) |
| 관리 표 카드 감싸기 금지 (11.2) | **미달** | admin 4표·branch 보고서 표가 `shadow-xl` Card 안 |
| 모달 문법 (5.6) | **미달** | 닫기 버튼 없음(시험 상세·지점내 배포 등), 동작 버튼 순서 주→보조(`지점내 배포, 취소`), 제목이 h3 |
| 거짓 빈 상태 | **미달** | 학생 대시보드 로딩 7초 시점 "0회 응시 기준 / 배정 없음 / 아직 응시한 시험이 없습니다" → 11초 후 "75점 / 2회 / 최근 결과 2건"(런타임). KPI(StatValue) 11곳은 스켈레톤 ✅ |
| 모바일 드로어 | **미달** | 지점 375px: 열림 후 **Esc 무반응**(오버레이·드로어 그대로), 포커스 미이동, 스크롤 잠금 없음, 오버레이 클릭으로만 닫힘(런타임) |
| 터치 타깃 44px | 통과(경미) | 375px에서 44 미만 1개: 테마 토글 36×44 |
| 페이지네이션 | 통과(함수) | `paginate(45,3) → 20 3 5`, 쪽 초과 클램프, 빈 목록 1쪽. admin 배포 52건 페이저 렌더 ✅. **UI 21행+ 동작은 데이터 부재로 미검증**. 미부착: 응시 현황 드릴다운 배포별 표 |
| 콘솔 오류 | 통과 | 앱 자체 요청 중 4xx/5xx 없음(관측된 403은 점검자의 권한 프로브) |
| 다크 FOUC | **미달(정적)** | `index.html`에 선세팅 스크립트 없음, module script는 defer |
| 보고서 지면 오프라인 | 부분 | XSS 이스케이프 유지(`<img src=x` 미출현, `<` 존재) ✅ / 참고치 없음 → "기준 축적 중" 2회 ✅ / **등급 없음 → "0등급" 2회 인쇄**(R-1) |

---

## 4. 결함 목록

표기: **ID · 심각도 · 유형**(회귀/신규/기준선 잔존/드리프트) · 위치 · 재현/관측 · 영향 · 권장 조치. 심각도 정의 — 높음: 성적·권한·데이터 손실에 직접 닿음 / 중간: 오동작·오독·감사 결손 / 낮음: 규약·정리.

### 4.1 성적 무결성 (S)

| ID | 심각도 | 유형 | 위치 | 재현 / 관측 | 영향 | 권장 조치 |
|---|---|---|---|---|---|---|
| **S-1** | 높음 | 신규 | `attempts.ts:522-528,578` · `helpers.ts:96,104-105` | (정적) 제출은 `answers`가 객체인지만 검사. `gradeAnswers`는 `answers._gradingMode==='ox'`면 값이 1인 문항을 정답 처리. 학생이 `{"answers":{"_gradingMode":"ox","1":1,…}}` 제출 시 만점. 자동저장(`:499`)도 무검증. 클라이언트는 이 키를 **보내지 않음**(읽기만) | 성적 산출 무력화, 로그 흔적 없음 | 제출·자동저장 진입부에서 `_` 접두 키 거부(400) 또는 제거. `grading.test.ts`에 "학생이 넣었을 때" 케이스 추가 |
| **S-2** | 높음 | 신규 | `attempts.ts:782-786,814-816,820-832` | (정적) `branch-grade` UPDATE `.where(eq(id))`만. 제출 완료 사전 체크 없음. `maxScore<=0` 가드 없음 → NaN → `calculateGrade(NaN)`=9등급 | 학생 원본 답안 덮어쓰기(복구 불가), 조용한 9등급 | `isNull(submittedAt)` 조건 또는 명시적 재채점 플래그, `maxScore` 가드 |
| **S-3** | 높음 | 기준선 잔존(C5 부분 회귀) | `StudentDashboard.tsx:529-545,558-567` · `attempts.ts:497-500` | (정적) 복원 실패 시 `console.error` 후 로딩 해제 → 빈 답안지. 한 문항 선택 시 `saveAnswers`가 로컬 객체 통째 PUT, 서버는 `.set({answers})` 전체 교체 | 기존 답안 소실 | 복원 실패 시 오류 표시 + 자동저장 차단; 서버는 병합 또는 버전 검사 |
| S-4 | 높음 | 신규 | `attempts.ts:104-113` · `distributions.ts:193-221` | (정적+데이터) `classId` 없고 `distribution_students` 0행 = 지점 전원 공개. 배포 생성 비트랜잭션(`db.transaction` 0건, INSERT `:194`→`:220`). 운영 DB 52건 전부 `ALL_BRANCH` | 대상 지정 실패·CASCADE 시 조용히 전체 공개 | `target_kind` 컬럼 도입 또는 트랜잭션 + "빈 지정 = 아무도 아님" |
| S-5 | 중간 | 신규 | `reports.ts:169,173,416,426` vs `helpers.ts:104-109` | (정적) 보고서는 `q.correctAnswer`만(`answer` 별칭 무시)·`q.score \|\| 2`(points 무시). UI 생성 시험(`points`만)에서 영역 만점·평균이 채점과 어긋남 | 보고서 통계 오류 | 채점 판정·배점 조회를 `helpers`로 단일화 |
| S-6 | 낮음 | 신규 | `attempts.ts:742-761` | `branch-create` check-then-insert, `onConflictDoNothing` 없음 | 경합 시 500 | 학생 시작 경로(`:431`)와 동일 처리 |

### 4.2 권한 경계 (P)

| ID | 심각도 | 유형 | 위치 | 재현 / 관측 | 영향 | 권장 조치 |
|---|---|---|---|---|---|---|
| **P-1** | 높음 | 신규 | `exams.ts:57-69,96-114` | **(런타임)** 학생 세션 `GET /api/exams/4fc68bc4…` → 200, `questionsData[].correctAnswer = [2,3,4,…]`. 학생 화면이 오답 리뷰용으로 실제 호출(`StudentDashboard.tsx:190`) | 응시 전·중 정답 열람 | 학생·학부모용 리뷰 엔드포인트 분리(제출 후만, 본인 attempt 한정) |
| **P-2** | 중간 | 신규 | `distributions.ts:412-434` | **(런타임)** 지점(`branch-gangnam`) 세션 `GET /api/distributions/72c94503…`(branch-songdo) → 200, body `branchId:"branch-songdo"` | 타 지점 배포 메타 열람(IDOR) | `eq(branchId)` 조건 추가 (클라이언트 미사용 엔드포인트) |
| **P-3** | 높음 | 신규 | `parents.ts:156-159,197-200` | (정적) `POST /parents`가 `studentId` 지점 소속 미검증 → 타 지점 학생 링크 → `impersonate/parent` → `/parents/me/children/:id/attempts`·보고서 열람 | 교차 지점 성적·보고서 노출 연쇄 | `validateStudentsInBranch` 재사용(distributions/classes에는 있음) |
| **P-4** | 중간 | 기준선 잔존(Major #17 UI 경로) | `students.ts:417-462` vs `auth.ts:200-250,115-134` | **(런타임)** UI "학생 화면"(`login-as`) 클릭 후 `/auth/me` → `role:student, originalUser:null`; `restore` → **400 "복귀할 원래 계정 정보가 없습니다"**; 서버 stdout에 `[AUDIT]` 줄 **미기록**(auth 경로 전환 6건은 전부 기록됨) | 복귀 불가(재로그인 필요), 감사 추적 결손 | 클라이언트를 `auth/impersonate/student`로 전환하고 `login-as` 제거 |
| P-5 | 중간 | 드리프트 | `middleware/auth.ts:26-52` | **(런타임)** 미인증 `GET /api/distributions`·`/admin/stats`·`/students` → **403**. 스펙 §12 UNAUTHORIZED=401 | 클라이언트 401 인터셉터가 세션 만료를 못 감지 | 역할 미들웨어 진입부에서 세션 없음 → 401 |
| P-6 | 중간 | 신규 | `auth.ts:29-38` · `students.ts:159` | **(런타임)** `[AUDIT][impersonation] … "target":{"username":"010…"}` — 학생 username은 전화번호 | 감사 로그에 PII 평문(`logger.ts:12-13` 정책 위반) | target에서 username 제거, id만 |
| P-7 | 낮음 | 신규 | `index.ts:103,108` | `students.ts` 이중 마운트 → 모든 학생 라우트가 두 URL로 노출 | 공격면 2배 | `/branch-students` 마운트를 `stats` 전용으로 축소 |

### 4.3 데이터 정합 (D)

| ID | 심각도 | 유형 | 위치 | 관측 | 권장 조치 |
|---|---|---|---|---|---|
| D-1 | 중간 | 기준선 잔존(Major #10) | `schema.ts:13` | `users.branch_id` FK 없음(`pg_constraint` 확인). 스펙 §5.1 "지점 삭제 → 소속 사용자 삭제" 미충족. 현재 고아 0 | FK 추가 또는 스펙 수정 |
| D-2 | 중간 | 드리프트 | `schema.ts:69-84` vs data-model:195,214 | 중간 테이블 UNIQUE 없음. 앱 레벨 중복 체크만(`classes.ts:293-301`). 현재 중복 0 | UNIQUE 추가(0005처럼 중복 선조회 후) |
| D-3 | 높음 | 신규 | (S-4와 동일 뿌리) | 배포 52건 100% `ALL_BRANCH`, `distribution_students` 0행, `student_classes` 0행 | 대상 지정 기능이 실사용되지 않거나 저장되지 않음 — 운영 확인 필요 |
| D-4 | 중간 | 데이터 | 운영 DB | 동일 제목·기간 배포가 16지점 × 2건(2025-11-17 07:44:45.812Z 동시각) | 일괄 배포 스크립트 이중 실행 추정. 정리 여부 결정 필요 |
| D-5 | 중간 | 신규 | `schema.ts:16,29` | users 30/30 `updated_at==created_at`, `$onUpdate` 없음 | `$onUpdate(() => new Date())` |
| D-6 | 중간 | 신규 | `students.ts:177-199` | users INSERT → students INSERT 비트랜잭션 | 실패 시 고아 users + username 점유 | 트랜잭션 |
| D-7 | 낮음 | 신규 | `drizzle/0005` | `ADD CONSTRAINT` 무가드(0000~0002는 `DO $$`, 0006은 `IF NOT EXISTS`) | 재실행·중복 데이터 환경에서 체인 중단 |
| D-8 | 낮음 | 신규 | `schema.ts:165-177` 등 | 미사용 컬럼 `ai_reports.weak_areas/recommendations/expected_grade`, `exams.exam_file_url`, `classes.is_active`, `branches.is_active`; `student_parents` 인덱스 없음; `ai_reports.student_id/exam_id` 인덱스 없음 | 정리 |

### 4.4 화면·기능 계약 (U)

| ID | 심각도 | 유형 | 위치 | 재현 / 관측 | 영향 | 권장 조치 |
|---|---|---|---|---|---|---|
| **U-1** | 높음 | 신규 | `AdminDashboard.tsx:989-991` vs `:1060-1100` · `exams.ts:168-234` | **(런타임 DOM)** 수정 모달 입력 name 패턴 = `difficulty_N, domain_N, typeAnalysis_N, subcategory_N, explanation_N, correctAnswer_N, points_N` — **`category_N` 없음**. 핸들러는 `category_N`을 읽어 `null` 저장, `domain/typeAnalysis/explanation` 편집은 버림. PATCH는 `questionsData` 통째 교체 | 시험 수정 시 데이터 손실(저장 미실행으로 DB 변화 없음) | 핸들러 필드명을 입력과 일치시키고 통째 교체 대신 부분 갱신 |
| **U-2** | 중간 | 신규(★7 재분류) | `StudentDashboard.tsx:332,339` · `exams.ts:334,352` · `reports.ts:698` | **(런타임)** 현재 DB 시험은 `commentary` 키를 갖고 있어 오답 모달에 해설이 **표시됨**. 그러나 현 업로드 파서는 `explanation`만 생성하고 클라이언트는 `commentary`만 읽음(`reports.ts:698`은 둘 다 폴백) | **새로 업로드하는 시험**부터 학생 오답 모달에 해설이 안 뜸 | 클라이언트 `explanation ?? commentary` 폴백 또는 파서 정규화 |
| **U-3** | 높음 | 신규 | `BranchDashboard.tsx:3410` vs `:935,:1146` | **(런타임)** 보고서 섹션 "보고서 보기" 클릭 → `window.open('/reports/9e7e48a8-…')` 캡처. `/api/` 누락. 같은 표 3벌 중 한 벌만 미수정 | 새 창에 SPA 404 | `/api/reports/:id` 또는 `openFullReport` 재사용 |
| **U-4** | 높음 | 신규 | `BranchDashboard.tsx:2920-2950,455-490` · `distributions.ts:441` | **(런타임 DOM)** 지점내 배포 모달 입력 = `redistributeType×2, select, startDate, endDate`. 핸들러는 기간을 읽지 않고 서버 PUT은 `{classId, studentIds}`만 구조분해 | 기간 변경이 조용히 무시되고 "배포 완료" 토스트 | 입력 제거 또는 서버 PUT 확장 |
| **U-5** | 높음 | 신규 | `BranchDashboard.tsx:65,157-160` vs `:105,3525,3535` | **(런타임 375px)** 드로어 열림(오버레이 O, `translate(0)`) → Esc 후 오버레이·드로어 **그대로** → 오버레이 클릭으로만 닫힘. 포커스 미이동, `body.overflow=visible`. 원인: `useModalA11y({active: sidebarOpen&&…})`인데 `sidebarOpen` setter는 onClose뿐(죽은 상태), 실제 상태는 `panelOpen` | 모바일 a11y 무효 | `active: panelOpen && isMobileViewport(), onClose: () => setPanelOpen(false)` |
| U-6 | 높음 | 신규 | `StudentDashboard.tsx:1346-1352,1369,1393,1418,1460,1797-1900,2014-2029` 등 | **(런타임)** 로딩 7초 시점 "0회 응시 기준 / 배정 없음 / 아직 응시한 시험이 없습니다 / 아직 완료된 시험이 없습니다" → 11초 후 "75점 / 2회 / 최근 시험 결과 2건". KPI 3곳(StatValue)은 스켈레톤이었으나 나머지 블록은 확정 문구 | 학생이 "성적이 없다"로 오독. Branch 표 6곳·Admin 표 3곳도 같은 패턴(정적) | `isLoading` 분기 추가(`renderAttemptBoard`가 모범) |
| U-7 | 중간 | 신규 | `AdminDashboard.tsx:1272` · `distributions.ts:99-118` | **(런타임)** 관리자 배포 목록 "지점" 열 20/20행이 `branch-songdo` 등 id. 응답에 지점 이름 필드 없음 | 관리자가 지점을 식별 못 함 | 서버가 `branch.name` 조인 또는 클라이언트가 `/branches` 매핑 |
| U-8 | 중간 | 신규 | `StudentDashboard.tsx:394-412` | (정적) `AIReportButton` catch가 404만 처리 → 500/네트워크 오류 시 `'checking'` 고착 | "확인 중…" 영구 비활성 | 오류 분기 + 토스트 |
| U-9 | 중간 | 신규 | `StudentDashboard.tsx:132` vs `:394-411` | **(런타임)** `/my-exams`가 `hasReport`를 제공하는데 성적 조회 진입 시 완료 시험 2건에 `GET /reports/attempt/:id` **4회**(행당 2회) | 불필요 요청 N×2 | `hasReport` 사용 |
| U-10 | 중간 | 신규 | `BranchDashboard.tsx:163-170` | **(런타임)** 지점 진입마다 `GET /branch-students/stats` 200 호출, 결과 미사용 | 낭비 요청 | 제거 |
| U-11 | 중간 | 신규 | `reportClient.ts:57-81` | **(런타임)** 학부모 데스크톱 "보고서 보기": `GET /reports/attempt/…` 후 `window.open` — 새 탭 없음(사용자 제스처와 분리된 open → 차단) | 보고서가 열리지 않고 토스트만 | 클릭 시점에 창을 먼저 열고 내용 주입 |
| U-12 | 중간 | 신규 | `StudentDashboard.tsx:1078,1248` / `ParentDashboard.tsx` | **(런타임)** 학생 `<h1>` 2개("ALLGA", "안녕하세요…") / 학부모 `<h1>` 0개 | 문서 위계 | 사이드바 브랜드는 `<p>`/`<div>`, 학부모 제목 h1 |
| U-13 | 중간 | 신규 | 지점 보고서 섹션 | **(런타임)** 배포 카드 3개가 `DIV` onClick(role/tabindex 없음), 삭제 아이콘 버튼 3개 aria-label 없음 | 키보드·스크린리더 불가 | `<button>`화 + aria-label |
| U-14 | 중간 | 신규 | 시험 수정 모달 등 | **(런타임)** `label` 6/6 `for` 미연결; 정적으로 30여 개 | 폼 접근성 | `htmlFor`/`id` |
| U-15 | 중간 | DESIGN.md 위반 | Branch·Parent 표 | **(런타임)** 첫 열 `position: static` (학생·응시 3표·배포·학부모). Admin 표는 sticky ✅ | 5.4 위반 | `table.tsx`(미사용 131줄) 도입 |
| U-16 | 중간 | DESIGN.md 위반 | `AdminDashboard.tsx:489,551,758,1238` · `BranchDashboard.tsx:3249` | **(런타임)** 관리 표가 `shadow-xl` Card 안, 모달 닫기 버튼 없음, 동작 버튼 주→보조 순서, 제목 h3 | 11.2 / 5.6 / 4.4 | 헌법 절 적용 |
| U-17 | 중간 | 기준선 잔존(§12.1 주장) | `reports.ts:934-939,659-665` · `newReportTemplate.ts:15-19,1193` | **(오프라인 렌더)** 등급 데이터 없음 → 지면에 "0등급" 2회. "관리 목표" 곡선 = 정답률 +5/+10/+15 산술. "표준점수" = 등급 구간별 임의식(데이터 없으면 null ✅) | 분석서 §12.1 "날조 데이터 전량 제거"와 부분 불일치 | `|| 0` 제거(null → "산출 불가"), 곡선·표준점수 명명 재검토 |
| U-18 | 중간 | 신규 | `client/index.html:11` · `main.tsx:9` | (정적) 테마 선세팅 인라인 스크립트 없음, module script는 defer | 다크 사용자 FOUC | `<head>` 인라인 스크립트 |
| U-19 | 중간 | 신규 | `BranchDashboard.tsx:876-3608` 16곳 | (정적) `console.log`에 학생 객체·답안 출력, 3곳은 매 렌더 | 브라우저 콘솔 PII | 제거 |
| U-20 | 낮음 | 신규 | `client/src/components/ui/table.tsx` 외 | `table.tsx` 131줄 전체 미사용, 미사용 export 15개, 표 3벌 복붙 ≈450줄(U-3의 원인) | 유지보수 | 통합 |
| U-21 | 낮음 | 신규 | `package.json:11` | `"dev": "npm run dev:server & npm run dev:client"` POSIX `&` — Windows 셸 미동작 | 개발 편의 | `concurrently` |

### 4.5 보고서 큐·운영 (R)

| ID | 심각도 | 유형 | 위치 | 관측 | 권장 조치 |
|---|---|---|---|---|---|
| R-1 | 중간 | 기준선 잔존 | (U-17과 동일) | 오프라인 렌더 `literal_0등급_count=2` | 위 참조 |
| R-2 | 중간 | 설계 한계 | `reports.ts:281-318` · `schema.ts:165-177` · `reportClient.ts:57-67` | 메모리 큐, DB 상태 컬럼 없음 → 실패가 클라이언트에 전달되지 않고 90초 폴링 타임아웃으로만 끝남. 서버 재시작 시 진행 작업 소실 | `ai_reports.status` 컬럼 또는 작업 테이블 |
| R-3 | 낮음 | 신규 | `reports.ts:83-93,569,593` | 기동·요청마다 이모지 console 로그(`🔑 GEMINI_API_KEY 확인 …`) — 런타임 stdout 확인 | logger로 |

---

## 5. 미검증 항목과 이유

| 항목 | 이유 | 대체 근거 |
|---|---|---|
| 응시 시작·자동저장·제출 POST/PUT의 실동작 | 운영 DB 쓰기 | 코드 확정(조건부 UPDATE·409·onConflict) + UNIQUE 실존 + vitest 37 |
| S-1 만점 위조 런타임 재현 | 제출 = 쓰기 | 정적 경로 완전 추적(`attempts.ts:522-578` → `helpers.ts:96-105`) |
| 보고서 생성 큐 실동작 | Gemini 비용·DB 쓰기 | 코드 검토 + 기존 보고서 GET |
| 페이지네이션 UI 21행 이상 | 모든 목록 20행 미만 | `paginate()` 함수 판정 `20 3 5` + 52건 배포 목록 페이저 렌더 |
| 삭제·수정 저장 흐름 | 쓰기 | 모달 DOM 관찰(입력 name·버튼 순서)까지만 |
| 읽기 전용 세션 강제 | Neon 풀러가 시작 파라미터 무시 | 실행 문장 전수(SELECT + `where false` UPDATE 1건) |
| 로그인 예산 | 계획 2회 → **실제 3회**(UI `login-as`가 세션을 학생으로 고정해 복귀 불가 → 드로어 재검증용 재로그인) | 남은 예산 `remaining=9`(창 리셋) |
| `npm run build`가 `dist/`를 덮어썼음 | 검증 필요상 실행 | `dist/`는 `.gitignore` 대상 → `git status` 영향 없음 |

---

## 6. 기준선 대비 재확인

### 6.1 Critical C1~C7 (분석서 §9.1 "전건 해소")

| # | 분석서 판정 | 이번 재확인 | 근거 |
|---|---|---|---|
| C1 O/X 채점 | 해소 | **유지** | `attempts.ts:809` `_gradingMode:'ox'` 부착, `helpers.ts:96` 분기, vitest 케이스 |
| C2 수동 생성 정답키 날조 | 해소 | **유지** | `AdminDashboard.tsx:329-338` answerKey 입력·개수 검증 |
| C3 제출 소유권·기간 | 해소 | **유지** | `attempts.ts` 제출부 403(`본인의 답안만`)·400(`응시 기간이 종료`)·`endOfLocalDay` |
| C4 보고서 권한 | 해소 | **유지** | `checkAttemptAccess` 4라우트 적용(`reports.ts:38,333,1039,1149,1165`) |
| C5 임시저장·재개 | 해소 | **부분 회귀** | 800ms debounce·복원 경로 존재 ✅ / 복원 **실패 분기**에서 빈 답안지 + 전체 교체 PUT(S-3) |
| C6 XSS | 해소 | **유지** | 오프라인 렌더: `</script><img src=x onerror=1>` 투입 → 원문 미출현, `<` 이스케이프 |
| C7 빌드·기동 | 해소 | **유지** | BUILD_EXIT=0, `start: tsx server/index.ts`, `/health` up |

### 6.2 Major 18 (관련 항목)

| # | 분석서 | 이번 | 근거 |
|---|---|---|---|
| #3 지점 간 배정 검증 | 수정 | 부분 | 배치 엔드포인트는 `branchStudentById`로 걸러냄 ✅ / `POST /parents` 미검증(P-3), `POST /distributions` `classId` 미검증(낮음) |
| #6 `/branch/completed` admin | 수정 | 무의미화 | 클라이언트 미사용(죽은 코드) |
| #10 지점 삭제 고아 users | 수정 | 잔존 | `users.branch_id` FK 없음(D-1), 고아 현재 0 |
| #13 30문항 폴백 | 수정 | 유지 | grep 결과 폴백 30 없음 |
| #17 impersonation 복귀·감사 | 수정 | **경로별 분리** | `auth.ts` 경로 해소 ✅ / **UI가 쓰는 `login-as` 경로 미해소**(P-4, 런타임 400·감사 0건) |
| #18 N+1 | 수정 | 유지 | attempts·distributions·students·admin·classes·parents 배치화 확인. 클라이언트 측 N+1 잔존(U-9) |
| §12.1 "날조 데이터 전량 제거" | 주장 | **부분 불일치** | U-17/R-1 |

### 6.3 미구현 목록(`code-analysis-report.md` §4.1) 현황
비밀번호 변경: 지점장이 `PUT /students/:id`로 재설정만 가능(학생 본인 변경 없음) / 학생 삭제: 없음(지점 삭제 CASCADE만) / **반 삭제: 구현됨**(`classes.ts:227`, 문서 갱신 필요) / 세션 만료 안내: 401 인터셉터 1회 이동(`api.ts`) / 학부모 대시보드: 구현됨(런타임 확인) / F011 알림: 미구현(P2).

---

## 7. 스펙 드리프트 (api-spec.md · data-model.md ↔ 구현)

| 스펙 | 구현 | 비고 |
|---|---|---|
| §1.3 레벨 3 "branch = 관리자 + 지점 관리자" | `requireBranchManager`는 admin 거부(런타임 403) | §2.5/2.6도 동일 |
| §12 UNAUTHORIZED 401 | 역할 미들웨어 미인증 → 403 | P-5 |
| §8.7 `GET /api/branch/completed` + 쿼리 `examId/classId/grade` | 라우트 존재(403), 쿼리 파라미터 미구현, 클라이언트 미사용 | 주석 경로 `/api/exam-attempts/branch/completed`는 404 |
| §11.1~11.2 `/api/parents/children…` | `/api/parents/me/children…` | |
| §11.3 `GET /parents/children/:id/reports` | 미구현(클라이언트는 `/reports/attempt/:id`) | |
| 스펙 외 | `GET /distributions/students`, `POST /students/:id/login-as`, `GET /students/branch-students`, `GET /students/stats`, `/api/branch-students/*` 이중 마운트 | |
| data-model §5.1 지점 삭제 CASCADE → users | FK 없음 | D-1 |
| data-model 195·214 중간 테이블 UNIQUE | 없음 | D-2 |
| 죽은 엔드포인트 12 | `/exams/available`, `/branch/completed`, `/students/branch-students`, `/admin/recent-activity`, `GET/POST /parents`, `GET /distributions/:id`, `POST/DELETE /classes/:cid/students/:sid`, `auth/impersonate/restore|student|parent` | 클라이언트 호출 경로 전수 대조 |

---

## 8. 증거 부록 (원문)

```
# 정적
grep -rn "#[0-9a-fA-F]\{3,8\}\b" client/src --include=*.tsx --include=*.ts
→ client/src/pages/BranchDashboard.tsx:3469: … 라이트 #FFF / 다크 …   (주석) HEX_EXIT=0
DASH_COUNT= 0
npx tsc -p tsconfig.server.json --noEmit → SERVER_EXIT=0
npx tsc -p tsconfig.json --noEmit        → CLIENT_EXIT=0
npm run build → ✓ built in 1m 36s … BUILD_EXIT=0  (Node v22.23.2; dist/public/assets/index-*.js 751.37 kB 경고)
npx vitest run → Test Files 2 passed (2) / Tests 37 passed (37)

# 오프라인
paginate(45 items, page 3) → 20 3 5 ; page 9 → clamp 3, 5 ; [] → 1 0
generateReportHTML(XSS 이름, categoryReference available:false)
→ raw_img_tag_present=false, escaped_lt_in_script_json=true, 기준_축적_중_count=2, literal_0등급_count=2

# 운영 DB (읽기 전용 세션 요청 → 'off' 로 무시됨; 실행 문장은 SELECT + `update … where false`)
show default_transaction_read_only → off
drizzle.__drizzle_migrations → id 1..7 (6,7 = 2026-08-21T14:02 / 14:26)
pg_constraint(exam_attempts) → …_student_distribution_unique (u) 존재
UNIQUE(public) → ai_reports_attempt_id_unique, exam_attempts_student_distribution_unique, parents_user_id_unique, students_user_id_unique, users_username_unique
인덱스 7 존재 + session.IDX_session_expire
users.branch_id FK → []
행수: users 30 · branches 17 · classes 1 · students 12 · parents 1 · student_parents 1 · student_classes 0 · exams 3 · exam_distributions 52 · distribution_students 0 · exam_attempts 20 · ai_reports 10 · session 1
고아 0 · 제출됐는데 score null 0 · _gradingMode=ox 0/20 · U+FFFD 9컬럼 0 · 중간테이블 중복 0
배포 대상 유형 → ALL_BRANCH 52
제목·기간 동일 배포 중복 → 16 지점 × count 2
users updated_at==created_at → 30/30

# 런타임
GET /health → {"ok":true,"db":"up","uptime":266}
미인증: /api/exams 401 · /api/students/me 401 · /api/distributions 403 · /api/admin/stats 403 · /api/students 403
/api/branch/completed 403(존재) · /api/exam-attempts/branch/completed 404 · /api/exams/available 401 · /api/admin/recent-activity 403 · /api/parents 403
로그인: allga 200 · allga1 200 (RateLimit: limit=10, remaining=7) · allga1 재로그인 200 (remaining=9, reset=900)
admin: GET /distributions/students → 403 ; 배포 목록 지점 열 20/20 = "branch-songdo" 등 id ; 시험 수정 모달 입력 name = difficulty_N domain_N typeAnalysis_N subcategory_N explanation_N correctAnswer_N points_N (category_N 없음), label 6/6 for 없음, 닫기 버튼 없음, h3
branch: GET /admin/stats 403 · GET /branches 403 · GET /distributions/72c94503-…(branch-songdo) → 200 body.branchId=branch-songdo · GET /branch-students/stats 200(미사용)
branch 보고서 섹션: 카드 3개 DIV(role/tabindex 없음) · 아이콘 버튼 3개 라벨 없음 · "보고서 보기" → window.open('/reports/9e7e48a8-e925-4e0d-b658-98e532031d22')
branch 지점내 배포 모달 입력: redistributeType×2, select-one, startDate, endDate · 하단 버튼 [지점내 배포, 취소] · 닫기 버튼 없음
branch 표 첫 열 position: 학생 static · 응시 3표 static · 배포 static (admin 표 sticky)
branch 375px: hScroll 0 · under44 = [주간 모드로 전환(36x44)] · 드로어 열림 overlay=true transform=matrix(1,0,0,1,0,0) → Esc → overlay=true(그대로) → 오버레이 클릭 → overlay=false · focusInAside=false · body.overflow=visible
student(impersonate 200, originalUser=branch): h1 = ["ALLGA","안녕하세요, 김민수님"] · 7s "0회 응시 기준 / 배정 없음 / 아직 응시한 시험이 없습니다" → 11s "75점 / 2회 / 최근 시험 결과 2" · GET /api/exams/4fc68bc4-… 200 correctAnswer [2,3,4] · /my-exams/:id 정답 없음 · /my-exams itemKeys 포함 hasReport · 성적 조회 진입 GET /reports/attempt/* 4회(2건×2) · 오답 모달 해설 표시(DB 시험은 commentary 키 보유) · Esc 후 dialog 1(Radix, aria-modal null) · restore 200
parent(impersonate 200): children 200 (1) · attempts 3행 · 표 첫 열 static · h1 0 · "보고서 보기" → GET /reports/attempt/4bf0e514-… 후 새 탭 없음 · restore 200
UI login-as(강하준): /auth/me role=student originalUser=null · restore → 400 "복귀할 원래 계정 정보가 없습니다" · 서버 [AUDIT] 6줄 전부 auth 경로(login-as 기록 없음)
[AUDIT] target.username = "010****"(학생 전화번호, 보고서에서 마스킹)
콘솔 오류: 앱 자체 요청 4xx 없음(관측 403은 점검자 프로브)
종료: 로그아웃 200 · sessionAfter null · olga-theme=light · 뷰포트 desktop 복귀
```

---

## 9. 권장 우선순위 (수정은 별도 승인 후)

1. **S-1** 제출·자동저장에서 `_` 접두 키 거부 + 테스트 (1시간 내, 가장 큰 위험 제거)
2. **P-1** 학생·학부모 정답키 노출 차단 (리뷰 전용 응답)
3. **S-2** `branch-grade` 제출본 보호 + `maxScore` 가드
4. **P-3 / P-2** 지점 스코프 검증 2곳
5. **U-1 / U-4 / U-3** 클라이언트 필드·경로 계약 3건 (각 한 줄 수정)
6. **U-5 / U-6** 드로어 상태 배선 + 로딩 분기
7. **P-4** `login-as` → `auth/impersonate/student` 전환
8. D-1/D-2 제약 추가, D-4 중복 배포 정리 여부 결정, U-17 지면 `|| 0`

---

## 10. 수정 현황 (2026-09-04, 점검 당일)

§4 의 높음 11건과 중간 4건(P-2·P-4·P-5·P-6)은 점검 당일 수정 커밋됐다. 커밋은 모두 점검 기준 HEAD `399e9fc` 이후다. 높음 11건과 중간 4건은 push 했고(`origin/main` = `d45d54d`), 이어 수정한 중간 9건(U-7·U-2·U-8·U-9·U-10·U-11·U-12·U-13·U-19, 화면·요청 마감)은 push 했고(`origin/main` = `1fe177b`), 데이터 구조 5건(D-1·D-2·D-5·D-6·D-7)은 아직 push 하지 않았다.

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

정적 확정만 된 항목(S-2·P-3·U-1·U-5·S-3)의 런타임 확인은 다음 기회에 한다. P-2·P-4·P-5·P-6, U-7·U-2·U-8~U-13·U-19, D-1·D-2·D-5·D-6·D-7 을 제외한 중간·낮음 결함은 §4 를 그대로 둔다.

### 10.1 운영 DB 마이그레이션 0007

점검 이후 수정 단계에서 운영 DB(Neon)에 가한 유일한 쓰기다(점검 자체는 읽기만 했다). 사용자 승인 후 적용했다(`drizzle/0007_keen_captain_cross.sql`). 문장은 셋이다.

1. **ADD COLUMN** `ALTER TABLE "exam_distributions" ADD COLUMN "target_kind" text DEFAULT 'branch' NOT NULL` 로 배포 대상 종류를 컬럼으로 명시한다.
2. **CHECK 가드** `exam_distributions_target_kind_check` 로 값을 `branch`·`class`·`students` 셋으로 제한한다(`duplicate_object` 예외 처리로 재실행 안전).
3. **백필** 기존 행을 `class_id` 가 있으면 `class`, `distribution_students` 에 행이 있으면 `students`, 아니면 `branch` 로 갱신한다.

적용 전후 확인값이다. `__drizzle_migrations` 7건 → 8건. `exam_distributions` 52행의 `target_kind` 는 전부 `branch`(§3 A 의 "52건 전부 ALL_BRANCH" 와 일치). CHECK 제약 실존. 주요 테이블 행수 52/20/30/12/0/10 은 적용 전과 같다.

### 10.1.1 운영 DB 마이그레이션 0008

D-1·D-2 수정으로 생긴 두 번째 쓰기다. 사용자 승인 후 `npm run db:migrate` 를 한 번 실행해 적용했다(`drizzle/0008_eager_the_hood.sql`, "Migrations completed!"). 문장은 셋이고 모두 재실행 안전한 `DO $$ … EXCEPTION` 블록이다.

1. **users FK** `users_branch_id_branches_id_fk` 로 `users.branch_id` 를 `branches(id)` 에 묶고 `ON DELETE SET NULL` 을 건다.
2. **student_classes UNIQUE** `student_classes_student_class_unique` 로 `(student_id, class_id)` 중복 배정을 막는다.
3. **student_parents UNIQUE** `student_parents_student_parent_unique` 로 `(student_id, parent_id)` 중복 연결을 막는다.

적용 전후 확인값이다. `__drizzle_migrations` 8건 → 9건(마지막 `created_at` 1788504219241). 제약 3개는 `pg_constraint` 조회로 실존을 확인했다. 주요 테이블 행수 users 30 / students 12 / student_classes 0 / student_parents 1 / branches 17 / exam_attempts 20 / exam_distributions 52 는 적용 전과 같다. 적용 전 대조에서 고아 `branch_id` 0건, 중간 테이블 중복 조합 0건이었으므로 제약 신설로 끊긴 행은 없다.

삭제 동작은 스펙 §3.1 이 시사하던 CASCADE 대신 SET NULL 로 잡았다. `server/routes/branches.ts` 의 `DELETE /:id` 가 소속 계정을 지우지 않고 `isActive=false` 로 남겨 감사 추적을 유지하는 설계라, CASCADE 면 그 계정이 함께 사라져 설계와 충돌한다. admin 계정의 `branch_id` 가 NULL 인 것도 이 정의에서는 정상이다.

### 10.2 검증 방법과 한계

최종 게이트는 서버·클라이언트 `tsc --noEmit` 각각 오류 0, `vitest run` 4파일 83건 통과(중간 4건 수정 후, 미들웨어 테스트 22건 추가), 하드코딩 hex 0건(주석 1건)이다.

부작용 1건을 기록한다. 미인증 `GET /api/exams` 응답이 401 에서 403 으로 바뀌었다. P-1 의 미들웨어 교체에서 온 것으로, §4 의 P-5(401/403 혼용)와 같은 종류다. P-5 수정(`846e404`)으로 다시 401 이 됐다(런타임 확인).

런타임 검증 중 확인한 도구 한계는 둘이다. 숨겨진 브라우저 페인에서는 `innerWidth` 가 0 이고 Esc 키가 페이지에 도달하지 않는다. 375px 뷰포트 에뮬레이션에서는 렌더러가 반복해서 멈췄다. 이 때문에 U-5 의 375px 재현은 하지 못했고 코드 확정에 머물렀다. 다만 모달 취소 버튼으로 닫을 때 `body.style.overflow` 가 정상 복원되는 것은 확인했다.

중간 4건 수정 뒤에도 남은 항목 2건을 기록한다. `server/routes/attempts.ts:733` 의 `GET /api/branch/completed`(클라이언트 호출 0건인 죽은 엔드포인트)는 인라인 검사라 미인증 요청에 여전히 403 을 낸다. P-5 의 미들웨어 범위 밖이다. `PUT /distributions/:id` 는 타 지점 배포에 404 가 아닌 403 을 내므로 존재 열거 오라클이 남아 있다(쓰기 전에 끊기므로 부작용은 없다). 묶음 F 뒤 새로 관찰된 접근성 항목 1건: `BranchDashboard` O/X 수동 채점 컨트롤이 시각적으로 숨긴 radio + 아이콘만 든 label 이라 접근 가능한 이름이 없다(U-13 범위 밖, 미수정).

---

*이 보고서의 모든 "통과"는 위 부록의 명령 출력 또는 응답 원문에 대응한다. 탐색 에이전트가 보고했으나 점검자가 직접 확인하지 못한 항목은 결함 목록에 넣지 않았다.*
