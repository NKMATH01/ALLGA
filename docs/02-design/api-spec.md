# 올가 미수등 시스템 - API 명세서

> **문서 버전**: 1.0
> **최종 수정일**: 2026-01-31
> **Base URL**: `http://localhost:5000/api`

---

## 1. 개요

### 1.1 인증 방식
- **세션 기반 인증** (express-session)
- 쿠키: `connect.sid`
- 만료: 24시간

### 1.2 응답 형식

**성공 응답**:
```json
{
  "success": true,
  "data": { ... },
  "message": "성공 메시지"
}
```

**오류 응답**:
```json
{
  "success": false,
  "message": "오류 메시지"
}
```

### 1.3 권한 레벨
| 레벨 | 역할 | 설명 |
|------|------|------|
| 0 | 공개 | 인증 불필요 |
| 1 | 로그인 | 인증된 모든 사용자 |
| 2 | admin | 관리자만 |
| 3 | branch | 관리자 + 지점 관리자 |
| 4 | student | 학생만 |
| 5 | parent | 학부모만 |

---

## 2. 인증 API (`/api/auth`)

### 2.1 POST /api/auth/login
**설명**: 사용자 로그인

**권한**: 공개

**요청**:
```json
{
  "username": "allga",
  "password": "allga",
  "userType": "admin"  // optional: admin | branch | student | parent
}
```

**응답 (200)**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "allga",
    "name": "관리자",
    "role": "admin",
    "branchId": null
  }
}
```

**오류 (401)**:
```json
{
  "message": "아이디 또는 비밀번호가 올바르지 않습니다."
}
```

---

### 2.2 GET /api/auth/me
**설명**: 현재 로그인 사용자 정보 조회

**권한**: 로그인 필요

**응답 (200)**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "allga1",
    "name": "강남점 관리자",
    "role": "branch",
    "branchId": "branch-id"
  }
}
```

---

### 2.3 POST /api/auth/logout
**설명**: 로그아웃

**권한**: 로그인 필요

**응답 (200)**:
```json
{
  "success": true,
  "message": "로그아웃되었습니다."
}
```

---

### 2.4 POST /api/auth/impersonate/:branchId
**설명**: 관리자가 지점 관리자로 전환

**권한**: admin

**응답 (200)**:
```json
{
  "success": true,
  "message": "강남점 관리자로 전환되었습니다.",
  "user": {
    "id": "branch-manager-id",
    "role": "branch",
    "branchId": "branch-id"
  }
}
```

---

### 2.5 POST /api/auth/impersonate/student/:studentId
**설명**: 학생으로 전환

**권한**: admin, branch

---

### 2.6 POST /api/auth/impersonate/parent/:parentId
**설명**: 학부모로 전환

**권한**: admin, branch

---

## 3. 지점 API (`/api/branches`)

### 3.1 GET /api/branches
**설명**: 지점 목록 조회

**권한**: admin

**쿼리 파라미터**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| includeInactive | boolean | 비활성 지점 포함 |

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "branch-1",
      "name": "강남점",
      "address": "서울시 강남구",
      "phone": "02-1234-5678",
      "managerName": "김지점장",
      "displayOrder": 1,
      "isActive": true
    }
  ]
}
```

---

### 3.2 POST /api/branches
**설명**: 지점 생성 (관리자 계정 포함)

**권한**: admin

**요청**:
```json
{
  "name": "신규지점",
  "address": "서울시 서초구",
  "phone": "02-9876-5432",
  "managerName": "박지점장",
  "managerUsername": "newbranch",
  "managerPassword": "password123"
}
```

**응답 (201)**:
```json
{
  "success": true,
  "data": {
    "branch": { "id": "new-branch-id", "name": "신규지점" },
    "manager": { "id": "manager-id", "username": "newbranch" }
  }
}
```

---

### 3.3 PUT /api/branches/:id
**설명**: 지점 정보 수정

**권한**: admin

---

### 3.4 DELETE /api/branches/:id
**설명**: 지점 삭제 (CASCADE)

**권한**: admin

---

### 3.5 POST /api/branches/reorder
**설명**: 지점 표시 순서 변경

**권한**: admin

**요청**:
```json
{
  "branchIds": ["branch-2", "branch-1", "branch-3"]
}
```

---

## 4. 시험 API (`/api/exams`)

### 4.1 GET /api/exams
**설명**: 시험 목록 조회

**권한**: admin

**쿼리 파라미터**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| subject | string | 과목 필터 |
| grade | string | 학년 필터 |

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "exam-1",
      "title": "2026년 3월 모의고사 수학",
      "subject": "수학",
      "grade": "고3",
      "totalQuestions": 45,
      "totalScore": 100,
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ]
}
```

