import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index';
import { aiReports, examAttempts, exams, parents, studentParents, students, users } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { OLGA_REPORT_META_PROMPT_V2 } from '../prompts/olga-report-meta-prompt-v2';
import { generateReportHTML as generateNewReportHTML } from '../templates/newReportTemplate';

const router = express.Router();

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

// POST /api/reports/generate/:attemptId - AI 분석 보고서 생성
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
      console.log('✓ 이미 보고서가 존재합니다. 스킵:', attemptId);
      return res.status(200).json({
        success: true,
        message: '이미 보고서가 생성되었습니다.',
        report: existingReport
      });
    }

    // Get attempt with exam and student info
    const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);

    if (!attempt || !attempt.submittedAt) {
      return res.status(404).json({ message: '제출된 시험을 찾을 수 없습니다.' });
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
      return res.status(404).json({ message: '시험 또는 학생 정보를 찾을 수 없습니다.' });
    }

    if (!genAI) {
      return res.status(500).json({ message: 'AI 분석 서비스가 설정되지 않았습니다.' });
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

    // Get all completed attempts for ranking
    const allAttempts = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.examId, attempt.examId));

    const completedAttempts = allAttempts
      .filter(a => a.score !== null && a.submittedAt !== null);

    const sortedAttempts = completedAttempts
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const rank = sortedAttempts.findIndex(a => a.id === attemptId) + 1;

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
        응시학생수: completedAttempts.length,
        영역별평균: domainStats.map(d => ({
          영역: d.name,
          평균점수: Math.round(d.maxScore * 0.65),
          평균정답률: 65
        }))
      }
    };

    // Combine System Prompt + User Data (clean separation)
    const prompt = `${OLGA_REPORT_META_PROMPT_V2}

[입력 데이터]
${JSON.stringify(userData, null, 2)}`;

    // DEBUG: Log user data structure
    console.log('[DEBUG][USER_DATA]', JSON.stringify(userData, null, 2));
    console.log('[DEBUG][PROMPT_LENGTH]', prompt.length, 'characters');

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
          maxOutputTokens: 8000,
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
        subjectAreas: domainStats.map((d: any) => ({
          name: d.name,
          percentage: d.percentage,
          earnedScore: d.earnedScore,
          maxScore: d.maxScore,
          avgScore: 65,
          avgPercentage: 65,
          analysis: `${d.name} 영역에서 ${d.percentage}%의 정답률을 보였습니다.`
        }))
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

      // metaVersion 검증
      if (aiAnalysis.metaVersion !== 'v2') {
        console.warn('⚠️ 경고: 이전 버전의 프롬프트 응답 감지됨. metaVersion:', aiAnalysis.metaVersion);
      } else {
        console.log('✅ 새로운 메타 프롬프트 v2 응답 확인');
      }
    } catch (e) {
      console.error('JSON 파싱 오류:', e);
      console.error('응답 내용:', responseText.substring(0, 500));
      aiAnalysis = {
        metaVersion: 'v2',
        olgaSummary: responseText,
        subjectAreas: [],
        errorPatterns: []
      };
    }

    // 계산된 값들 (필요한 기본 통계만)
    const percentile = Math.round(100 * (1 - (rank / completedAttempts.length)) * 10) / 10;

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

    // reportData 구조 (AI JSON 기반)
    const reportData = {
      metaVersion: aiAnalysis.metaVersion || 'v2',
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
          cumulativeData: [3, 8, 16, 28, 43, 61, 77, 90, 97, 100], // 표준 누적 분포
        },
        radarChartData: aiStats.domainChartData || {
          student: domainStats.map(d => d.percentage),
          average: domainStats.map(() => 65),
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
      },
    };

    // DEBUG 로그
    console.log('[DEBUG][REPORT_DATA]', JSON.stringify(reportData, null, 2));

    // metaVersion 검증
    if (reportData.metaVersion !== 'v2') {
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

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ message: 'AI 보고서 생성 중 오류가 발생했습니다.' });
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
