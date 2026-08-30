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

---

## 5. 제약

- 마이그레이션 대상은 실서버(Neon)다. 스키마 변경 전 **중복 현황 조회를 선행**하고, 중복이 있으면 적용하지 않고 보고한다.
- 기존 디자인 토큰 체계(DESIGN.md)와 iteration 1~4 의 수정 로직은 보존한다.
- 빌드는 Node 22 LTS 에서 수행한다(Node 24 는 `vite build` 크래시).
- 실행자의 "검증 통과" 보고는 신뢰하지 않는다. **exit code 원문**으로 재확인한다. 서버는 `tsconfig.server.json` 이다(`tsconfig.json` 은 client 전용 include).
