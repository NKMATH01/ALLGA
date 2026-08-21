# 올가 미수등 시스템 — Gap 분석 보고서 (PDCA Check)

- **Feature**: olga-system-v2
- **분석일**: 2026-08-18
- **분석 방법**: 코드베이스 전수 탐색(구조·설계문서·문제점 3트랙 병렬) + 대표 발견사항 코드 재검증
- **Match Rate**: **72%** (기준선: v1 설계 문서, 산정 근거 §4)
- **판정**: 90% 미만 → **Act(iterate) 필요**

---

## 1. 기준선(Baseline) 결정

v2 설계(`docs/02-design/system-design-v2.md`, Next.js 14 + Supabase)는 **문서만 존재하고 구현률 0%**다.
저장소에 `app/`, `supabase/`, `next.config.js`, `middleware.ts`가 없으며, `.pdca-status.json` pipeline도 Phase 2~9 전부 pending이다.

따라서 본 분석의 비교 기준은:
- **구현 대비 기준**: v1 설계 3종 — `system-design.md`, `data-model.md`, `api-spec.md`
- **UI/디자인 기준**: `올가 프로그램.md` §6.5(반응형)·§10.5(타이포·팔레트) — 색/폰트/브레이크포인트가 명시된 유일한 문서
- **v2 마이그레이션 진행률**은 §7에서 별도 보고 (9단계 중 1단계 완료 = 11%)

## 2. 앱 실체 요약

| 구분 | 내용 |
|---|---|
| 구조 | 풀스택 모노레포: `client/`(React 18 + Vite) + `server/`(Express + TS) |
| 프론트 | Wouter(사실상 단일 라우트), TanStack Query 5(유일한 상태관리), Tailwind 3.4 + shadcn 스타일 primitives, Chart.js |
| 백엔드 | Express 4.19, Drizzle ORM 0.33 → PostgreSQL(Neon), express-session + connect-pg-simple(24h), bcryptjs, multer+xlsx, Gemini 2.5-flash |
| DB | 12테이블(`server/db/schema.ts`) + 런타임 `session` 테이블, 마이그레이션 5개 |
| 화면 | 역할별 초대형 단일 파일: `AdminDashboard.tsx` 1,381줄 / `BranchDashboard.tsx` 2,225줄 / `StudentDashboard.tsx` 1,844줄 / `ParentDashboard.tsx` **62줄 스텁** |
| 핵심 플로우 | Excel 업로드(행4~48=45문항) → 배포(본사→지점→반/학생) → 온라인 응시 → 자동 채점(1~9등급) → Gemini AI 보고서(5쪽 A4 HTML, DB에 HTML 통저장) |
| 데드 코드 | `AdminDashboard_old.tsx`(1,305줄), `*.backup` 4종, `reports_old/temp/openai.ts`, 루트 일회성 스크립트 13개 — 모두 tsc 컴파일 대상에 포함 |

## 3. 설계 대비 구현 체크리스트

O=일치, △=부분/결함, X=미구현

### 3.1 기능 요구사항 (project-plan.md F001~F012)

| ID | 항목 | 판정 | 비고 |
|---|---|---|---|
| F001 | 인증/RBAC/세션/Impersonation | △ | 구현됨. 단 impersonation 복귀 경로·감사기록 없음(auth.ts:80-208), 레이트리밋 없음 |
| F002 | 지점 CRUD + 순서변경 | △ | 구현됨. 목록 쿼리가 branch 계정 없는 지점 누락(branches.ts:14-22), 삭제 시 cascade 무경고 |
| F003 | 시험 관리 + Excel 업로드 | △ | 업로드 구현. 수동 생성은 **가짜 정답키** 생성(Critical C2), 45문항 하드코딩 절단, 수정 시 questionsData 무시 |
| F004 | 다중지점 배포 | △ | 구현됨. 날짜 UTC 파싱으로 KST 마지막 날 소실, 유효성 검증 부재 |
| F005 | 시험 응시 + 자동 채점 | △ | 채점 로직 자체는 수정됨(50ea180). **임시저장 미구현→답안 유실**(C5), 제출 소유권·기간 미검증(C3) |
| F006 | Gemini AI 보고서 | △ | 파이프라인 구현. 권한 미검증(C4), XSS(C6), 가짜 "전체평균 65%" 데이터 |
| F007 | 학생 관리 | △ | CRUD 구현. 삭제 미구현, 비밀번호 변경 미구현, 최신응시 정렬 NULL-first 버그 |
| F008 | 반 관리 | △ | CRUD 구현. 반 생성 시 studentIds 무시(서버 미수신), 타 지점 학생 배정 권한 미검증 |
| F009 | 통계 대시보드 | O | 구현됨(N+1 쿼리 성능 문제는 존재) |
| F010 | 학부모 기능 | **X** | `ParentDashboard.tsx` 62줄 정적 placeholder — 자녀 목록/성적/보고서 전부 미구현 |
| F011 | 알림 (P2) | X | 미구현(계획서상 예정) |
| F012 | 모바일 반응형 (P2) | △ | 부분 구현(§6 참고) |

