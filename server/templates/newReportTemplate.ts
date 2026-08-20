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

  // <script> 컨텍스트에 안전하게 주입하기 위한 직렬화.
  // '<'/'>' 를 이스케이프해 데이터 안의 </script> 로 스크립트가 조기 종료되는 것을 막고,
  // JS 에서 줄바꿈으로 취급되는 U+2028/U+2029 도 escape 한다.
  const reportDataJson = JSON.stringify(reportData, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/[\u2028\u2029]/g, (c) =>
      c === '\u2028' ? '\\u2028' : '\\u2029'
    );

  // 강점/약점 분석을 위한 HTML 생성
  const strengthsHTML = reportData.analysis.strengths.map((strength: any) => {
    return '<div class="sw-card">' +
      '<div class="sw-head">' +
      '<p class="sw-name">' + escapeHtml(strength.name) + '</p>' +
      '<span class="sw-score">' + strength.score + '%</span>' +
      '</div>' +
      '<div class="sw-body">' +
      '<p class="analysis-label">💪 전문가 분석</p>' +
      '<p class="analysis-text">' + escapeHtml(strength.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  const weaknessesHTML = reportData.analysis.weaknesses.map((weakness: any) => {
    return '<div class="sw-card is-weak-card">' +
      '<div class="sw-head">' +
      '<p class="sw-name">' + escapeHtml(weakness.name) + '</p>' +
      '<span class="sw-score is-weak-score">' + weakness.score + '%</span>' +
      '</div>' +
      '<div class="sw-body">' +
      '<p class="analysis-label is-weak-label">⚠️ 전문가 분석</p>' +
      '<p class="analysis-text">' + escapeHtml(weakness.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  // 영역별 상세 분석 HTML 생성
  const subjectDetailsHTML = reportData.analysis.subjectDetails.map((subject: any) => {
    // 성취 구간 -> 기능색 계층 (DESIGN.md 2.3). 학생 성적이므로 --fn-error 는 쓰지 않는다.
    const statusMap: any = {
      blue: 'is-excellent',
      green: 'is-good',
      orange: 'is-fair',
      red: 'is-weak',
    };
    const status = statusMap[subject.statusColor] || statusMap.blue;

    return '<div class="subject-card ' + status + '">' +
      '<div class="subject-head">' +
      '<h3 class="subject-name">' + escapeHtml(subject.name) + '</h3>' +
      '<span class="subject-score">' + subject.score + '%</span>' +
      '</div>' +
      '<p class="subject-scoretext">' + escapeHtml(subject.scoreText || '') + '</p>' +
      '<div class="meter">' +
      '<div class="meter-fill" style="width: ' + subject.score + '%"></div>' +
      '</div>' +
      '<div class="subject-body">' +
      '<p class="analysis-label is-neutral-label">📋 전문가 분석</p>' +
      '<p class="analysis-text">' + escapeHtml(subject.analysisText || '') + '</p>' +
      '</div>' +
      '</div>';
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>올가국어 분석 보고서 - ${escapeHtml(reportData.studentInfo.name)}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
        /* ==========================================================
           올가 미수등 디자인 토큰 (DESIGN.md 2장 3계층)
           hex 리터럴은 이 :root 블록에만 존재한다. 이하 모든 규칙은 var() 참조.
           ========================================================== */
        :root {
            /* 1계층 브랜드: 네이비(구조) / 브라스(성취) */
            --navy-50:#F4F6FA; --navy-100:#E6EBF4; --navy-200:#C9D4E7; --navy-300:#A3B4D3;
            --navy-400:#7189B5; --navy-500:#4C6595; --navy-600:#354C78; --navy-700:#27395C;
            --navy-800:#1B2942; --navy-900:#131E31; --navy-950:#0C1421;
            --brass-300:#E3C88E; --brass-400:#D4B26A; --brass-500:#C09A4E;
            --brass-600:#A07F3B; --brass-700:#7D622C;

            /* 인쇄 잉크 */
            --print-paper:#FFFFFF; --print-ink:#000000; --print-rule:#999999;

            /* 2계층 시맨틱 */
            --surface:#FFFFFF;
            --surface-sunken:var(--navy-50);
            --surface-subtle:var(--navy-100);
            --surface-inverse:var(--navy-800);
            --text-primary:var(--navy-900);
            --text-secondary:var(--navy-600);
            --text-tertiary:var(--navy-400);
            --text-on-inverse:#FFFFFF;
            --text-on-inverse-muted:var(--navy-200);
            --border:var(--navy-200);
            --border-strong:var(--navy-300);
            --border-subtle:var(--navy-100);
            --action:var(--navy-800);
            --accent:var(--brass-500);
            --accent-strong:var(--brass-700);
            --accent-surface:#FBF6EA;
            --shadow-md:0 2px 8px rgba(19,30,49,0.08);
            --overlay:rgba(19,30,49,0.48);

            /* 3계층 기능색: 브랜드와 독립. 상태/성취 구간 전용 */
            --fn-success:#1D7A4C; --fn-success-surface:#E8F4EE; --fn-success-border:#A8D4BE;
            --fn-warning:#8F5A00; --fn-warning-surface:#FBF1DF; --fn-warning-border:#E0C48A;
            --fn-error:#B3261E;   --fn-error-surface:#FCEDEC;   --fn-error-border:#E9B4B0;
            --fn-info:#0F6E7A;    --fn-info-surface:#E6F2F4;    --fn-info-border:#9FCBD2;

            --radius-sm:6px; --radius-md:10px; --radius-lg:14px;
        }

        /* ==========================================================
           지면 골격 (DESIGN.md 10장 보고서 지면 문법)
           ========================================================== */
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo',
                         'Malgun Gothic', system-ui, sans-serif;
            background: var(--surface-sunken);
            color: var(--text-primary);
            font-variant-numeric: tabular-nums;
            word-break: keep-all;
            overflow-wrap: anywhere;
            -webkit-font-smoothing: antialiased;
        }
        .a4-page {
            width: 794px;
            min-height: 1123px;
            background: var(--surface);
            margin: 20px auto;
            padding: 60px;
            position: relative;
            box-shadow: var(--shadow-md);
            page-break-after: always;
        }
        .section-title-report {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: -0.01em;
            color: var(--text-primary);
            margin: 0 0 12px;
            padding-left: 10px;
            border-left: 3px solid var(--action);
        }

        /* 1쪽 머리 */
        .rpt-header { margin-bottom: 32px; }
        .rpt-title { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); }
        .rpt-rule { height: 3px; width: 100%; background: var(--action); margin-top: 12px; }
        .rpt-org { margin: 12px 0 0; font-size: 12px; color: var(--text-tertiary); }

        /* 2-5쪽 머리 */
        .page-head {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 28px; padding-bottom: 12px;
            border-bottom: 2px solid var(--action);
        }
        .page-head-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); }
        .page-head-num { font-size: 13px; font-weight: 600; color: var(--text-tertiary); }

        /* 학생 메타 */
        .meta-strip {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
            margin-bottom: 32px; padding: 12px 0; font-size: 12px;
            border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
        }
        .meta-label { color: var(--text-tertiary); margin-right: 4px; font-weight: 600; }
        .meta-value { font-weight: 700; color: var(--text-primary); }

        /* 공통 패널 */
        .panel { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; }
        .section { margin-bottom: 32px; }
        .section-tight { margin-bottom: 24px; }
        .chart-frame { position: relative; }
        .h-52 { height: 208px; }
        .h-44 { height: 176px; }
        .h-64 { height: 256px; }

        /* 성적 총괄 */
        .summary-box {
            border: 1px solid var(--border); border-radius: var(--radius-md);
            padding: 20px; display: flex; align-items: center; gap: 20px;
        }
        .grade-block { text-align: center; }
        .grade-label { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-secondary); }
        /* 브라스 1/2 (1쪽): 종합 등급은 이 지면의 핵심 성취 수치다 */
        .grade-value { margin: 4px 0 0; font-size: 56px; font-weight: 700; line-height: 1; letter-spacing: -0.04em; color: var(--accent-strong); }
        .grade-unit { font-size: 20px; font-weight: 600; letter-spacing: 0; color: var(--text-tertiary); }
        .summary-divider { width: 1px; height: 80px; background: var(--border); }
        .summary-grid { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; text-align: center; }
        .cell-label { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-tertiary); }
        .cell-value { margin: 4px 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); }
        .cell-unit { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }

        /* 범례 */
        .legend-row { display: flex; justify-content: center; gap: 16px; margin-top: 16px; font-size: 11px; }
        .legend-item { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
        .legend-swatch { width: 10px; height: 10px; border-radius: 2px; }
        .sw-excellent { background: var(--fn-success); }
        .sw-good { background: var(--fn-info); }
        .sw-fair { background: var(--text-tertiary); }
        .sw-weak { background: var(--fn-warning); }

        /* 지면 꼬리 */
        .page-foot {
            position: absolute; bottom: 40px; left: 0; right: 0;
            text-align: center; font-size: 11px; color: var(--text-tertiary);
        }

        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }

        /* 영역별 상세 카드 */
        .subject-card {
            border: 1px solid var(--border); border-left: 3px solid var(--border-strong);
            border-radius: var(--radius-sm); padding: 16px; background: var(--surface);
        }
        .subject-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 12px; }
        .subject-name { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); }
        .subject-score { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
        .subject-scoretext { margin: 0 0 8px; font-size: 11px; color: var(--text-secondary); }
        .meter { width: 100%; height: 6px; border-radius: 999px; background: var(--surface-subtle); margin-bottom: 12px; overflow: hidden; }
        .meter-fill { height: 6px; border-radius: 999px; }
        .subject-body { font-size: 11px; line-height: 1.7; color: var(--text-secondary); }

        /* 성취 구간별 기능색 (DESIGN.md 2.3 / 2.4). 성적이므로 error 는 쓰지 않는다 */
        .is-excellent { border-left-color: var(--fn-success); }
        .is-excellent .subject-score { color: var(--fn-success); }
        .is-excellent .meter-fill { background: var(--fn-success); }
        .is-good { border-left-color: var(--fn-info); }
        .is-good .subject-score { color: var(--fn-info); }
        .is-good .meter-fill { background: var(--fn-info); }
        .is-fair { border-left-color: var(--border-strong); }
        .is-fair .subject-score { color: var(--text-secondary); }
        .is-fair .meter-fill { background: var(--text-tertiary); }
        .is-weak { border-left-color: var(--fn-warning); }
        .is-weak .subject-score { color: var(--fn-warning); }
        .is-weak .meter-fill { background: var(--fn-warning); }

        .analysis-label { margin: 0 0 8px; font-size: 11px; font-weight: 700; color: var(--fn-success); }
        .is-weak-label { color: var(--fn-warning); }
        .is-neutral-label { color: var(--text-primary); }
        .analysis-text { margin: 0; font-size: 11px; line-height: 1.7; color: var(--text-secondary); white-space: pre-line; }

        /* 강점 / 보완 */
        .sw-col-title { margin: 0 0 12px; font-size: 13px; font-weight: 700; color: var(--fn-success); }
        .sw-col-title.is-weak-title { color: var(--fn-warning); }
        .sw-stack > * + * { margin-top: 12px; }
        .sw-card {
            border: 1px solid var(--fn-success-border); background: var(--surface);
            border-radius: var(--radius-sm); padding: 16px;
        }
        .sw-card.is-weak-card { border-color: var(--fn-warning-border); }
        .sw-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; }
        .sw-name { margin: 0; font-size: 13px; font-weight: 700; color: var(--text-primary); }
        .sw-score { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; color: var(--fn-success); }
        .sw-score.is-weak-score { color: var(--fn-warning); }
        .sw-body { font-size: 11px; line-height: 1.7; color: var(--text-secondary); }
        .empty-note { margin: 0; font-size: 11px; color: var(--text-tertiary); }

        /* 총평 / 성향 콜아웃 */
        .callout {
            border: 1px solid var(--border); border-left: 3px solid var(--action);
            background: var(--surface-sunken); border-radius: var(--radius-md);
            padding: 24px; display: flex; align-items: flex-start; gap: 20px;
        }
        .callout-icon { width: 40px; height: 40px; flex-shrink: 0; color: var(--text-tertiary); }
        .callout-body { flex: 1; }
        .callout-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); }
        .callout-text { margin: 0; font-size: 13px; line-height: 1.8; color: var(--text-secondary); white-space: pre-line; }

        /* 로드맵 */
        .roadmap-stack > * + * { margin-top: 12px; }
        .roadmap-item {
            border: 1px solid var(--border); border-left: 3px solid var(--action);
            background: var(--surface-sunken); border-radius: var(--radius-sm);
            padding: 12px; display: flex; align-items: flex-start; gap: 10px;
        }
        .roadmap-num {
            width: 22px; height: 22px; flex-shrink: 0; border-radius: 999px;
            background: var(--action); color: var(--text-on-inverse);
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700;
        }
        .roadmap-title { margin: 0 0 4px; font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .roadmap-text { margin: 0; font-size: 11px; line-height: 1.7; color: var(--text-secondary); }

        /* 표 (DESIGN.md 5.4) */
        .rpt-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
        .rpt-table thead th {
            padding: 8px; font-weight: 700; color: var(--text-secondary);
            background: var(--surface-subtle); border-bottom: 1px solid var(--border-strong);
            white-space: nowrap;
        }
        .rpt-table tbody td { padding: 8px; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); vertical-align: top; line-height: 1.6; }
        .rpt-table tbody tr:last-child td { border-bottom: none; }
        .rpt-table .cell-strong { font-weight: 700; color: var(--text-primary); }
        .col-step { width: 64px; }
        .col-outcome { width: 96px; }

        /* 마무리 배너 */
        .outcome-banner {
            border: 1px solid var(--border); border-top: 3px solid var(--accent);
            background: var(--surface-sunken); border-radius: var(--radius-md);
            padding: 20px; text-align: center;
        }
        .outcome-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
        /* 브라스 1/1 (5쪽): 목표 달성 가능성 판정이 이 지면의 핵심 성취 문구다 */
        .outcome-accent { color: var(--accent-strong); }
        .outcome-text { margin: 0; font-size: 11px; line-height: 1.7; color: var(--text-secondary); }

        /* PDF 다운로드 버튼 (DESIGN.md 5.1 주 버튼) */
        .pdf-download-button {
            position: fixed; bottom: 32px; right: 32px; z-index: 50;
            display: inline-flex; align-items: center; gap: 8px;
            height: 48px; padding: 0 20px; border: none; border-radius: 999px;
            background: var(--action); color: var(--text-on-inverse);
            font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
            box-shadow: var(--shadow-md);
            transition: background-color 150ms ease-out;
        }
        .pdf-download-button:hover { background: var(--navy-700); }
        .pdf-download-button:active { transform: scale(0.98); }
        .pdf-download-button svg { width: 20px; height: 20px; }

        #pdf-loading-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: var(--overlay);
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            z-index: 2000; color: var(--text-on-inverse); text-align: center;
        }
        #pdf-loading-overlay p { margin-top: 20px; font-size: 14px; color: var(--text-on-inverse); }
        .spinner {
            border: 6px solid var(--navy-600); border-top: 6px solid var(--navy-100);
            border-radius: 50%; width: 48px; height: 48px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
            .spinner { animation-duration: 0.01ms; }
            .pdf-download-button { transition-duration: 0.01ms; }
        }

        /* ==========================================================
           인쇄 (DESIGN.md 10.3) - 토큰을 잉크/종이 값으로 교체한다.
           브라스 강조는 색이 아니라 굵기와 규칙선으로 대체된다.
           ========================================================== */
        @media print {
            :root {
                --surface: var(--print-paper);
                --surface-sunken: var(--print-paper);
                --surface-subtle: var(--print-paper);
                --surface-inverse: var(--print-paper);
                --text-primary: var(--print-ink);
                --text-secondary: var(--print-ink);
                --text-tertiary: var(--print-rule);
                --border: var(--print-rule);
                --border-strong: var(--print-ink);
                --border-subtle: var(--print-rule);
                --action: var(--print-ink);
                --accent: var(--print-ink);
                --accent-strong: var(--print-ink);
                --shadow-md: none;
            }
            @page { size: A4; margin: 12mm; }
            body { background: var(--print-paper); }
            .a4-page { margin: 0; padding: 0; box-shadow: none; min-height: 0; }
            .pdf-download-button, #pdf-loading-overlay { display: none; }
            .panel, .summary-box, .subject-card, .sw-card, .callout, .roadmap-item, .outcome-banner {
                box-shadow: none; border-color: var(--print-rule);
            }
            .outcome-banner { border-top: 3px solid var(--print-ink); }
            .grade-value { font-weight: 700; }
            .rpt-table, .subject-card, .sw-card, .callout, .roadmap-item, .outcome-banner { break-inside: avoid; }
            .section-title-report, .page-head-title { break-after: avoid; }
            a[href]::after { content: none; }
        }
    </style>
