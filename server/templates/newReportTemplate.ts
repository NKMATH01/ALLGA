// 새로운 5페이지 A4 보고서 템플릿 with reportData injection
import { escapeHtml } from '../utils/helpers';

export function generateReportHTML(data: any): string {
  // reportData 구조 준비 (AI 분석 결과 + 학생 정보)
  const reportData = {
    metaVersion: data.metaVersion || 'v2',
    studentInfo: {
      name: data.studentInfo?.name || '',
      school: data.studentInfo?.school || '미지정',
      date: data.studentInfo?.date || '',
      level: data.studentInfo?.level || '미지정',
    },
    scoreSummary: {
      grade: data.scoreSummary?.grade || 0,
      rawScore: data.scoreSummary?.rawScore || 0,
      rawScoreMax: data.scoreSummary?.rawScoreMax || 100,
      standardScore: data.scoreSummary?.standardScore || 0,
      percentile: data.scoreSummary?.percentile || 0,
    },
    analysis: {
      olgaSummary: data.analysis?.olgaSummary || '분석 생성 중입니다.',
      subjectDetails: (data.analysis?.subjectDetails || []).map((subject: any) => ({
        name: subject.name,
        score: subject.score,
        scoreText: subject.scoreText,
        analysisText: subject.analysisText,
        statusColor: subject.statusColor || (subject.score >= 80 ? 'blue' : subject.score >= 70 ? 'green' : subject.score >= 60 ? 'orange' : 'red'),
      })),
      strengths: data.analysis?.strengths || [],
      weaknesses: data.analysis?.weaknesses || [],
      propensity: data.analysis?.propensity || { typeTitle: '분석 중', typeDescription: '성향 데이터 생성 중입니다.' },
    },
    charts: {
      radarChartData: {
        labels: (data.analysis?.subjectDetails || []).map((s: any) => s.name),
        student: (data.analysis?.subjectDetails || []).map((s: any) => s.score || 0),
        average: (data.analysis?.subjectDetails || []).map(() => 65),
      },
      barChartData: {
        labels: (data.analysis?.subjectDetails || []).map((s: any) => s.name),
        values: (data.analysis?.subjectDetails || []).map((s: any) => s.score || 0),
      },
      predictionData: {
        labels: ['현재', '4주 후', '8주 후', '12주 후'],
        values: data.charts?.predictionChartData || [
          data.scoreSummary?.percentile || 0,
          Math.min((data.scoreSummary?.percentile || 0) + 5, 100),
          Math.min((data.scoreSummary?.percentile || 0) + 10, 100),
          Math.min((data.scoreSummary?.percentile || 0) + 15, 100),
        ],
      },
    },
  };

  // 강점/약점 분석을 위한 HTML 생성
  const strengthsHTML = reportData.analysis.strengths.map(strength => {
    return '<div class="border border-indigo-300 bg-white p-4 rounded-lg">' +
      '<div class="flex justify-between items-center mb-3">' +
      '<p class="font-bold text-sm text-slate-800">' + escapeHtml(strength.name) + '</p>' +
      '<span class="text-lg font-bold text-indigo-600">' + strength.score + '%</span>' +
      '</div>' +
      '<div class="text-xs text-slate-700 leading-relaxed">' +
      '<p class="font-semibold text-indigo-700 mb-2">💪 전문가 분석</p>' +
      '<p class="whitespace-pre-line">' + escapeHtml(strength.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  const weaknessesHTML = reportData.analysis.weaknesses.map(weakness => {
    return '<div class="border border-red-300 bg-white p-4 rounded-lg">' +
      '<div class="flex justify-between items-center mb-3">' +
      '<p class="font-bold text-sm text-slate-800">' + escapeHtml(weakness.name) + '</p>' +
      '<span class="text-lg font-bold text-red-600">' + weakness.score + '%</span>' +
      '</div>' +
      '<div class="text-xs text-slate-700 leading-relaxed">' +
      '<p class="font-semibold text-red-700 mb-2">⚠️ 전문가 분석</p>' +
      '<p class="whitespace-pre-line">' + escapeHtml(weakness.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  // 영역별 상세 분석 HTML 생성
  const subjectDetailsHTML = reportData.analysis.subjectDetails.map(subject => {
    const colorMap: any = {
      blue: { border: 'border-blue-500', bg: 'bg-blue-50', text: 'text-blue-600', bar: 'bg-blue-500' },
      green: { border: 'border-green-500', bg: 'bg-green-50', text: 'text-green-600', bar: 'bg-green-500' },
      orange: { border: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-600', bar: 'bg-orange-500' },
      red: { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-600', bar: 'bg-red-500' },
    };
    const colors = colorMap[subject.statusColor] || colorMap.blue;

    return '<div class="border-l-4 ' + colors.border + ' ' + colors.bg + ' p-4 rounded-r-lg">' +
      '<div class="flex justify-between items-start mb-2">' +
      '<h3 class="font-bold text-sm text-slate-800">' + escapeHtml(subject.name) + '</h3>' +
      '<span class="text-2xl font-bold ' + colors.text + '">' + subject.score + '%</span>' +
      '</div>' +
      '<p class="text-xs text-slate-600 mb-2">' + escapeHtml(subject.scoreText || '') + '</p>' +
      '<div class="w-full ' + colors.bar + ' bg-opacity-20 rounded-full h-2 mb-3">' +
      '<div class="' + colors.bar + ' h-2 rounded-full" style="width: ' + subject.score + '%"></div>' +
      '</div>' +
      '<div class="text-xs text-slate-700 leading-relaxed space-y-2">' +
      '<p class="font-semibold text-slate-800 mb-2">📋 전문가 분석</p>' +
      '<p class="whitespace-pre-line">' + escapeHtml(subject.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>올가국어 분석 보고서 - ${escapeHtml(reportData.studentInfo.name)}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans KR', sans-serif; background: #f1f5f9; }
        .a4-page {
            width: 794px;
            min-height: 1123px;
            background: white;
            margin: 20px auto;
            padding: 60px;
            position: relative;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            page-break-after: always;
        }
        .section-title-report {
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 12px;
            padding-left: 10px;
            border-left: 4px solid #6366f1;
        }
        @media print {
            body { background: white; }
            .a4-page { margin: 0; padding: 0; box-shadow: none; }
            .pdf-download-button { display: none; }
        }
        #pdf-loading-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            z-index: 2000; color: white; text-align: center;
        }
        #pdf-loading-overlay p { margin-top: 20px; font-size: 1.2em; color: white; }
        .spinner {
            border: 8px solid #f3f3f3; border-top: 8px solid #4f46e5;
            border-radius: 50%; width: 60px; height: 60px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="pdf-loading-overlay" style="display: none;">
        <div class="spinner"></div>
        <p>PDF 파일을 생성 중입니다. 잠시만 기다려주세요...</p>
    </div>

    <button id="pdf-download-btn" class="pdf-download-button fixed bottom-8 right-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-full shadow-lg transition-transform transform hover:scale-105 z-50">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block -mt-1 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        PDF 다운로드
    </button>

    <section id="report-content">
        <!-- Page 1: 종합 현황 -->
        <div class="a4-page">
            <header class="mb-8">
                <div class="mb-3">
                    <h1 class="text-2xl font-black text-slate-800">올가국어 종합 분석 결과</h1>
                </div>
                <div class="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"></div>
                <p class="mt-3 text-xs text-slate-500">올가교육 수능연구소</p>
            </header>

            <section class="grid grid-cols-4 gap-3 mb-8 text-xs border-y border-slate-200 py-3">
                <div><strong class="text-slate-500 mr-1">학생명:</strong><span class="font-bold text-slate-700">${escapeHtml(reportData.studentInfo.name)}</span></div>
                <div><strong class="text-slate-500 mr-1">학교:</strong><span class="font-bold text-slate-700">${escapeHtml(reportData.studentInfo.school)}</span></div>
                <div><strong class="text-slate-500 mr-1">응시일:</strong><span class="font-bold text-slate-700">${escapeHtml(reportData.studentInfo.date)}</span></div>
                <div><strong class="text-slate-500 mr-1">학년:</strong><span class="font-bold text-slate-700">${escapeHtml(reportData.studentInfo.level)}</span></div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">성적 총괄 현황</h2>
                <div class="border border-slate-200 rounded-lg p-5 flex items-center gap-5">
                    <div class="text-center">
                        <p class="text-sm font-bold text-slate-600">종합 등급</p>
                        <p class="text-6xl font-black text-indigo-600">${reportData.scoreSummary.grade}<span class="text-2xl font-bold text-slate-400"> 등급</span></p>
                    </div>
                    <div class="w-px h-20 bg-slate-200"></div>
                    <div class="flex-1">
                        <div class="grid grid-cols-2 gap-3 text-center">
                            <div>
                                <p class="text-xs font-semibold text-slate-500">원점수</p>
                                <p class="text-xl font-bold text-slate-700">${reportData.scoreSummary.rawScore}<span class="text-sm font-medium">/${reportData.scoreSummary.rawScoreMax}</span></p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">표준점수</p>
                                <p class="text-xl font-bold text-slate-700">${reportData.scoreSummary.standardScore}</p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">백분위</p>
                                <p class="text-xl font-bold text-slate-700">${reportData.scoreSummary.percentile}<span class="text-sm font-medium">%</span></p>
                            </div>
                            <div>
                                <p class="text-xs font-semibold text-slate-500">학년</p>
                                <p class="text-xl font-bold text-blue-600">${escapeHtml(reportData.studentInfo.level)}</p>
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
                    <div class="flex justify-center gap-4 mt-4 text-xs">
                        <div class="flex items-center gap-1.5"><div class="w-3 h-3 bg-blue-500 rounded"></div><span class="text-slate-600">우수 (80% 이상)</span></div>
                        <div class="flex items-center gap-1.5"><div class="w-3 h-3 bg-green-500 rounded"></div><span class="text-slate-600">양호 (70-79%)</span></div>
                        <div class="flex items-center gap-1.5"><div class="w-3 h-3 bg-orange-500 rounded"></div><span class="text-slate-600">보통 (60-69%)</span></div>
                        <div class="flex items-center gap-1.5"><div class="w-3 h-3 bg-red-500 rounded"></div><span class="text-slate-600">미흡 (60% 미만)</span></div>
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
                © 2025 올가교육 수능연구소 | Page 1 / 5
            </div>
        </div>

        <!-- Page 2: 영역별 상세 분석 -->
        <div class="a4-page">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">영역별 상세 분석</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 2</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">영역별 성취도 상세</h2>
                <div class="grid grid-cols-2 gap-4">
                    ${subjectDetailsHTML}
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 2 / 5
            </div>
        </div>

        <!-- Page 3: 올가 분석 & 학습 로드맵 -->
        <div class="a4-page">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">올가 분석 & 학습 로드맵</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 3</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">강점·약점 심층 분석</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h3 class="font-bold text-sm text-indigo-700 mb-3">✓ 강점 영역</h3>
                        <div class="space-y-3">
                            ${strengthsHTML || '<p class="text-xs text-slate-500">강점 데이터 없음</p>'}
                        </div>
                    </div>
                    <div>
                        <h3 class="font-bold text-sm text-red-600 mb-3">✗ 보완 영역</h3>
                        <div class="space-y-3">
                            ${weaknessesHTML || '<p class="text-xs text-slate-500">약점 데이터 없음</p>'}
                        </div>
                    </div>
                </div>
            </section>

            <section class="mb-8">
                <h2 class="section-title-report">올가 분석 총평</h2>
                <div class="border border-indigo-200 bg-indigo-50 rounded-lg p-6 flex items-start gap-5">
                    <div>
                        <svg class="w-12 h-12 text-indigo-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path fill-rule="evenodd" d="M2.25 2.25a.75.75 0 0 0-1.5 0v1.5A.75.75 0 0 0 1.5 4.5h.75A.75.75 0 0 0 3 3.75V3h1.5A.75.75 0 0 0 5.25 2.25h-3Z M3.75 9A.75.75 0 0 1 3 9.75v1.5a.75.75 0 0 1 1.5 0v-1.5A.75.75 0 0 1 3.75 9Zm1.5 0A.75.75 0 0 0 4.5 9.75v1.5A.75.75 0 0 0 6 11.25v-1.5A.75.75 0 0 0 5.25 9Zm1.5 0A.75.75 0 0 1 6.75 9.75v1.5a.75.75 0 0 1 1.5 0v-1.5A.75.75 0 0 1 8.25 9Zm1.5 0A.75.75 0 0 0 9 9.75v1.5a.75.75 0 0 0 1.5 0v-1.5A.75.75 0 0 0 10.5 9Z" clip-rule="evenodd" />
                          <path d="M6.26.177a.75.75 0 0 1 1.06 1.06L6.802 1.75h10.448A2.25 2.25 0 0 1 19.5 4v16.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 20.5V13.802l-.482.482a.75.75 0 1 1-1.06-1.06l1.26-1.26a.75.75 0 0 1 1.06 0l1.018 1.018a.75.75 0 0 0 1.06 0l3.018-3.018a.75.75 0 0 0 0-1.06l-4.018-4.018a.75.75 0 0 0-1.06 0l-1.768 1.768A.75.75 0 0 1 6.26.177Z" />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="space-y-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                            ${escapeHtml(reportData.analysis.olgaSummary)}
                        </div>
                    </div>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 3 / 5
            </div>
        </div>

        <!-- Page 4: 데이터 분석 및 로드맵 -->
        <div class="a4-page">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">데이터 분석 및 중장기 로드맵</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 4</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">학생 vs 평균 비교 분석</h2>
                <div class="border border-slate-200 rounded-lg p-4">
                    <div class="relative h-64">
                        <canvas id="radarChart"></canvas>
                    </div>
                    <p class="text-xs text-center text-slate-600 mt-4">
                        [분석] '${escapeHtml(reportData.studentInfo.name)}' 학생(파란색)과 '전체 평균'(회색)의 비교 분석
                    </p>
                </div>
            </section>

            <section>
                <h2 class="section-title-report">중3 → 고3 수능 완성 로드맵</h2>
                <div class="space-y-3">
                    <div class="border-l-4 border-indigo-600 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">1</div>
                            <div>
                                <h3 class="font-bold text-xs text-slate-800 mb-1">중학교 3학년 - 기초 체력 완성 단계</h3>
                                <p class="text-xs text-slate-600"><strong>목표:</strong> 수능 국어의 기본 토대 구축 | <strong>학습:</strong> 갈래별(현대시, 고전소설 등) 대표 작품 읽기, 영역별(화작, 문법, 독서, 문학) 독해 훈련 시작, 중등 문법 마스터</p>
                            </div>
                        </div>
                    </div>
                    <div class="border-l-4 border-indigo-500 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">2</div>
                            <div><h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 1학년 - 심화 학습 전개 단계</h3><p class="text-xs text-slate-600"><strong>목표:</strong> 수능 출제 패턴 익숙화 및 실력 도약 | <strong>학습:</strong> 고1 학력평가 기출 작품/지문 완벽 분석, 독해 전략 수립, 수능 문법 전 영역 1회독 완료</p></div>
                        </div>
                    </div>
                    <div class="border-l-4 border-indigo-400 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-400 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">3</div>
                            <div><h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 2학년 - 실전 역량 강화 단계</h3><p class="text-xs text-slate-600"><strong>목표:</strong> 2등급 진입 및 1등급 도전 기반 구축 | <strong>학습:</strong> 고2 학력평가 및 수능 기출(3개년) 분석, 고난도 독서 지문(과학, 기술, 경제) 대응 훈련, EBS 연계 작품 사전 학습</p></div>
                        </div>
                    </div>
                    <div class="border-l-4 border-indigo-300 bg-indigo-50 p-3 rounded-r-lg">
                        <div class="flex items-start gap-2">
                            <div class="w-6 h-6 bg-indigo-300 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">4</div>
                            <div><h3 class="font-bold text-xs text-slate-800 mb-1">고등학교 3학년 - 수능 완전 정복 단계</h3><p class="text-xs text-slate-600"><strong>목표:</strong> 1등급 안정적 획득 및 만점 도전 | <strong>학습:</strong> 주 2회 이상 실전 모의고사, 취약 영역/유형 집중 공략, EBS 연계/비연계 고난도 문제 풀이, 시간 관리 및 멘탈 관리 훈련</p></div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 4 / 5
            </div>
        </div>

        <!-- Page 5: 맞춤형 학습 전략 -->
        <div class="a4-page">
            <div class="flex items-center justify-between mb-7 pb-3 border-b-2 border-indigo-600">
                <h2 class="text-xl font-black text-slate-800">맞춤형 학습 전략</h2>
                <span class="text-sm text-slate-500 font-semibold">Page 5</span>
            </div>

            <section class="mb-8">
                <h2 class="section-title-report">학생 성향 분석</h2>
                <div class="border border-indigo-200 bg-indigo-50 rounded-lg p-6 flex items-start gap-5">
                    <div>
                        <svg class="w-12 h-12 text-indigo-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.475 2 2 6.475 2 12s4.475 10 10 10 10-4.475 10-10S17.525 2 12 2ZM8.007 17.05a8.002 8.002 0 0 1-4.002-8.03A8 8 0 0 1 12.002 4.004a8 8 0 0 1 7.995 8.01 8 8 0 0 1-8.01 7.995 8.002 8.002 0 0 1-3.988-1.004.75.75 0 0 0 .011.004Zm8.948-2.31a.75.75 0 0 0 .15-.098A5.502 5.502 0 0 0 18.5 8.5a5.5 5.5 0 0 0-11 0 5.502 5.502 0 0 0 1.395 6.142.75.75 0 0 0 .95.274 6.978 6.978 0 0 1 7.31 0 .75.75 0 0 0 .95-.274ZM12 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-lg font-bold text-indigo-800 mb-2">${escapeHtml(reportData.analysis.propensity.typeTitle)}</h3>
                        <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">${escapeHtml(reportData.analysis.propensity.typeDescription)}</p>
                    </div>
                </div>
            </section>

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
                        <tr class="border-b border-slate-100 align-top">
                            <td class="p-2 text-slate-700 font-bold">1단계<br/>(4주)</td>
                            <td class="p-2 text-slate-700 font-bold">약점 영역 집중 공략</td>
                            <td class="p-2 text-slate-700">약점 영역의 긴 지문 독해 훈련. 매일 2개 지문씩 시간 내에 풀고 오답 분석.</td>
                            <td class="p-2 text-slate-700">정답률 +10%<br/>상승</td>
                        </tr>
                        <tr class="border-b border-slate-100 align-top">
                            <td class="p-2 text-slate-700 font-bold">2단계<br/>(3주)</td>
                            <td class="p-2 text-slate-700 font-bold">개념어 적용 훈련</td>
                            <td class="p-2 text-slate-700">약점인 개념어를 실제 기출 문제에 적용하는 훈련.</td>
                            <td class="p-2 text-slate-700">정답률 +5%<br/>상승</td>
                        </tr>
                        <tr class="border-b border-slate-100 align-top">
                            <td class="p-2 text-slate-700 font-bold">3단계<br/>(5주)</td>
                            <td class="p-2 text-slate-700 font-bold">종합 실전 대비 및 시간 관리</td>
                            <td class="p-2 text-slate-700">주 2회 실전 모의고사(시간 측정 필수), 오답 문항 심층 분석, 취약 유형 집중 보완</td>
                            <td class="p-2 text-slate-700">등급 상승<br/>달성</td>
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

            <section>
                <div class="bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-lg p-5 text-center">
                    <p class="text-base font-bold mb-2">목표 달성 가능성: <span class="text-yellow-300">높음</span></p>
                    <p class="text-xs opacity-95 leading-relaxed">${escapeHtml(reportData.studentInfo.name)} 학생은 강점이 명확합니다. 제시된 전략을 성실히 따른다면 목표 등급 달성이 가능합니다.</p>
                </div>
            </section>

            <div class="absolute bottom-10 left-0 right-0 text-center text-slate-400 text-xs">
                © 2025 올가교육 수능연구소 | Page 5 / 5
            </div>
        </div>
    </section>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // ===== INJECT REPORT DATA =====
            const reportData = ${JSON.stringify(reportData, null, 2)};

            console.log('[DEBUG] reportData injected:', reportData);

            // Page 1: Score Chart (Bar Chart)
            const ctx1 = document.getElementById('scoreChart');
            if (ctx1) {
                const barData = reportData.charts.barChartData.values;
                const barColors = barData.map(p => {
                    if (p >= 80) return 'rgb(59, 130, 246)';
                    if (p >= 70) return 'rgb(34, 197, 94)';
                    if (p >= 60) return 'rgb(249, 115, 22)';
                    return 'rgb(239, 68, 68)';
                });
                new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: reportData.charts.barChartData.labels,
                        datasets: [{
                            label: '정답률 (%)',
                            data: barData,
                            backgroundColor: barColors,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } } },
                        plugins: { legend: { display: false } }
                    }
                });
            }

            // Page 1: Percentile Chart (Line Chart)
            const ctx2 = document.getElementById('percentileChart');
            if (ctx2) {
                const studentPercentile = reportData.scoreSummary.percentile;
                const cumulativeData = [0, 15, 35, 60, 85, 100];
                const percentilePoints = [0, 20, 40, 60, 80, 100];

                let studentYValue = 0;
                for (let i = 0; i < percentilePoints.length - 1; i++) {
                    if (studentPercentile >= percentilePoints[i] && studentPercentile <= percentilePoints[i + 1]) {
                        const x0 = percentilePoints[i];
                        const x1 = percentilePoints[i + 1];
                        const y0 = cumulativeData[i];
                        const y1 = cumulativeData[i + 1];
                        studentYValue = y0 + (y1 - y0) * (studentPercentile - x0) / (x1 - x0);
                        break;
                    }
                }

                new Chart(ctx2, {
                    type: 'line',
                    data: {
                        labels: percentilePoints.map(p => p + '%'),
                        datasets: [{
                            label: '누적 분포',
                            data: cumulativeData,
                            borderColor: 'rgb(99, 102, 241)',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            fill: true,
                            tension: 0.4
                        }, {
                            label: '학생 위치 (' + studentPercentile + '%)',
                            data: [{x: studentPercentile, y: studentYValue}],
                            borderColor: 'rgb(239, 68, 68)',
                            backgroundColor: 'rgb(239, 68, 68)',
                            pointRadius: 10,
                            pointHoverRadius: 12,
                            showLine: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'top' } },
                        scales: {
                            x: { type: 'linear', min: 0, max: 100, ticks: { callback: value => value + '%' } },
                            y: { min: 0, max: 100 }
                        }
                    }
                });
            }

            // Page 4: Radar Chart
            const ctx3 = document.getElementById('radarChart');
            if (ctx3) {
                new Chart(ctx3, {
                    type: 'radar',
                    data: {
                        labels: reportData.charts.radarChartData.labels,
                        datasets: [{
                            label: '학생',
                            data: reportData.charts.radarChartData.student,
                            borderColor: 'rgb(99, 102, 241)',
                            backgroundColor: 'rgba(99, 102, 241, 0.2)'
                        }, {
                            label: '전체 평균',
                            data: reportData.charts.radarChartData.average,
                            borderColor: 'rgb(100, 116, 139)',
                            backgroundColor: 'rgba(100, 116, 139, 0.2)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { r: { beginAtZero: true, max: 100 } }
                    }
                });
            }

            // Page 5: Prediction Chart
            const ctx4 = document.getElementById('predictionChart');
            if (ctx4) {
                new Chart(ctx4, {
                    type: 'line',
                    data: {
                        labels: reportData.charts.predictionData.labels,
                        datasets: [{
                            label: '예상 점수',
                            data: reportData.charts.predictionData.values,
                            borderColor: 'rgb(34, 197, 94)',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { min: 0, max: 100 } }
                    }
                });
            }

            // PDF Download
            async function downloadPDF() {
                const loadingOverlay = document.getElementById('pdf-loading-overlay');
                loadingOverlay.style.display = 'flex';
                try {
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF('p', 'mm', 'a4');
                    const pages = document.querySelectorAll('.a4-page');
                    const pageWidth = 210;
                    const pageHeight = 297;

                    for (let i = 0; i < pages.length; i++) {
                        const page = pages[i];
                        const canvas = await html2canvas(page, { scale: 2, useCORS: true, logging: false });
                        const imgData = canvas.toDataURL('image/png', 0.98);
                        if (i > 0) { doc.addPage(); }
                        doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
                    }

                    const studentName = reportData.studentInfo.name;
                    const filename = \`올가국어_분석보고서_\${studentName}.pdf\`;
                    doc.save(filename);
                } catch (error) {
                    console.error("PDF 생성 중 오류:", error);
                    alert("PDF 파일 생성에 실패했습니다. 다시 시도해주세요.");
                } finally {
                    loadingOverlay.style.display = 'none';
                }
            }

            const downloadButton = document.getElementById('pdf-download-btn');
            if (downloadButton) {
                downloadButton.addEventListener('click', downloadPDF);
            }
        });
    </script>
</body>
</html>`;
}