### 3.2 데이터 스키마 (data-model.md 12테이블)

**12/12 테이블 모두 구현, 컬럼·제약 일치 — O (100%)**
경미한 차이: `users.role`이 free-text(CHECK 없음), `users.branchId`에 FK 없음(지점 삭제 시 고아행).

### 3.3 API (api-spec.md 60+ 엔드포인트)

약 **90% 구현**. 누락/불일치:
- 비밀번호 변경 API 없음
- 학생/반 삭제 일부 미구현
- 명세에 없는 엔드포인트 다수 존재(branch-grade, branch-create, /branch-students 이중 마운트 등)
- 응답 형식 비일관(`message` vs `error`)
- 미들웨어 누락 라우트: `GET /api/exam-attempts/:id`(attempts.ts:237), `GET /api/exam-attempts/branch/completed`(attempts.ts:476)

### 3.4 화면 구성 (system-design.md §5)

admin/branch/student 화면·사이드바 구성은 설계와 대체로 일치(O). parent 화면 X. 라우트 구조는 설계(`/admin/branches` 등 URL 라우팅)와 달리 단일 라우트 + `activeSection` 스위칭(△).

## 4. Match Rate 산정

| 카테고리 | 가중치 | 점수 | 근거 |
|---|---|---|---|
| 데이터 스키마 | 20% | 98% | 12/12 테이블, 경미한 제약 차이만 |
| API | 25% | 88% | 누락 소수 + 형식 비일관 |
| 기능(F001~F012) | 35% | 62% | O 1건, △ 9건(각 60~75%), X 2건 |
| UI/디자인 스펙 | 20% | 45% | 토큰 전면 미준수, 다크모드 미연결, 반응형 부분, 접근성 미흡 |
| **가중 평균** | | **≈ 72%** | |

## 5. 문제점 목록

### 5.1 Critical — 7건 (전건 코드 재검증 완료)

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| C1 | 지점 수동 채점 모달이 O/X를 `value="1"/"0"`으로 저장하는데, 서버는 `studentAnswer === correctAnswer`(1~5)로 채점 → 정답이 1번이 아닌 모든 문항이 오답 처리 | `BranchDashboard.tsx:2153-2176` + `attempts.ts:644-653` | **지점 입력 성적 전면 오류** |
| C2 | 시험 수동 생성이 정답키를 `(i % 5) + 1`로 날조, 난이도 '중'·배점 2 하드코딩 | `AdminDashboard.tsx:277-286` | 해당 시험 응시생 전원 엉터리 채점 |
| C3 | 제출 API가 `requireStudent`만 검사 — attempt 소유권·응시기간 미검증 | `attempts.ts:402-416` | 타 학생 답안 제출/확정 가능, 기간 만료 후 제출 가능 |
| C4 | 보고서 생성·열람이 `requireAuth`만 검사 | `reports.ts:26,388,407` | 로그인한 누구나 타 학생 성적·보고서 열람 + 유료 Gemini 호출 남발 가능 |
| C5 | 답안 임시저장 미구현: PUT 저장 API를 클라이언트가 호출하지 않고, 재개 시 `attempt.answers` 미로딩. "나중에 계속하기"=단순 `onClose` | `StudentDashboard.tsx:448,473,605-607,701-712` | 새로고침·닫기 시 **답안 전체 유실** |
| C6 | 보고서 HTML `<script>`에 JSON 원문 주입(`escapeForJson` 존재하나 미사용) → `</script>` 포함 데이터로 저장형 XSS | `newReportTemplate.ts:455` (+열람 `StudentDashboard.tsx:375`) | 앱 origin에서 스크립트 실행 |
| C7 | `npm run build:server` 실패(tsc 에러 40+: noUnusedLocals, null 산술) + `start` 스크립트가 존재하지 않는 `dist/index.js` 참조 | `reports.ts:126-292`, `package.json:11` | **프로덕션 빌드·기동 불가**, 런타임 NaN 표준점수 |

