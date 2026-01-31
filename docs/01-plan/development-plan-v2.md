# 올가 미수등 시스템 - 추가 개발 계획서 v2.0

> **문서 버전**: 2.0
> **작성일**: 2026-01-31
> **목표**: Next.js + Supabase 마이그레이션 및 버그/보안 수정

---

## 1. 개발 목표

### 1.1 핵심 목표

1. **기술 스택 현대화**: React+Express → Next.js 14 + Supabase
2. **Critical 버그 수정**: 채점 로직, 권한 검증, 보안 취약점
3. **성능 최적화**: N+1 쿼리 해결, 캐싱 도입
4. **기능 완성**: 미구현 기능 구현

### 1.2 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 코드 품질 점수 | 58/100 | 85/100 |
| Critical 이슈 | 5 | 0 |
| Warning 이슈 | 8 | 2 이하 |
| 테스트 커버리지 | 0% | 70% |
| 페이지 로드 시간 | 3초+ | 1초 이하 |

---

## 2. 개발 단계

### Phase 1: Critical 버그 수정 (3일)

**목표**: 현재 시스템의 심각한 버그/보안 문제 즉시 해결

| 작업 | 파일 | 우선순위 | 예상 시간 |
|------|------|----------|-----------|
| 채점 로직 버그 수정 | `attempts.ts:416` | P0 | 30분 |
| 답안 수정 소유권 검증 | `attempts.ts:357` | P0 | 1시간 |
| 입력 검증 추가 | `exams.ts:131` | P0 | 1시간 |
| 테스트 계정 제거 | `LoginPage.tsx:106` | P0 | 30분 |
| 비밀번호 정책 강화 | `students.ts:145` | P0 | 2시간 |
| 배포 삭제 권한 검증 | `distributions.ts:240` | P1 | 1시간 |

**산출물**:
- 버그 수정된 현재 시스템
- 핫픽스 배포

---

### Phase 2: 프로젝트 초기화 (2일)

**목표**: Next.js + Supabase 새 프로젝트 설정

```bash
# 프로젝트 생성
npx create-next-app@latest olga-academy-v2 --typescript --tailwind --app

# 의존성 설치
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @tanstack/react-query zustand
npm install react-hook-form zod @hookform/resolvers
npm install recharts xlsx
npm install -D @types/node prisma

# Shadcn/ui 설정
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card dialog input table toast skeleton
```

**산출물**:
- Next.js 14 프로젝트 구조
- Supabase 프로젝트 생성
- 개발 환경 설정

---

### Phase 3: 데이터베이스 마이그레이션 (3일)

**목표**: PostgreSQL → Supabase 스키마 마이그레이션

| 작업 | 설명 | 예상 시간 |
|------|------|-----------|
| 스키마 생성 | 12개 테이블 + RLS 정책 | 4시간 |
| 인덱스 생성 | 성능 최적화 인덱스 | 1시간 |
| audit_logs 테이블 | 신규 감사 로그 | 1시간 |
| 데이터 마이그레이션 | 기존 데이터 이전 | 4시간 |
| Edge Functions | 채점 로직 | 2시간 |
| Storage 설정 | 시험 파일 버킷 | 1시간 |

**산출물**:
- Supabase 스키마 완성
- RLS 정책 적용
- 데이터 마이그레이션 완료

---

### Phase 4: 인증 시스템 구현 (2일)

**목표**: Supabase Auth 기반 인증 시스템

| 작업 | 설명 | 예상 시간 |
|------|------|-----------|
| Auth 설정 | Supabase Auth 구성 | 1시간 |
| 로그인 페이지 | Server Actions 기반 | 3시간 |
| 미들웨어 | 역할 기반 라우트 보호 | 2시간 |
| 프로필 관리 | auth.users ↔ profiles 연동 | 2시간 |
| 비밀번호 변경 | 신규 기능 구현 | 2시간 |
| Rate Limiting | 로그인 시도 제한 | 1시간 |

**산출물**:
- 안전한 인증 시스템
- 비밀번호 변경 기능
- 감사 로그 기록

---

### Phase 5: 핵심 API 구현 (5일)

**목표**: Next.js API Routes + Server Actions

| 모듈 | 엔드포인트 수 | 예상 시간 |
|------|--------------|-----------|
| 지점 관리 | 5 | 4시간 |
| 학생 관리 | 6 | 6시간 |
| 반 관리 | 5 | 4시간 |
| 시험 관리 | 7 | 8시간 |
| 배포 관리 | 6 | 6시간 |
| 응시 관리 | 6 | 8시간 |
| AI 보고서 | 3 | 4시간 |
| 통계 | 2 | 4시간 |

**주요 개선**:
- N+1 쿼리 제거 (Supabase JOIN)
- Zod 입력 검증
- 표준 에러 응답

**산출물**:
- 40+ API 엔드포인트
- Server Actions
- 입력 검증 스키마

---

### Phase 6: 프론트엔드 구현 (7일)

**목표**: React Server Components 기반 UI

| 페이지 | 컴포넌트 | 예상 시간 |
|--------|----------|-----------|
| 로그인 | LoginForm | 4시간 |
| 관리자 대시보드 | StatsCard, DataTable, Charts | 12시간 |
| 지점 관리자 대시보드 | StudentList, ClassManager | 10시간 |
| 학생 대시보드 | ExamList, ExamView | 8시간 |
| 시험 응시 | QuestionView, AnswerSheet | 8시간 |
| 결과 조회 | ResultChart, ReportView | 6시간 |
| 학부모 대시보드 | ChildrenList, GradeView | 6시간 |

