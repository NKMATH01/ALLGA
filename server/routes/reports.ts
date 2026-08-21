import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index';
import { aiReports, examAttempts, exams, parents, studentParents, students, users } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { OLGA_REPORT_META_PROMPT_V3 } from '../prompts/olga-report-meta-prompt-v3';
import { generateReportHTML as generateNewReportHTML } from '../templates/newReportTemplate';

const router = express.Router();

/**
 * 실제 응시 점수 분포로 10분위 누적 비율(%)을 만든다.
 * 각 원소는 "만점의 10%·20%…100% 이하를 받은 응시자 비율".
 * 표본이 없거나 만점이 0이면 빈 배열 (가짜 곡선을 만들지 않는다).
 */
function buildCumulativeDistribution(scores: number[], maxScore: number): number[] {
  if (scores.length === 0 || !maxScore || maxScore <= 0) return [];

  return Array.from({ length: 10 }, (_, i) => {
    const threshold = (maxScore * (i + 1)) / 10;
    const atOrBelow = scores.filter(s => s <= threshold).length;
    return Math.round((atOrBelow / scores.length) * 100);
  });
}

type SessionUser = { id: string; role: string; branchId?: string };

type AttemptAccess =
  | { ok: true; attempt: typeof examAttempts.$inferSelect; student: typeof students.$inferSelect }
  | { ok: false; status: number; message: string };

/**
 * 응시 기록(및 그에 연결된 보고서)에 접근할 수 있는지 검사한다.
 * admin=전체, branch=자기 지점 학생, student=본인, parent=자기 자녀.
 */
async function checkAttemptAccess(user: SessionUser | undefined, attemptId: string): Promise<AttemptAccess> {
  if (!user) {
    return { ok: false, status: 401, message: '로그인이 필요합니다.' };
  }

  const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!attempt) {
    return { ok: false, status: 404, message: '시험 응시를 찾을 수 없습니다.' };
  }

  const [student] = await db.select().from(students).where(eq(students.id, attempt.studentId)).limit(1);
  if (!student) {
    return { ok: false, status: 404, message: '학생 정보를 찾을 수 없습니다.' };
  }

  const denied = { ok: false as const, status: 403, message: '권한이 없습니다.' };

  if (user.role === 'admin') {
    return { ok: true, attempt, student };
  }

  if (user.role === 'branch') {
    return student.branchId === user.branchId ? { ok: true, attempt, student } : denied;
  }

  if (user.role === 'student') {
    return student.userId === user.id ? { ok: true, attempt, student } : denied;
  }

  if (user.role === 'parent') {
    const [parent] = await db.select().from(parents).where(eq(parents.userId, user.id)).limit(1);
    if (!parent) return denied;

    const [link] = await db
      .select()
      .from(studentParents)
      .where(and(eq(studentParents.parentId, parent.id), eq(studentParents.studentId, student.id)))
      .limit(1);

    return link ? { ok: true, attempt, student } : denied;
  }

  return denied;
}

console.log('🔑 GEMINI_API_KEY 확인:', process.env.GEMINI_API_KEY ? '설정됨 ✅' : '설정 안됨 ❌');

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not set. AI report generation will not work.');
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

console.log('🤖 Gemini 초기화:', genAI ? '성공 ✅' : '실패 ❌');

/* ===========================================================================
 * 시험별 코호트 통계 캐시
 *
 * 보고서 1건을 만들 때마다 같은 시험의 전체 응시 기록을 다시 읽고
 * (응시자 x 문항) 만큼 정오를 다시 계산한다. 한 시험의 보고서를 연속으로
 * 생성할 때 이 비용이 그대로 반복된다.
 *
 * 시험 단위로만 달라지는 값(순위 목록·영역 평균·문항별 정답 수·참고치 표본)을
 * 한 번 계산해 5분간 재사용한다. 순위 자체는 attempt 마다 목록에서 찾는다.
 *
 * 절충: TTL 안에 새로 제출된 응시는 다음 계산 때까지 통계에 반영되지 않는다.
 * 일괄 생성 구간의 비용 절감을 위해 이 정도 지연은 허용한다.
 * =========================================================================== */

interface CohortStats {
  completedAttempts: any[];
  sortedAttemptIds: string[];
  attemptCount: number;
  scores: number[];
  domainAverages: Map<string, { earnedScore: number; maxScore: number; correct: number; total: number }>;
  perQuestionCorrect: Map<number, number>;
  referenceCategorySamples: Map<string, number[]>;
  referenceDifficultySamples: Map<string, number[]>;
  referenceTotalSamples: number[];
  computedAt: number;
}

const COHORT_TTL_MS = 5 * 60 * 1000;
const cohortCache = new Map<string, CohortStats>();