### 5.2 Major — 18건

1. 시험 수정 PATCH가 `questionsData/totalQuestions/totalScore`를 화이트리스트에서 제외하고도 성공 알림 — `exams.ts:136-143` vs `AdminDashboard.tsx:858-878`
2. Excel 파서 행 인덱스 하드코딩(`i < 48`) → 45문항 초과분 무단 절단 — `exams.ts:204`
3. 반-학생 배정 시 지점 소속 미검증(타 지점 학생 배정 가능) — `classes.ts:90-121`, `distributions.ts:129-136,216-222`
4. 반 생성 시 클라이언트가 보낸 `studentIds`를 서버가 무시 — `classes.ts:31-48`
5. 최신 응시 정렬 `DESC` NULL-first → 미제출 attempt가 최신으로 표시 — `students.ts:297-306`
6. `/branch/completed`에서 admin 접근 시 `branchId=undefined` 쿼리 — `attempts.ts:480-507`
7. 날짜 `new Date('YYYY-MM-DD')` UTC 파싱 → KST 09:00 개시/마감, 마지막 응시일 소실 — `distributions.ts:105-106`, `attempts.ts:127-131`
8. 배포 날짜 유효성 검증 부재(NaN 통과), examId/branchIds 존재 검증 없음 — `distributions.ts:85-87`
9. 제출 시 `answers` 누락이면 500, `totalScore=0`이면 NaN%→9등급 — `attempts.ts:432,442`
10. 지점/시험 무조건 삭제(cascade 대량 소실 + users 고아행, 없는 id도 성공 응답) — `branches.ts:135-149`, `exams.ts:167-181`
11. 아이디=전화번호 + 초기비번=뒷4자리(레거시 스크립트) + 로그인 레이트리밋 없음 + seed 계정 `allga/allga` — `add-songdo-students.ts:35-45`, `auth.ts:11`, `seed.ts:11`
12. 보고서의 "전체 평균" 날조(65% 하드코딩, 가짜 백분위 곡선, findIndex 실패 시 백분위 100) — `reports.ts:198-204,290,322,337-343`
13. 채점 폼 `totalQuestions` 폴백 30 하드코딩 5개소 → 31번 이후 답안 무단 누락 — `BranchDashboard.tsx:345,2024,2051,2078,2108`
14. 틀린문항 분석이 O/X 관례(`studentAns !== 1`)로 판정 → 일반 제출 attempt에서 오판 + 정답을 "O"로 표기 — `StudentDashboard.tsx:161-171,313-315`
15. 401 인터셉터 무조건 `window.location.reload()` → 시험 중 세션만료 시 답안 유실·reload 루프 — `api.ts:15-18`
16. 지점 목록 leftJoin+where로 inner join化 → 일부 지점 목록 누락 — `branches.ts:14-22`
17. impersonation 원 신원 미보존·복귀 불가·감사로그 없음 — `auth.ts:80-208`, `students.ts:382-427`
18. N+1 쿼리 5개소(admin stats는 요청당 ~30쿼리) — `attempts.ts:33-155`, `distributions.ts:346-388`, `students.ts:88-116`, `admin.ts:42-96`

### 5.3 Minor (요약)

- Toast 스텁(`Toaster=()=>null`, `toast()`→`alert()`), 블로킹 `alert/confirm` 약 60개소
- `BranchDashboard.tsx` 성적 테이블 3중 복붙, 데드 파일·백업 파일이 tsc 컴파일 대상
- PII 콘솔 로깅(학생 데이터·답안), 생성 비밀번호 평문 API 응답(`students.ts:192`)
- CORS가 localhost 4개 포트만 허용(프로덕션 origin 없음) — `server/index.ts:39-42`
- 조용한 실패: 배포 fetch 에러 시 null 반환으로 항목 소실, AI 버튼 "확인 중..." 고착

