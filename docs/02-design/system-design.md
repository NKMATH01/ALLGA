# 올가 미수등 시스템 - 시스템 설계서 v1.0

> **문서 버전**: 1.0
> **최종 수정일**: 2026-01-31
> **프로젝트 레벨**: Dynamic (Fullstack with BaaS patterns)

---

## 1. 시스템 개요

### 1.1 프로젝트 정의

**프로젝트명**: 올가 미수등 시스템 (OLGA Academy Management System)

**목적**: 한국 대학입시 준비 학원 프랜차이즈를 위한 종합 시험 관리 및 AI 분석 시스템

**핵심 가치**:
- Excel 기반 편리한 시험 입력
- 실시간 자동 채점 (1-9등급)
- AI 기반 개인화 분석 보고서 (Google Gemini API)
- 4단계 역할 기반 권한 관리
- 다중 지점 데이터 격리 및 통합 관리

### 1.2 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│   React 18 + TypeScript + Wouter + TanStack Query           │
│   Shadcn/ui + Tailwind CSS + Chart.js + Recharts            │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API (Port 5000)
┌─────────────────────────┴───────────────────────────────────┐
│                        Backend                               │
│   Node.js + Express + TypeScript                            │
│   Session Management (express-session) + bcrypt Auth        │
└─────────────────────────┬─────────────┬─────────────────────┘
                          │             │
              ┌───────────┴──────┐  ┌──┴────────────┐
              │   PostgreSQL     │  │  Gemini API   │
              │   (Neon DB)      │  │  (AI 분석)    │
              │   Drizzle ORM    │  │               │
              └──────────────────┘  └───────────────┘
```

### 1.3 기술 스택

| 영역 | 기술 | 버전/설명 |
|------|------|-----------|
| **Frontend** | React | 18.x |
| | TypeScript | 5.x |
| | Vite | 빌드 도구 |
| | Wouter | 라우팅 |
| | TanStack Query | 서버 상태 관리 |
| | Tailwind CSS | 스타일링 |
| | Shadcn/ui | UI 컴포넌트 |
| | Chart.js, Recharts | 데이터 시각화 |
| | React Hook Form + Zod | 폼 처리 및 검증 |
| **Backend** | Node.js + Express | 서버 프레임워크 |
| | TypeScript | 타입 안전성 |
| | Drizzle ORM | 데이터베이스 ORM |
| | bcrypt | 비밀번호 해싱 |
| | express-session | 세션 관리 |
| | multer | 파일 업로드 |
| | xlsx | Excel 파싱 |
| **Database** | PostgreSQL | Neon DB (클라우드) |
| **AI** | Google Gemini API | 보고서 생성 |
| | OpenAI API | 대체 AI (옵션) |
| **배포** | Vercel/Netlify | Frontend |
| | Railway/Render | Backend |

---

## 2. 사용자 역할 및 권한 설계

### 2.1 역할 정의 (4단계)

| 역할 | 코드 | 설명 | 주요 권한 |
|------|------|------|-----------|
| **관리자** | `admin` | 전체 시스템 관리자 | 시험 생성, 지점 관리, 전체 통계 |
| **지점 관리자** | `branch` | 개별 지점 관리자 | 학생/반 관리, 시험 배포, 지점 통계 |
| **학생** | `student` | 시험 응시자 | 시험 응시, 성적 조회, AI 보고서 |
| **학부모** | `parent` | 학생 보호자 | 자녀 성적 조회, AI 보고서 조회 |

### 2.2 권한 매트릭스

| 기능 | admin | branch | student | parent |
|------|:-----:|:------:|:-------:|:------:|
| 지점 CRUD | ✅ | ❌ | ❌ | ❌ |
| 시험 CRUD | ✅ | ❌ | ❌ | ❌ |
| 시험 배포 (다중 지점) | ✅ | ❌ | ❌ | ❌ |
| 시험 배포 (본인 지점) | ✅ | ✅ | ❌ | ❌ |
| 학생/반 관리 | ✅ | ✅ | ❌ | ❌ |
| 시험 응시 | ❌ | ❌ | ✅ | ❌ |
| 본인 성적 조회 | ❌ | ❌ | ✅ | ❌ |
| 자녀 성적 조회 | ❌ | ❌ | ❌ | ✅ |
| AI 보고서 조회 | ✅ | ✅ | ✅ | ✅ |
| 전체 통계 | ✅ | ❌ | ❌ | ❌ |
| 지점 통계 | ✅ | ✅ | ❌ | ❌ |
| Impersonation | ✅ | ✅ | ❌ | ❌ |

### 2.3 데이터 격리 정책

```
관리자 (admin)
  └── 모든 지점 데이터 접근 가능
  └── 시스템 전체 통계

