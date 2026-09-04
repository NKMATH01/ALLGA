# 올가 미수등 시스템 - 데이터 모델 설계서

> **문서 버전**: 1.0
> **최종 수정일**: 2026-01-31

---

## 1. 개요

본 문서는 올가 미수등 시스템의 데이터베이스 스키마와 엔티티 관계를 정의합니다.

**데이터베이스**: PostgreSQL (Neon DB)
**ORM**: Drizzle ORM
**스키마 파일**: `server/db/schema.ts`

---

## 2. ERD (Entity Relationship Diagram)

```
                              ┌──────────────────┐
                              │      users       │
                              │──────────────────│
                              │ id (PK)          │
                              │ username (UQ)    │
                              │ passwordHash     │
                              │ role             │
                              │ name             │
                              │ branchId (FK)    │
                              └────────┬─────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │    students     │      │     parents     │      │    branches     │
    │─────────────────│      │─────────────────│      │─────────────────│
    │ id (PK)         │      │ id (PK)         │      │ id (PK)         │
    │ userId (FK, UQ) │      │ userId (FK, UQ) │      │ name            │
    │ branchId (FK)   │      │ branchId (FK)   │      │ address         │
    │ school          │      └────────┬────────┘      │ displayOrder    │
    │ grade           │               │               └────────┬────────┘
    └────────┬────────┘               │                        │
             │                        │                        │
             │         ┌──────────────┴──────────────┐         │
             │         │     student_parents         │         │
             │         │ (studentId, parentId)       │         │
             │         └─────────────────────────────┘         │
             │                                                 │
             ├─────────────────────────────────────────────────┤
             │                                                 │
             ▼                                                 ▼
    ┌─────────────────┐                              ┌─────────────────┐
    │ student_classes │                              │     classes     │
    │─────────────────│                              │─────────────────│
    │ studentId (FK)  │◄────────────────────────────►│ id (PK)         │
    │ classId (FK)    │                              │ branchId (FK)   │
    └─────────────────┘                              │ name            │
             │                                       │ grade           │
             │                                       └─────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                        exam_attempts                             │
    │─────────────────────────────────────────────────────────────────│
    │ id (PK)                                                          │
    │ examId (FK) ──────────────────────────────────► exams           │
    │ studentId (FK)                                                   │
    │ distributionId (FK) ──────────────────────────► exam_distributions│
    │ answers (JSON)                                                   │
    │ score, grade (1-9)                                               │
    └────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   ai_reports    │
                        │─────────────────│
                        │ id (PK)         │
                        │ attemptId (FK)  │
                        │ htmlContent     │
                        └─────────────────┘
```

---

## 3. 테이블 상세 명세

### 3.1 users (사용자)

사용자 계정 정보를 저장합니다. 모든 역할(admin, branch, student, parent)이 이 테이블을 사용합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| username | TEXT | UNIQUE, NOT NULL | 로그인 아이디 |
| passwordHash | TEXT | NOT NULL | bcrypt 해시 비밀번호 |
| role | TEXT | NOT NULL | 역할: admin, branch, student, parent |
| name | TEXT | NOT NULL | 사용자 이름 |
| email | TEXT | | 이메일 (선택) |
| phone | TEXT | | 전화번호 (선택) |
| branchId | VARCHAR(255) | FK → branches.id | 소속 지점 |
| isActive | BOOLEAN | DEFAULT true | 활성 상태 |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |
| updatedAt | TIMESTAMP | DEFAULT NOW() | 수정일시 |

**인덱스**:
- `idx_users_username` ON (username)
- `idx_users_role` ON (role)
- `idx_users_branch` ON (branchId)

**외래키**: `branchId` → branches.id (SET NULL ON DELETE, 2026-09-04 마이그레이션 0008. 지점 삭제 시 계정은 비활성으로 남기므로 CASCADE 가 아님)

---

### 3.2 branches (지점)

학원 지점 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| name | TEXT | NOT NULL | 지점명 (예: 강남점) |
| address | TEXT | | 주소 |
| phone | TEXT | | 대표 전화번호 |
| managerName | TEXT | | 지점장 이름 |
| displayOrder | INTEGER | DEFAULT 0 | 표시 순서 |
| isActive | BOOLEAN | DEFAULT true | 활성 상태 |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |
| updatedAt | TIMESTAMP | DEFAULT NOW() | 수정일시 |

---

### 3.3 classes (반)

지점 내 반 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| name | TEXT | NOT NULL | 반 이름 (예: 고3-A반) |
| branchId | VARCHAR(255) | FK, NOT NULL | 소속 지점 |
| grade | TEXT | | 학년 (고1, 고2, 고3) |
| description | TEXT | | 설명 |
| isActive | BOOLEAN | DEFAULT true | 활성 상태 |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |

**외래키**: `branchId` → branches.id (CASCADE DELETE)

---

### 3.4 students (학생)

학생 상세 정보를 저장합니다. users 테이블과 1:1 관계입니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| userId | VARCHAR(255) | FK, UNIQUE, NOT NULL | 사용자 계정 연결 |
| branchId | VARCHAR(255) | FK, NOT NULL | 소속 지점 |
| school | TEXT | | 학교명 |
| grade | TEXT | | 학년 |
| parentPhone | TEXT | | 학부모 연락처 |
| enrollmentDate | TIMESTAMP | DEFAULT NOW() | 등록일 |

**외래키**:
- `userId` → users.id (CASCADE DELETE)
- `branchId` → branches.id (CASCADE DELETE)

---

### 3.5 parents (학부모)

학부모 상세 정보를 저장합니다. users 테이블과 1:1 관계입니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| userId | VARCHAR(255) | FK, UNIQUE, NOT NULL | 사용자 계정 연결 |
| branchId | VARCHAR(255) | FK, NOT NULL | 소속 지점 |

**외래키**:
- `userId` → users.id (CASCADE DELETE)
- `branchId` → branches.id (CASCADE DELETE)

---

### 3.6 student_parents (학생-학부모 관계)

학생과 학부모의 다대다 관계를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| studentId | VARCHAR(255) | FK, NOT NULL | 학생 ID |
| parentId | VARCHAR(255) | FK, NOT NULL | 학부모 ID |

**제약**: UNIQUE (studentId, parentId) (2026-09-04 0008 로 DB 반영)

**외래키**:
- `studentId` → students.id (CASCADE DELETE)
- `parentId` → parents.id (CASCADE DELETE)

---

### 3.7 student_classes (학생-반 배정)

학생의 반 배정 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| studentId | VARCHAR(255) | FK, NOT NULL | 학생 ID |
| classId | VARCHAR(255) | FK, NOT NULL | 반 ID |
| enrolledAt | TIMESTAMP | DEFAULT NOW() | 배정일시 |

**제약**: UNIQUE (studentId, classId) (2026-09-04 0008 로 DB 반영)

**외래키**:
- `studentId` → students.id (CASCADE DELETE)
- `classId` → classes.id (CASCADE DELETE)

---

### 3.8 exams (시험)

시험 문제 및 메타데이터를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| title | TEXT | NOT NULL | 시험 제목 |
| subject | TEXT | NOT NULL | 과목 (국어, 수학, 영어 등) |
| grade | TEXT | | 대상 학년 |
| description | TEXT | | 설명 |
| totalQuestions | INTEGER | NOT NULL | 총 문제 수 (표준: 45) |
| totalScore | INTEGER | NOT NULL | 만점 (표준: 100) |
| examFileUrl | TEXT | | 시험지 파일 URL |
| questionsData | JSON | NOT NULL | 문제 메타데이터 배열 |
| examTrends | JSON | | 출제 경향 분석 |
| overallReview | TEXT | | 총평 |
| createdBy | VARCHAR(255) | FK, NOT NULL | 생성자 |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |

**questionsData 구조**:
```json
[
  {
    "questionNumber": 1,
    "difficulty": "상",
    "category": "대수",
    "subcategory": "이차함수",
    "correctAnswer": 3,
    "points": 2,
    "commentary": "해설 텍스트"
  }
]
```

**examTrends 구조**:
```json
[
  {
    "questionNumbers": "1,2,3",
    "description": "이차함수의 그래프와 최댓값, 최솟값 문제"
  }
]
```

---

### 3.9 exam_distributions (시험 배포)

시험의 지점/반별 배포 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| examId | VARCHAR(255) | FK, NOT NULL | 시험 ID |
| branchId | VARCHAR(255) | FK, NOT NULL | 대상 지점 |
| classId | VARCHAR(255) | FK | 대상 반 (NULL = 전체) |
| parentDistributionId | VARCHAR(255) | FK | 상위 배포 ID |
| startDate | TIMESTAMP | NOT NULL | 응시 시작일시 |
| endDate | TIMESTAMP | NOT NULL | 응시 종료일시 |
| distributedBy | VARCHAR(255) | FK, NOT NULL | 배포자 |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |

**외래키**:
- `examId` → exams.id (CASCADE DELETE)
- `branchId` → branches.id (CASCADE DELETE)
- `classId` → classes.id (CASCADE DELETE)
- `parentDistributionId` → exam_distributions.id (CASCADE DELETE)

