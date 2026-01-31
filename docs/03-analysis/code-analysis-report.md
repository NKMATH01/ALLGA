# 올가 미수등 시스템 - 코드 분석 보고서

> **분석일**: 2026-01-31
> **분석 범위**: 전체 코드베이스 (25개 주요 파일)
> **품질 점수**: 58/100

---

## 1. 분석 요약

### 1.1 심각도별 이슈 현황

| 심각도 | 개수 | 설명 |
|--------|------|------|
| 🔴 **Critical** | 5 | 즉시 수정 필요 (보안/버그) |
| 🟠 **Warning** | 8 | 개선 권장 |
| 🟡 **Info** | 12 | 참고 사항 |

### 1.2 카테고리별 분포

| 카테고리 | Critical | Warning | Info |
|----------|:--------:|:-------:|:----:|
| 보안 | 3 | 4 | 2 |
| 버그 | 2 | 1 | 1 |
| 성능 | 0 | 2 | 4 |
| 아키텍처 | 0 | 1 | 3 |
| UX | 0 | 0 | 2 |

---

## 2. Critical 이슈 (즉시 수정 필요)

### 2.1 🔴 채점 로직 버그

**파일**: `server/routes/attempts.ts:416`

**문제**: 학생 답안이 `1`이면 무조건 정답 처리. 실제 정답과 비교하지 않음.

```typescript
// 현재 코드 (버그)
if (studentAnswer === 1) {
  score += question.points || question.score || 0;
  correctCount++;
}

// 수정 필요
if (studentAnswer === question.correctAnswer) {
  score += question.points || question.score || 0;
  correctCount++;
}
```

**영향**: 모든 시험 점수가 잘못 계산됨
**수정 난이도**: 낮음 (1줄 수정)

---

### 2.2 🔴 답안 수정 권한 검증 없음

**파일**: `server/routes/attempts.ts:357-380`

**문제**: PUT 요청 시 현재 로그인한 학생이 답안의 소유자인지 확인하지 않음

```typescript
// 현재 코드 (취약점)
router.put('/exam-attempts/:id', requireStudent, async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body;
  // 소유권 검증 없이 바로 업데이트
  const [attempt] = await db.update(examAttempts).set({ answers })...
});

// 수정 필요
router.put('/exam-attempts/:id', requireStudent, async (req, res) => {
  const student = await getStudentFromSession(req);
  const attempt = await db.query.examAttempts.findFirst({
    where: and(
      eq(examAttempts.id, req.params.id),
      eq(examAttempts.studentId, student.id)  // 소유권 검증
    )
  });
  if (!attempt) return res.status(403).json({ error: 'Forbidden' });
  // ...업데이트 진행
});
```

**영향**: 다른 학생의 답안 수정 가능
**수정 난이도**: 중간

---

### 2.3 🔴 입력 검증 없는 시험 수정

**파일**: `server/routes/exams.ts:131-136`

**문제**: `req.body`를 검증 없이 그대로 DB 업데이트에 사용

```typescript
// 현재 코드 (취약점)
router.patch('/:id', requireAdmin, async (req, res) => {
  const updateData = req.body;  // 위험: 어떤 필드든 수정 가능
  const [exam] = await db.update(exams).set(updateData)...
});

// 수정 필요
const allowedFields = ['title', 'subject', 'grade', 'description'];
const updateData = Object.fromEntries(
  Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
);
```

**영향**: 악의적인 필드 주입 가능
**수정 난이도**: 낮음

---

### 2.4 🔴 약한 비밀번호 정책

**파일**: `server/routes/students.ts:145-146`

**문제**: 전화번호 끝 4자리를 초기 비밀번호로 사용

```typescript
// 현재 코드 (취약점)
const initialPassword = phone.slice(-4);  // 예측 가능

// 수정 필요
const initialPassword = crypto.randomBytes(8).toString('hex');
// + 최초 로그인 시 비밀번호 변경 강제
```

**영향**: 브루트포스 공격에 취약 (4자리 = 10,000 조합)
**수정 난이도**: 중간

---

### 2.5 🔴 테스트 계정 정보 노출

**파일**: `client/src/pages/LoginPage.tsx:106-109`

**문제**: 프로덕션 빌드에 테스트 계정 정보가 하드코딩