**주요 개선**:
- 컴포넌트 분리 (파일당 300줄 이하)
- Toast 알림 시스템
- Skeleton 로딩
- 접근성 개선 (a11y)

**산출물**:
- 7개 대시보드 페이지
- 20+ 재사용 컴포넌트
- Toast 시스템

---

### Phase 7: 성능 최적화 (2일)

**목표**: 로딩 속도 1초 이하

| 작업 | 설명 | 예상 시간 |
|------|------|-----------|
| TanStack Query 캐싱 | staleTime, gcTime 설정 | 2시간 |
| 이미지 최적화 | next/image 적용 | 2시간 |
| 번들 최적화 | dynamic import, tree shaking | 3시간 |
| Supabase Realtime | 실시간 업데이트 | 3시간 |
| Lighthouse 점검 | 90점 이상 달성 | 2시간 |

**산출물**:
- Lighthouse 점수 90+
- 페이지 로드 1초 이하

---

### Phase 8: 테스트 및 QA (3일)

**목표**: 안정적인 프로덕션 배포

| 작업 | 설명 | 예상 시간 |
|------|------|-----------|
| E2E 테스트 | Playwright 시나리오 | 8시간 |
| API 테스트 | Vitest 단위 테스트 | 6시간 |
| 보안 점검 | OWASP 체크리스트 | 4시간 |
| 부하 테스트 | 동시 접속 100명 | 2시간 |
| 버그 수정 | 발견된 이슈 해결 | 4시간 |

**산출물**:
- 테스트 커버리지 70%
- 보안 점검 보고서

---

### Phase 9: 배포 (1일)

**목표**: 프로덕션 환경 배포

| 작업 | 설명 | 예상 시간 |
|------|------|-----------|
| Vercel 설정 | 환경변수, 도메인 | 1시간 |
| Supabase 프로덕션 | 설정 최종 확인 | 1시간 |
| DNS 설정 | 도메인 연결 | 30분 |
| 모니터링 | Vercel Analytics, Sentry | 1시간 |
| 문서화 | 운영 가이드 작성 | 2시간 |

**산출물**:
- 프로덕션 배포 완료
- 모니터링 설정
- 운영 가이드

---

## 3. 일정 요약

```
Week 1
├── Day 1-3: Phase 1 (Critical 버그 수정)
├── Day 4-5: Phase 2 (프로젝트 초기화)
└── Day 6-7: Phase 3 시작 (DB 마이그레이션)

Week 2
├── Day 1: Phase 3 완료 (DB 마이그레이션)
├── Day 2-3: Phase 4 (인증 시스템)
└── Day 4-7: Phase 5 시작 (API 구현)

Week 3
├── Day 1-2: Phase 5 완료 (API 구현)
└── Day 3-7: Phase 6 (프론트엔드)

Week 4
├── Day 1-2: Phase 6 완료 (프론트엔드)
├── Day 3-4: Phase 7 (성능 최적화)
├── Day 5-7: Phase 8 (테스트)
└── Day 7: Phase 9 (배포)
```

**총 예상 기간**: 4주 (28일)

---

## 4. 리소스 요구사항

### 4.1 개발 환경
- Node.js 18+
- Git
- VS Code + 확장
- Supabase CLI

### 4.2 서비스 비용 (월간)

| 서비스 | 무료 티어 | 예상 비용 |
|--------|----------|-----------|
| Vercel | Pro 필요시 | $0 ~ $20 |
| Supabase | Free 티어 | $0 |
| Gemini API | 사용량 기반 | $10 ~ $50 |
| 도메인 | 연간 | $15/년 |

**예상 월 비용**: $10 ~ $70

---

## 5. 위험 요소 및 대응

| 위험 | 가능성 | 영향 | 대응 방안 |
|------|--------|------|-----------|
| 데이터 마이그레이션 실패 | 중 | 상 | 백업 후 진행, 롤백 계획 수립 |
| Supabase RLS 복잡성 | 중 | 중 | 단계별 테스트, 문서화 |
| AI API 비용 초과 | 중 | 중 | 캐싱, 요청 제한 |
| 일정 지연 | 중 | 중 | 버퍼 일정 확보 (20%) |

---

## 6. 체크리스트

### 배포 전 필수 확인

- [ ] Critical 버그 5개 모두 수정
- [ ] RLS 정책 테스트 완료
- [ ] 비밀번호 정책 강화
- [ ] Rate Limiting 적용
- [ ] 감사 로그 작동 확인
- [ ] 테스트 계정 제거
- [ ] 환경변수 프로덕션 설정
- [ ] HTTPS 강제
- [ ] 백업 설정

### 품질 기준

- [ ] Lighthouse 점수 90+
- [ ] 테스트 커버리지 70%+
- [ ] TypeScript strict mode
- [ ] ESLint 에러 0개
- [ ] 접근성 (a11y) 점검

---

## 7. 관련 문서

- [시스템 설계서 v2.0](../02-design/system-design-v2.md)
- [코드 분석 보고서](../03-analysis/code-analysis-report.md)
- [API 명세서](../02-design/api-spec.md)
- [데이터 모델](../02-design/data-model.md)

---

**문서 끝**