async function getCohortStats(examId: string, questionsData: any[]): Promise<CohortStats> {
  const cached = cohortCache.get(examId);
  if (cached && Date.now() - cached.computedAt < COHORT_TTL_MS) {
    return cached;
  }

  const allAttempts = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.examId, examId));

  const completedAttempts = allAttempts.filter(
    (a) => a.score !== null && a.submittedAt !== null
  );

  const sortedAttemptIds = [...completedAttempts]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((a) => a.id);

  const domainAverages = new Map<
    string,
    { earnedScore: number; maxScore: number; correct: number; total: number }
  >();
  const perQuestionCorrect = new Map<number, number>();
  questionsData.forEach((q: any, idx: number) => {
    perQuestionCorrect.set(q.number || idx + 1, 0);
  });
  const referenceCategorySamples = new Map<string, number[]>();
  const referenceDifficultySamples = new Map<string, number[]>();
  const referenceTotalSamples: number[] = [];

  // 세 종류의 집계를 응시자당 한 번의 순회로 함께 만든다.
  for (const other of completedAttempts) {
    const otherAnswers = (other.answers as any) || {};
    const otherIsOx = otherAnswers._gradingMode === 'ox';
    const catTally = new Map<string, { correct: number; total: number }>();
    const diffTally = new Map<string, { correct: number; total: number }>();
    let correctTally = 0;

    questionsData.forEach((q: any, idx: number) => {
      const qNum = q.number || idx + 1;
      const otherAnswer = otherAnswers[qNum.toString()];
      const correct = otherIsOx
        ? Number(otherAnswer) === 1
        : otherAnswer === q.correctAnswer;

      // (a) 영역별 평균
      const domain = q.domain || q.category || '독서';
      const qScore = q.score || 2;
      if (!domainAverages.has(domain)) {
        domainAverages.set(domain, { earnedScore: 0, maxScore: 0, correct: 0, total: 0 });
      }
      const acc = domainAverages.get(domain)!;
      acc.maxScore += qScore;
      acc.total += 1;
      if (correct) {
        acc.earnedScore += qScore;
        acc.correct += 1;
      }

      // (b) 문항별 전체 정답 수
      if (correct) {
        perQuestionCorrect.set(qNum, (perQuestionCorrect.get(qNum) || 0) + 1);
      }

      // (c) 참고치 표본용 항목별 집계
      const category = q.category || q.domain || '미분류';
      const level = q.difficulty || '중';
      if (!catTally.has(category)) catTally.set(category, { correct: 0, total: 0 });
      if (!diffTally.has(level)) diffTally.set(level, { correct: 0, total: 0 });
      catTally.get(category)!.total += 1;
      diffTally.get(level)!.total += 1;
      if (correct) {
        catTally.get(category)!.correct += 1;
        diffTally.get(level)!.correct += 1;
        correctTally += 1;
      }
    });

    for (const [name, t] of catTally) {
      if (!referenceCategorySamples.has(name)) referenceCategorySamples.set(name, []);
      referenceCategorySamples.get(name)!.push((t.correct / t.total) * 100);
    }
    for (const [level, t] of diffTally) {
      if (!referenceDifficultySamples.has(level)) referenceDifficultySamples.set(level, []);
      referenceDifficultySamples.get(level)!.push((t.correct / t.total) * 100);
    }
    if (questionsData.length > 0) {
      referenceTotalSamples.push((correctTally / questionsData.length) * 100);
    }
  }

  const stats: CohortStats = {
    completedAttempts,
    sortedAttemptIds,
    attemptCount: completedAttempts.length,
    scores: completedAttempts.map((a) => a.score || 0),
    domainAverages,
    perQuestionCorrect,
    referenceCategorySamples,
    referenceDifficultySamples,
    referenceTotalSamples,
    computedAt: Date.now(),
  };

  cohortCache.set(examId, stats);
  return stats;
}

/* ===========================================================================
 * AI 보고서 생성 큐
 *
 * Gemini 호출은 수십 초가 걸리고 비용도 든다. 요청마다 즉시 호출하면
 *   - 동시 응시 후 일괄 생성 시 외부 API 로 부하가 그대로 전달되고
 *   - 같은 attempt 를 두 번 누르면 같은 보고서를 두 번 만든다.
 * 그래서 동시 실행을 2개로 제한하고, attempt 단위로 잠금을 건다.
 *
 * 전제: 단일 인스턴스. 큐가 프로세스 메모리에 있으므로 여러 인스턴스로
 * 수평 확장하면 인스턴스마다 별도 큐가 생겨 중복 잠금이 깨진다.
 * 다중 인스턴스가 필요해지면 DB 잠금(예: aiReports 선삽입 + 상태 컬럼)이나
 * 외부 큐로 옮겨야 한다.
 * =========================================================================== */

const MAX_CONCURRENT_REPORTS = 2;

/** 4xx 로 사용자에게 그대로 알려야 하는 실패 (재시도 무의미) */
class ReportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let runningReports = 0;
const waitingReports: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (runningReports < MAX_CONCURRENT_REPORTS) {
    runningReports++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitingReports.push(() => {
      runningReports++;
      resolve();
    });
  });
}

function releaseSlot() {
  runningReports--;
  const next = waitingReports.shift();
  if (next) next();
}

interface ReportJob {
  attemptId: string;
  state: 'queued' | 'processing';
  promise: Promise<string>;
}

/** attempt 별 진행 중 작업. 존재 = 잠금. */
const reportJobs = new Map<string, ReportJob>();

async function runWithRetry(attemptId: string): Promise<string> {
  try {
    return await runReportGeneration(attemptId);
  } catch (error: any) {
    // 데이터 문제(4xx)는 다시 해도 같으므로 재시도하지 않는다
    if (error instanceof ReportError) throw error;
    console.warn('[report-queue] 1차 실패, 1회 재시도:', attemptId, error?.message);
    return await runReportGeneration(attemptId);
  }
}

/** 이미 진행 중이면 그 작업을 그대로 돌려준다(새 Gemini 호출 없음). */
function enqueueReport(attemptId: string): ReportJob {
  const existing = reportJobs.get(attemptId);
  if (existing) return existing;

  const job: ReportJob = { attemptId, state: 'queued', promise: undefined as any };

  job.promise = (async () => {
    await acquireSlot();
    job.state = 'processing';
    console.log('[report-queue] 생성 시작:', attemptId, `(동시 ${runningReports}/${MAX_CONCURRENT_REPORTS})`);
    try {
      const reportId = await runWithRetry(attemptId);
      console.log('[report-queue] 생성 완료:', attemptId);
      return reportId;
    } finally {
      releaseSlot();
      // 성공·실패 모두 잠금 해제. 실패했다면 사용자가 다시 시도할 수 있어야 한다.
      reportJobs.delete(attemptId);
    }
  })();

  // 폴링으로 결과를 확인하므로 여기서 rejection 을 삼켜 unhandled 를 막는다
  job.promise.catch(() => {});
  reportJobs.set(attemptId, job);
  return job;
}