## 6. 디자인 분석

| 항목 | 설계 (올가 프로그램.md §10.5) | 구현 | 판정 |
|---|---|---|---|
| 컬러 토큰 | primary 블루 `210 100% 50%` 등 HSL 변수 체계 | 토큰은 `index.css`/`tailwind.config.js`에 정의됐으나 **전 페이지가 미사용**. 하드코딩 그라디언트: 로그인·관리자=오렌지/레드, 지점=블루/인디고, 학생=퍼플/인디고 → 역할마다 브랜드 컬러 상이 | X |
| 타이포 | Noto Sans KR / Inter / JetBrains Mono | 폰트 로딩 없음(시스템 폰트) | X |
| 다크모드 | 다크 팔레트 명세 | CSS `.dark` 정의만 있고 토글 미연결 | X |
| 반응형 | sm640/md768/lg1024 3단계, 모바일 햄버거+1열 | 햄버거 토글은 구현. 사이드바 `w-72`↔`w-0` 브레이크포인트 없는 곳 존재, 보고서는 794px 고정 A4 | △ |
| 접근성 | (v2 계획서 요구) | label↔input 미연결(`LoginPage.tsx:60-82`), 아이콘 버튼 aria-label 없음, 키보드 내비 미지원 | X |
| 보고서 | `server/report-template.html` 693줄 + escape 가드 | 실제는 `newReportTemplate.ts`(630줄, 별도 구현) + escape 미적용 + Tailwind/Chart.js/jsPDF **CDN 런타임 의존**(오프라인 불가) | △ |
| UI 알림 | Toast/Skeleton (v2 계획) | `alert()` 스텁 | X |

**설계 문서 내부 불일치**: 등급 컷이 `올가 프로그램.md` §11.1(6등급 ≥25 / 7 ≥15 / 8 ≥8)과 PDCA 설계 문서 2종(6 ≥23 / 7 ≥11 / 8 ≥4)이 서로 다름. 구현(`helpers.ts:32-42`)은 올가 프로그램.md를 따름 → **설계 문서 쪽을 코드에 맞춰 정정 필요**.

## 7. v2 마이그레이션 진행 상태

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | Critical Bug Fix (6건) | ✅ 완료 (commit 50ea180) — 단, 본 분석에서 신규 Critical 7건 추가 발견 |
| 2~9 | Next.js 셋업 → Supabase → Auth → API → Frontend → 최적화 → 테스트 → 배포 | ⏳ 전부 미착수 |

진행률 1/9 (≈11%). 품질 점수 궤적: 58 → 68 (목표 85). 본 분석 반영 시 Critical 0→7로 재산정 필요.

## 8. 권장 조치 (우선순위)

1. **[P0] Critical 7건 수정** — 특히 C1(성적 전면 오류)·C5(답안 유실)·C7(빌드 불가)은 서비스 신뢰성 직결. Codex 위임 대상.
2. **[P0] C3·C4 권한 검증 추가** — 소유권·branchId 검증 미들웨어 공통화.
3. **[P1] Major 중 데이터 정합성 항목**(1·5·7·13·14) 수정.
4. **[P1] 설계 문서 등급 컷 정정** + F010 학부모 대시보드 구현 여부 의사결정.
5. **[P2] 디자인 토큰 일원화**(하드코딩 그라디언트 → CSS 변수), toast 실구현, 데드 파일 정리.
6. v2 마이그레이션(Phase 2~) 착수는 위 P0 안정화 이후 권장.

**다음 단계**: `/pdca iterate olga-system-v2` (Match Rate 72% < 90%)

---

## 9. 재측정 결과 — Act Iteration 1 이후 (2026-08-19)

### 9.1 수정 확인 (Critical 7건 전건 해소)