```tsx
// 현재 코드 (노출)
<p>관리자: allga / allga</p>
<p>지점관리자: allga1 / allga1</p>

// 수정 필요
{process.env.NODE_ENV === 'development' && (
  <TestAccountInfo />
)}
```

**영향**: 누구나 관리자 계정으로 접근 가능
**수정 난이도**: 낮음

---

## 3. Warning 이슈 (개선 권장)

### 3.1 🟠 N+1 쿼리 패턴 (5개소)

| 파일 | 라인 | 설명 | 예상 쿼리 수 |
|------|------|------|-------------|
| `students.ts` | 77-104 | 학생별 부모 정보 | N+1 |
| `students.ts` | 283-315 | 학생별 최신 시험 | N+1 |
| `admin.ts` | 42-82 | 지점별 통계 | N×4 |
| `admin.ts` | 85-96 | 등급별 분포 | 9 |
| `distributions.ts` | 331-370 | 학생별 응시 상태 | N×2 |

**해결**: Supabase JOIN 쿼리 또는 집계 쿼리 사용

---

### 3.2 🟠 로그인 시도 제한 없음

**파일**: `server/routes/auth.ts`

**문제**: 브루트포스 공격에 취약

**해결**: Rate Limiting 적용 (express-rate-limit 또는 Supabase Edge Rate Limiting)

---

### 3.3 🟠 Impersonate 감사 로그 부재

**파일**: `server/routes/auth.ts:78-124`

**문제**: 관리자가 다른 계정으로 전환 시 로그 없음

**해결**: audit_logs 테이블 생성 및 기록

---

### 3.4 🟠 거대한 단일 컴포넌트

**파일**: `client/src/pages/AdminDashboard.tsx` (1382줄)

**문제**: 유지보수 어려움, 번들 크기 증가

**해결**: 기능별 컴포넌트 분리 (목표: 파일당 300줄 이하)

---

### 3.5 🟠 일관성 없는 에러 처리

**위치**: 서버 전체

**문제**: 일부는 `message`, 일부는 `error` 필드 사용

**해결**: 표준 에러 응답 형식 정의

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

---

### 3.6 🟠 alert() 사용

**위치**: 클라이언트 페이지 다수

**문제**: UX 불량, 사용자 경험 저하

**해결**: Toast 컴포넌트로 대체

---

### 3.7 🟠 배포 삭제 권한 검증 미흡

**파일**: `server/routes/distributions.ts:240-254`

**문제**: 다른 지점의 배포도 삭제 가능

**해결**: branchId 검증 추가

---

### 3.8 🟠 API 키 로깅

**파일**: `server/routes/reports.ts:13-14`

**문제**: 서버 로그에 API 키 존재 여부 노출

**해결**: 프로덕션에서 로그 제거

---

## 4. Info 이슈 (참고 사항)

### 4.1 미구현 기능

| 기능 | 상태 | 우선순위 |
|------|------|----------|
| 비밀번호 변경 | ❌ 미구현 | 높음 |
| 학생 삭제 | ❌ 미구현 | 중간 |
| 반 삭제 | ❌ 미구현 | 중간 |
| 학부모 대시보드 | ⚠️ 불완전 | 중간 |
| 세션 만료 안내 | ❌ 미구현 | 낮음 |
| 모바일 반응형 | ⚠️ 불완전 | 낮음 |

### 4.2 접근성 문제

- `<label>`과 `<Input>` 연결 없음
- 키보드 네비게이션 미지원
- `<th scope>` 속성 없음

### 4.3 타입 안전성

- `any` 타입 다수 사용 (15개소 이상)
- `as any` 타입 캐스팅

### 4.4 코드 중복

- 채점 로직 2곳 중복
- mutation 훅 패턴 중복
- impersonate 세션 설정 중복

---

## 5. 권장 조치 요약

### 즉시 수정 (배포 전)
1. ✅ 채점 로직 버그 수정
2. ✅ 답안 수정 소유권 검증
3. ✅ 입력 검증 추가
4. ✅ 테스트 계정 제거

### 단기 개선 (1-2주)
1. N+1 쿼리 최적화
2. Rate Limiting 적용
3. Toast 시스템 도입
4. 감사 로그 시스템

### 중기 개선 (1개월)
1. 컴포넌트 분리
2. 미구현 기능 완성
3. 타입 안전성 강화
4. 접근성 개선

---

**문서 끝**
