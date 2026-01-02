# 올가 미수등 시스템 (OLGA Academy Management System)

한국 대학입시 준비 학원 프랜차이즈를 위한 종합 관리 시스템

## 🎯 주요 기능

- **4단계 역할 기반 접근 제어**: 관리자, 지점 관리자, 학생, 학부모
- **시험 관리**: Excel 기반 시험 업로드 및 문제 은행 관리
- **시험 배포**: 지점/반별 시험 배포 및 응시 기간 관리
- **자동 채점**: 학생 제출 시 즉시 1~9등급 자동 산출
- **AI 분석**: Google Gemini API를 활용한 개인화된 성적 분석 보고서
- **다중 지점 관리**: 지점별 데이터 격리 및 통합 대시보드

## 🏗️ 기술 스택

### Backend
- Node.js + Express + TypeScript
- PostgreSQL (Drizzle ORM)
- bcrypt (비밀번호 해싱)
- express-session (세션 관리)
- multer (파일 업로드)
- xlsx (Excel 파싱)
- Google Gemini API (AI 분석)

### Frontend
- React 18 + TypeScript
- Wouter (라우팅)
- TanStack Query (서버 상태 관리)
- Tailwind CSS + Shadcn/ui
- Chart.js (데이터 시각화)

## 📦 설치 방법

### 1. 의존성 설치