| # | 상태 | 검증 방법 |
|---|---|---|
| C1 | ✅ 해소 | branch-grade O/X 채점 + `_gradingMode` 메타키, 틀린문항 모달·AI 보고서 분석 분기 diff 확인 |
| C2 | ✅ 해소 | 수동 생성 폼 answerKey 입력·검증 diff 확인 |
| C3 | ✅ 해소 | 제출 API 소유권(403)·마감일 23:59:59 검증(400) diff 확인 |
| C4 | ✅ 해소 | `checkAttemptAccess` 4역할 검증, 3개 엔드포인트 적용 grep 확인 |
| C5 | ✅ 해소 | 800ms debounce 자동저장 + 재개 복원 + 저장 후 닫기, 호출부 `attempt` prop 전달 확인 |
| C6 | ✅ 해소 | JSON 주입 `<`/`>`/U+2028/U+2029 이스케이프 diff 확인 |
| C7 | ✅ 해소 (지시 범위) | `tsc --noEmit` 에러 0, `build:server` 성공, start 경로 수정 — 단 `build:client`·런타임 기동은 §9.4 참조 |

회귀 검사: ExamTakingModal 호출부 prop 전달 정상, 재개 폴백 `GET /exam-attempts/:id`는 인라인 소유권 검증 보유(attempts.ts:237-280) — Major 목록에서 "미들웨어 누락"으로 기재했던 이 라우트는 실제로는 인라인 권한 검증이 있어 심각도 하향.

### 9.2 Match Rate 재산정

| 카테고리 | 가중치 | 이전 | 현재 | 변동 근거 |
|---|---|---|---|---|
| 데이터 스키마 | 20% | 98% | 98% | 변동 없음 |
| API | 25% | 88% | 90% | C3·C4 권한 검증 추가 |
| 기능(F001~F012) | 35% | 62% | 69% | F003 정답키(60→75), F005 임시저장(60→90), F006 권한·XSS(65→80) |
| UI/디자인 스펙 | 20% | 45% | 45% | 디자인 미변경 |
| **가중 평균** | | **72%** | **≈ 75%** | |

### 9.3 판정

**75% < 90% → Iteration 2 필요.** 잔여 갭 우선순위:
1. Major 데이터 정합성 5건 — 시험 수정 questionsData 무시(M1), 날짜 UTC 파싱(M7), NULL-first 정렬(M5), 30문항 폴백(M13), Excel 45문항 절단(M2)
2. Major 보안 4건 — 지점 간 배정 권한(M3), 무조건 삭제(M10), 취약 비밀번호·레이트리밋(M11), impersonation 복귀·감사(M17)
3. F010 학부모 대시보드 구현 (설계 대비 0%)
4. UI/디자인 — 토큰 일원화, toast 실구현, 접근성 (45% 구간의 주요 원인)

### 9.4 검증 단서 — 빌드·기동 미해소 2건 (Critical 7건과 별개)

Iteration 1 검증 중 확인된 사실로, §9.1 C7의 "해소"는 **지시된 범위(start 스크립트 경로 + tsc 에러)에 한정**된다. 아래 2건은 여전히 프로덕션 배포를 막는다.

| 항목 | 상태 | 근거 |
|---|---|---|
| `npm run build:client` | ❌ 실패 | vite가 "1746 modules transformed" 직후 종료코드 `-1073740791`(0xC0000409, STATUS_STACK_BUFFER_OVERRUN)로 크래시. **Iteration 1 변경과 무관** — 두 클라이언트 파일을 stash한 HEAD(50ea180) 원본에서도 동일 재현. `--minify false`, `--target esnext`, `--stack-size` 조정, rollup native 우회 모두 무효이며 rollup·esbuild 단독 실행은 정상. Node v24.13 + Vite 5.4.21/Rollup 4.53.2 환경 이슈로 추정(마지막 성공 빌드 산출물 `dist/public`은 2026-03-30자) |
| `npm start` 런타임 기동 | ❌ 실패 | start 경로 수정 후 실제 실행 시 `ERR_MODULE_NOT_FOUND: .../dist/server/routes/auth`. `"type": "module"` + tsc 출력이라 컴파일된 상대 import에 `.js` 확장자가 없어 Node ESM이 해석 불가. 개발은 tsx가 처리해 드러나지 않던 문제 |

두 건 모두 Critical 7건 지시 범위를 벗어나 Iteration 1에서 처리하지 않았다. **Iteration 2의 P0 후보**이며, 특히 `npm start`는 서버 전 파일 상대 import에 `.js` 부여 또는 번들러 도입이 필요해 별도 의사결정이 요구된다. 클라이언트 타입 검사는 Iteration 1 전후 tsc 에러 차이가 기존 3건의 줄번호 이동뿐으로, 신규 타입 에러는 없음을 확인했다.

