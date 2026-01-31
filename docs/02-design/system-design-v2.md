# 올가 미수등 시스템 - 시스템 설계서 v2.0

> **문서 버전**: 2.0
> **최종 수정일**: 2026-01-31
> **주요 변경**: Next.js + Supabase 마이그레이션

---

## 1. 기술 스택 변경 요약

### 1.1 Before vs After

| 영역 | v1.0 (현재) | v2.0 (변경) |
|------|-------------|-------------|
| **Frontend** | React + Vite + Wouter | Next.js 14 App Router |
| **Backend** | Express.js 별도 서버 | Next.js API Routes + Server Actions |
| **Database** | PostgreSQL + Drizzle ORM | Supabase (PostgreSQL + Auth + Storage) |
| **Auth** | express-session + bcrypt | Supabase Auth (JWT) |
| **File Storage** | multer (로컬) | Supabase Storage |
| **Real-time** | 없음 | Supabase Realtime |
| **Hosting** | Vercel + Railway | Vercel (통합) |

### 1.2 마이그레이션 이점

1. **풀스택 통합**: Next.js로 프론트/백엔드 통합, 배포 단순화
2. **인증 간소화**: Supabase Auth로 세션 관리 자동화, RLS 지원
3. **실시간 기능**: Supabase Realtime으로 실시간 알림 가능
4. **스토리지**: 시험지 파일 Supabase Storage로 관리
5. **비용 절감**: Railway 비용 제거, Vercel + Supabase 무료 티어 활용

---

## 2. 새로운 아키텍처

### 2.1 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js 14                               │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │    App Router        │    │     Server Components        │   │
│  │  (Client Components) │◄──►│     Server Actions           │   │
│  │  React 18 + TanStack │    │     API Routes               │   │
│  └──────────────────────┘    └───────────────┬──────────────┘   │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                    Supabase                          │
                    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
                    │  │  PostgreSQL │  │    Auth     │  │   Storage   │  │
                    │  │     + RLS   │  │    (JWT)    │  │   (Files)   │  │
                    │  └─────────────┘  └─────────────┘  └─────────────┘  │
                    │  ┌─────────────┐  ┌─────────────┐                   │
                    │  │  Realtime   │  │    Edge     │                   │
                    │  │ (WebSocket) │  │  Functions  │                   │
                    │  └─────────────┘  └─────────────┘                   │
                    └─────────────────────────────────────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                   External APIs                      │
                    │  ┌─────────────┐  ┌─────────────┐                   │
                    │  │ Gemini API  │  │ OpenAI API  │                   │
                    │  │ (AI 분석)   │  │  (대체)      │                   │
                    │  └─────────────┘  └─────────────┘                   │
                    └─────────────────────────────────────────────────────┘
```

### 2.2 기술 스택 상세

| 영역 | 기술 | 버전/설명 |
|------|------|-----------|
| **Framework** | Next.js | 14.x App Router |
| | TypeScript | 5.x |
| | React | 18.x Server Components |
| **Styling** | Tailwind CSS | 3.x |
| | Shadcn/ui | 컴포넌트 라이브러리 |
| **State** | TanStack Query | 서버 상태 |
| | Zustand | 클라이언트 상태 |
| **Forms** | React Hook Form | 폼 관리 |
| | Zod | 스키마 검증 |
| **Database** | Supabase | PostgreSQL + Auth + Storage |
| | Prisma (선택) | 타입 안전 ORM |
| **Charts** | Recharts | 데이터 시각화 |
| **AI** | Google Gemini API | 보고서 생성 |
| **Hosting** | Vercel | 배포 + Edge Functions |

---

## 3. Supabase 스키마 설계

### 3.1 테이블 구조 (RLS 적용)

```sql
-- ============================================
-- 1. profiles (사용자 프로필)
-- Supabase Auth의 auth.users와 연결
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'branch', 'student', 'parent')),
  branch_id UUID REFERENCES branches(id),
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Branch can view branch profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'branch' AND branch_id = profiles.branch_id
    )
  );

-- ============================================
-- 2. branches (지점)
-- ============================================
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  manager_name TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: 관리자만 수정 가능, 지점 관리자는 본인 지점만 조회
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to branches"
  ON branches FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Branch manager can view own branch"
  ON branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'branch' AND branch_id = branches.id
    )
  );

-- ============================================
-- 3. classes (반)
-- ============================================
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  grade TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. students (학생)
-- ============================================
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  school TEXT,
  grade TEXT,
  parent_phone TEXT,
  enrollment_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. parents (학부모)