---

### 3.10 distribution_students (배포 대상 학생)

특정 학생에게 배포된 시험 정보를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| distributionId | VARCHAR(255) | FK, NOT NULL | 배포 ID |
| studentId | VARCHAR(255) | FK, NOT NULL | 학생 ID |
| createdAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |

**외래키**:
- `distributionId` → exam_distributions.id (CASCADE DELETE)
- `studentId` → students.id (CASCADE DELETE)

---

### 3.11 exam_attempts (시험 응시)

학생의 시험 응시 기록과 결과를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| examId | VARCHAR(255) | FK, NOT NULL | 시험 ID |
| studentId | VARCHAR(255) | FK, NOT NULL | 학생 ID |
| distributionId | VARCHAR(255) | FK, NOT NULL | 배포 ID |
| answers | JSON | NOT NULL | 학생 답안 |
| score | INTEGER | | 획득 점수 |
| maxScore | INTEGER | | 만점 |
| grade | INTEGER | | 등급 (1-9) |
| correctCount | INTEGER | | 정답 개수 |
| startedAt | TIMESTAMP | DEFAULT NOW() | 시작일시 |
| submittedAt | TIMESTAMP | | 제출일시 |
| gradedAt | TIMESTAMP | | 채점일시 |

**제약**: UNIQUE (studentId, distributionId)

**answers 구조**:
```json
{
  "1": 3,
  "2": 1,
  "3": 4,
  "4": 2,
  "5": 5
}
```

---

### 3.12 ai_reports (AI 분석 보고서)

Google Gemini API로 생성된 AI 분석 보고서를 저장합니다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | VARCHAR(255) | PK | UUID 자동 생성 |
| attemptId | VARCHAR(255) | FK, UNIQUE, NOT NULL | 응시 기록 ID |
| studentId | VARCHAR(255) | FK, NOT NULL | 학생 ID |
| examId | VARCHAR(255) | FK, NOT NULL | 시험 ID |
| analysis | JSON | | AI 분석 데이터 |
| weakAreas | JSON | | 취약 영역 배열 |
| recommendations | JSON | | 추천 학습 전략 |
| expectedGrade | INTEGER | | 예상 등급 |
| summary | TEXT | | 종합 요약 |
| htmlContent | TEXT | | 완성된 HTML 보고서 |
| generatedAt | TIMESTAMP | DEFAULT NOW() | 생성일시 |

**외래키**:
- `attemptId` → exam_attempts.id (CASCADE DELETE)
- `studentId` → students.id (CASCADE DELETE)
- `examId` → exams.id (CASCADE DELETE)

---

## 4. 등급 산출 기준

시험 제출 시 자동으로 등급이 산출됩니다.

| 등급 | 백분율 범위 | 산출 기준 |
|:----:|:-----------:|----------|
| 1 | 96% 이상 | score >= maxScore * 0.96 |
| 2 | 89% - 95% | score >= maxScore * 0.89 |
| 3 | 77% - 88% | score >= maxScore * 0.77 |
| 4 | 60% - 76% | score >= maxScore * 0.60 |
| 5 | 40% - 59% | score >= maxScore * 0.40 |
| 6 | 23% - 39% | score >= maxScore * 0.23 |
| 7 | 11% - 22% | score >= maxScore * 0.11 |
| 8 | 4% - 10% | score >= maxScore * 0.04 |
| 9 | 4% 미만 | score < maxScore * 0.04 |

---

## 5. 데이터 무결성 규칙

### 5.1 CASCADE 삭제
- 지점 삭제 → 소속 사용자, 학생, 반, 배포 삭제
- 시험 삭제 → 배포, 응시 기록, AI 보고서 삭제
- 학생 삭제 → 응시 기록, AI 보고서, 반 배정 삭제
- 사용자 삭제 → 연결된 학생/학부모 정보 삭제

### 5.2 UNIQUE 제약
- users.username (로그인 아이디 중복 방지)
- students.userId (사용자당 1명의 학생)
- parents.userId (사용자당 1명의 학부모)
- ai_reports.attemptId (응시당 1개의 보고서)
- exam_attempts(studentId, distributionId) (배포당 1회 응시)

### 5.3 NOT NULL 제약
- 모든 이름 필드 (name, title 등)
- 외래키 참조 (선택적 제외)
- 시험 점수 관련 필드

---

## 6. 마이그레이션 명령어

```bash
# 마이그레이션 생성
npm run db:generate

# 마이그레이션 실행
npm run db:migrate

# DB 스튜디오 (GUI)
npm run db:studio
```

---

**문서 끝**
