import { pgTable, varchar, text, boolean, timestamp, integer, json, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // admin, branch, student, parent
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  // 지점이 삭제돼도 계정은 남긴다(감사 추적). branches.ts DELETE /:id 가 계정을
  // isActive=false 로만 내리는 설계이므로 cascade 가 아니라 set null 이어야 한다.
  // admin 처럼 branch_id 가 NULL 인 계정은 원래 정상 상태다.
  branchId: varchar('branch_id', { length: 255 }).references(() => branches.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

// Branches table
export const branches = pgTable('branches', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  managerName: text('manager_name'),
  displayOrder: integer('display_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

// Classes table
export const classes = pgTable('classes', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  branchId: varchar('branch_id', { length: 255 }).notNull().references(() => branches.id, { onDelete: 'cascade' }),
  grade: text('grade'),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // classes.ts GET / : WHERE branch_id = ? (지점 반 목록)
  branchIdx: index('classes_branch_id_idx').on(table.branchId),
}));

// Students table
export const students = pgTable('students', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  branchId: varchar('branch_id', { length: 255 }).notNull().references(() => branches.id, { onDelete: 'cascade' }),
  school: text('school'),
  grade: text('grade'),
  parentPhone: text('parent_phone'),
  enrollmentDate: timestamp('enrollment_date').defaultNow().notNull(),
}, (table) => ({
  // students.ts GET / 및 /branch-students : WHERE branch_id = ? (지점 학생 목록·통계)
  // FK 컬럼은 Postgres 가 자동 인덱싱하지 않는다.
  branchIdx: index('students_branch_id_idx').on(table.branchId),
}));

// Parents table
export const parents = pgTable('parents', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  branchId: varchar('branch_id', { length: 255 }).notNull().references(() => branches.id, { onDelete: 'cascade' }),
});

// Student-Parents relationship table
export const studentParents = pgTable('student_parents', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  parentId: varchar('parent_id', { length: 255 }).notNull().references(() => parents.id, { onDelete: 'cascade' }),
}, (table) => ({
  // 같은 학생-학부모 쌍을 두 번 연결할 수 없다.
  studentParentUnique: unique('student_parents_student_parent_unique').on(
    table.studentId,
    table.parentId
  ),
  // parents.ts·reports.ts·attempts.ts : WHERE parent_id = ? (학부모의 자녀 조회·권한 확인)
  // 위 UNIQUE 는 student_id 로 시작하므로 parent_id 단독 조회를 커버하지 못한다.
  parentIdx: index('student_parents_parent_id_idx').on(table.parentId),
}));

// Student-Classes relationship table
export const studentClasses = pgTable('student_classes', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  classId: varchar('class_id', { length: 255 }).notNull().references(() => classes.id, { onDelete: 'cascade' }),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
}, (table) => ({
  // 같은 학생을 같은 반에 두 번 배정할 수 없다.
  studentClassUnique: unique('student_classes_student_class_unique').on(
    table.studentId,
    table.classId
  ),
  // attempts.ts /my-exams : WHERE student_id = ? (반 배포 대상 판정, 전 학생 진입점)
  studentIdx: index('student_classes_student_id_idx').on(table.studentId),
}));