// POST /api/reports/generate/:attemptId - AI 분석 보고서 생성 (큐 적재 후 즉시 응답)
router.post('/generate/:attemptId', requireAuth, async (req, res) => {
  try {
    const { attemptId } = req.params;

    // 권한 검증 (타 학생 보고서 생성 및 Gemini 호출 남용 차단)
    const access = await checkAttemptAccess(req.session.user, attemptId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    // Check if report already exists
    const [existingReport] = await db
      .select()
      .from(aiReports)
      .where(eq(aiReports.attemptId, attemptId))
      .limit(1);

    if (existingReport) {
      // 기존 계약 유지: report 필드를 그대로 두고 status/reportId 를 추가한다
      return res.status(200).json({
        success: true,
        status: 'done',
        reportId: existingReport.id,
        message: '이미 보고서가 생성되었습니다.',
        report: existingReport,
      });
    }

    const alreadyRunning = reportJobs.get(attemptId);
    if (alreadyRunning) {
      return res.status(202).json({
        success: true,
        status: alreadyRunning.state,
        message: '보고서를 생성하고 있습니다.',
      });
    }

    const job = enqueueReport(attemptId);
    return res.status(202).json({
      success: true,
      status: job.state,
      message: '보고서 생성을 시작했습니다.',
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ message: 'AI 보고서 생성 중 오류가 발생했습니다.' });
  }
});

/**
 * 실제 보고서 생성. 큐 워커에서만 호출한다. 완료 시 reportId 를 돌려준다.
 */
async function runReportGeneration(attemptId: string): Promise<string> {
  {
    // Get attempt with exam and student info
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);

    if (!attempt || !attempt.submittedAt) {
      throw new ReportError(404, '제출된 시험을 찾을 수 없습니다.');
    }

    const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
    const [student] = await db
      .select({
        student: students,
        user: users,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.id, attempt.studentId))
      .limit(1);

    if (!exam || !student) {
      throw new ReportError(404, '시험 또는 학생 정보를 찾을 수 없습니다.');
    }

    if (!genAI) {
      throw new ReportError(500, 'AI 분석 서비스가 설정되지 않았습니다.');
    }

    // Prepare data for AI analysis
    const questionsData = exam.questionsData as any[];
    const answers = attempt.answers as any;
    const studentUser = student.user;

    // 지점 수동 채점(O/X)으로 저장된 답안은 값이 정답 번호가 아니라 O=1 / X=0 이다.
    const isOxGraded = answers?._gradingMode === 'ox';
    const isAnswerCorrect = (q: any, studentAnswer: any) =>
      isOxGraded ? Number(studentAnswer) === 1 : studentAnswer === q.correctAnswer;

    // Calculate domain stats
    const domainMap = new Map<string, { name: string; correct: number; total: number; earnedScore: number; maxScore: number; incorrectQuestions: number[] }>();

    for (const q of questionsData) {
      const domain = q.domain || q.category || '독서';
      const qNum = q.number || (questionsData.indexOf(q) + 1);
      const studentAnswer = answers[qNum.toString()];
      const isCorrect = isAnswerCorrect(q, studentAnswer);
      const qScore = q.score || 2;

      if (!domainMap.has(domain)) {
        domainMap.set(domain, { name: domain, correct: 0, total: 0, earnedScore: 0, maxScore: 0, incorrectQuestions: [] });
      }

      const domainData = domainMap.get(domain)!;
      domainData.total++;
      domainData.maxScore += qScore;
      if (isCorrect) {
        domainData.correct++;
        domainData.earnedScore += qScore;
      } else {
        domainData.incorrectQuestions.push(qNum);
      }
    }

    const domainStats = Array.from(domainMap.values()).map(d => ({
      ...d,
      percentage: Math.round((d.correct / d.total) * 100),
    }));

    // 시험 단위 코호트 통계 (5분 캐시). 순위·영역평균·문항정답수·참고치 표본을 함께 얻는다.
    const cohort = await getCohortStats(attempt.examId, questionsData);
    const completedAttempts = cohort.completedAttempts;

    const rankIndex = cohort.sortedAttemptIds.indexOf(attemptId);
    const rank = rankIndex + 1; // 못 찾으면 0

    const domainAverageMap = cohort.domainAverages;
    const attemptCount = cohort.attemptCount;

    /** 영역별 실제 평균 점수/정답률. 표본이 없으면 null (임의 값을 만들지 않는다) */
    function domainAverage(domainName: string): { avgScore: number | null; avgPercentage: number | null } {
      const acc = domainAverageMap.get(domainName);
      if (!acc || attemptCount === 0 || acc.total === 0) {
        return { avgScore: null, avgPercentage: null };
      }
      return {
        avgScore: Math.round(acc.earnedScore / attemptCount),
        avgPercentage: Math.round((acc.correct / acc.total) * 100),
      };
    }

    // Call Gemini API with detailed prompt for comprehensive report
    // Try multiple models as fallback
    // GPT-4o 사용

    // 전문적이고 상세한 프롬프트 - 틀린 문항 패턴 분석
    const incorrectQuestions = questionsData.filter((q: any, idx: number) => {
      const qNum = q.number || (idx + 1);
      return !isAnswerCorrect(q, answers[qNum.toString()]);
    });

    const correctQuestions = questionsData.filter((q: any, idx: number) => {
      const qNum = q.number || (idx + 1);
      return isAnswerCorrect(q, answers[qNum.toString()]);
    });

    // 학년별 프로그램 철학
    const gradePhilosophy: { [key: string]: string } = {
      '중1': '올가의 중1 프로그램은 국어의 기초 개념을 튼튼히 다지는 데 중점을 둡니다.',
      '중2': '올가의 중2 프로그램은 독해력과 문법의 심화 학습에 집중합니다.',
      '중3': '올가의 중3 프로그램은 고등 국어로의 전환을 준비하며 실전 독해를 강화합니다.',
      '고1': '올가의 고1 프로그램은 수능 국어의 기본 체계를 구축하는 데 집중합니다.',
      '고2': '올가의 고2 프로그램은 수능 독서 지문 분석과 문학 감상 능력을 고도화합니다.',
      '고3': '올가의 고3 프로그램은 수능 최적화 전략과 킬러 문항 대응력을 완성합니다.',
    };

    const philosophy =
      (student.student.grade ? gradePhilosophy[student.student.grade] : undefined) ||
      '올가의 프로그램은 학생의 실력 향상에 집중합니다.';

    // ===== 새로운 구조: System Prompt + User Data 분리 =====
    // User Data: Only input data in JSON format (NO old report examples, NO old prompts)
    const userData = {
      studentAnswer: {
        학생명: studentUser.name,
        학년: student.student.grade,
        시험명: exam.title,
        원점수: attempt.score,
        만점: attempt.maxScore,
        정답률: Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100),
        등급: attempt.grade,
        순위: `${rank}/${completedAttempts.length}`,
        프로그램철학: philosophy,
        영역별성취도: domainStats.map(d => ({
          영역: d.name,
          취득점수: d.earnedScore,
          만점: d.maxScore,
          정답수: d.correct,
          전체문항: d.total,
          정답률: d.percentage
        }))
      },
      masterCsv: {
        틀린문항: incorrectQuestions.length > 0 ? incorrectQuestions.map((q: any) => {
          const qNum = q.number || q.questionNumber;
          return {
            문항번호: qNum,
            영역: q.domain,
            난이도: q.difficulty || '중',
            유형: q.typeAnalysis || '미분류',
            소분류: q.subcategory || '미분류',
            정답: q.correctAnswer,
            학생답안: isOxGraded ? 'X(오답)' : answers[qNum?.toString()] || '무응답'
          };
        }) : [],
        맞은문항: correctQuestions.length > 0 ? correctQuestions.map((q: any) => {
          const qNum = q.number || q.questionNumber;
          return {
            문항번호: qNum,
            영역: q.domain,
            난이도: q.difficulty || '중',
            유형: q.typeAnalysis || '미분류',
            소분류: q.subcategory || '미분류'
          };
        }) : []
      },
      average: {
        응시학생수: attemptCount,
        영역별평균: domainStats.map(d => {
          const avg = domainAverage(d.name);
          return {
            영역: d.name,
            평균점수: avg.avgScore,
            평균정답률: avg.avgPercentage,
            // 표본이 1명(본인)뿐이면 비교 의미가 없음을 AI 에 알린다
            비교가능: attemptCount > 1,
          };
        })
      }
    };

    // Combine System Prompt + User Data (clean separation)
    const prompt = `${OLGA_REPORT_META_PROMPT_V3}

[입력 데이터]
${JSON.stringify(userData, null, 2)}`;

    // 학생명·학년·점수·틀린문항·학생답안이 담긴 userData 를 로그로 남기지 않는다(PII).

    // Call Gemini API (Gemini 2.5 Flash)
    console.log('🤖 Google Gemini 2.5 Flash로 전문 보고서 생성 중...');

    let responseText = '';

    try {
      if (!genAI) {
        throw new Error('Gemini API가 초기화되지 않았습니다.');
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.7,
          // v3 프롬프트는 영역별 소견 5건(각 300-420자) + 진학 대비 소견 + 처방 5갈래를
          // 한 번에 요구한다. 8000 으로는 응답이 잘려 JSON 파싱이 실패하고
          // 폴백 텍스트로 떨어진다 (실측: 잘림 -> subjectDetails 25자짜리 기본 문장).
          maxOutputTokens: 16000,
        }
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      responseText = response.text();

      console.log('✅ Google Gemini 전문 보고서 생성 완료');
    } catch (error: any) {
      console.error('❌ Gemini API 오류:', error.message);
      // AI 분석 실패 시 기본 분석 데이터 생성
      responseText = JSON.stringify({
        olgaSummary: `AI 분석이 일시적으로 불가능합니다.\n\n성적: ${attempt.score}점/${attempt.maxScore}점 (${Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100)}%)\n등급: ${attempt.grade}등급\n순위: ${rank}/${completedAttempts.length}`,
        errorPatterns: [],
        subjectAreas: domainStats.map((d: any) => {
          const avg = domainAverage(d.name);
          return {
            name: d.name,
            percentage: d.percentage,
            earnedScore: d.earnedScore,
            maxScore: d.maxScore,
            avgScore: avg.avgScore,
            avgPercentage: avg.avgPercentage,
            analysis: `${d.name} 영역에서 ${d.percentage}%의 정답률을 보였습니다.`
          };
        })
      });
    }

    // Parse AI response
    let aiAnalysis: any = {};
    try {
      // Remove markdown code blocks if present (```json ... ```)
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      aiAnalysis = JSON.parse(cleanedText);

      // metaVersion 검증. v3 프롬프트를 보냈으므로 v3 응답을 기대한다.
      // v2 응답은 highSchoolPrep 이 없고 영역 소견이 짧지만, 지면이 폴백을 갖고 있어 렌더는 된다.
      if (aiAnalysis.metaVersion !== 'v3') {
        console.warn('⚠️ 경고: 이전 버전의 프롬프트 응답 감지됨. metaVersion:', aiAnalysis.metaVersion);
      } else {
        console.log('✅ 새로운 메타 프롬프트 v3 응답 확인');
      }
    } catch (e) {
      console.error('JSON 파싱 오류:', e);
      console.error('응답 내용:', responseText.substring(0, 500));
      aiAnalysis = {
        metaVersion: 'v3',
        olgaSummary: responseText,
        subjectAreas: [],
        errorPatterns: []
      };
    }

    // 백분위. 순위를 못 찾았거나(rank=0) 표본이 없으면 100 이 아니라 0 으로 둔다.
    // (기존에는 findIndex 실패 시 1 - 0/n = 1 → 백분위 100 으로 잘못 표시됐다)
    const percentile =
      rank > 0 && attemptCount > 0
        ? Math.round(100 * (1 - rank / attemptCount) * 10) / 10
        : 0;

    // 표준점수는 채점 결과(등급·원점수·만점)가 모두 있을 때만 산출한다.
    // 값이 없으면 임의의 숫자를 만들지 않고 null 로 둔다.
    const hasScoreData =
      attempt.grade !== null && attempt.score !== null && attempt.maxScore !== null && attempt.maxScore > 0;
    const scoreRatio = hasScoreData ? attempt.score! / attempt.maxScore! : 0;
    const standardScore = !hasScoreData
      ? null
      : attempt.grade! <= 2
      ? Math.round(80 + scoreRatio * 20)
      : attempt.grade! <= 4
      ? Math.round(70 + scoreRatio * 10)
      : Math.round(60 + scoreRatio * 10);

    // ===== OLD HARDCODED TEMPLATES REMOVED =====
    // studyPlan, learningStrategy 등 하드코딩된 템플릿 모두 제거
    // AI가 생성한 JSON만 사용

    // ===== AI JSON 구조만 사용 (NEW) =====
    const aiStats = aiAnalysis.stats || {};
    const aiAnalysisData = aiAnalysis.analysis || {};

    // =====================================================================
    // 시험지/문항 분석 실계산.
    // 모든 값은 exam.questionsData 와 제출 완료된 attempts 에서만 나온다.
    // 표본이 없으면 null 을 반환하고, 임의의 평균이나 곡선을 만들지 않는다.
    // =====================================================================

    /** 문항별 전체 응시자 정답 수 (코호트 캐시에서). */
    const perQuestionCorrect = cohort.perQuestionCorrect;
    /** 문항별 분석. 학생 정오 + 전체 응시자 정답률. */
    const questionAnalysis = questionsData.map((q: any, idx: number) => {
      const qNum = q.number || idx + 1;
      const studentAnswer = answers[qNum.toString()];
      const cohortCorrectCount = perQuestionCorrect.get(qNum) || 0;
      return {
        number: qNum,
        category: q.category || q.domain || '미분류',
        type: q.typeAnalysis || q.questionIntent || '',
        subcategory: q.subcategory || '',
        difficulty: q.difficulty || '중',
        points: Number(q.points ?? q.score) || 0,
        isCorrect: isAnswerCorrect(q, studentAnswer),
        correctAnswer: q.correctAnswer ?? null,
        studentAnswer: isOxGraded ? null : (studentAnswer ?? null),
        explanation: q.explanation || q.commentary || '',
        cohortCorrectCount,
        cohortRate: attemptCount > 0 ? Math.round((cohortCorrectCount / attemptCount) * 100) : null,
      };
    });

    /** 난이도별 학생 정답률과 전체 평균 정답률. */
    const difficultyStats = ['상', '중', '하']
      .map((level) => {
        const items = questionAnalysis.filter((q) => q.difficulty === level);
        if (items.length === 0) return null;
        const studentCorrect = items.filter((q) => q.isCorrect).length;
        const cohortCorrectSum = items.reduce((s, q) => s + q.cohortCorrectCount, 0);
        const cohortDenominator = items.length * attemptCount;
        return {
          level,
          count: items.length,
          points: items.reduce((s, q) => s + q.points, 0),
          studentCorrect,
          studentRate: Math.round((studentCorrect / items.length) * 100),
          cohortRate: cohortDenominator > 0 ? Math.round((cohortCorrectSum / cohortDenominator) * 100) : null,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    /** 영역별 배점 구성과 정답률. */
    const categoryAccumulator = new Map<string, { name: string; count: number; points: number; studentCorrect: number; cohortCorrect: number }>();
    for (const q of questionAnalysis) {
      if (!categoryAccumulator.has(q.category)) {
        categoryAccumulator.set(q.category, { name: q.category, count: 0, points: 0, studentCorrect: 0, cohortCorrect: 0 });
      }
      const acc = categoryAccumulator.get(q.category)!;
      acc.count += 1;
      acc.points += q.points;
      if (q.isCorrect) acc.studentCorrect += 1;
      acc.cohortCorrect += q.cohortCorrectCount;
    }
    const categoryPointsMap = Array.from(categoryAccumulator.values()).map((c) => ({
      ...c,
      studentRate: Math.round((c.studentCorrect / c.count) * 100),
      cohortRate: attemptCount > 0 ? Math.round((c.cohortCorrect / (c.count * attemptCount)) * 100) : null,
    }));

    // =====================================================================
    // 참고치(reference range).
    // 건강검진 결과지의 '참고치'와 같은 개념으로, 같은 시험을 제출한 응시자들의
    // 항목별 정답률 분포에서 가운데 80% 구간(제10 ~ 제90 백분위)을 참고치로 삼는다.
    // 임상 검사의 참고구간과 같은 방식이며, 평균 +- 표준편차와 달리 0/100 에서
    // 잘려 나가지 않는다. 가운데 50%(사분위) 구간은 응시자 절반이 미달로 찍혀
    // 검진지의 플래그 의미가 희석되므로 쓰지 않는다.
    // 표본이 REFERENCE_MIN_SAMPLE 미만이면 구간을 만들지 않는다.
    // 지면에는 '기준 축적 중'으로 표기한다 (없는 범위를 지어내지 않는다).
    // =====================================================================
    const REFERENCE_MIN_SAMPLE = 5;

    type ReferenceBand = {
      available: boolean;
      sampleSize: number;
      mid: number | null;
      mean: number | null;
      low: number | null;
      high: number | null;
    };

    function buildReferenceBand(values: number[]): ReferenceBand {
      if (values.length < REFERENCE_MIN_SAMPLE) {
        return { available: false, sampleSize: values.length, mid: null, mean: null, low: null, high: null };
      }
      const sorted = values.slice().sort((a, b) => a - b);
      const quantile = (p: number) => {
        const pos = (sorted.length - 1) * p;
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
      };
      return {
        available: true,
        sampleSize: values.length,
        low: Math.round(quantile(0.10)),
        mid: Math.round(quantile(0.5)),
        high: Math.round(quantile(0.90)),
        mean: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
      };
    }

    /** 참고치 구간 표본 (코호트 캐시에서). */
    const referenceCategorySamples = cohort.referenceCategorySamples;
    const referenceDifficultySamples = cohort.referenceDifficultySamples;
    const referenceTotalSamples = cohort.referenceTotalSamples;

    const categoryReference = categoryPointsMap.map((c) => ({
      name: c.name,
      ...buildReferenceBand(referenceCategorySamples.get(c.name) || []),
    }));
    const difficultyReference = difficultyStats.map((d) => ({
      level: d.level,
      ...buildReferenceBand(referenceDifficultySamples.get(d.level) || []),
    }));
    const overallReference = buildReferenceBand(referenceTotalSamples);

    // =====================================================================
    // 추이(이전 검사 대비). 같은 학생의 이전 제출 기록 중 가장 최근 것과 비교한다.
    // 시험이 다르면 만점이 다르므로 정답률(%)로 비교하고, 지면에 시험명을 함께 적는다.
    // 이전 기록이 없으면 비교하지 않는다 (첫 검사임을 그대로 표기한다).
    // =====================================================================
    const studentAllAttempts = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.studentId, attempt.studentId));

    const priorAttempts = studentAllAttempts
      .filter(
        (a) =>
          a.id !== attemptId &&
          a.submittedAt !== null &&
          a.score !== null &&
          !!a.maxScore &&
          new Date(a.submittedAt).getTime() < new Date(attempt.submittedAt!).getTime()
      )
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime());

    const previousAttempt = priorAttempts[0] || null;
    let previousExam: typeof exams.$inferSelect | null = null;
    if (previousAttempt) {
      const [found] = await db
        .select()
        .from(exams)
        .where(eq(exams.id, previousAttempt.examId))
        .limit(1);
      previousExam = found || null;
    }

    const currentRate = attempt.maxScore
      ? Math.round(((attempt.score || 0) / attempt.maxScore) * 100)
      : null;
    const previousRate =
      previousAttempt && previousAttempt.maxScore
        ? Math.round(((previousAttempt.score || 0) / previousAttempt.maxScore) * 100)
        : null;

    const examHistory = {
      available: previousAttempt !== null,
      priorCount: priorAttempts.length,
      sameExam: previousAttempt ? previousAttempt.examId === attempt.examId : false,
      previous: previousAttempt
        ? {
            examTitle: previousExam?.title || '이전 검사',
            date: new Date(previousAttempt.submittedAt!).toLocaleDateString('ko-KR'),
            score: previousAttempt.score,
            maxScore: previousAttempt.maxScore,
            rate: previousRate,
            grade: previousAttempt.grade ?? null,
          }
        : null,
      current: {
        examTitle: exam.title,
        date: new Date(attempt.submittedAt!).toLocaleDateString('ko-KR'),
        score: attempt.score,
        maxScore: attempt.maxScore,
        rate: currentRate,
        grade: attempt.grade ?? null,
      },
      delta:
        previousAttempt && previousRate !== null && currentRate !== null
          ? {
              rate: currentRate - previousRate,
              score:
                previousAttempt.maxScore === attempt.maxScore
                  ? (attempt.score || 0) - (previousAttempt.score || 0)
                  : null,
              grade:
                previousAttempt.grade !== null && attempt.grade !== null
                  ? (previousAttempt.grade as number) - (attempt.grade as number)
                  : null,
            }
          : null,
    };

    /** 변별 분석: 전체는 잘 맞힌 문항인데 놓친 것 / 전체가 어려워한 문항인데 맞힌 것. */
    const missedEasyQuestions = questionAnalysis
      .filter((q) => q.cohortRate !== null && q.cohortRate >= 70 && !q.isCorrect)
      .sort((a, b) => (b.cohortRate || 0) - (a.cohortRate || 0));
    const solvedHardQuestions = questionAnalysis
      .filter((q) => q.cohortRate !== null && q.cohortRate <= 40 && q.isCorrect)
      .sort((a, b) => (a.cohortRate || 0) - (b.cohortRate || 0));

    const examOverview = {
      title: exam.title,
      subject: exam.subject,
      grade: exam.grade || '',
      totalQuestions: exam.totalQuestions,
      totalScore: exam.totalScore,
      pointsSum: questionAnalysis.reduce((s, q) => s + q.points, 0),
      attemptCount,
      rank: rank > 0 ? rank : null,
      categoryCount: categoryPointsMap.length,
      difficultyCount: difficultyStats.length,
      explainedCount: questionAnalysis.filter((q) => q.explanation).length,
      // 결과통보서 문서번호. 응시 기록 id 앞 8자리로, 새로 만들어낸 값이 아니다.
      documentNo: attemptId.replace(/-/g, '').slice(0, 8).toUpperCase(),
      issuedDate: new Date().toLocaleDateString('ko-KR'),
      referenceMinSample: REFERENCE_MIN_SAMPLE,
    };

    // reportData 구조 (AI JSON 기반)
    const reportData = {
      metaVersion: aiAnalysis.metaVersion || 'v3',
      studentInfo: {
        name: studentUser.name,
        school: student.student.school || '미지정',
        date: new Date(attempt.submittedAt!).toLocaleDateString('ko-KR'),
        level: student.student.grade || '미지정',
      },
      scoreSummary: {
        grade: attempt.grade,
        rawScore: attempt.score,
        rawScoreMax: attempt.maxScore,
        standardScore,
        percentile: percentile,
      },
      charts: {
        scoreChartData: domainStats.map(d => d.percentage),
        percentileChartData: {
          studentPercentile: percentile,
          // 실제 응시자 점수 분포에서 만든 10분위 누적 비율.
          // (기존에는 표본과 무관한 고정 곡선을 넣고 있었다)
          cumulativeData: buildCumulativeDistribution(
            completedAttempts.map(a => a.score || 0),
            attempt.maxScore || 0
          ),
          sampleSize: attemptCount,
        },
        radarChartData: aiStats.domainChartData || {
          student: domainStats.map(d => d.percentage),
          average: domainStats.map(d => domainAverage(d.name).avgPercentage),
        },
        predictionChartData: [
          Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100),
          Math.min(Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100) + 5, 100),
          Math.min(Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100) + 10, 100),
          Math.min(Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100) + 15, 100),
        ],
      },
      analysis: {
        olgaSummary: aiAnalysisData.olgaSummary || `${studentUser.name} 학생의 성적 분석 결과입니다.`,
        subjectDetails: (aiAnalysisData.subjectDetails || domainStats.map((d: any) => ({
          name: d.name,
          score: d.percentage,
          scoreText: `취득 ${d.earnedScore}점 / 만점 ${d.maxScore}점 (${d.correct}/${d.total}문항 정답)`,
          statusColor: d.percentage >= 80 ? 'blue' : d.percentage >= 70 ? 'green' : d.percentage >= 60 ? 'orange' : 'red',
          analysisText: `${d.name} 영역에서 ${d.percentage}%의 정답률을 기록했습니다.`,
        }))),
        strengths: aiAnalysisData.strengths || [],
        weaknesses: aiAnalysisData.weaknesses || [],
        propensity: aiAnalysisData.propensity || {
          typeTitle: '분석 중',
          typeDescription: '성향 분석 데이터가 생성 중입니다.',
        },
        // 고교 진학 대비 소견. 프롬프트 v2 에서 새로 요구하는 필드이므로
        // 이전에 생성된 보고서에는 없다. 없으면 null 로 두고 지면에서 대체 문구를 쓴다.
        highSchoolPrep: aiAnalysisData.highSchoolPrep || null,
      },
      // 수능 등급 예측 표기용. 이번 검사에서 '측정된' 등급을 그대로 옮긴 구간이며
      // 새 수치를 만들어내지 않는다. 해석 문구와 단서는 지면이 붙인다.
      ceoOutlook: {
        measuredGrade: attempt.grade ?? null,
        bandLow: attempt.grade ? Math.max(1, (attempt.grade as number) - 1) : null,
        bandHigh: attempt.grade ? Math.min(9, (attempt.grade as number) + 1) : null,
        sampleSize: attemptCount,
      },
      // ===== 시험지/문항 분석 (전부 DB 실데이터 계산) =====
      examOverview,
      questionAnalysis,
      difficultyStats,
      categoryPointsMap,
      // 건강검진 결과지 문법의 참고치 / 추이 (전부 실표본 계산)
      categoryReference,
      difficultyReference,
      overallReference,
      examHistory,
      discrimination: {
        missedEasy: missedEasyQuestions,
        solvedHard: solvedHardQuestions,
      },
      examInsight: {
        trends: Array.isArray(exam.examTrends) ? (exam.examTrends as any[]) : [],
        overallReview: exam.overallReview || '',
      },
    };

    // reportData 에는 학생명·학교·성적이 들어 있으므로 로그로 남기지 않는다(PII).

    // metaVersion 검증
    if (reportData.metaVersion !== 'v3') {
      console.warn('[WARN] Old style reportData detected:', reportData.metaVersion);
    }

    // Generate HTML content with new reportData structure (using new template)
    const htmlContent = generateNewReportHTML(reportData);

    // Save report with AI analysis data
    const [report] = await db
      .insert(aiReports)
      .values({
        attemptId,
        studentId: attempt.studentId,
        examId: attempt.examId,
        analysis: reportData,  // 새 구조로 저장
        summary: reportData.analysis.olgaSummary || '분석 완료',
        htmlContent,
      })
      .returning();

    return report.id;
  }
}