\`\`\`bash
npm install
\`\`\`

### 2. 환경 변수 설정

\`.env\` 파일을 생성하고 다음 내용을 입력하세요:

\`\`\`env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Session
SESSION_SECRET=your_random_secret_string_here

# Server
PORT=5000
NODE_ENV=development
\`\`\`

### 3. 데이터베이스 마이그레이션

\`\`\`bash
npm run db:generate
npm run db:migrate
\`\`\`

### 4. 테스트 데이터 시드

\`\`\`bash
tsx server/db/seed.ts
\`\`\`

### 5. 개발 서버 실행

\`\`\`bash
npm run dev
\`\`\`

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## 🔐 테스트 계정

| 역할 | 아이디 | 비밀번호 | 설명 |
|------|--------|----------|------|
| 관리자 | allga | allga | 전체 시스템 관리 |
| 지점 관리자 | allga1 | allga1 | 강남점 관리 |
| 학생 | kim_minsu | password123 | 강남점 학생 |

## 📁 프로젝트 구조

\`\`\`
olga-academy-system/
├── server/                 # Backend
│   ├── db/                # Database
│   │   ├── schema.ts      # Drizzle ORM schema (11 tables)
│   │   ├── index.ts       # DB connection
│   │   ├── migrate.ts     # Migration script
│   │   └── seed.ts        # Seed data
│   ├── routes/            # API routes
│   │   ├── auth.ts        # Authentication
│   │   ├── exams.ts       # Exam management
│   │   ├── branches.ts    # Branch management
│   │   ├── distributions.ts # Exam distribution
│   │   ├── classes.ts     # Class management
│   │   ├── students.ts    # Student management
│   │   ├── parents.ts     # Parent management
│   │   ├── attempts.ts    # Exam attempts
│   │   ├── reports.ts     # AI reports
│   │   └── admin.ts       # Admin statistics
│   ├── middleware/        # Middleware
│   │   └── auth.ts        # Auth middleware
│   ├── utils/             # Utilities
│   │   └── helpers.ts     # Helper functions
│   └── index.ts           # Server entry point
├── client/                # Frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   │   └── ui/        # Shadcn/ui components
│   │   ├── pages/         # Page components
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── BranchDashboard.tsx
│   │   │   ├── StudentDashboard.tsx
│   │   │   └── ParentDashboard.tsx
│   │   ├── lib/           # Libraries
│   │   │   ├── api.ts     # Axios instance
│   │   │   └── utils.ts   # Utility functions
│   │   ├── App.tsx        # App component
│   │   └── main.tsx       # Entry point
│   └── index.html
├── shared/                # Shared types
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## 🗄️ 데이터베이스 스키마

11개 테이블:
- \`users\` - 사용자 (4가지 역할)
- \`branches\` - 지점
- \`classes\` - 반
- \`students\` - 학생
- \`parents\` - 학부모
- \`student_parents\` - 학생-학부모 관계
- \`student_classes\` - 학생-반 배정
- \`exams\` - 시험
- \`exam_distributions\` - 시험 배포
- \`exam_attempts\` - 시험 응시
- \`ai_reports\` - AI 분석 보고서

## 📚 API 엔드포인트

### 인증 API
- \`POST /api/auth/login\` - 로그인
- \`GET /api/auth/me\` - 현재 사용자 정보
- \`POST /api/auth/logout\` - 로그아웃
- \`POST /api/auth/impersonate/:branchId\` - 지점 관리자로 전환 (관리자 only)
- \`POST /api/auth/impersonate/student/:studentId\` - 학생으로 전환 (지점 관리자 only)

### 시험 관리 API (관리자 only)
- \`GET /api/exams\` - 시험 목록 조회
- \`GET /api/exams/:id\` - 시험 상세 조회
- \`POST /api/exams\` - 시험 생성
- \`PATCH /api/exams/:id\` - 시험 수정
- \`DELETE /api/exams/:id\` - 시험 삭제
- \`POST /api/exams/upload\` - Excel 시험 업로드

### 지점 관리 API (관리자 only)
- \`GET /api/branches\` - 지점 목록
- \`POST /api/branches\` - 지점 생성 (관리자 계정 포함)
- \`PUT /api/branches/:id\` - 지점 수정
- \`DELETE /api/branches/:id\` - 지점 삭제

### 시험 배포 API (관리자 & 지점 관리자)
- \`GET /api/distributions\` - 배포 목록
- \`POST /api/distributions\` - 시험 배포
- \`DELETE /api/distributions/:id\` - 배포 삭제

### 학생 인터페이스 API (학생 only)
- \`GET /api/my-exams\` - 내 시험 목록
- \`GET /api/my-exams/:distributionId\` - 시험 상세
- \`POST /api/exam-attempts\` - 시험 시작
- \`PUT /api/exam-attempts/:id\` - 답안 임시 저장
- \`POST /api/exam-attempts/:id/submit\` - 시험 제출 및 자동 채점

### AI 보고서 API
- \`POST /api/reports/generate/:attemptId\` - AI 보고서 생성 (15-30초)
- \`GET /api/reports/:reportId\` - 보고서 HTML 조회
- \`GET /api/reports/attempt/:attemptId\` - 응시 기록의 보고서 조회

### 관리자 통계 API (관리자 only)
- \`GET /api/admin/stats?grade=고1\` - 전체 통계 (학년 필터 지원)
- \`GET /api/admin/recent-activity\` - 최근 활동

## 🎨 Excel 시험 업로드 형식

**OLGA 표준 포맷**:
- Row 1: 시험 제목 (A1)
- Row 2: 과목명 (A2)
- Row 3: 헤더 (번호, 난이도, 출제영역, 유형분석, 소분류, 해설, 정답, 배점)
- Row 4-48: 문제 데이터 (45문제)
- Row 50-52: 출제 경향
- Row 54: 총평

## 📊 등급 산출 기준

| 등급 | 백분율 | 설명 |
|------|--------|------|
| 1등급 | 96% 이상 | 최상위 |
| 2등급 | 89-95% | 상위 |
| 3등급 | 77-88% | 중상위 |
| 4등급 | 60-76% | 중위 |
| 5등급 | 40-59% | 중하위 |
| 6등급 | 25-39% | 하위 |
| 7등급 | 15-24% | 하하위 |
| 8등급 | 8-14% | 최하위 |
| 9등급 | 7% 이하 | 매우 낮음 |

## 🤖 AI 보고서 생성

Google Gemini API를 사용하여 학생별 맞춤형 분석 보고서 생성:

- **영역별 분석**: 정답률, 난이도별 분포
- **강점**: AI가 분석한 잘한 점
- **약점**: 취약 영역 및 오답 패턴
- **학습 로드맵**: 즉시 실행/단기/장기 목표
- **학습 전략**: 맞춤형 학습 방법 제안
- **종합 평가**: AI 생성 종합 요약

## 🔒 보안 기능

- bcrypt 비밀번호 해싱 (salt rounds: 10)
- XSS 방어 (HTML/JSON 이스케이프)
- SQL Injection 방어 (Drizzle ORM 파라미터화)
- 역할별 데이터 격리
- 세션 기반 인증 (24시간 만료)
- CSRF 방어 (동일 출처 정책)

## 📱 반응형 디자인

- **Desktop** (1024px+): 3열 레이아웃, 사이드바 고정
- **Tablet** (768px-1023px): 2열 레이아웃, 사이드바 토글
- **Mobile** (< 768px): 1열 레이아웃, 햄버거 메뉴

## 🚀 프로덕션 배포

### 1. 빌드

\`\`\`bash
npm run build
\`\`\`

### 2. 환경 변수 설정

프로덕션 환경에서 \`.env\`에 다음을 설정:

\`\`\`env
NODE_ENV=production
DATABASE_URL=<production_database_url>
GEMINI_API_KEY=<your_api_key>
SESSION_SECRET=<secure_random_string>
\`\`\`

### 3. 서버 실행

\`\`\`bash
npm start
\`\`\`

## 📝 추가 개발 가이드

### Excel 업로드 예제 파일 생성
\`server/samples/exam-template.xlsx\` 참고

### 새로운 API 엔드포인트 추가
1. \`server/routes/\`에 라우트 파일 생성
2. \`server/index.ts\`에 라우트 등록
3. 권한 미들웨어 적용 (\`requireAdmin\`, \`requireAuth\` 등)

### 새로운 페이지 추가
1. \`client/src/pages/\`에 페이지 컴포넌트 생성
2. \`client/src/App.tsx\`에 라우트 추가

### 데이터베이스 스키마 변경
1. \`server/db/schema.ts\` 수정
2. \`npm run db:generate\` 실행
3. 생성된 마이그레이션 파일 확인
4. \`npm run db:migrate\` 실행

## 🐛 문제 해결

### 데이터베이스 연결 오류
- \`DATABASE_URL\`이 올바른지 확인
- PostgreSQL 서버가 실행 중인지 확인

### 세션 오류
- \`SESSION_SECRET\`이 설정되었는지 확인
- PostgreSQL에 \`session\` 테이블이 생성되었는지 확인

### AI 보고서 생성 오류
- \`GEMINI_API_KEY\`가 유효한지 확인
- API 호출 한도를 초과하지 않았는지 확인

## 📄 라이선스

MIT License

## 👥 기여

이슈 및 풀 리퀘스트를 환영합니다!

## 📧 문의

올가 미수등 시스템 개발팀