지점 관리자 (branch)
  └── 본인 지점 데이터만 접근
  └── branchId 기반 필터링

학생 (student)
  └── 본인 데이터만 접근
  └── studentId 기반 필터링

학부모 (parent)
  └── 연결된 자녀 데이터만 접근
  └── student_parents 테이블 기반
```

---

## 3. 데이터 모델 설계

### 3.1 ERD (Entity Relationship Diagram)

```
┌──────────────┐         ┌──────────────┐
│   branches   │◄────────│    users     │
│              │  1    * │              │
│ - id (PK)    │         │ - id (PK)    │
│ - name       │         │ - username   │
│ - address    │         │ - role       │
│ - phone      │         │ - branchId   │
│ - displayOrder│        └──────┬───────┘
└──────┬───────┘                │
       │ 1                      │ 1
       │ *                      │ *
┌──────┴───────┐         ┌──────┴───────┐
│   classes    │         │   students   │
│              │         │              │
│ - id (PK)    │         │ - id (PK)    │
│ - name       │         │ - userId     │
│ - branchId   │         │ - branchId   │
│ - grade      │         │ - grade      │
└──────────────┘         └──────┬───────┘
                                │ 1
                                │ *
                         ┌──────┴────────┐
                         │ examAttempts  │
                         │               │
                         │ - id (PK)     │
                         │ - studentId   │
                         │ - examId      │
                         │ - score       │
                         │ - grade (1-9) │
                         └───────┬───────┘
                                 │ 1
                                 │ 1
                         ┌───────┴───────┐
                         │  ai_reports   │
                         │               │
                         │ - id (PK)     │
                         │ - attemptId   │
                         │ - htmlContent │
                         └───────────────┘