// Exams table
export const exams = pgTable('exams', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  subject: text('subject').notNull(),
  grade: text('grade'),
  description: text('description'),
  totalQuestions: integer('total_questions').notNull(),
  totalScore: integer('total_score').notNull(),
  questionsData: json('questions_data').notNull(), // Array of question metadata
  examTrends: json('exam_trends'), // Array of exam trends
  overallReview: text('overall_review'),
  createdBy: varchar('created_by', { length: 255 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Exam Distributions table
export const examDistributions: any = pgTable('exam_distributions', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  examId: varchar('exam_id', { length: 255 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  branchId: varchar('branch_id', { length: 255 }).notNull().references(() => branches.id, { onDelete: 'cascade' }),
  classId: varchar('class_id', { length: 255 }).references(() => classes.id, { onDelete: 'cascade' }),
  /**
   * 이 배포가 "누구에게" 가는지를 명시하는 컬럼. 파생 판정을 대체한다.
   *
   *   'branch'   : 지점 전원 공개. class_id 와 distribution_students 를 보지 않는다.
   *   'class'    : class_id 가 가리키는 반의 구성원.
   *   'students' : distribution_students 에 배정된 학생만.
   *
   * ⚠ 빈 지정 = 아무도 아님.
   *   'students' 인데 distribution_students 가 0건이면 **대상이 없는 것**이지
   *   지점 전원이 아니다. 예전에는 "class_id 없음 + 지정 0건"을 전원 공개로 읽었기 때문에
   *   배정 INSERT 가 실패하거나 지정 학생이 CASCADE 로 사라지면 배포가 조용히
   *   전원 공개로 승격됐다. 이 컬럼이 그 승격 경로를 끊는다.
   *
   * 기본값 'branch' 는 기존 행(전부 지점 전원)의 동작을 그대로 보존하기 위한 것이다.
   */
  targetKind: text('target_kind', { enum: ['branch', 'class', 'students'] }).notNull().default('branch'),
  parentDistributionId: varchar('parent_distribution_id', { length: 255 }).references(() => examDistributions.id, { onDelete: 'cascade' }),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  distributedBy: varchar('distributed_by', { length: 255 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table: any) => ({
  // attempts.ts /my-exams : WHERE branch_id = ? (전 학생 진입점)
  // distributions.ts GET / : WHERE branch_id = ? (지점 배포 목록)
  branchIdx: index('exam_distributions_branch_id_idx').on(table.branchId),
  // exams.ts DELETE /:id : WHERE exam_id = ? (삭제 영향 조회)
  examIdx: index('exam_distributions_exam_id_idx').on(table.examId),
}));

// Distribution Students table (for student-specific distributions)
export const distributionStudents = pgTable('distribution_students', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  distributionId: varchar('distribution_id', { length: 255 }).notNull().references(() => examDistributions.id, { onDelete: 'cascade' }),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // attempts.ts /my-exams : WHERE distribution_id IN (...) 로 조회하고 student_id 를 읽는다.
  // 두 컬럼을 함께 두어 커버링 인덱스가 되게 한다.
  distributionStudentIdx: index('distribution_students_distribution_id_student_id_idx').on(
    table.distributionId,
    table.studentId
  ),
}));

// Exam Attempts table
export const examAttempts = pgTable('exam_attempts', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  examId: varchar('exam_id', { length: 255 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  distributionId: varchar('distribution_id', { length: 255 }).notNull().references(() => examDistributions.id, { onDelete: 'cascade' }),
  answers: json('answers').notNull(), // { "1": 3, "2": 1, ... }
  score: integer('score'),
  maxScore: integer('max_score'),
  grade: integer('grade'), // 1-9
  correctCount: integer('correct_count'), // Number of correct answers
  startedAt: timestamp('started_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at'),
  gradedAt: timestamp('graded_at'),
}, (table) => ({
  // 한 학생이 같은 배포에 대해 응시 레코드를 두 개 가질 수 없다.
  // 동시 요청으로 중복 attempt 가 생기면 성적이 갈라지므로 DB 차원에서 막는다.
  studentDistributionUnique: unique('exam_attempts_student_distribution_unique').on(
    table.studentId,
    table.distributionId
  ),
  // reports.ts 보고서 생성 : WHERE exam_id = ? (순위·평균 산출을 위해 동일 시험 전체 조회)
  // exams.ts DELETE /:id : WHERE exam_id = ? (삭제 영향 조회)
  // (student_id 로 시작하는 조회는 위 UNIQUE 인덱스가 이미 커버한다)
  examIdx: index('exam_attempts_exam_id_idx').on(table.examId),
  // attempts.ts·distributions.ts : WHERE distribution_id IN (...) / = ? (배포별 응시 조회)
  // 위 UNIQUE 는 student_id 로 시작하므로 distribution_id 단독 조회를 커버하지 못한다.
  distributionIdx: index('exam_attempts_distribution_id_idx').on(table.distributionId),
}));

// AI Reports table
export const aiReports = pgTable('ai_reports', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  attemptId: varchar('attempt_id', { length: 255 }).notNull().unique().references(() => examAttempts.id, { onDelete: 'cascade' }),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  examId: varchar('exam_id', { length: 255 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  analysis: json('analysis'), // AI analysis data
  summary: text('summary'),
  htmlContent: text('html_content'), // Full HTML report
  // 생성 진행 상태. 행이 곧 잠금이라 큐 적재 전에 processing 으로 먼저 넣는다.
  // 실패가 클라이언트에 전달되지 않고 폴링 타임아웃으로만 끝나던 문제(R-2)를 막는다.
  status: text('status', { enum: ['processing', 'completed', 'failed'] })
    .notNull()
    .default('processing'),
  // 실패 사유. 사용자에게 그대로 보여줄 수 있는 짧은 문구만 저장한다.
  failureReason: text('failure_reason'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
  classes: many(classes),
  students: many(students),
  parents: many(parents),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, {
    fields: [students.userId],
    references: [users.id],
  }),
  branch: one(branches, {
    fields: [students.branchId],
    references: [branches.id],
  }),
  attempts: many(examAttempts),
  reports: many(aiReports),
  parents: many(studentParents),
  classes: many(studentClasses),
}));

export const parentsRelations = relations(parents, ({ one, many }) => ({
  user: one(users, {
    fields: [parents.userId],
    references: [users.id],
  }),
  branch: one(branches, {
    fields: [parents.branchId],
    references: [branches.id],
  }),
  students: many(studentParents),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  creator: one(users, {
    fields: [exams.createdBy],
    references: [users.id],
  }),
  distributions: many(examDistributions),
  attempts: many(examAttempts),
  reports: many(aiReports),
}));

export const examDistributionsRelations = relations(examDistributions, ({ one, many }) => ({
  exam: one(exams, {
    fields: [examDistributions.examId],
    references: [exams.id],
  }),
  branch: one(branches, {
    fields: [examDistributions.branchId],
    references: [branches.id],
  }),
  class: one(classes, {
    fields: [examDistributions.classId],
    references: [classes.id],
  }),
  distributor: one(users, {
    fields: [examDistributions.distributedBy],
    references: [users.id],
  }),
  attempts: many(examAttempts),
}));

export const examAttemptsRelations = relations(examAttempts, ({ one }) => ({
  exam: one(exams, {
    fields: [examAttempts.examId],
    references: [exams.id],
  }),
  student: one(students, {
    fields: [examAttempts.studentId],
    references: [students.id],
  }),
  distribution: one(examDistributions, {
    fields: [examAttempts.distributionId],
    references: [examDistributions.id],
  }),
  report: one(aiReports, {
    fields: [examAttempts.id],
    references: [aiReports.attemptId],
  }),
}));

export const aiReportsRelations = relations(aiReports, ({ one }) => ({
  attempt: one(examAttempts, {
    fields: [aiReports.attemptId],
    references: [examAttempts.id],
  }),
  student: one(students, {
    fields: [aiReports.studentId],
    references: [students.id],
  }),
  exam: one(exams, {
    fields: [aiReports.examId],
    references: [exams.id],
  }),
}));