---

### 4.2 GET /api/exams/:id
**설명**: 시험 상세 조회

**권한**: admin

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "exam-1",
    "title": "2026년 3월 모의고사 수학",
    "subject": "수학",
    "grade": "고3",
    "totalQuestions": 45,
    "totalScore": 100,
    "questionsData": [...],
    "examTrends": [...],
    "overallReview": "총평 텍스트"
  }
}
```

---

### 4.3 GET /api/exams/available
**설명**: 배포 가능한 시험 목록

**권한**: admin

---

### 4.4 POST /api/exams
**설명**: 시험 수동 생성

**권한**: admin

**요청**:
```json
{
  "title": "시험 제목",
  "subject": "수학",
  "grade": "고3",
  "totalQuestions": 45,
  "totalScore": 100,
  "questionsData": [...]
}
```

---

### 4.5 POST /api/exams/upload
**설명**: Excel 파일로 시험 업로드

**권한**: admin

**Content-Type**: `multipart/form-data`

**요청**:
- `file`: Excel 파일 (.xlsx)

**Excel 형식** (Row 4-48: 45문제):
| 열 | 내용 |
|----|------|
| A | 문제 번호 |
| B | 정답 (1-5) |
| C | 배점 |
| D | 난이도 (상/중/하) |
| E | 대분류 |
| F | 소분류 |
| G | 해설 |

**응답 (201)**:
```json
{
  "success": true,
  "data": {
    "id": "exam-id",
    "title": "파일명에서 추출",
    "totalQuestions": 45
  }
}
```

---

### 4.6 PATCH /api/exams/:id
**설명**: 시험 수정

**권한**: admin

---

### 4.7 DELETE /api/exams/:id
**설명**: 시험 삭제

**권한**: admin

---

## 5. 배포 API (`/api/distributions`)

### 5.1 GET /api/distributions
**설명**: 배포 목록 조회

**권한**: admin, branch

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "dist-1",
      "examId": "exam-1",
      "examTitle": "2026년 3월 모의고사",
      "branchId": "branch-1",
      "branchName": "강남점",
      "classId": null,
      "startDate": "2026-03-01T09:00:00Z",
      "endDate": "2026-03-01T12:00:00Z",
      "attemptCount": 25,
      "completedCount": 20
    }
  ]
}
```

---

### 5.2 POST /api/distributions
**설명**: 시험 배포

**권한**: admin, branch

**요청**:
```json
{
  "examId": "exam-1",
  "branchIds": ["branch-1", "branch-2"],  // admin only
  "classId": "class-1",                    // optional
  "studentIds": ["student-1", "student-2"], // optional
  "startDate": "2026-03-01T09:00:00Z",
  "endDate": "2026-03-01T12:00:00Z"
}
```

---

### 5.3 GET /api/distributions/:id
**설명**: 배포 상세 조회

**권한**: admin, branch

---

### 5.4 PUT /api/distributions/:id
**설명**: 배포 수정

**권한**: admin, branch

---

### 5.5 DELETE /api/distributions/:id
**설명**: 배포 삭제

**권한**: admin, branch

---

### 5.6 GET /api/distributions/:id/students
**설명**: 배포 대상 학생 목록