```

### 3.2 테이블 상세 명세

#### 3.2.1 users (사용자)
```typescript
{
  id: varchar(255) PK,          // UUID
  username: text UNIQUE NOT NULL,
  passwordHash: text NOT NULL,  // bcrypt 해시
  role: text NOT NULL,          // admin | branch | student | parent
  name: text NOT NULL,
  email: text,
  phone: text,
  branchId: varchar(255) FK,    // → branches.id
  isActive: boolean DEFAULT true,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### 3.2.2 branches (지점)
```typescript
{
  id: varchar(255) PK,
  name: text NOT NULL,
  address: text,
  phone: text,
  managerName: text,
  displayOrder: integer DEFAULT 0,
  isActive: boolean DEFAULT true,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### 3.2.3 classes (반)
```typescript
{
  id: varchar(255) PK,
  name: text NOT NULL,
  branchId: varchar(255) FK NOT NULL,  // → branches.id CASCADE
  grade: text,                          // 고1, 고2, 고3 등
  description: text,
  isActive: boolean DEFAULT true,
  createdAt: timestamp
}
```

#### 3.2.4 students (학생)
```typescript
{
  id: varchar(255) PK,
  userId: varchar(255) FK UNIQUE NOT NULL,  // → users.id CASCADE
  branchId: varchar(255) FK NOT NULL,       // → branches.id CASCADE
  school: text,
  grade: text,
  parentPhone: text,
  enrollmentDate: timestamp
}
```

#### 3.2.5 parents (학부모)
```typescript
{
  id: varchar(255) PK,
  userId: varchar(255) FK UNIQUE NOT NULL,  // → users.id CASCADE
  branchId: varchar(255) FK NOT NULL        // → branches.id CASCADE
}
```

#### 3.2.6 student_parents (학생-학부모 관계)
```typescript
{
  id: varchar(255) PK,
  studentId: varchar(255) FK NOT NULL,  // → students.id CASCADE
  parentId: varchar(255) FK NOT NULL    // → parents.id CASCADE
}
// UNIQUE (studentId, parentId)
```

#### 3.2.7 student_classes (학생-반 배정)
```typescript
{
  id: varchar(255) PK,
  studentId: varchar(255) FK NOT NULL,  // → students.id CASCADE
  classId: varchar(255) FK NOT NULL,    // → classes.id CASCADE
  enrolledAt: timestamp
}
// UNIQUE (studentId, classId)
```

#### 3.2.8 exams (시험)
```typescript
{
  id: varchar(255) PK,
  title: text NOT NULL,
  subject: text NOT NULL,           // 국어, 수학, 영어 등
  grade: text,                      // 대상 학년
  description: text,
  totalQuestions: integer NOT NULL, // 45 (표준)
  totalScore: integer NOT NULL,     // 100
  examFileUrl: text,
  questionsData: json NOT NULL,     // 문제 메타데이터 배열
  examTrends: json,                 // 출제 경향
  overallReview: text,              // 총평
  createdBy: varchar(255) FK NOT NULL,
  createdAt: timestamp
}

// questionsData 구조
[
  {
    "questionNumber": 1,
    "difficulty": "상" | "중" | "하",
    "category": "대수",
    "subcategory": "이차함수",
    "correctAnswer": 3,
    "points": 2,
    "commentary": "해설 텍스트"
  }
]
```

#### 3.2.9 exam_distributions (시험 배포)
```typescript
{
  id: varchar(255) PK,
  examId: varchar(255) FK NOT NULL,     // → exams.id CASCADE
  branchId: varchar(255) FK NOT NULL,   // → branches.id CASCADE
  classId: varchar(255) FK,             // → classes.id CASCADE (NULL = 전체)
  parentDistributionId: varchar(255) FK, // 상위 배포 참조
  startDate: timestamp NOT NULL,
  endDate: timestamp NOT NULL,
  distributedBy: varchar(255) FK NOT NULL,
  createdAt: timestamp
}
```

#### 3.2.10 distribution_students (배포 대상 학생)
```typescript
{
  id: varchar(255) PK,
  distributionId: varchar(255) FK NOT NULL,  // → exam_distributions.id CASCADE
  studentId: varchar(255) FK NOT NULL,       // → students.id CASCADE
  createdAt: timestamp
}
```

#### 3.2.11 exam_attempts (시험 응시)
```typescript
{
  id: varchar(255) PK,
  examId: varchar(255) FK NOT NULL,
  studentId: varchar(255) FK NOT NULL,
  distributionId: varchar(255) FK NOT NULL,
  answers: json NOT NULL,           // { "1": 3, "2": 1, ... }
  score: integer,                   // 획득 점수
  maxScore: integer,                // 만점
  grade: integer,                   // 1-9 등급
  correctCount: integer,            // 정답 개수
  startedAt: timestamp,
  submittedAt: timestamp,
  gradedAt: timestamp
}
// UNIQUE (studentId, distributionId)
```

#### 3.2.12 ai_reports (AI 분석 보고서)
```typescript
{
  id: varchar(255) PK,
  attemptId: varchar(255) FK UNIQUE NOT NULL,  // → exam_attempts.id CASCADE
  studentId: varchar(255) FK NOT NULL,
  examId: varchar(255) FK NOT NULL,
  analysis: json,                   // AI 분석 데이터
  weakAreas: json,                  // 취약 영역 배열
  recommendations: json,            // 추천 학습 전략
  expectedGrade: integer,
  summary: text,
  htmlContent: text,                // 완성된 HTML 보고서
  generatedAt: timestamp
}
```

### 3.3 등급 산출 기준

| 등급 | 백분율 범위 | 설명 |
|:----:|:-----------:|------|
| 1 | 96% 이상 | 최상위 |
| 2 | 89% - 95% | 상위권 |
| 3 | 77% - 88% | 중상위 |
| 4 | 60% - 76% | 중위권 |
| 5 | 40% - 59% | 중하위 |
| 6 | 23% - 39% | 하위권 |
| 7 | 11% - 22% | 하위 |
| 8 | 4% - 10% | 최하위 |
| 9 | 4% 미만 | 기초 |

---

## 4. API 설계

### 4.1 API 엔드포인트 목록

#### 인증 API (`/api/auth`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| POST | `/login` | 로그인 | 공개 |
| GET | `/me` | 현재 사용자 정보 | 로그인 필요 |
| POST | `/logout` | 로그아웃 | 로그인 필요 |
| POST | `/impersonate/:branchId` | 지점 관리자로 전환 | admin |
| POST | `/impersonate/student/:studentId` | 학생으로 전환 | admin, branch |
| POST | `/impersonate/parent/:parentId` | 학부모로 전환 | admin, branch |

#### 지점 API (`/api/branches`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/` | 지점 목록 | admin |
| POST | `/` | 지점 생성 | admin |
| PUT | `/:id` | 지점 수정 | admin |
| DELETE | `/:id` | 지점 삭제 | admin |
| POST | `/reorder` | 지점 순서 변경 | admin |

#### 시험 API (`/api/exams`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/` | 시험 목록 | admin |
| GET | `/:id` | 시험 상세 | admin |
| GET | `/available` | 이용 가능한 시험 | admin |
| POST | `/` | 시험 생성 | admin |
| PATCH | `/:id` | 시험 수정 | admin |
| DELETE | `/:id` | 시험 삭제 | admin |
| POST | `/upload` | Excel 시험 업로드 | admin |

#### 배포 API (`/api/distributions`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/` | 배포 목록 | admin, branch |
| POST | `/` | 시험 배포 | admin, branch |
| GET | `/:id` | 배포 상세 | admin, branch |
| PUT | `/:id` | 배포 수정 | admin, branch |
| DELETE | `/:id` | 배포 삭제 | admin, branch |
| GET | `/:id/students` | 배포 대상 학생 | admin, branch |

#### 학생 API (`/api/students`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/` | 학생 목록 | admin, branch |
| POST | `/` | 학생 생성 | branch |
| GET | `/:id` | 학생 상세 | admin, branch |
| PUT | `/:id` | 학생 수정 | branch |
| DELETE | `/:id` | 학생 삭제 | branch |

#### 반 API (`/api/classes`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/` | 반 목록 | admin, branch |
| POST | `/` | 반 생성 | branch |
| PUT | `/:id` | 반 수정 | branch |
| DELETE | `/:id` | 반 삭제 | branch |
| POST | `/:id/students` | 학생 배정 | branch |

#### 시험 응시 API (`/api/`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/my-exams` | 배포받은 시험 목록 | student |
| GET | `/my-exams/:distributionId` | 시험 상세 정보 | student |
| POST | `/exam-attempts` | 시험 시작 | student |
| PUT | `/exam-attempts/:id` | 답안 임시 저장 | student |
| POST | `/exam-attempts/:id/submit` | 시험 제출 | student |
| GET | `/exam-attempts/:id` | 응시 결과 | student |
| GET | `/branch/completed` | 완료된 응시 목록 | branch |

#### AI 보고서 API (`/api/reports`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| POST | `/generate/:attemptId` | AI 보고서 생성 | 모두 |
| GET | `/:reportId` | 보고서 HTML 조회 | 모두 |
| GET | `/attempt/:attemptId` | 응시별 보고서 조회 | 모두 |

#### 관리자 통계 API (`/api/admin`)
| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/stats` | 전체 통계 | admin |
| GET | `/recent-activity` | 최근 활동 | admin |

### 4.2 응답 형식

#### 성공 응답
```json
{
  "success": true,
  "data": { ... },
  "message": "처리되었습니다."
}
```

#### 오류 응답
```json
{
  "success": false,
  "error": "오류 메시지",
  "code": "ERROR_CODE"
}
```

---

## 5. UI/UX 설계

### 5.1 페이지 구조

```
/login                      # 로그인 페이지
/admin                      # 관리자 대시보드
  ├── /branches             # 지점 관리
  ├── /exams                # 시험 관리
  ├── /distributions        # 배포 관리
  └── /statistics           # 통계
/branch                     # 지점 관리자 대시보드
  ├── /students             # 학생 관리
  ├── /classes              # 반 관리
  ├── /distributions        # 배포 관리
  └── /results              # 성적 결과
/student                    # 학생 대시보드
  ├── /exams                # 시험 목록
  ├── /exam/:id             # 시험 응시
  └── /results              # 내 성적
/parent                     # 학부모 대시보드
  └── /children             # 자녀 성적 조회
```

### 5.2 주요 화면

#### 관리자 대시보드
- 전체 지점 현황 (카드 그리드)
- 최근 시험 배포 현황
- 응시 완료 통계 (차트)
- 학년별 평균 등급

#### 지점 관리자 대시보드
- 지점 내 학생 현황
- 반별 성적 현황
- 최근 응시 결과
- AI 보고서 생성 현황

#### 학생 대시보드
- 배포된 시험 목록 (응시 가능/완료)
- 최근 성적 추이 (차트)
- AI 분석 보고서 링크

#### 시험 응시 화면
- 45문제 5지선다 (1-5번)
- 문제별 탐색
- 임시 저장
- 제출 확인

---

## 6. 보안 설계

### 6.1 인증/인가

| 항목 | 구현 |
|------|------|
| 비밀번호 저장 | bcrypt (salt rounds: 10) |
| 세션 관리 | express-session (24시간 만료) |
| 세션 저장소 | PostgreSQL (connect-pg-simple) |
| CSRF 방어 | 동일 출처 정책 |

### 6.2 데이터 보안

| 위협 | 대응 |
|------|------|
| SQL Injection | Drizzle ORM 파라미터화 쿼리 |
| XSS | HTML/JSON 이스케이프 |
| 권한 우회 | 미들웨어 기반 역할 검증 |
| 데이터 노출 | branchId 기반 필터링 |

### 6.3 미들웨어

```typescript
// 인증 확인
requireAuth(req, res, next)

// 역할 확인
requireRole('admin', 'branch')(req, res, next)

// 지점 데이터 격리
requireBranchAccess(req, res, next)
```

---

## 7. 배포 설계

### 7.1 환경 변수

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# API Keys
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=optional_openai_key

# Session
SESSION_SECRET=random_secret_string

# Server
PORT=5000
NODE_ENV=development|production
```

### 7.2 npm 스크립트

```json
{
  "dev": "npm run dev:server & npm run dev:client",
  "dev:client": "vite",
  "dev:server": "tsx watch server/index.ts",
  "build": "npm run build:client && npm run build:server",
  "start": "node dist/index.js",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx server/db/migrate.ts",
  "db:studio": "drizzle-kit studio"
}
```

---

## 8. 테스트 계정

| 역할 | 아이디 | 비밀번호 | 설명 |
|------|--------|----------|------|
| 관리자 | allga | allga | 전체 시스템 관리 |
| 지점 관리자 | allga1 | allga1 | 강남점 관리 |
| 학생 | kim_minsu | password123 | 테스트 학생 |

---

## 9. 향후 확장 계획

### 9.1 단기 (1-3개월)
- [ ] 모바일 반응형 UI 개선
- [ ] 시험 문제 프리뷰 기능
- [ ] 학부모 알림 기능 (카카오톡)

### 9.2 중기 (3-6개월)
- [ ] 시험 문제 은행 기능
- [ ] 학습 추천 시스템 고도화
- [ ] 다중 언어 지원

### 9.3 장기 (6-12개월)
- [ ] 마이크로서비스 분리
- [ ] 실시간 알림 (WebSocket)
- [ ] 모바일 앱 (React Native)

---

**문서 끝**
