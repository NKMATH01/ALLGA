import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index';
import { aiReports, examAttempts, exams, students, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { escapeHtml } from '../utils/helpers';

const router = express.Router();

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set. AI report generation will not work.');
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// POST /api/reports/generate/:attemptId - AI 분석 보고서 생성
router.post('/generate/:attemptId', requireAuth, async (req, res) => {
  try {
    const { attemptId } = req.params;

    // Check if report already exists
    const [existingReport] = await db
      .select()
      .from(aiReports)
      .where(eq(aiReports.attemptId, attemptId))
      .limit(1);

    if (existingReport) {
      return res.status(400).json({ message: '이미 보고서가 생성되었습니다.' });
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

    // Calculate domain stats
    const domainMap = new Map<string, { name: string; correct: number; total: number; earnedScore: number; maxScore: number; incorrectQuestions: number[] }>();

    for (const q of questionsData) {
      const domain = q.domain || q.category || '독서';
      const qNum = q.number || (questionsData.indexOf(q) + 1);
      const studentAnswer = answers[qNum.toString()];
      const isCorrect = studentAnswer === q.correctAnswer;
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
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-09-2025'
    });

    const prompt = `당신은 한국의 수능 국어 전문가입니다. 다음 학생의 시험 결과를 분석하여 상세한 4페이지 분량의 보고서를 작성해주세요.

학생 정보:
- 이름: ${studentUser.name}
- 학년: ${student.student.grade || '중3'}
- 학교: ${student.student.school || '알 수 없음'}

시험 정보:
- 시험명: ${exam.title}
- 과목: ${exam.subject}
- 총 문항: ${exam.totalQuestions}개
- 만점: ${exam.totalScore}점
- 출제 경향: ${exam.examTrends ? JSON.stringify(exam.examTrends) : ''}

성적:
- 원점수: ${attempt.score}/${attempt.maxScore}점 (${Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100)}%)
- 등급: ${attempt.grade}등급
- 순위: ${rank}/${completedAttempts.length}

영역별 정답률 (실제 계산값):
${domainStats.map(d => `- ${d.name}: ${d.percentage}% (${d.earnedScore}/${d.maxScore}점, 정답: ${d.correct}/${d.total}문항)`).join('\n')}

문항별 결과:
${questionsData.map((q: any, idx: number) => {
  const studentAnswer = answers[q.questionNumber?.toString() || (idx + 1).toString()];
  const isCorrect = studentAnswer === q.correctAnswer;
  return `${q.questionNumber || idx + 1}번 - ${isCorrect ? '정답' : '오답'} (난이도: ${q.difficulty || '중'}, 영역: ${q.category || '독서'}, 유형: ${q.subcategory || ''}, 점수: ${q.points || 2}점)`;
}).join('\n')}

시험 총평:
${exam.overallReview || ''}

다음 JSON 형식으로 분석 결과를 작성해주세요. subjectAreas의 percentage, earnedScore, maxScore는 위의 '영역별 정답률'에서 제공된 실제 계산값을 그대로 사용하세요:

{
  "overallGrade": "${attempt.grade}",
  "rawScore": ${attempt.score},
  "maxScore": ${attempt.maxScore},
  "standardScore": <표준점수 계산 (평균과 표준편차 기반)>,
  "percentile": <백분위 계산 (순위 기반: ${rank}/${completedAttempts.length})>,
  "expectedFinalGrade": "<예상 최종 등급 (예: 2~3)>",
  "subjectAreas": [
${domainStats.map(d => `    {
      "name": "${d.name}",
      "percentage": ${d.percentage},
      "earnedScore": ${d.earnedScore},
      "maxScore": ${d.maxScore},
      "avgScore": <전체 평균 점수 추정>,
      "avgPercentage": <전체 평균 정답률 추정>,
      "analysis": "<이 영역의 구체적인 분석 2-3문장>"
    }`).join(',\n')}
  ],
  "olgaSummary": "<올가 분석 총평을 다음 3개 문단으로 구성>\\n\\n<strong class=\\"text-slate-800\\">종합 평가:</strong> <현재 학년에서 이 등급의 의미와 잠재력 평가>\\n\\n<strong class=\\"text-slate-800\\">영역별 분석:</strong> <각 영역(화법, 작문, 문법, 수능독서, 문학)의 정답률을 바탕으로 한 학습 방향>\\n\\n<strong class=\\"text-slate-800\\">보완점 및 제언:</strong> <시급한 개선 과제와 학습 방향>",
  "errorPatterns": [
    {
      "area": "<영역명>",
      "questions": "<오답 문항 번호들 (예: 28, 31, 32번)>",
      "reason": "<주요 실수 원인 분석>"
    }
  ],
  "studyPlan": [
    {
      "stage": "중학교 3학년 - 기초 체력 완성 단계",
      "goal": "수능 국어의 기본 토대 구축",
      "details": "갈래별 대표 작품 읽기, 영역별 독해 훈련, 중등 문법 마스터"
    },
    {
      "stage": "고등학교 1학년 - 심화 학습 전개 단계",
      "goal": "수능 출제 패턴 익숙화 및 실력 도약",
      "details": "기출 작품 분석, 독해 전략 수립, 수능 문법 전 영역 학습"
    },
    {
      "stage": "고등학교 2학년 - 실전 역량 강화 단계",
      "goal": "2등급 진입 및 1등급 도전 기반 구축",
      "details": "출제 예상 작품 분석, 고난도 문제 대응, 복합 지문 훈련"
    },
    {
      "stage": "고등학교 3학년 - 수능 완전 정복 단계",
      "goal": "1등급 안정적 획득 및 만점 도전",
      "details": "주 3회 실전 모의고사, 취약 유형 집중 공략, 시간 관리 훈련"
    }
  ],
  "learningStrategy": [
    {
      "stage": "1단계<br/>(4주)",
      "focus": "<가장 약한 영역> 집중",
      "details": "<구체적인 학습 내용 및 방법>",
      "expectedResult": "<영역> XX% 달성<br/>+X~X점"
    },
    {
      "stage": "2단계<br/>(3주)",
      "focus": "<두 번째로 약한 영역> 완성",
      "details": "<구체적인 학습 내용 및 방법>",
      "expectedResult": "<영역> XX% 달성<br/><효과>"
    },
    {
      "stage": "3단계<br/>(5주)",
      "focus": "종합 실전 대비",
      "details": "주 2회 실전 모의고사 및 오답 분석, 취약 유형 집중 보완, 시간 관리 전략 수립",
      "expectedResult": "전체 XX% 달성<br/>X등급 진입"
    }
  ],
  "predictionScores": [<현재점수>, <4주후 예상>, <7주후 예상>, <12주후 예상>, <고1목표점수>],
  "gradeDistribution": [<1등급%>, <2등급%>, <3등급%>, <4등급%>, <5등급%>, <6등급%>, <7등급%>, <8등급%>, <9등급%>],
  "percentileDistribution": [<0-10구간인원>, <10-20구간인원>, <20-30구간인원>, <30-40구간인원>, <40-50구간인원>, <50-60구간인원>, <60-70구간인원>, <70-80구간인원>, <80-90구간인원>, <90-100구간인원>],
  "achievementPotential": "<매우 높음/높음/보통 중 하나>",
  "finalMessage": "<제시된 12주 학습 전략을 따를 경우의 성과 전망 및 격려 메시지 2-3문장>",
  "recommendations": "<맞춤형 학습 전략 및 추천사항>"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Simple analysis data structure
    const analysisData = {
      summary: responseText,
      domainStats,
      rank,
      totalParticipants: completedAttempts.length,
    };

    // Calculate percentage
    const calculatedPercentage = Math.round(((attempt.score || 0) / (attempt.maxScore || 100)) * 100);

    // Generate HTML content
    const htmlContent = generateReportHTML({
      student: student.user.name,
      grade: student.student.grade || '미지정',
      school: student.student.school || '미지정',
      examTitle: exam.title,
      examSubject: exam.subject,
      examDate: attempt.submittedAt!,
      score: attempt.score!,
      maxScore: attempt.maxScore!,
      percentage: calculatedPercentage,
      gradeLevel: attempt.grade!,
      analysis: analysisData,
    });

    // Save report with simplified data structure
    const [report] = await db
      .insert(aiReports)
      .values({
        attemptId,
        studentId: attempt.studentId,
        examId: attempt.examId,
        analysis: analysisData,
        summary: analysisData.summary,
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
router.get('/:reportId', requireAuth, (req, res) => {
  db.select()
    .from(aiReports)
    .where(eq(aiReports.id, req.params.reportId))
    .limit(1)
    .then(([report]) => {
      if (!report) {
        return res.status(404).send('<h1>보고서를 찾을 수 없습니다.</h1>');
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(report.htmlContent);
    })
    .catch((error) => {
      console.error('Get report error:', error);
      res.status(500).send('<h1>보고서 조회 중 오류가 발생했습니다.</h1>');
    });
});

// GET /api/reports/attempt/:attemptId - 응시 기록의 보고서 조회
router.get('/attempt/:attemptId', requireAuth, async (req, res) => {
  try {
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

// Helper function to generate 4-page HTML report with user's design template
function generateReportHTML(data: any): string {
  const {
    student,
    grade,
    school,
    examTitle,
    examSubject,
    examDate,
    score,
    maxScore,
    percentage,
    gradeLevel,
    analysis,
  } = data;

  const dateStr = new Date(examDate).toLocaleDateString('ko-KR');
  const domainStats = analysis.domainStats || [];

  // Prepare chart data
  const domainLabels = JSON.stringify(domainStats.map((d: any) => d.name));
  const domainPercentages = JSON.stringify(domainStats.map((d: any) => d.percentage));

  // AI analysis paragraphs
  const aiParagraphs = analysis.summary.split('\n\n').filter((p: string) => p.trim().length > 0);

  // Get strongest and weakest domains
  const sortedByPerf = [...domainStats].sort((a: any, b: any) => b.percentage - a.percentage);
  const strongestDomains = sortedByPerf.filter((d: any) => d.percentage >= 70);
  const weakestDomains = sortedByPerf.filter((d: any) => d.percentage < 70);

  // Determine color for each domain
  const getDomainColor = (percentage: number) => {
    if (percentage >= 80) return { border: 'blue-500', bg: 'blue-50', text: 'blue-600', desc: '우수' };
    if (percentage >= 70) return { border: 'green-500', bg: 'green-50', text: 'green-600', desc: '양호' };
    if (percentage >= 60) return { border: 'orange-500', bg: 'orange-50', text: 'orange-600', desc: '보통' };
    return { border: 'red-500', bg: 'red-50', text: 'red-600', desc: '미흡' };
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(examTitle)} - ${escapeHtml(student)} 분석 보고서</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans KR', sans-serif; background: #f1f5f9; }
        .a4-page { width: 794px; min-height: 1123px; background: white; margin: 20px auto; padding: 60px; position: relative; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .section-title-report { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; padding-left: 10px; border-left: 4px solid #6366f1; }
        @media print { .a4-page { margin: 0; box-shadow: none; page-break-after: always; } .page-break { page-break-before: always; } }
    </style>
</head>
<body>
    <section>
        <!-- Page 1 -->
        <div class="a4-page">
            <header class="mb-8">
                <div class="mb-3">
                    <h1 class="text-2xl font-black text-slate-800">${escapeHtml(examTitle)} 종합 분석 결과</h1>
                </div>
                <div class="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"></div>
                <p class="mt-3 text-xs text-slate-500">${escapeHtml(examTitle)} • ${escapeHtml(examSubject)} • 올가교육 수능연구소</p>
            </header>

            <section class="grid grid-cols-4 gap-3 mb-8 text-xs border-y border-slate-200 py-3">
                <div><strong class="text-slate-500 mr-1">학생명:</strong><span class="font-bold text-slate-700">${escapeHtml(student)}</span></div>
                <div><strong class="text-slate-500 mr-1">학교:</strong><span class="font-bold text-slate-700">${escapeHtml(school)}</span></div>
                <div><strong class="text-slate-500 mr-1">응시일:</strong><span class="font-bold text-slate-700">${dateStr}</span></div>
                <div><strong class="text-slate-500 mr-1">응시번호:</strong><span class="font-bold text-slate-700">${analysis.rank}/${analysis.totalParticipants}</span></div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">성적 총괄 현황</h2>
                <div class="border border-slate-200 rounded-lg p-5 flex items-center gap-5">
                    <div class="text-center">
                        <p class="text-sm font-bold text-slate-600">종합 등급</p>
                        <p class="text-6xl font-black text-indigo-600">${gradeLevel}<span class="text-2xl font-bold text-slate-400"> 등급</span></p>
                    </div>
                    <div class="w-px h-20 bg-slate-200"></div>
                    <div class="flex-1">
                        <div class="grid grid-cols-2 gap-3 text-center">
                            <div>
                                <p class="text-xs font-semibold text-slate-500">원점수</p>
                                <p class="text-xl font-bold text-slate-700">${score}<span class="text-sm font-medium">/${maxScore}</span></p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">표준점수</p>
                                <p class="text-xl font-bold text-slate-700">${Math.round(100 + (percentage - 50) * 0.4)}</p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">백분위</p>
                                <p class="text-xl font-bold text-slate-700">${percentage}<span class="text-sm font-medium">%</span></p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">학년</p>
                                <p class="text-xl font-bold text-blue-600">${escapeHtml(grade)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">영역별 점수 현황</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-52">
                        <canvas id="scoreChart"></canvas>
                    </div>
                    <div class="flex justify-center gap-6 mt-4 text-xs">
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 bg-indigo-600 rounded"></div>
                            <span class="text-slate-700 font-medium">${escapeHtml(student)} 학생</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="mb-6">
                <h2 class="section-title-report">백분위 분포도</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-44">
                        <canvas id="percentileChart"></canvas>
                    </div>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 1 / 4
            </div>
        </div>

        <!-- Page 2 -->
        <div class="a4-page page-break">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">영역별 상세 분석</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 2</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">영역별 성취도 상세</h2>
                <div class="grid grid-cols-2 gap-4">
                    ${domainStats.map((area: any) => {
                      const color = getDomainColor(area.percentage);
                      return `
                    <div class="border-l-4 border-${color.border} bg-${color.bg} p-4 rounded-r-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-sm text-slate-800">${escapeHtml(area.name)}</h3>
                            <span class="text-2xl font-bold text-${color.text}">${area.percentage}%</span>
                        </div>
                        <p class="text-xs text-slate-600 mb-2">취득 ${area.earnedScore}점 / 만점 ${area.maxScore}점</p>
                        <div class="w-full bg-${color.border} bg-opacity-20 rounded-full h-2 mb-3">
                            <div class="bg-${color.border} h-2 rounded-full" style="width: ${area.percentage}%"></div>
                        </div>
                        <p class="text-xs text-slate-700 leading-relaxed">${area.percentage >= 70 ? '우수한 성취도를 보이고 있습니다' : '추가 학습이 필요한 영역입니다'}</p>
                    </div>
                      `;
                    }).join('')}
                </div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">학생 vs 평균 비교 분석</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-64">
                        <canvas id="radarChart"></canvas>
                    </div>
                </div>
            </section>

            <section>
                <h2 class="section-title-report">강점·약점 심층 분석</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h3 class="font-bold text-sm text-indigo-700 mb-3">✓ 강점 영역</h3>
                        <div class="space-y-2">
                            ${strongestDomains.length > 0 ? strongestDomains.slice(0, 2).map((area: any) => `
                            <div class="border border-slate-200 p-3 rounded-lg bg-white">
                                <p class="font-bold text-xs text-slate-800 mb-1">${escapeHtml(area.name)} - ${area.percentage}%</p>
                                <p class="text-xs text-slate-600 leading-relaxed">
                                    우수한 성취도를 보이고 있습니다. 이 영역의 강점을 유지하세요.
                                </p>
                            </div>
                            `).join('') : '<p class="text-xs text-slate-600">꾸준한 학습으로 강점을 만들어가세요.</p>'}
                        </div>
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-red-600 mb-3">✗ 보완 영역</h3>
                        <div class="space-y-2">
                            ${weakestDomains.length > 0 ? weakestDomains.slice(0, 2).map((area: any) => `
                            <div class="border border-slate-200 p-3 rounded-lg bg-white">
                                <p class="font-bold text-xs text-slate-800 mb-1">${escapeHtml(area.name)} - ${area.percentage}%</p>
                                <p class="text-xs text-slate-600 leading-relaxed">
                                    추가 학습이 필요한 영역입니다. 기본 개념 복습을 추천합니다.
                                </p>
                            </div>
                            `).join('') : '<p class="text-xs text-slate-600">모든 영역에서 우수한 성적을 유지하고 있습니다.</p>'}
                        </div>
                    </div>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 2 / 4
            </div>
        </div>

        <!-- Page 3 -->
        <div class="a4-page page-break">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">학습 로드맵 & 오답 분석</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 3</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">AI 분석 총평</h2>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-slate-700 text-xs leading-relaxed">
                    ${aiParagraphs.map((para: string) => `<p>${escapeHtml(para)}</p>`).join('')}
                </div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">상세 오답 패턴 분석</h2>
                <table class="w-full text-left border-collapse text-xs">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200">영역</th>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200">오답 문항</th>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200">정답률</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${domainStats.map((area: any) => `
                        <tr class="border-b border-slate-100">
                            <td class="p-2 text-slate-700 font-bold">${escapeHtml(area.name)}</td>
                            <td class="p-2 text-slate-700">${area.incorrectQuestions && area.incorrectQuestions.length > 0 ? area.incorrectQuestions.join(', ') + '번' : '모두 정답'}</td>
                            <td class="p-2 text-slate-700">${area.percentage}%</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>

            <section>
                <h2 class="section-title-report">${escapeHtml(grade)} → 고3 수능 완성 로드맵</h2>
                <div class="space-y-3">
                    <div class="border-l-4 border-indigo-600 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">1</div>
                            <div>
                                <h3 class="font-bold text-xs text-slate-800 mb-1">중학교 - 기초 체력 완성 단계</h3>
                                <p class="text-xs text-slate-600"><strong>목표:</strong> 수능 국어의 기본 토대 구축 | <strong>학습:</strong> 갈래별 대표 작품 읽기, 영역별 독해 훈련</p>
                            </div>
                        </div>
                    </div>

                    <div class="border-l-4 border-indigo-500 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">2</div>
                            <div>
                                <h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 1학년 - 심화 학습 전개 단계</h3>
                                <p class="text-xs text-slate-600"><strong>목표:</strong> 수능 출제 패턴 익숙화 및 실력 도약</p>
                            </div>
                        </div>
                    </div>

                    <div class="border-l-4 border-indigo-400 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-400 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">3</div>
                            <div>
                                <h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 2학년 - 실전 역량 강화 단계</h3>
                                <p class="text-xs text-slate-600"><strong>목표:</strong> 2등급 진입 및 1등급 도전 기반 구축</p>
                            </div>
                        </div>
                    </div>

                    <div class="border-l-4 border-indigo-300 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-300 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">4</div>
                            <div>
                                <h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 3학년 - 수능 완전 정복 단계</h3>
                                <p class="text-xs text-slate-600"><strong>목표:</strong> 1등급 안정적 획득 및 만점 도전</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 3 / 4
            </div>
        </div>

        <!-- Page 4 -->
        <div class="a4-page">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">맞춤형 학습 전략</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 4</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">12주 집중 학습 전략</h2>
                <table class="w-full text-left border-collapse text-xs">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200 w-16">단계</th>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200">핵심 전략</th>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200">세부 학습 내용</th>
                            <th class="p-2 font-bold text-slate-600 border-b border-slate-200 w-24">예상 성과</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${weakestDomains.length > 0 ? `
                        <tr class="border-b border-slate-100 align-top">
                            <td class="p-2 text-slate-700 font-bold">1단계<br/>(4주)</td>
                            <td class="p-2 text-slate-700 font-bold">${escapeHtml(weakestDomains[0].name)} 집중</td>
                            <td class="p-2 text-slate-700">기본 개념 복습 및 문제 풀이 연습</td>
                            <td class="p-2 text-slate-700">${escapeHtml(weakestDomains[0].name)} 70% 달성</td>
                        </tr>
                        ` : ''}
                        <tr class="border-b border-slate-100 align-top">
                            <td class="p-2 text-slate-700 font-bold">2단계<br/>(3주)</td>
                            <td class="p-2 text-slate-700 font-bold">전 영역 복습</td>
                            <td class="p-2 text-slate-700">다양한 문제 유형 분석 및 실전 연습</td>
                            <td class="p-2 text-slate-700">전체 균형 향상</td>
                        </tr>
                        <tr class="align-top border-b border-slate-100">
                            <td class="p-2 text-slate-700 font-bold">3단계<br/>(5주)</td>
                            <td class="p-2 text-slate-700 font-bold">종합 실전 대비</td>
                            <td class="p-2 text-slate-700">주 2회 실전 모의고사 및 오답 분석, 시간 관리 전략</td>
                            <td class="p-2 text-slate-700">목표 등급 달성</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">성적 향상 예측 그래프</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-52">
                        <canvas id="predictionChart"></canvas>
                    </div>
                </div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">등급별 분포 현황</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-44">
                        <canvas id="gradeChart"></canvas>
                    </div>
                </div>
            </section>

            <section>
                <div class="bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-lg p-5 text-center">
                    <p class="text-base font-bold mb-2">목표 달성 가능성: <span class="text-yellow-300">${percentage >= 70 ? '매우 높음' : percentage >= 60 ? '높음' : '중간'}</span></p>
                    <p class="text-xs opacity-95 leading-relaxed">제시된 12주 학습 전략을 충실히 따른다면 ${gradeLevel > 1 ? (gradeLevel - 1) + '등급' : '1등급'} 달성이 가능합니다.<br/>
                    ${strongestDomains.length > 0 ? escapeHtml(strongestDomains[0].name) : '핵심'} 영역의 강점을 유지하면서 ${weakestDomains.length > 0 ? escapeHtml(weakestDomains[0].name) : '취약'} 영역을 집중 보완하여 균형잡힌 실력을 갖춰나가시기 바랍니다.</p>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 4 / 4
            </div>
        </div>
    </section>

    <script>
        // Page 1: Score Chart (Bar Chart)
        const ctx1 = document.getElementById('scoreChart');
        if (ctx1) {
            new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ${domainLabels},
                    datasets: [{
                        label: '정답률 (%)',
                        data: ${domainPercentages},
                        backgroundColor: 'rgb(99, 102, 241)',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Page 1: Percentile Chart (Line Chart)
        const ctx2 = document.getElementById('percentileChart');
        if (ctx2) {
            new Chart(ctx2, {
                type: 'line',
                data: {
                    labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
                    datasets: [{
                        label: '누적 분포',
                        data: [0, 15, 35, 60, 85, 100],
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Page 2: Radar Chart
        const ctx3 = document.getElementById('radarChart');
        if (ctx3) {
            new Chart(ctx3, {
                type: 'radar',
                data: {
                    labels: ${domainLabels},
                    datasets: [{
                        label: '학생',
                        data: ${domainPercentages},
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: { beginAtZero: true, max: 100 }
                    }
                }
            });
        }

        // Page 4: Prediction Chart
        const ctx4 = document.getElementById('predictionChart');
        if (ctx4) {
            new Chart(ctx4, {
                type: 'line',
                data: {
                    labels: ['현재', '4주 후', '8주 후', '12주 후'],
                    datasets: [{
                        label: '예상 점수',
                        data: [${percentage}, ${Math.min(percentage + 5, 100)}, ${Math.min(percentage + 10, 100)}, ${Math.min(percentage + 15, 100)}],
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100 }
                    }
                }
            });
        }

        // Page 4: Grade Distribution Chart
        const ctx5 = document.getElementById('gradeChart');
        if (ctx5) {
            new Chart(ctx5, {
                type: 'bar',
                data: {
                    labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
                    datasets: [{
                        label: '학생 분포',
                        data: [4, 7, 12, 17, 20, 17, 12, 7, 4],
                        backgroundColor: 'rgb(99, 102, 241)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }
    </script>
</body>
</html>`;
}

export default router;