</head>
<body>
    <div id="pdf-loading-overlay" style="display: none;">
        <div class="spinner"></div>
        <p>PDF 파일을 생성 중입니다. 잠시만 기다려주세요...</p>
    </div>

    <button id="pdf-download-btn" class="pdf-download-button">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        PDF 다운로드
    </button>

    <section id="report-content">
        <!-- Page 1: 종합 현황 -->
        <div class="a4-page">
            <header class="rpt-header">
                <h1 class="rpt-title">올가국어 종합 분석 결과</h1>
                <div class="rpt-rule"></div>
                <p class="rpt-org">올가교육 수능연구소</p>
            </header>

            <section class="meta-strip">
                <div><strong class="meta-label">학생명:</strong><span class="meta-value">${escapeHtml(reportData.studentInfo.name)}</span></div>
                <div><strong class="meta-label">학교:</strong><span class="meta-value">${escapeHtml(reportData.studentInfo.school)}</span></div>
                <div><strong class="meta-label">응시일:</strong><span class="meta-value">${escapeHtml(reportData.studentInfo.date)}</span></div>
                <div><strong class="meta-label">학년:</strong><span class="meta-value">${escapeHtml(reportData.studentInfo.level)}</span></div>
            </section>

            <section class="section">
                <h2 class="section-title-report">성적 총괄 현황</h2>
                <div class="summary-box">
                    <div class="grade-block">
                        <p class="grade-label">종합 등급</p>
                        <p class="grade-value">${reportData.scoreSummary.grade}<span class="grade-unit"> 등급</span></p>
                    </div>
                    <div class="summary-divider"></div>
                    <div class="summary-grid">
                        <div>
                            <p class="cell-label">원점수</p>
                            <p class="cell-value">${reportData.scoreSummary.rawScore}<span class="cell-unit">/${reportData.scoreSummary.rawScoreMax}</span></p>
                        </div>
                        <div>
                            <p class="cell-label">표준점수</p>
                            <p class="cell-value">${reportData.scoreSummary.standardScore}</p>
                        </div>
                        <div>
                            <p class="cell-label">백분위</p>
                            <p class="cell-value">${reportData.scoreSummary.percentile}<span class="cell-unit">%</span></p>
                        </div>
                        <div>
                            <p class="cell-label">학년</p>
                            <p class="cell-value">${escapeHtml(reportData.studentInfo.level)}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title-report">영역별 점수 현황</h2>
                <div class="panel">
                    <div class="chart-frame h-52">
                        <canvas id="scoreChart"></canvas>
                    </div>
                    <div class="legend-row">
                        <div class="legend-item"><div class="legend-swatch sw-excellent"></div><span>우수 (80% 이상)</span></div>
                        <div class="legend-item"><div class="legend-swatch sw-good"></div><span>양호 (70-79%)</span></div>
                        <div class="legend-item"><div class="legend-swatch sw-fair"></div><span>보통 (60-69%)</span></div>
                        <div class="legend-item"><div class="legend-swatch sw-weak"></div><span>미흡 (60% 미만)</span></div>
                    </div>
                </div>
            </section>

            <section class="section-tight">
                <h2 class="section-title-report">백분위 분포도</h2>
                <div class="panel">
                    <div class="chart-frame h-44">
                        <canvas id="percentileChart"></canvas>
                    </div>
                </div>
            </section>

            <div class="page-foot">
                © 2025 올가교육 수능연구소 | Page 1 / 5
            </div>
        </div>

        <!-- Page 2: 영역별 상세 분석 -->
        <div class="a4-page">
            <div class="page-head">
                <h2 class="page-head-title">영역별 상세 분석</h2>
                <span class="page-head-num">Page 2</span>
            </div>

            <section class="section">
                <h2 class="section-title-report">영역별 성취도 상세</h2>
                <div class="grid-2">
                    ${subjectDetailsHTML}
                </div>
            </section>

            <div class="page-foot">
                © 2025 올가교육 수능연구소 | Page 2 / 5
            </div>
        </div>

        <!-- Page 3: 올가 분석 & 학습 로드맵 -->
        <div class="a4-page">
            <div class="page-head">
                <h2 class="page-head-title">올가 분석 &amp; 학습 로드맵</h2>
                <span class="page-head-num">Page 3</span>
            </div>

            <section class="section">
                <h2 class="section-title-report">강점·약점 심층 분석</h2>
                <div class="grid-2">
                    <div>
                        <h3 class="sw-col-title">✓ 강점 영역</h3>
                        <div class="sw-stack">
                            ${strengthsHTML || '<p class="empty-note">강점 데이터 없음</p>'}
                        </div>
                    </div>
                    <div>
                        <h3 class="sw-col-title is-weak-title">✗ 보완 영역</h3>
                        <div class="sw-stack">
                            ${weaknessesHTML || '<p class="empty-note">약점 데이터 없음</p>'}
                        </div>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title-report">올가 분석 총평</h2>
                <div class="callout">
                    <div>
                        <svg class="callout-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path fill-rule="evenodd" d="M2.25 2.25a.75.75 0 0 0-1.5 0v1.5A.75.75 0 0 0 1.5 4.5h.75A.75.75 0 0 0 3 3.75V3h1.5A.75.75 0 0 0 5.25 2.25h-3Z M3.75 9A.75.75 0 0 1 3 9.75v1.5a.75.75 0 0 1 1.5 0v-1.5A.75.75 0 0 1 3.75 9Zm1.5 0A.75.75 0 0 0 4.5 9.75v1.5A.75.75 0 0 0 6 11.25v-1.5A.75.75 0 0 0 5.25 9Zm1.5 0A.75.75 0 0 1 6.75 9.75v1.5a.75.75 0 0 1 1.5 0v-1.5A.75.75 0 0 1 8.25 9Zm1.5 0A.75.75 0 0 0 9 9.75v1.5a.75.75 0 0 0 1.5 0v-1.5A.75.75 0 0 0 10.5 9Z" clip-rule="evenodd" />
                          <path d="M6.26.177a.75.75 0 0 1 1.06 1.06L6.802 1.75h10.448A2.25 2.25 0 0 1 19.5 4v16.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 20.5V13.802l-.482.482a.75.75 0 1 1-1.06-1.06l1.26-1.26a.75.75 0 0 1 1.06 0l1.018 1.018a.75.75 0 0 0 1.06 0l3.018-3.018a.75.75 0 0 0 0-1.06l-4.018-4.018a.75.75 0 0 0-1.06 0l-1.768 1.768A.75.75 0 0 1 6.26.177Z" />
                        </svg>
                    </div>
                    <div class="callout-body">
                        <div class="callout-text">${escapeHtml(reportData.analysis.olgaSummary)}</div>
                    </div>
                </div>
            </section>

            <div class="page-foot">
                © 2025 올가교육 수능연구소 | Page 3 / 5
            </div>
        </div>

        <!-- Page 4: 데이터 분석 및 로드맵 -->
        <div class="a4-page">
            <div class="page-head">
                <h2 class="page-head-title">데이터 분석 및 중장기 로드맵</h2>
                <span class="page-head-num">Page 4</span>
            </div>

            <section class="section">
                <h2 class="section-title-report">학생 vs 평균 비교 분석</h2>
                <div class="panel">
                    <div class="chart-frame h-64">
                        <canvas id="radarChart"></canvas>
                    </div>
                    <p class="outcome-text" style="text-align: center; margin-top: 16px;">
                        [분석] '${escapeHtml(reportData.studentInfo.name)}' 학생(파란색)과 '전체 평균'(회색)의 비교 분석
                    </p>
                </div>
            </section>

            <section>
                <h2 class="section-title-report">중3 → 고3 수능 완성 로드맵</h2>
                <div class="roadmap-stack">
                    <div class="roadmap-item">
                        <div class="roadmap-num">1</div>
                        <div>
                            <h3 class="roadmap-title">중학교 3학년 - 기초 체력 완성 단계</h3>
                            <p class="roadmap-text"><strong>목표:</strong> 수능 국어의 기본 토대 구축 | <strong>학습:</strong> 갈래별(현대시, 고전소설 등) 대표 작품 읽기, 영역별(화작, 문법, 독서, 문학) 독해 훈련 시작, 중등 문법 마스터</p>
                        </div>
                    </div>
                    <div class="roadmap-item">
                        <div class="roadmap-num">2</div>
                        <div><h3 class="roadmap-title">고등학교 1학년 - 심화 학습 전개 단계</h3><p class="roadmap-text"><strong>목표:</strong> 수능 출제 패턴 익숙화 및 실력 도약 | <strong>학습:</strong> 고1 학력평가 기출 작품/지문 완벽 분석, 독해 전략 수립, 수능 문법 전 영역 1회독 완료</p></div>
                    </div>
                    <div class="roadmap-item">
                        <div class="roadmap-num">3</div>
                        <div><h3 class="roadmap-title">고등학교 2학년 - 실전 역량 강화 단계</h3><p class="roadmap-text"><strong>목표:</strong> 2등급 진입 및 1등급 도전 기반 구축 | <strong>학습:</strong> 고2 학력평가 및 수능 기출(3개년) 분석, 고난도 독서 지문(과학, 기술, 경제) 대응 훈련, EBS 연계 작품 사전 학습</p></div>
                    </div>
                    <div class="roadmap-item">
                        <div class="roadmap-num">4</div>
                        <div><h3 class="roadmap-title">고등학교 3학년 - 수능 완전 정복 단계</h3><p class="roadmap-text"><strong>목표:</strong> 1등급 안정적 획득 및 만점 도전 | <strong>학습:</strong> 주 2회 이상 실전 모의고사, 취약 영역/유형 집중 공략, EBS 연계/비연계 고난도 문제 풀이, 시간 관리 및 멘탈 관리 훈련</p></div>
                    </div>
                </div>
            </section>

            <div class="page-foot">
                © 2025 올가교육 수능연구소 | Page 4 / 5
            </div>
        </div>

        <!-- Page 5: 맞춤형 학습 전략 -->
        <div class="a4-page">
            <div class="page-head">
                <h2 class="page-head-title">맞춤형 학습 전략</h2>
                <span class="page-head-num">Page 5</span>
            </div>

            <section class="section">
                <h2 class="section-title-report">학생 성향 분석</h2>
                <div class="callout">
                    <div>
                        <svg class="callout-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.475 2 2 6.475 2 12s4.475 10 10 10 10-4.475 10-10S17.525 2 12 2ZM8.007 17.05a8.002 8.002 0 0 1-4.002-8.03A8 8 0 0 1 12.002 4.004a8 8 0 0 1 7.995 8.01 8 8 0 0 1-8.01 7.995 8.002 8.002 0 0 1-3.988-1.004.75.75 0 0 0 .011.004Zm8.948-2.31a.75.75 0 0 0 .15-.098A5.502 5.502 0 0 0 18.5 8.5a5.5 5.5 0 0 0-11 0 5.502 5.502 0 0 0 1.395 6.142.75.75 0 0 0 .95.274 6.978 6.978 0 0 1 7.31 0 .75.75 0 0 0 .95-.274ZM12 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
                        </svg>
                    </div>
                    <div class="callout-body">
                        <h3 class="callout-title">${escapeHtml(reportData.analysis.propensity.typeTitle)}</h3>
                        <p class="callout-text">${escapeHtml(reportData.analysis.propensity.typeDescription)}</p>
                    </div>
                </div>
            </section>

            <section class="section">
                <h2 class="section-title-report">12주 집중 학습 전략</h2>
                <table class="rpt-table">
                    <thead>
                        <tr>
                            <th class="col-step">단계</th>
                            <th>핵심 전략</th>
                            <th>세부 학습 내용</th>
                            <th class="col-outcome">예상 성과</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="cell-strong">1단계<br/>(4주)</td>
                            <td class="cell-strong">약점 영역 집중 공략</td>
                            <td>약점 영역의 긴 지문 독해 훈련. 매일 2개 지문씩 시간 내에 풀고 오답 분석.</td>
                            <td>정답률 +10%<br/>상승</td>
                        </tr>
                        <tr>
                            <td class="cell-strong">2단계<br/>(3주)</td>
                            <td class="cell-strong">개념어 적용 훈련</td>
                            <td>약점인 개념어를 실제 기출 문제에 적용하는 훈련.</td>
                            <td>정답률 +5%<br/>상승</td>
                        </tr>
                        <tr>
                            <td class="cell-strong">3단계<br/>(5주)</td>
                            <td class="cell-strong">종합 실전 대비 및 시간 관리</td>
                            <td>주 2회 실전 모의고사(시간 측정 필수), 오답 문항 심층 분석, 취약 유형 집중 보완</td>
                            <td>등급 상승<br/>달성</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="section">
                <h2 class="section-title-report">성적 향상 예측 그래프</h2>
                <div class="panel">
                    <div class="chart-frame h-52">
                        <canvas id="predictionChart"></canvas>
                    </div>
                </div>
            </section>

            <section>
                <div class="outcome-banner">
                    <p class="outcome-title">목표 달성 가능성: <span class="outcome-accent">높음</span></p>
                    <p class="outcome-text">${escapeHtml(reportData.studentInfo.name)} 학생은 강점이 명확합니다. 제시된 전략을 성실히 따른다면 목표 등급 달성이 가능합니다.</p>
                </div>
            </section>

            <div class="page-foot">
                © 2025 올가교육 수능연구소 | Page 5 / 5
            </div>
        </div>
    </section>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // ===== INJECT REPORT DATA =====
            const reportData = ${reportDataJson};

            console.log('[DEBUG] reportData injected:', reportData);

            // 차트 색도 DESIGN.md 토큰을 따른다. 캔버스에는 CSS 클래스를 적용할 수 없으므로
            // :root 의 CSS 변수 계산값을 읽어서 넘긴다 (새 hex 를 만들지 않는다).
            const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const tokenAlpha = (name, alpha) => {
                const raw = token(name).replace('#', '');
                if (raw.length !== 3 && raw.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
                const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
                const n = parseInt(full, 16);
                return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
            };

            // Page 1: Score Chart (Bar Chart)
            const ctx1 = document.getElementById('scoreChart');
            if (ctx1) {
                const barData = reportData.charts.barChartData.values;
                const barColors = barData.map(p => {
                    if (p >= 80) return token('--fn-success');
                    if (p >= 70) return token('--fn-info');
                    if (p >= 60) return token('--text-tertiary');
                    return token('--fn-warning');
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
                            borderColor: token('--action'),
                            backgroundColor: tokenAlpha('--action', 0.08),
                            fill: true,
                            tension: 0.4
                        }, {
                            // 브라스 2/2 (1쪽): 학생 위치는 이 지면의 성취 지점이다
                            label: '학생 위치 (' + studentPercentile + '%)',
                            data: [{x: studentPercentile, y: studentYValue}],
                            borderColor: token('--accent-strong'),
                            backgroundColor: token('--accent'),
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
                            borderColor: token('--action'),
                            backgroundColor: tokenAlpha('--action', 0.2)
                        }, {
                            label: '전체 평균',
                            data: reportData.charts.radarChartData.average,
                            borderColor: token('--text-tertiary'),
                            backgroundColor: tokenAlpha('--text-tertiary', 0.2)
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
                            borderColor: token('--action'),
                            backgroundColor: tokenAlpha('--action', 0.08),
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
