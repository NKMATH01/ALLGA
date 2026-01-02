import { pgTable, varchar, text, boolean, timestamp, integer, json } from 'drizzle-orm/pg-core';
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
  branchId: varchar('branch_id', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
});

// Students table
export const students = pgTable('students', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  branchId: varchar('branch_id', { length: 255 }).notNull().references(() => branches.id, { onDelete: 'cascade' }),
  school: text('school'),
  grade: text('grade'),
  parentPhone: text('parent_phone'),
  enrollmentDate: timestamp('enrollment_date').defaultNow().notNull(),
});

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
});

// Student-Classes relationship table
export const studentClasses = pgTable('student_classes', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  classId: varchar('class_id', { length: 255 }).notNull().references(() => classes.id, { onDelete: 'cascade' }),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
});

// Exams table
export const exams = pgTable('exams', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  subject: text('subject').notNull(),
  grade: text('grade'),
  description: text('description'),
  totalQuestions: integer('total_questions').notNull(),
  totalScore: integer('total_score').notNull(),
  examFileUrl: text('exam_file_url'),
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
  parentDistributionId: varchar('parent_distribution_id', { length: 255 }).references(() => examDistributions.id, { onDelete: 'cascade' }),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  distributedBy: varchar('distributed_by', { length: 255 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Distribution Students table (for student-specific distributions)
export const distributionStudents = pgTable('distribution_students', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  distributionId: varchar('distribution_id', { length: 255 }).notNull().references(() => examDistributions.id, { onDelete: 'cascade' }),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
});

// AI Reports table
export const aiReports = pgTable('ai_reports', {
  id: varchar('id', { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  attemptId: varchar('attempt_id', { length: 255 }).notNull().unique().references(() => examAttempts.id, { onDelete: 'cascade' }),
  studentId: varchar('student_id', { length: 255 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  examId: varchar('exam_id', { length: 255 }).notNull().references(() => exams.id, { onDelete: 'cascade' }),
  analysis: json('analysis'), // AI analysis data
  weakAreas: json('weak_areas'), // Array of weak areas
  recommendations: json('recommendations'), // Array of recommendations
  expectedGrade: integer('expected_grade'),
  summary: text('summary'),
  htmlContent: text('html_content'), // Full HTML report
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