**권한**: admin, branch

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "studentId": "student-1",
      "studentName": "김민수",
      "hasAttempt": true,
      "isCompleted": true,
      "score": 85,
      "grade": 2
    }
  ]
}
```

---

## 6. 학생 API (`/api/students`)

### 6.1 GET /api/students
**설명**: 학생 목록 조회

**권한**: admin, branch

**쿼리 파라미터**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| branchId | string | 지점 필터 |
| classId | string | 반 필터 |
| grade | string | 학년 필터 |

---

### 6.2 POST /api/students
**설명**: 학생 생성

**권한**: branch

**요청**:
```json
{
  "name": "홍길동",
  "username": "hong_gildong",
  "password": "password123",
  "school": "서울고등학교",
  "grade": "고2",
  "phone": "010-1234-5678",
  "parentPhone": "010-8765-4321",
  "classIds": ["class-1"]
}
```

---

### 6.3 GET /api/students/:id
**설명**: 학생 상세 조회

**권한**: admin, branch

---

### 6.4 PUT /api/students/:id
**설명**: 학생 정보 수정

**권한**: branch

---

### 6.5 DELETE /api/students/:id
**설명**: 학생 삭제

**권한**: branch

---

## 7. 반 API (`/api/classes`)

### 7.1 GET /api/classes
**설명**: 반 목록 조회

**권한**: admin, branch

---

### 7.2 POST /api/classes
**설명**: 반 생성

**권한**: branch

**요청**:
```json
{
  "name": "고3-A반",
  "grade": "고3",
  "description": "수능 대비반"
}
```

---

### 7.3 PUT /api/classes/:id
**설명**: 반 수정

**권한**: branch

---

### 7.4 DELETE /api/classes/:id
**설명**: 반 삭제

**권한**: branch

---

### 7.5 POST /api/classes/:id/students
**설명**: 학생 반 배정

**권한**: branch

**요청**:
```json
{
  "studentIds": ["student-1", "student-2"]
}
```

---

## 8. 시험 응시 API

### 8.1 GET /api/my-exams
**설명**: 학생의 배포받은 시험 목록

**권한**: student

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "distributionId": "dist-1",
      "examId": "exam-1",
      "examTitle": "2026년 3월 모의고사",
      "subject": "수학",
      "startDate": "2026-03-01T09:00:00Z",
      "endDate": "2026-03-01T12:00:00Z",
      "status": "available",  // available | in_progress | completed | expired
      "attemptId": null
    }
  ]
}
```

---

### 8.2 GET /api/my-exams/:distributionId
**설명**: 시험 상세 정보 (응시 전)

**권한**: student

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "distributionId": "dist-1",
    "exam": {
      "id": "exam-1",
      "title": "2026년 3월 모의고사",
      "subject": "수학",
      "totalQuestions": 45,
      "totalScore": 100
    },
    "startDate": "2026-03-01T09:00:00Z",
    "endDate": "2026-03-01T12:00:00Z"
  }
}
```

---

### 8.3 POST /api/exam-attempts
**설명**: 시험 시작

**권한**: student

**요청**:
```json
{
  "distributionId": "dist-1"
}
```

**응답 (201)**:
```json
{
  "success": true,
  "data": {
    "attemptId": "attempt-1",
    "examId": "exam-1",
    "questionsData": [...],  // 문제 정보 (정답 제외)
    "startedAt": "2026-03-01T09:15:00Z"
  }
}
```

---

### 8.4 PUT /api/exam-attempts/:id
**설명**: 답안 임시 저장

**권한**: student

**요청**:
```json
{
  "answers": {
    "1": 3,
    "2": 1,
    "3": 4
  }
}
```

---

### 8.5 POST /api/exam-attempts/:id/submit
**설명**: 시험 제출 및 자동 채점

**권한**: student

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "attemptId": "attempt-1",
    "score": 85,
    "maxScore": 100,
    "grade": 2,
    "correctCount": 40,
    "submittedAt": "2026-03-01T10:30:00Z"
  }
}
```

---

### 8.6 GET /api/exam-attempts/:id
**설명**: 응시 결과 상세 조회