### 9.5 P0 2건 처리 결과 — Act Iteration 3 (2026-08-20)

#### P0-A `npm start` 기동 실패 → ✅ 해소

tsc 산출물의 확장자 없는 상대 import 를 전부 고치는 대신 **프로덕션도 tsx 로 실행**하는 방식을 택했다.
`package.json` 의 `start` 를 `tsx server/index.ts` 로 변경했다. `cross-env` 는 미설치라 도입하지 않았고,
`NODE_ENV` 는 `server/index.ts` 최상단의 `import 'dotenv/config'` 가 `.env` 에서 읽어가는 기존 경로를 그대로 쓴다
(`.env` 에 `NODE_ENV` 키가 이미 존재함을 확인). `build:server` 는 타입 검사 용도로 유지했다.

검증: `PORT=5001 npm start` → `🚀 Server running on http://localhost:5001` 기동 확인,
`curl /api/auth/me` → **HTTP 200** (`{"success":true,"user":null}`). 스모크 후 프로세스 종료.

#### P0-B vite 빌드 크래시 → ❌ 미해소 (경계 도달, 중단)

| 시도 | 내용 | 결과 |
|---|---|---|
| ① | `npm i -D vite@^5 rollup@latest` (rollup 4.53.2 → 4.62.4) | 동일 크래시 `-1073740791` |
| ② | `npm i -D vite@^6 @vitejs/plugin-react@latest` | **설치 자체가 ERESOLVE 피어 충돌로 실패**, vite 5.4.21 유지 → 동일 크래시 |
| — | Node 20/22 로 교차 검증 | 불가 (해당 머신에 Node v24.13 단일 설치, nvm 없음) |

지시된 경계에 도달해 **중단**했다. ①②로 바뀐 `package.json`·`package-lock.json` 은 효과가 없어 원복했고,
대신 `package.json` 에 `engines.node: ">=20 <23"` 을 추가해 지원 런타임을 명시했다.
Node 24 가 원인이라는 가설은 이 머신에서 직접 검증하지 못했으므로 **추정으로 남는다.**

부수 확인: 빌드 로그가 기존 결함 1건을 드러냈다 — `AdminDashboard.tsx` 지점 선택 체크박스에
`className` 이 두 번 선언되어(`h-4 w-4 accent-action` 과 `rounded border-line`) 앞의 것이 조용히 버려지고 있었다.
디자인 이행 커밋(ce88853)에서 유입된 것으로, 두 값을 병합해 수정했다.

---

## 10. 재측정 결과 — Iteration 2(디자인 이행)·3(Major 수정) 이후 (2026-08-20)

### 10.1 반영 내역
- Iteration 2: DESIGN.md 헌법 기반 전 화면 디자인 이행 (커밋 59b1f39, ce88853, 0040f3e) — 토큰 3계층, 그라디언트 118곳 제거, 모바일 오버레이 드로어, AI 보고서 지면 이행(내용 불변)
- Iteration 3: P0-A 1건 + Major 17건 수정 (미커밋) — npm start tsx 전환(기동 스모크 200 확인), KST 날짜 유틸 일괄 적용, 시험 수정 화이트리스트 확장+검증, Excel 절단 해소, 지점 간 배정 검증, 삭제 안전장치(404/409+force), 로그인 레이트리밋, 보고서 실평균 계산(65% 하드코딩 제거), NULLS 정렬, LEFT JOIN 복원, impersonation 복귀 엔드포인트+감사 로그, 401 인터셉터 개선, 30문항 폴백 제거, N+1 상위 2곳 배치화
- P0-B(vite 빌드 크래시): 업그레이드 시도 실패 → engines.node 명시 + 시도 내역 기록 (§9.5). **미해소 잔존**

### 10.2 Match Rate 재산정

| 카테고리 | 가중치 | 2차(75%) | 현재 | 변동 근거 |
|---|---|---|---|---|
| 데이터 스키마 | 20% | 98 | 98 | 변동 없음 |
| API | 25% | 90 | 93 | 검증·에러코드·레이트리밋·restore 엔드포인트 |
| 기능(F001~F012) | 35% | 69 | 73 | F003/F004/F005 90, F001/F002/F008 85, F010=0·F011=0 유지가 상한 제약 |
| UI/디자인 스펙 | 20% | 45 | 82 | 토큰 일원화·반응형·지면 문법 완료. 다크 토글 미연결·toast 미구현·접근성 부분이 잔여 |
| **가중 평균** | | **75%** | **≈ 85%** | |

