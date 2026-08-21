# olga-hardening — 2,000명 규모 대비 강화 계획

- **Feature**: olga-hardening
- **착수**: 2026-08-21
- **선행 사이클**: olga-system-v2 (Match Rate 90%, `docs/04-report/olga-system-v2.report.md`)
- **근거**: Claude × Codex 토론 합의 — **성적 무결성 최우선**

---

## 1. 배경

직전 사이클은 "설계 대비 정합성"을 목표로 했고 90%로 마감했다.
이번 사이클의 전제는 다르다. **사용자 2,000명 규모에서 실제로 견디는가**이다.

두 가지 특성이 설계를 지배한다.

- **버스트 트래픽**: 시험은 특정 시간대에 동시 시작·동시 제출된다. 평시 부하가 아니라 순간 피크가 기준이다.
- **성적은 되돌릴 수 없다**: 답안 유실·중복 제출·경합으로 인한 점수 오류는 사후 복구가 사실상 불가능하다. 성능보다 무결성이 앞선다.

현재 코드는 단일 사용자 흐름을 가정한 지점이 남아 있다. 자동저장과 제출이 사전 조회 후 UPDATE 하는 read-then-write 구조라 동시 요청에 취약하고, `exam_attempts` 에 (학생, 배포) 유일성 제약이 없어 중복 응시 레코드가 생길 수 있다.

---

## 2. Wave 계획

### Wave 1 — 무결성·권한·모바일 (이번 범위)

| 항목 | 내용 |
|---|---|
| 자동저장 원자화 | `PUT /exam-attempts/:id` UPDATE 에 `isNull(submittedAt)` 조건. 0행이면 400 |
| 제출 멱등·원자화 | submit 최종 UPDATE 에 `isNull(submittedAt)` 조건. 0행이면 409 (더블클릭 대비) |
| 응시 시작 중복 방지 | `exam_attempts` UNIQUE(student_id, distribution_id) + `onConflictDoNothing` 후 기존 레코드 반환 |
| 권한 구멍 2건 | `GET /exam-attempts/:id` parent 분기 및 미분류 역할 기본 차단, `POST /exam-attempts` 배포 대상·기간 검증 |
| 모바일 사이드바 | 4개 대시보드 `sidebarOpen` 초기값을 뷰포트 기준으로 |
| PII 로그 제거 | 학생 이름·답안·전화가 담기는 console.log 제거 (감사 로그는 유지) |

### Wave 2 — 성능 Top 5

N+1 잔여 3곳(`attempts.ts` 2, `distributions.ts` 1) 배치화, 대시보드 집계 쿼리 인덱스 점검, `/my-exams` 배포 루프 배치화, 보고서 목록 조회 페이지네이션, 세션 스토어 부하 점검.

### Wave 3 — 디자인 Top 3

모달 포커스 트랩·aria 보강, 표 첫 열 sticky(DESIGN.md 5.4) 적용, 빈 상태·로딩 문법 통일.

### Wave 4 — 운영

전화번호 초기 비밀번호 데이터 이전, F011 알림(P2) 착수 여부 결정, v2(Next.js + Supabase) 마이그레이션 재결정.

---

## 3. 성공 기준

| 기준 | 측정 |
|---|---|
| 동시 제출로 점수가 덮이지 않는다 | 같은 attempt 이중 submit → 두 번째 409 |
| 제출 후 답안이 변경되지 않는다 | 제출 완료 attempt 에 PUT → 400 |
| 중복 응시 레코드가 생기지 않는다 | UNIQUE 제약 존재 + 재시작 요청이 기존 레코드 반환 |
| 권한 경계가 새지 않는다 | parent 가 타 학생 attempt 조회 → 403, 미대상 배포 응시 시작 → 403 |
| 모바일 첫 화면이 가려지지 않는다 | 390px 진입 시 사이드바 닫힘 |
| 회귀 없음 | 서버·클라이언트 `tsc --noEmit` EXIT=0 |

---

## 4. 제약

- 마이그레이션 대상은 실서버(Neon)다. 스키마 변경 전 **중복 현황 조회를 선행**하고, 중복이 있으면 적용하지 않고 보고한다.
- 기존 디자인 토큰 체계(DESIGN.md)와 iteration 1~4 의 수정 로직은 보존한다.
- 빌드는 Node 22 LTS 에서 수행한다(Node 24 는 `vite build` 크래시).