**권한**: student

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "attemptId": "attempt-1",
    "examTitle": "2026년 3월 모의고사",
    "score": 85,
    "maxScore": 100,
    "grade": 2,
    "correctCount": 40,
    "answers": { "1": 3, "2": 1, ... },
    "questionsData": [...],  // 정답 및 해설 포함
    "hasReport": true,
    "reportId": "report-1"
  }
}
```

---

### 8.7 GET /api/branch/completed
**설명**: 지점의 완료된 응시 목록

**권한**: branch

**쿼리 파라미터**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| examId | string | 시험 필터 |
| classId | string | 반 필터 |
| grade | string | 학년 필터 |

---

## 9. AI 보고서 API (`/api/reports`)

### 9.1 POST /api/reports/generate/:attemptId
**설명**: AI 분석 보고서 생성

**권한**: 모든 로그인 사용자

**처리 시간**: 15-30초 (Gemini API 호출)

**응답 (201)**:
```json
{
  "success": true,
  "data": {
    "reportId": "report-1",
    "generatedAt": "2026-03-01T11:00:00Z"
  }
}
```

---

### 9.2 GET /api/reports/:reportId
**설명**: 보고서 HTML 조회

**권한**: 모든 로그인 사용자

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "reportId": "report-1",
    "htmlContent": "<html>...</html>",
    "generatedAt": "2026-03-01T11:00:00Z"
  }
}
```

---

### 9.3 GET /api/reports/attempt/:attemptId
**설명**: 응시 기록의 보고서 조회

**권한**: 모든 로그인 사용자

---

## 10. 관리자 통계 API (`/api/admin`)

### 10.1 GET /api/admin/stats
**설명**: 전체 통계 조회

**권한**: admin

**쿼리 파라미터**:
| 파라미터 | 타입 | 설명 |
|----------|------|------|
| grade | string | 학년 필터 (예: 고1, 고2, 고3) |

**응답 (200)**:
```json
{
  "success": true,
  "data": {
    "totalBranches": 5,
    "totalStudents": 250,
    "totalExams": 20,
    "totalAttempts": 1500,
    "averageScore": 72.5,
    "gradeDistribution": {
      "1": 45,
      "2": 80,
      "3": 120,
      "4": 200
    },
    "branchStats": [
      {
        "branchId": "branch-1",
        "branchName": "강남점",
        "studentCount": 50,
        "attemptCount": 300,
        "averageScore": 75.2
      }
    ]
  }
}
```

---

### 10.2 GET /api/admin/recent-activity
**설명**: 최근 활동 조회

**권한**: admin

**응답 (200)**:
```json
{
  "success": true,
  "data": [
    {
      "type": "exam_completed",
      "studentName": "김민수",
      "examTitle": "3월 모의고사",
      "branchName": "강남점",
      "score": 85,
      "grade": 2,
      "timestamp": "2026-03-01T10:30:00Z"
    }
  ]
}
```

---

## 11. 학부모 API (`/api/parents`)

### 11.1 GET /api/parents/children
**설명**: 자녀 목록 조회

**권한**: parent

---

### 11.2 GET /api/parents/children/:studentId/attempts
**설명**: 자녀의 시험 응시 기록

**권한**: parent

---

### 11.3 GET /api/parents/children/:studentId/reports
**설명**: 자녀의 AI 보고서 목록

**권한**: parent

---

## 12. 오류 코드

| 코드 | HTTP | 설명 |
|------|------|------|
| UNAUTHORIZED | 401 | 인증 필요 |
| FORBIDDEN | 403 | 권한 없음 |
| NOT_FOUND | 404 | 리소스 없음 |
| VALIDATION_ERROR | 400 | 입력값 오류 |
| DUPLICATE_ENTRY | 409 | 중복 데이터 |
| EXAM_EXPIRED | 400 | 시험 기간 만료 |
| ALREADY_SUBMITTED | 400 | 이미 제출됨 |
| REPORT_GENERATION_FAILED | 500 | AI 보고서 생성 실패 |

---

**문서 끝**