### 10.3 판정
**85% < 90% → Iteration 4 필요.** 잔여 갭 (기여도 순):
1. F010 학부모 대시보드 실기능 (기능 카테고리 최대 단일 갭)
2. toast 실구현(alert 60곳 대체) + 다크 토글 연결 + 접근성(포커스 트랩, aria)
3. P0-B vite 빌드 (Node 22 LTS 환경에서 재시도 필요)
4. N+1 잔여 3곳, 전화번호 초기 비밀번호 데이터 이전

---

## 11. 재측정 결과 — Iteration 4 이후 (2026-08-20)

### 11.1 반영 내역
- F010 학부모 실기능: `GET /api/parents/me/children` + `/children/:studentId/attempts`(소속 검증), ParentDashboard 재작성(자녀 목록·성적 테이블·보고서 열람·드로어) — 0% → 85%
- Toast 실구현(DESIGN.md 5.7): 라이브 페이지 alert() 0건(단순 알림 → toast, confirm은 의사결정 흐름 유지)
- 다크 토글: useTheme 훅(localStorage+system 감지, FOUC 방지) + 전 대시보드 헤더 토글 + 차트 테마 연동

### 11.2 Match Rate 재산정 (동일 방법론)

| 카테고리 | 가중치 | 3차(85%) | 현재 |
|---|---|---|---|
| 데이터 스키마 | 20% | 98 | 98 |
| API | 25% | 93 | 95 |
| 기능(F001~F012) | 35% | 73 | 80 |
| UI/디자인 스펙 | 20% | 82 | 90 |
| **가중 평균** | | **85%** | **≈ 89%** |

### 11.3 판정
- 동일 방법론 기준 **89%** — 90% 문턱 직전. 잔여 감점 10.65%p 중 **F011 알림(0%)이 약 2.9%p**로 단일 항목 최대이며, 이는 **프로젝트 계획서(project-plan.md)가 P2(향후 범위)로 명시한 항목**이다.
- **P0·P1 범위 기준으로는 ≈92%** (F011 제외 시).
- 잔여: F011 알림(P2), P0-B vite 빌드(Node 22 필요), N+1 잔여 3곳, 전화번호 초기 비밀번호 이전, 접근성 세부(포커스 트랩).

---

## 12. 최종 재측정 — 사이클 마감 (2026-08-21)

### 12.1 반영 내역 (iteration 4 이후)
- 보고서 전면 개편 완료: 학습 건강검진 결과통보서 문법 8쪽, 실 AI 소견(프롬프트 v3), 실계산 참고치(제10~90백분위), 예상 수능 등급 구간, 심화 처방 분기. 날조 데이터 전량 제거(고정 백분위 곡선·65% 하드코딩·"예측" 정명).
- §9 검증 단서 2건 전부 해소: npm start(tsx 전환) + vite build(Node 22.23.2, nvm 병행 설치, EXIT=0 실측)
- 클라이언트 tsc 37건 → 0건, 데드 파일 23개 삭제(-9,080줄, 커밋 dd9575a)
- Gemini 키 교체, maxOutputTokens 8000→16000(응답 절단→조용한 폴백 버그), highSchoolPrep 읽기 경로 버그 수정

### 12.2 Match Rate (동일 방법론)
| 카테고리 | 가중치 | 4차(89%) | 최종 |
|---|---|---|---|
| 데이터 스키마 | 20% | 98 | 98 |
| API | 25% | 95 | 95 |
| 기능(F001~F012) | 35% | 80 | 81 |
| UI/디자인 스펙 | 20% | 90 | 92 |
| **가중 평균** | | **89%** | **≈ 90%** |

근거: F006 AI 보고서 85→95(설계 취지 초과 달성), F012 반응형 90(드로어·overflow 완성), 보고서 지면 문법 헌법 편입.

### 12.3 판정
**90% ≥ 90% → 사이클 완료 조건 충족.** 잔여(차기 사이클): F011 알림(P2), N+1 잔여 3곳, 전화번호 초기 비밀번호 이전, 접근성 세부, v2(Next.js+Supabase) 마이그레이션 여부 재결정.