-- ============================================
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE
);

ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. student_parents (학생-학부모 관계)
-- ============================================
CREATE TABLE student_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  UNIQUE(student_id, parent_id)
);

ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. student_classes (학생-반 배정)
-- ============================================
CREATE TABLE student_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

ALTER TABLE student_classes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. exams (시험)
-- ============================================
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT,
  description TEXT,
  total_questions INTEGER NOT NULL DEFAULT 45,
  total_score INTEGER NOT NULL DEFAULT 100,
  exam_file_url TEXT,
  questions_data JSONB NOT NULL,
  exam_trends JSONB,
  overall_review TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. exam_distributions (시험 배포)
-- ============================================
CREATE TABLE exam_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  parent_distribution_id UUID REFERENCES exam_distributions(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  distributed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exam_distributions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. distribution_students (배포 대상 학생)
-- ============================================
CREATE TABLE distribution_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL REFERENCES exam_distributions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE distribution_students ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 11. exam_attempts (시험 응시)
-- ============================================
CREATE TABLE exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  distribution_id UUID NOT NULL REFERENCES exam_distributions(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER,
  max_score INTEGER,
  grade INTEGER CHECK (grade >= 1 AND grade <= 9),
  correct_count INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  UNIQUE(student_id, distribution_id)
);

ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 12. ai_reports (AI 분석 보고서)
-- ============================================
CREATE TABLE ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL UNIQUE REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  analysis JSONB,
  weak_areas JSONB,
  recommendations JSONB,
  expected_grade INTEGER,
  summary TEXT,
  html_content TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. audit_logs (감사 로그) - 신규
-- ============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

### 3.2 인덱스

```sql
-- 성능 최적화 인덱스
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_branch ON profiles(branch_id);
CREATE INDEX idx_students_branch ON students(branch_id);
CREATE INDEX idx_classes_branch ON classes(branch_id);
CREATE INDEX idx_exams_subject ON exams(subject);
CREATE INDEX idx_exams_created_at ON exams(created_at DESC);
CREATE INDEX idx_distributions_exam ON exam_distributions(exam_id);
CREATE INDEX idx_distributions_branch ON exam_distributions(branch_id);
CREATE INDEX idx_distributions_dates ON exam_distributions(start_date, end_date);
CREATE INDEX idx_attempts_student ON exam_attempts(student_id);
CREATE INDEX idx_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX idx_attempts_submitted ON exam_attempts(submitted_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

### 3.3 Supabase Edge Functions

```typescript
// supabase/functions/grade-exam/index.ts
// 시험 자동 채점 Edge Function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { attemptId } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 응시 기록 및 시험 정보 조회
  const { data: attempt } = await supabase
    .from('exam_attempts')
    .select('*, exams(*)')
    .eq('id', attemptId)
    .single()

  const { answers } = attempt
  const { questions_data, total_score } = attempt.exams

  let score = 0
  let correctCount = 0

  for (const question of questions_data) {
    const studentAnswer = answers[question.questionNumber]
    // 버그 수정: 실제 정답과 비교
    if (studentAnswer === question.correctAnswer) {
      score += question.points || 0
      correctCount++
    }
  }

  // 등급 산출
  const percentage = (score / total_score) * 100
  let grade = 9
  if (percentage >= 96) grade = 1
  else if (percentage >= 89) grade = 2
  else if (percentage >= 77) grade = 3
  else if (percentage >= 60) grade = 4
  else if (percentage >= 40) grade = 5
  else if (percentage >= 23) grade = 6
  else if (percentage >= 11) grade = 7
  else if (percentage >= 4) grade = 8

  // 결과 업데이트
  await supabase
    .from('exam_attempts')
    .update({
      score,
      max_score: total_score,
      grade,
      correct_count: correctCount,
      graded_at: new Date().toISOString()
    })
    .eq('id', attemptId)

  return new Response(JSON.stringify({ score, grade, correctCount }))
})
```

---

## 4. Next.js 프로젝트 구조

```
olga-academy/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 인증 그룹
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/              # 대시보드 그룹
│   │   ├── admin/                # 관리자
│   │   │   ├── page.tsx
│   │   │   ├── branches/
│   │   │   ├── exams/
│   │   │   └── statistics/
│   │   │
│   │   ├── branch/               # 지점 관리자
│   │   │   ├── page.tsx
│   │   │   ├── students/
│   │   │   ├── classes/
│   │   │   └── distributions/
│   │   │
│   │   ├── student/              # 학생
│   │   │   ├── page.tsx
│   │   │   ├── exams/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # 시험 응시
│   │   │   │       └── result/
│   │   │   │           └── page.tsx  # 결과 확인
│   │   │   └── reports/
│   │   │
│   │   ├── parent/               # 학부모
│   │   │   ├── page.tsx
│   │   │   └── children/
│   │   │
│   │   └── layout.tsx            # 공통 대시보드 레이아웃
│   │
│   ├── api/                      # API Routes
│   │   ├── auth/
│   │   │   └── [...supabase]/
│   │   │       └── route.ts      # Supabase Auth Callback
│   │   ├── exams/
│   │   │   ├── route.ts
│   │   │   ├── [id]/
│   │   │   │   └── route.ts
│   │   │   └── upload/
│   │   │       └── route.ts      # Excel 업로드
│   │   ├── reports/
│   │   │   └── generate/
│   │   │       └── route.ts      # AI 보고서 생성
│   │   └── admin/
│   │       └── stats/
│   │           └── route.ts
│   │
│   ├── layout.tsx                # 루트 레이아웃
│   ├── page.tsx                  # 랜딩/리다이렉트
│   └── globals.css
│
├── components/
│   ├── ui/                       # Shadcn/ui 컴포넌트
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── table.tsx
│   │   ├── toast.tsx             # 신규: 토스트 알림
│   │   └── skeleton.tsx          # 신규: 로딩 스켈레톤
│   │
│   ├── dashboard/                # 대시보드 컴포넌트
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── StatsCard.tsx
│   │   └── DataTable.tsx
│   │
│   ├── exam/                     # 시험 관련 컴포넌트
│   │   ├── ExamCard.tsx
│   │   ├── QuestionView.tsx
│   │   ├── AnswerSheet.tsx
│   │   └── ResultChart.tsx
│   │
│   ├── forms/                    # 폼 컴포넌트
│   │   ├── LoginForm.tsx
│   │   ├── StudentForm.tsx
│   │   ├── ExamUploadForm.tsx
│   │   └── DistributionForm.tsx
│   │
│   └── providers/                # 컨텍스트 프로바이더
│       ├── AuthProvider.tsx
│       ├── QueryProvider.tsx
│       └── ToastProvider.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # 브라우저 클라이언트
│   │   ├── server.ts             # 서버 클라이언트
│   │   ├── middleware.ts         # 미들웨어 클라이언트
│   │   └── admin.ts              # 서비스 롤 클라이언트
│   │
│   ├── actions/                  # Server Actions
│   │   ├── auth.ts
│   │   ├── students.ts
│   │   ├── exams.ts
│   │   ├── distributions.ts
│   │   └── reports.ts
│   │
│   ├── validations/              # Zod 스키마
│   │   ├── auth.ts
│   │   ├── student.ts
│   │   ├── exam.ts
│   │   └── distribution.ts
│   │
│   └── utils/
│       ├── grade.ts              # 등급 산출 로직
│       ├── excel.ts              # Excel 파싱
│       └── format.ts             # 포맷팅 유틸
│
├── hooks/
│   ├── useAuth.ts
│   ├── useProfile.ts
│   ├── useExams.ts
│   └── useToast.ts
│
├── types/
│   ├── database.ts               # Supabase 생성 타입
│   ├── auth.ts
│   └── exam.ts
│
├── middleware.ts                 # Next.js 미들웨어 (인증)
├── supabase/
│   ├── migrations/               # DB 마이그레이션
│   └── functions/                # Edge Functions
│
├── .env.local
├── next.config.js
├── tailwind.config.js
└── package.json
```

---

## 5. 인증 흐름 (Supabase Auth)

### 5.1 로그인 흐름

```typescript
// lib/actions/auth.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: error.message }
  }

  // 프로필에서 역할 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  // 감사 로그 기록
  await supabase.from('audit_logs').insert({
    user_id: data.user.id,
    action: 'login',
    details: { ip: headers().get('x-forwarded-for') }
  })

  // 역할별 리다이렉트
  switch (profile?.role) {
    case 'admin':
      redirect('/admin')
    case 'branch':
      redirect('/branch')
    case 'student':
      redirect('/student')
    case 'parent':
      redirect('/parent')
    default:
      redirect('/login?error=invalid_role')
  }
}
```

### 5.2 미들웨어 인증

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const { data: { session } } = await supabase.auth.getSession()

  // 보호된 경로 확인
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/admin') ||
                          req.nextUrl.pathname.startsWith('/branch') ||
                          req.nextUrl.pathname.startsWith('/student') ||
                          req.nextUrl.pathname.startsWith('/parent')

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 역할 기반 접근 제어
  if (session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const role = profile?.role
    const path = req.nextUrl.pathname

    // 권한 검사
    if (path.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
    if (path.startsWith('/branch') && !['admin', 'branch'].includes(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
    // ... 기타 역할 검사
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 6. API Routes 예시

### 6.1 시험 업로드

```typescript
// app/api/exams/upload/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  // 인증 확인
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    // Excel 파싱
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    // 45문제 파싱 (Row 4-48)
    const questionsData = []
    for (let i = 4; i <= 48; i++) {
      questionsData.push({
        questionNumber: i - 3,
        correctAnswer: parseInt(sheet[`B${i}`]?.v) || 0,
        points: parseInt(sheet[`C${i}`]?.v) || 2,
        difficulty: sheet[`D${i}`]?.v || '중',
        category: sheet[`E${i}`]?.v || '',
        subcategory: sheet[`F${i}`]?.v || '',
        commentary: sheet[`G${i}`]?.v || ''
      })
    }

    // 시험 저장
    const { data: exam, error } = await supabase
      .from('exams')
      .insert({
        title: file.name.replace('.xlsx', ''),
        subject: sheet['B1']?.v || '미지정',
        total_questions: 45,
        total_score: 100,
        questions_data: questionsData,
        created_by: session.user.id
      })
      .select()
      .single()

    if (error) throw error

    // 감사 로그
    await supabase.from('audit_logs').insert({
      user_id: session.user.id,
      action: 'exam_upload',
      target_type: 'exam',
      target_id: exam.id,
      details: { filename: file.name }
    })

    return NextResponse.json({ success: true, exam })
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
```

---

## 7. 보안 개선 사항

### 7.1 해결된 보안 문제

| 문제 | v1.0 | v2.0 해결책 |
|------|------|-------------|
| 세션 관리 복잡 | express-session 수동 관리 | Supabase Auth JWT 자동 관리 |
| SQL Injection | Drizzle ORM (안전) | Supabase Client (안전) + RLS |
| 권한 우회 | 미들웨어 수동 검증 | RLS 정책으로 DB 레벨 격리 |
| 비밀번호 정책 | 전화번호 4자리 | Supabase Auth 정책 + 랜덤 생성 |
| 입력 검증 | 일부만 | Zod 스키마 전체 적용 |
| 감사 로그 | 없음 | audit_logs 테이블 신규 |
| Rate Limiting | 없음 | Supabase Edge Rate Limiting |

### 7.2 RLS 정책 요약

```
profiles: 본인 또는 관리자/지점 관리자만 조회
branches: 관리자 전체, 지점 관리자 본인 지점만
students: 관리자/지점 관리자/본인만
exams: 관리자만 생성/수정, 전체 조회 가능
exam_attempts: 학생 본인 + 관리자/지점 관리자
ai_reports: 학생 본인 + 학부모 + 관리자/지점 관리자
```

---

## 8. 성능 개선 사항

### 8.1 N+1 쿼리 해결

```typescript
// Before (N+1 문제)
const students = await db.select().from(students)
for (const student of students) {
  const parent = await db.select().from(parents).where(...)  // N번 추가 쿼리
}