/**
 * GET /api/reports/:reportId/summary - 모바일 요약 뷰용 데이터
 *
 * 저장된 analysis JSON 에서 이미 계산된 값만 골라 낸다. 새로 계산하거나
 * 없는 값을 채우지 않는다(참고치가 없으면 없는 대로 내려보낸다).
 * 라우트 순서 주의: '/:reportId' 보다 먼저 등록해야 한다.
 */
router.get('/:reportId/summary', requireAuth, async (req, res) => {
  try {
    const [report] = await db
      .select({
        id: aiReports.id,
        attemptId: aiReports.attemptId,
        analysis: aiReports.analysis,
        generatedAt: aiReports.generatedAt,
      })
      .from(aiReports)
      .where(eq(aiReports.id, req.params.reportId))
      .limit(1);

    if (!report) {
      return res.status(404).json({ message: '보고서를 찾을 수 없습니다.' });
    }

    const access = await checkAttemptAccess(req.session.user, report.attemptId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const a = (report.analysis as any) || {};
    const score = a.scoreSummary || {};

    // ① 판정 — 이번 검사에서 측정된 값만 옮긴다
    const verdict = {
      grade: score.grade ?? null,
      rawScore: score.rawScore ?? null,
      rawScoreMax: score.rawScoreMax ?? null,
      percentile: score.percentile ?? null,
      studentName: a.studentInfo?.name ?? null,
      examDate: a.studentInfo?.date ?? null,
      overallReference: a.overallReference ?? null,
    };

    // ② 이상 항목 — 참고치(제10~90백분위) 를 벗어난 항목만
    const abnormal: Array<{
      name: string;
      kind: 'category' | 'difficulty';
      studentRate: number;
      low: number;
      high: number;
      direction: 'below' | 'above';
    }> = [];

    const categoryRates = new Map<string, number>(
      (a.categoryPointsMap || []).map((c: any) => [c.name, c.studentRate])
    );
    for (const ref of a.categoryReference || []) {
      if (!ref?.available) continue;
      const rate = categoryRates.get(ref.name);
      if (typeof rate !== 'number') continue;
      if (rate < ref.low) {
        abnormal.push({ name: ref.name, kind: 'category', studentRate: rate, low: ref.low, high: ref.high, direction: 'below' });
      } else if (rate > ref.high) {
        abnormal.push({ name: ref.name, kind: 'category', studentRate: rate, low: ref.low, high: ref.high, direction: 'above' });
      }
    }

    const difficultyRates = new Map<string, number>(
      (a.difficultyStats || []).map((d: any) => [d.level, d.studentRate])
    );
    for (const ref of a.difficultyReference || []) {
      if (!ref?.available) continue;
      const rate = difficultyRates.get(ref.level);
      if (typeof rate !== 'number') continue;
      if (rate < ref.low) {
        abnormal.push({ name: `난이도 ${ref.level}`, kind: 'difficulty', studentRate: rate, low: ref.low, high: ref.high, direction: 'below' });
      } else if (rate > ref.high) {
        abnormal.push({ name: `난이도 ${ref.level}`, kind: 'difficulty', studentRate: rate, low: ref.low, high: ref.high, direction: 'above' });
      }
    }

    // 미달을 먼저, 그 안에서 이탈 폭이 큰 순서로
    abnormal.sort((x, y) => {
      if (x.direction !== y.direction) return x.direction === 'below' ? -1 : 1;
      const dx = x.direction === 'below' ? x.low - x.studentRate : x.studentRate - x.high;
      const dy = y.direction === 'below' ? y.low - y.studentRate : y.studentRate - y.high;
      return dy - dx;
    });

    // ③ 핵심 소견
    const keyFinding = a.analysis?.olgaSummary ?? null;

    // ④ 권고 상위 3 — 약점 소견을 우선, 부족하면 진학 대비 소견으로 보충
    const recommendations: Array<{ title: string; detail: string | null }> = [];
    for (const w of a.analysis?.weaknesses || []) {
      if (recommendations.length >= 3) break;
      if (!w?.name) continue;
      recommendations.push({ title: w.name, detail: w.analysisText ?? null });
    }
    if (recommendations.length < 3 && a.analysis?.highSchoolPrep?.summary) {
      recommendations.push({ title: '진학 대비', detail: a.analysis.highSchoolPrep.summary });
    }

    res.json({
      success: true,
      data: {
        reportId: report.id,
        attemptId: report.attemptId,
        generatedAt: report.generatedAt,
        verdict,
        abnormal,
        keyFinding,
        recommendations,
      },
    });
  } catch (error) {
    console.error('Get report summary error:', error);
    res.status(500).json({ message: '보고서 요약 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/reports/:reportId - AI 보고서 HTML 조회
router.get('/:reportId', requireAuth, async (req, res) => {
  try {
    const [report] = await db
      .select()
      .from(aiReports)
      .where(eq(aiReports.id, req.params.reportId))
      .limit(1);

    if (!report) {
      return res.status(404).send('<h1>보고서를 찾을 수 없습니다.</h1>');
    }

    const access = await checkAttemptAccess(req.session.user, report.attemptId);
    if (!access.ok) {
      return res.status(access.status).send('<h1>권한이 없습니다.</h1>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(report.htmlContent);
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).send('<h1>보고서 조회 중 오류가 발생했습니다.</h1>');
  }
});

// GET /api/reports/attempt/:attemptId - 응시 기록의 보고서 조회
router.get('/attempt/:attemptId', requireAuth, async (req, res) => {
  try {
    const access = await checkAttemptAccess(req.session.user, req.params.attemptId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const [report] = await db
      .select()
      .from(aiReports)
      .where(eq(aiReports.attemptId, req.params.attemptId))
      .limit(1);

    if (!report) {
      return res.status(404).json({ message: '보고서를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Get report by attempt error:', error);
    res.status(500).json({ message: '보고서 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
