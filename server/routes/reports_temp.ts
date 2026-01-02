import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index';
import { aiReports, examAttempts, exams, students, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { escapeHtml } from '../utils/helpers';

const router = express.Router();

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
    // Try multiple models as fallback
    // GPT-4o 사용

    // 취약/강점 영역 계산
    const weakestArea = domainStats.reduce((min, d) => d.percentage < min.percentage ? d : min, domainStats[0]);
    const strongestArea = domainStats.reduce((max, d) => d.percentage > max.percentage ? d : max, domainStats[0]);

    // 전문적이고 상세한 프롬프트 - 틀린 문항 패턴 분석
    const incorrectQuestions = questionsData.filter((q: any, idx: number) => {
      const qNum = q.number || (idx + 1);
      return answers[qNum.toString()] !== q.correctAnswer;
    });

    const correctQuestions = questionsData.filter((q: any, idx: number) => {
      const qNum = q.number || (idx + 1);
      return answers[qNum.toString()] === q.correctAnswer;
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

    const philosophy = gradePhilosophy[student.student.grade] || '올가의 프로그램은 학생의 실력 향상에 집중합니다.';

    const prompt = `[메타 프롬프트: 올가국어 분석 보고서 생성]

1. 페르소나 (Persona)
당신은 **'올가교육 수능연구소의 데이터 분석 팀장'**이자, [초/중/고] 프로그램 철학을 마스터한 **'수석 멘토'**입니다. 당신의 유일한 임무는 학생의 성적 데이터를 [입력 데이터]와 [지식]에 기반하여 냉철하게 분석하고, 그 모든 분석 결과를 HTML 템플릿 시스템이 즉시 활용할 수 있도록 **구조화된 '단일 JSON 객체'**로 생성하는 것입니다.

[핵심 원칙]
- 전문성: 모든 분석은 ~했습니다, ~분석됩니다와 같은 전문가적 어투를 사용합니다.
- 근거 기반: 모든 분석은 [문항 분석 마스터]의 '유형분석', '소분류'를 구체적인 근거로 제시해야 합니다.
- 글자 수 준수: 템플릿 디자인에 맞게 각 분석 텍스트의 글자 수를 엄격히 준수합니다.

2. 입력 데이터 (Input Data)
당신은 다음 3가지 데이터를 입력받습니다:

**[결과물 제약 조건 (Constraints)]**

* **[절대 규칙]** 당신의 최종 출력물은 **오직 \`json\` 코드 블록 하나**여야 합니다. (\`<!DOCTYPE html>\`... 같은 HTML 코드를 **절대** 생성하지 마십시오.)
* 모든 분석(총평, 제언)에는 학년(${student.student.grade})에 맞는 프로그램 철학이 **반드시** 반영되어야 합니다: "${philosophy}"
* '보완점 및 제언' 텍스트(\`olgaSummary\` 내부)는 **반드시 '해요체'**를 사용해야 합니다.
* 최종 결과물 JSON 포맷에 정의된 키(key) 이름을 절대 변경하지 마십시오.

**[입력 데이터 (Input Data)]**

1. **[학생 답안 데이터]** (JSON 형식)
\`\`\`json
{
  "학생명": "${studentUser.name}",
  "학년": "${student.student.grade}",
  "시험명": "${exam.title}",
  "원점수": ${attempt.score},
  "만점": ${attempt.maxScore},
  "정답률": ${Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100)},
  "등급": ${attempt.grade},
  "순위": "${rank}/${completedAttempts.length}",
  "영역별성취도": ${JSON.stringify(domainStats.map(d => ({
    영역: d.name,
    취득점수: d.earnedScore,
    만점: d.maxScore,
    정답수: d.correct,
    전체문항: d.total,
    정답률: d.percentage
  })))}
}
\`\`\`

2. **[문항 분석 마스터]** (틀린 문항 + 맞은 문항)

**틀린 문항 (${incorrectQuestions.length}개):**
${incorrectQuestions.length > 0 ? incorrectQuestions.map((q: any) => {
  const qNum = q.number || q.questionNumber;
  return `- 문항 ${qNum}: ${q.domain} | 난이도: ${q.difficulty || '중'} | 유형: ${q.typeAnalysis || '미분류'} | 소분류: ${q.subcategory || '미분류'} | 정답: ${q.correctAnswer} | 학생답안: ${answers[qNum?.toString()] || '무응답'}`;
}).join('\n') : '없음'}

**맞은 문항 (${correctQuestions.length}개):**
${correctQuestions.length > 0 ? correctQuestions.map((q: any) => {
  const qNum = q.number || q.questionNumber;
  return `- 문항 ${qNum}: ${q.domain} | 난이도: ${q.difficulty || '중'} | 유형: ${q.typeAnalysis || '미분류'} | 소분류: ${q.subcategory || '미분류'}`;
}).join('\n') : '없음'}

3. **[전체 학생 평균]** (동일 시험 응시 학생 ${completedAttempts.length}명의 평균, 가상 데이터)
\`\`\`json
${JSON.stringify(domainStats.map(d => ({ 영역: d.name, 평균점수: Math.round(d.maxScore * 0.65), 평균정답률: 65 })))}
\`\`\`

**[작업 절차 (Process)]**

1. **데이터 정리 (Organize)**: 입력된 [학생 답안 데이터], [문항 분석 마스터], [전체 학생 평균]을 모두 파악합니다.
2. **등급 및 점수 계산**: 학생의 점수(${attempt.score}/${attempt.maxScore})를 등급으로 변환합니다.
3. **핵심 분석 수행 (Synthesize)**:
   * **총평 생성**: 학년(${student.student.grade})과 프로그램 철학을 기반으로 '올가 분석 총평' 텍스트(해요체 제언 포함)를 생성합니다.
   * **영역별 상세 분석**: 5개 영역 각각에 대해 '전문가 분석' 텍스트를 생성합니다. 이 텍스트에는 **반드시 [전체 학생 평균]과 비교**하는 내용, **틀린 문항의 '유형분석'/'소분류'**를 지적하는 내용이 포함되어야 합니다.
   * **강점/약점 분석**: 정답률 100% 또는 평균 대비 월등히 높은 영역을 '강점'으로, 정답률이 낮은 영역을 '약점'으로 분류하고 분석 텍스트를 생성합니다.
   * **성향 분석**: 전체 정답률과 등급을 기반으로 학생의 학습 성향 타입을 판별합니다.

**[절대 금지 사항]**
❌ "정답률 XX%입니다" 같은 뻔한 표현 금지
❌ "성취도를 보였습니다" 같은 추상적 표현 금지
❌ 문항 번호 언급 절대 금지
❌ 통계 수치만 나열하는 것 금지

**[최종 결과물 JSON 포맷]**

\`\`\`json
{
  "stats": {
    "score": ${attempt.score},
    "maxScore": ${attempt.maxScore},
    "percentage": ${Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100)},
    "grade": ${attempt.grade},
    "rank": "${rank}/${completedAttempts.length}",
    "domainChartData": {
      "student": [영역별 학생 정답률 배열],
      "average": [영역별 평균 정답률 배열]
    }
  },
  "analysis": {
    "olgaSummary": "학년별 철학과 해요체 제언이 포함된 올가 분석 총평 텍스트",
    "subjectDetails": [
      {
        "name": "영역명",
        "score": 정답률,
        "scoreText": "취득 X점 / 만점 Y점 (Z/W문항 정답)",
        "status": "우수|보통|부족",
        "analysisText": "영역별 전문가 분석 텍스트 (전체 평균 비교, 틀린 문항의 유형/소분류 언급)"
      }
    ],
    "strengths": [
      { "name": "영역명", "score": 정답률, "analysisText": "강점 분석 텍스트" }
    ],
    "weaknesses": [
      { "name": "영역명", "score": 정답률, "analysisText": "약점 분석 텍스트 (틀린 소분류 언급)" }
    ],
    "propensity": {
      "typeTitle": "성향 타이틀 (예: 최상위권 안정적 1등급형)",
      "typeDescription": "성향 상세 설명 텍스트"
    }
  }
}
\`\`\`

위 형식에 맞춰 JSON만 생성하세요. HTML은 절대 생성하지 마세요.`;

    // Call Gemini API (Gemini 2.5 Flash)
    console.log('🤖 Google Gemini 2.5 Flash로 전문 보고서 생성 중...');

    let responseText = '';

    try {
      if (!genAI) {
        throw new Error('Gemini API가 초기화되지 않았습니다.');
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        generationConfig: {
          temperature: 0.7,
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
    } catch (e) {
      console.error('JSON 파싱 오류:', e);
      console.error('응답 내용:', responseText.substring(0, 500));
      aiAnalysis = {
        olgaSummary: responseText,
        subjectAreas: [],
        errorPatterns: []
      };
    }

    // 계산된 값들을 템플릿으로 생성
    const percentile = Math.round(100 * (1 - (rank / completedAttempts.length)) * 10) / 10;
    const standardScore = attempt.grade <= 2 ? 80 + (attempt.score / attempt.maxScore) * 20 :
                          attempt.grade <= 4 ? 70 + (attempt.score / attempt.maxScore) * 10 : '추정 불가';
    const expectedFinalGrade = attempt.grade <= 2 ? '1~2등급' :
                               attempt.grade <= 4 ? '2~3등급' : '3~4등급';
    const achievementPotential = attempt.grade <= 2 ? '매우 높음' :
                                 attempt.grade <= 4 ? '높음' : '보통';

    // 학습 계획 템플릿 (고정)
    const studyPlan = [
      {
        stage: "중학교 3학년 - 기초 체력 완성 단계",
        goal: "수능 국어의 기본 토대 구축",
        details: "갈래별(현대시, 고전소설 등) 대표 작품 읽기, 영역별(화작, 문법, 독서, 문학) 독해 훈련 시작, 중등 문법 마스터"
      },
      {
        stage: "고등학교 1학년 - 심화 학습 전개 단계",
        goal: "수능 출제 패턴 익숙화 및 실력 도약",
        details: "고1 학력평가 기출 작품/지문 완벽 분석, 독해 전략 수립, 수능 문법 전 영역 1회독 완료"
      },
      {
        stage: "고등학교 2학년 - 실전 역량 강화 단계",
        goal: "2등급 진입 및 1등급 도전 기반 구축",
        details: "고2 학력평가 및 수능 기출(3개년) 분석, 고난도 독서 지문(과학, 기술, 경제) 대응 훈련, EBS 연계 작품 사전 학습"
      },
      {
        stage: "고등학교 3학년 - 수능 완전 정복 단계",
        goal: "1등급 안정적 획득 및 만점 도전",
        details: "주 2회 이상 실전 모의고사, 취약 영역/유형 집중 공략, EBS 연계/비연계 고난도 문제 풀이, 시간 관리 및 멘탈 관리 훈련"
      }
    ];

    // 학습 전략 템플릿
    const targetIncrease = Math.round(weakestArea.maxScore * 0.2);
    const learningStrategy = [
      {
        stage: "1단계<br/>(4주)",
        focus: `${weakestArea.name} 집중 공략`,
        details: `${weakestArea.name} 영역의 기본 개념을 완벽히 이해하고, 관련 문제를 반복 학습합니다.`,
        expectedResult: `${weakestArea.name} 영역 정답률 ${Math.min(weakestArea.percentage + 20, 90)}% 달성<br/>+${targetIncrease}점 상승`
      },
      {
        stage: "2단계<br/>(3주)",
        focus: "전체 영역 균형 학습",
        details: "모든 영역의 기출 문제를 풀면서 약점을 보완하고 강점을 유지합니다.",
        expectedResult: "전체 영역 정답률 향상<br/>종합 안정성 확보"
      },
      {
        stage: "3단계<br/>(5주)",
        focus: "종합 실전 대비 및 시간 관리",
        details: "주 2회 실전 모의고사(시간 측정 필수), 오답 문항 심층 분석, 취약 유형 집중 보완",
        expectedResult: `전체 정답률 ${Math.min(Math.round((attempt.score || 0) / (attempt.maxScore || 100) * 100) + 10, 95)}% 달성<br/>${attempt.grade > 1 ? attempt.grade - 1 : 1}등급 진입`
      }
    ];

    // AI가 생성한 새로운 JSON 구조 처리
    const aiStats = aiAnalysis.stats || {};
    const aiAnalysisData = aiAnalysis.analysis || {};

    // subjectAreas에 AI 분석 데이터 통합
    const enrichedSubjectAreas = domainStats.map((d: any) => {
      const aiSubject = aiAnalysisData.subjectDetails?.find((s: any) => s.name === d.name);
      return {
        name: d.name,
        percentage: d.percentage,
        earnedScore: d.earnedScore,
        maxScore: d.maxScore,
        avgScore: 65,  // 템플릿 값
        avgPercentage: 65,  // 템플릿 값
        analysis: aiSubject?.analysisText || `${d.name} 영역에서 ${d.percentage}%의 정답률을 보였습니다.`,
        status: aiSubject?.status || (d.percentage >= 80 ? '우수' : d.percentage >= 60 ? '보통' : '부족'),
        scoreText: aiSubject?.scoreText || `취득 ${d.earnedScore}점 / 만점 ${d.maxScore}점`
      };
    });

    // 강점/약점 분석
    const strengths = aiAnalysisData.strengths || [];
    const weaknesses = aiAnalysisData.weaknesses || [];

    // 전체 분석 데이터 조합
    const analysisData = {
      overallGrade: attempt.grade,
      rawScore: attempt.score,
      maxScore: attempt.maxScore,
      standardScore,
      percentile,
      expectedFinalGrade,
      subjectAreas: enrichedSubjectAreas,
      olgaSummary: aiAnalysisData.olgaSummary || `${studentUser.name} 학생의 성적 분석 결과입니다.`,
      errorPatterns: aiAnalysisData.errorPatterns || [],
      strengths,
      weaknesses,
      propensity: aiAnalysisData.propensity || { typeTitle: '분석 중', typeDescription: '성향 분석 데이터가 생성 중입니다.' },
      studyPlan,
      learningStrategy,
      domainChartData: aiStats.domainChartData || {
        student: domainStats.map(d => d.percentage),
        average: domainStats.map(() => 65)
      },
      predictionScores: [
        attempt.score,
        attempt.score + targetIncrease,
        attempt.score + Math.round(targetIncrease * 1.5),
        Math.min(attempt.score + Math.round(targetIncrease * 2), 100),
        92
      ],
      gradeDistribution: [8, 12, 18, 22, 18, 11, 7, 3, 1],
      percentileDistribution: [3, 5, 8, 12, 15, 18, 16, 13, 7, 3],
      achievementPotential,
      finalMessage: `${studentUser.name} 학생은 뛰어난 잠재력을 보여주었습니다. 제시된 학습 전략을 성실히 따른다면 목표 등급 달성이 가능합니다.`,
      recommendations: `${weakestArea.name} 영역을 집중적으로 보완하는 것이 성적 향상의 핵심입니다.`,
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
      exam: exam,
      answers: answers,
    });

    // Save report with AI analysis data
    const [report] = await db
      .insert(aiReports)
      .values({
        attemptId,
        studentId: attempt.studentId,
        examId: attempt.examId,
        analysis: analysisData,
        summary: analysisData.olgaSummary || '분석 완료',
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

// Helper function to generate 5-page HTML report with user's exact design template