// After (Supabase JOIN)
const { data: students } = await supabase
  .from('students')
  .select(`
    *,
    profiles!inner(*),
    student_parents(
      parents(
        profiles(name, phone)
      )
    ),
    student_classes(
      classes(name, grade)
    )
  `)
  .eq('branch_id', branchId)
```

### 8.2 캐싱 전략

```typescript
// TanStack Query 캐싱
const { data: stats } = useQuery({
  queryKey: ['admin', 'stats', grade],
  queryFn: () => fetchAdminStats(grade),
  staleTime: 5 * 60 * 1000,  // 5분 캐싱
  gcTime: 10 * 60 * 1000,    // 10분 가비지 컬렉션
})

// Supabase Realtime 구독 (실시간 업데이트 필요시)
supabase
  .channel('exam_attempts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'exam_attempts'
  }, (payload) => {
    queryClient.invalidateQueries(['attempts'])
  })
  .subscribe()
```

---

## 9. 환경 변수

```env
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI APIs
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key  # 대체용

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## 10. 배포 구성

### 10.1 Vercel 배포

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["icn1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase-service-key",
    "GEMINI_API_KEY": "@gemini-api-key"
  }
}
```

### 10.2 Supabase 프로젝트 설정

1. 새 프로젝트 생성 (Region: Northeast Asia - Seoul)
2. Database 비밀번호 설정
3. Auth 이메일 템플릿 커스터마이징
4. Storage 버킷 생성 (exam-files)
5. Edge Functions 배포
6. RLS 정책 적용

---

**문서 끝**
