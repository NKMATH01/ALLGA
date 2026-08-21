// 새로운 5페이지 A4 보고서 템플릿 with reportData injection
import { escapeHtml } from '../utils/helpers';

export function generateReportHTML(data: any): string {
  // reportData 구조 준비 (AI 분석 결과 + 학생 정보)
  const reportData = {
    metaVersion: data.metaVersion || 'v3',
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
        // 응시자 평균은 영역 '이름'으로 맞춘다. 배열 순서로 맞추면 subjectDetails 와
        // categoryPointsMap 의 정렬이 다를 때 다른 영역의 평균이 얹힌다.
        // 이름으로 못 찾으면 호출부가 준 순서값, 그것도 없으면 null (지어내지 않는다).
        average: (data.analysis?.subjectDetails || []).map((s: any, i: number) => {
          const byName = (Array.isArray(data.categoryPointsMap) ? data.categoryPointsMap : [])
            .find((c: any) => c.name === s.name);
          if (byName && byName.cohortRate !== null && byName.cohortRate !== undefined) {
            return byName.cohortRate;
          }
          const given = data.charts?.radarChartData?.average;
          if (Array.isArray(given) && given[i] !== undefined) return given[i];
          return s.avgPercentage === undefined ? null : s.avgPercentage;
        }),
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
    // 시험 분석지 도판이 클라이언트에서 쓰는 값. 서버에서 DB 실데이터로 계산되어 넘어온 것을
    // 그대로 전달한다. 해설 등 긴 텍스트는 서버 렌더 HTML 에만 있고 여기에는 싣지 않는다.
    questionAnalysis: (Array.isArray(data.questionAnalysis) ? data.questionAnalysis : []).map((q: any) => ({
      number: q.number,
      isCorrect: q.isCorrect,
      cohortRate: q.cohortRate,
      difficulty: q.difficulty,
      category: q.category,
    })),
    difficultyStats: Array.isArray(data.difficultyStats) ? data.difficultyStats : [],
    categoryPointsMap: Array.isArray(data.categoryPointsMap) ? data.categoryPointsMap : [],
    // 참고치 도판용. 서버에서 응시자 실표본으로 계산된 구간을 그대로 전달한다.
    categoryReference: Array.isArray(data.categoryReference) ? data.categoryReference : [],
    difficultyReference: Array.isArray(data.difficultyReference) ? data.difficultyReference : [],
    // 응시자 점수 분포. 표본이 없으면 빈 배열이고, 그때는 도판을 그리지 않는다.
    scoreDistribution: {
      cumulative: Array.isArray(data.charts?.percentileChartData?.cumulativeData)
        ? data.charts.percentileChartData.cumulativeData
        : [],
      sampleSize: Number(data.charts?.percentileChartData?.sampleSize) || 0,
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

  // ===================================================================
  // 학습 건강검진 결과통보서 (v4).
  // 병원 건강검진 결과통보서의 검증된 문법을 성적 지면에 이식한다.
  //   종합판정 / 항목별 검사표(결과-참고치-판정) / 참고범위 밴드 /
  //   요약 지면의 목차화 / 종합소견 + 권고사항 / 이전 검사 대비 추이
  // 모든 수치는 서버가 DB 실데이터로 계산해 넘긴 값이고, 없는 값은
  // '기준 축적 중'으로 적는다. 지면이 지어내는 수치는 없다.
  // ===================================================================
  const overview: any = data.examOverview || null;
  const questionRows: any[] = Array.isArray(data.questionAnalysis) ? data.questionAnalysis : [];
  const categoryRows: any[] = Array.isArray(data.categoryPointsMap) ? data.categoryPointsMap : [];
  const difficultyRows: any[] = Array.isArray(data.difficultyStats) ? data.difficultyStats : [];
  const categoryRefRows: any[] = Array.isArray(data.categoryReference) ? data.categoryReference : [];
  const difficultyRefRows: any[] = Array.isArray(data.difficultyReference) ? data.difficultyReference : [];
  const overallRef: any = data.overallReference || null;
  const history: any = data.examHistory || null;
  const outlook: any = data.ceoOutlook || null;
  // 고교 진학 대비 소견은 지면 조판에만 쓰는 긴 텍스트라 주입 JSON 에 싣지 않는다.
  // 따라서 정제본(reportData)이 아니라 호출부가 넘긴 원본에서 읽는다.
  const prep: any = data.analysis?.highSchoolPrep || null;
  const missedEasy: any[] = data.discrimination?.missedEasy || [];
  /** 전체 정답률이 낮은데 맞힌 문항. 심화 처방의 근거가 된다. */
  const solvedHard: any[] = data.discrimination?.solvedHard || [];
  const examTrends: any[] = data.examInsight?.trends || [];
  const overallReview: string = data.examInsight?.overallReview || '';
  const hasQuestionData = questionRows.length > 0;
  const minSample = Number(overview?.referenceMinSample) || 5;

  const rateText = (r: any) => (r === null || r === undefined ? '-' : r + '%');

  // DESIGN.md 10.5.2 영역 색은 이름 기준으로 고정 배정한다 (지면마다 같은 색).
  const CAT_VAR: Record<string, string> = {
    '화법': '--cat-1', '화법과 작문': '--cat-1', '작문': '--cat-2',
    '수능독서': '--cat-3', '독서': '--cat-3', '문학': '--cat-4',
    '문법': '--cat-6', '언어와 매체': '--cat-6', '언어와매체': '--cat-6', '매체': '--cat-6',
  };
  const FALLBACK = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6'];
  const catVar = (name: string, idx: number) => CAT_VAR[name] || FALLBACK[idx % FALLBACK.length];
  const catIndex = new Map<string, number>();
  categoryRows.forEach((c: any, i: number) => catIndex.set(c.name, i));
  const catVarOf = (name: string) => catVar(name, catIndex.get(name) ?? 0);

  const diffVar = (d: string) => (d === '상' ? '--diff-hi' : d === '하' ? '--diff-lo' : '--diff-mid');
  const heatClass = (r: any) =>
    r === null || r === undefined ? 'heat-na'
      : r >= 90 ? 'heat-5' : r >= 75 ? 'heat-4' : r >= 60 ? 'heat-3' : r >= 40 ? 'heat-2' : 'heat-1';

  // ===================================================================
  // 1. 종합판정 체계.
  //    검진지의 '정상A / 정상B / 질환의심 / 유질환자' 4단 판정에 대응한다.
  //    등급 색은 DESIGN.md 2.4 를 따른다 (등급에는 --fn-error 를 쓰지 않는다).
  // ===================================================================
  const VERDICTS = [
    {
      code: 'A', name: '우수', tone: 'vd-a', band: '1 ~ 2등급',
      meaning: '상위 성취 구간입니다. 현재의 학습 상태를 유지하면서 고난도 문항 대응력을 다듬는 단계입니다.',
    },
    {
      code: 'B', name: '양호', tone: 'vd-b', band: '3 ~ 4등급',
      meaning: '전반적으로 안정적인 구간입니다. 참고치를 벗어난 항목만 골라 보완하면 상위 구간 진입이 가능합니다.',
    },
    {
      code: 'C', name: '보완 필요', tone: 'vd-c', band: '5 ~ 6등급',
      meaning: '기초는 갖췄으나 항목별 편차가 큰 구간입니다. 미달 항목을 우선 처치하는 계획이 필요합니다.',
    },
    {
      code: 'R', name: '집중 관리', tone: 'vd-r', band: '7 ~ 9등급',
      meaning: '기본기부터 다시 쌓아야 하는 구간입니다. 정해진 주기로 재검사하며 변화를 추적할 것을 권합니다.',
    },
  ];
  const verdictOf = (g: any) => {
    const n = Number(g);
    if (!n || Number.isNaN(n)) return VERDICTS[2];
    return n <= 2 ? VERDICTS[0] : n <= 4 ? VERDICTS[1] : n <= 6 ? VERDICTS[2] : VERDICTS[3];
  };
  const verdict = verdictOf(reportData.scoreSummary.grade);

  // ===================================================================
  // 2. 참고치 대비 판정 (검진지의 H / L 플래그).
  //    참고치는 같은 시험 응시자들의 항목별 정답률 평균 +- 표준편차이고,
  //    표본이 모자라면 구간 자체를 만들지 않는다.
  // ===================================================================
  type Flag = { kind: string; mark: string; label: string };
  const flagOf = (value: any, ref: any): Flag => {
    if (value === null || value === undefined) return { kind: 'fl-na', mark: '', label: '-' };
    if (!ref || !ref.available) return { kind: 'fl-na', mark: '', label: '기준 축적 중' };
    if (value > ref.high) return { kind: 'fl-high', mark: '▲', label: '우수' };
    if (value < ref.low) return { kind: 'fl-low', mark: '▼', label: '미달' };
    return { kind: 'fl-normal', mark: '', label: '정상' };
  };
  const refText = (ref: any) =>
    ref && ref.available ? ref.low + ' ~ ' + ref.high + '%' : '기준 축적 중';

  const catRefOf = (name: string) => categoryRefRows.find((r: any) => r.name === name) || null;
  const diffRefOf = (level: string) => difficultyRefRows.find((r: any) => r.level === level) || null;

  /** 참고치를 벗어난 항목. 요약 지면의 하이라이트 대상이다. */
  const abnormalCats = categoryRows
    .map((c: any) => ({ row: c, ref: catRefOf(c.name), flag: flagOf(c.studentRate, catRefOf(c.name)) }))
    .filter((x) => x.flag.kind === 'fl-low');
  const excellentCats = categoryRows
    .map((c: any) => ({ row: c, ref: catRefOf(c.name), flag: flagOf(c.studentRate, catRefOf(c.name)) }))
    .filter((x) => x.flag.kind === 'fl-high');
  const abnormalDiffs = difficultyRows
    .map((d: any) => ({ row: d, ref: diffRefOf(d.level), flag: flagOf(d.studentRate, diffRefOf(d.level)) }))
    .filter((x) => x.flag.kind === 'fl-low');
  const referenceReady = categoryRefRows.some((r: any) => r.available);

  /** 검사표 한 덩어리. 열 구성은 검진지와 같다: 검사항목 / 결과 / 참고치 / 판정 */
  const resultRowHTML = (
    label: string, sub: string, value: any, ref: any, detailPage: string, chip: string
  ) => {
    const f = flagOf(value, ref);
    return '<tr>' +
      '<td class="ft-item">' + chip + '<span class="ft-item-name">' + escapeHtml(label) + '</span>' +
        (sub ? '<span class="ft-item-sub">' + escapeHtml(sub) + '</span>' : '') + '</td>' +
      '<td class="ft-num ft-result">' + rateText(value) + '</td>' +
      '<td class="ft-num ft-ref">' + refText(ref) + '</td>' +
      '<td class="ft-verdict"><span class="flag ' + f.kind + '">' +
        (f.mark ? '<span class="flag-mark">' + f.mark + '</span>' : '') + f.label + '</span></td>' +
      '<td class="ft-page">' + detailPage + '</td>' +
      '</tr>';
  };

  const categoryExamTable = (detailPage: string) =>
    '<table class="ftable">' +
    '<caption class="ft-caption">영역별 성취 측정 결과</caption>' +
    '<colgroup><col style="width:34%"><col style="width:15%"><col style="width:20%"><col style="width:19%"><col style="width:12%"></colgroup>' +
    '<thead><tr><th>검사 항목</th><th class="ft-num">측정값</th><th class="ft-num">참고치</th><th>판정</th><th class="ft-page">상세</th></tr></thead>' +
    '<tbody>' +
    categoryRows.map((c: any) =>
      resultRowHTML(
        c.name, c.count + '문항 · ' + c.points + '점', c.studentRate, catRefOf(c.name), detailPage,
        '<span class="ft-chip" style="background: var(' + catVarOf(c.name) + ')"></span>'
      )).join('') +
    '</tbody></table>';

  const difficultyExamTable = (detailPage: string) =>
    '<table class="ftable">' +
    '<caption class="ft-caption">난이도별 성취 측정 결과</caption>' +
    '<colgroup><col style="width:34%"><col style="width:15%"><col style="width:20%"><col style="width:19%"><col style="width:12%"></colgroup>' +
    '<thead><tr><th>검사 항목</th><th class="ft-num">측정값</th><th class="ft-num">참고치</th><th>판정</th><th class="ft-page">상세</th></tr></thead>' +
    '<tbody>' +
    difficultyRows.map((d: any) =>
      resultRowHTML(
        '난이도 ' + d.level, d.count + '문항 · ' + d.points + '점', d.studentRate, diffRefOf(d.level), detailPage,
        '<span class="ft-chip" style="background: var(' + diffVar(d.level) + ')"></span>'
      )).join('') +
    '</tbody></table>';

  /** 종합 항목(전체 정답률) 한 줄. 참고치는 응시자 전체의 총 정답률 분포다. */
  const overallRate = hasQuestionData
    ? Math.round((questionRows.filter((q: any) => q.isCorrect).length / questionRows.length) * 100)
    : null;
  const overallFlag = flagOf(overallRate, overallRef);

  // ===================================================================
  // 3. 참고범위 밴드. 수치보다 '어디에 있는지'가 먼저 읽히게 한다.
  // ===================================================================
  const bandHTML = (label: string, sub: string, value: any, ref: any, colorVar: string) => {
    const f = flagOf(value, ref);
    const pos = Math.max(0, Math.min(100, Number(value) || 0));
    // 구역은 참고치를 기준으로 나눈다. 주의역은 참고치 안쪽 아래 1/4 로,
    // 참고치에 겨우 걸친 항목을 미리 알린다. 중앙값을 경계로 쓰면 응시자
    // 절반이 주의로 찍히고, 만점자가 많은 항목에서는 구역이 무너진다.
    const cautionEnd = ref && ref.available
      ? Math.min(ref.high, ref.low + (ref.high - ref.low) * 0.25) : 0;
    const zones = ref && ref.available
      ? '<div class="bz bz-low" style="left:0%; width:' + ref.low + '%"></div>' +
        '<div class="bz bz-caution" style="left:' + ref.low + '%; width:' + Math.max(0, cautionEnd - ref.low) + '%"></div>' +
        '<div class="bz bz-normal" style="left:' + cautionEnd + '%; width:' + Math.max(0, ref.high - cautionEnd) + '%"></div>' +
        '<div class="bz bz-high" style="left:' + ref.high + '%; width:' + Math.max(0, 100 - ref.high) + '%"></div>' +
        '<div class="bz-edge" style="left:' + ref.low + '%"></div>' +
        '<div class="bz-edge" style="left:' + ref.high + '%"></div>'
      : '<div class="bz bz-none" style="left:0%; width:100%"></div>';
    return '<div class="band">' +
      '<div class="band-head">' +
        '<span class="band-chip" style="background: var(' + colorVar + ')"></span>' +
        '<span class="band-name">' + escapeHtml(label) + '</span>' +
        '<span class="band-sub">' + escapeHtml(sub) + '</span>' +
        '<span class="flag ' + f.kind + '">' + (f.mark ? '<span class="flag-mark">' + f.mark + '</span>' : '') + f.label + '</span>' +
      '</div>' +
      '<div class="band-track">' + zones +
        '<div class="band-marker" style="left:' + pos + '%"></div>' +
        '<div class="band-value" style="left:' + pos + '%">' + rateText(value) + '</div>' +
      '</div>' +
      '<div class="band-foot">' +
        '<span>0%</span>' +
        (ref && ref.available
          ? '<span class="band-refnote">참고치 ' + ref.low + ' ~ ' + ref.high + '% (응시자 ' + ref.sampleSize + '명 중앙값 ' + ref.mid + '%)</span>'
          : '<span class="band-refnote">응시자 ' + (ref ? ref.sampleSize : 0) + '명. 참고치는 ' + minSample + '명 이상부터 산출합니다</span>') +
        '<span>100%</span>' +
      '</div>' +
      '</div>';
  };

  /**
   * 예상 수능 등급 블록.
   * 이번 검사에서 '측정된' 등급을 수능 척도 위에 그대로 옮기고 +-1등급 폭으로 적는다.
   * 새 점수를 계산하거나 미래를 예언하지 않는다. 단정 대신 구간과 조건으로 쓰고,
   * 확정 예측이 아니라는 각주를 반드시 함께 낸다 (DESIGN.md 10.3).
   */
  const outlookHTML = !outlook || !outlook.measuredGrade ? '' :
    '<div class="outlook">' +
    '<div class="outlook-key">' +
    '<p class="outlook-label">수능 국어 예상 등급 구간</p>' +
    '<p class="outlook-band">' + outlook.bandLow +
      '<span class="outlook-tilde">~</span>' + outlook.bandHigh +
      '<span class="outlook-unit">등급대</span></p>' +
    '</div>' +
    '<div class="outlook-body">' +
    '<p class="outlook-lead">현 성취를 그대로 유지할 경우 수능 국어에서 <em>' +
      outlook.bandLow + ' ~ ' + outlook.bandHigh + '등급대</em>에 놓입니다.</p>' +
    '<p class="outlook-basis">이번 검사에서 측정된 <b>' + outlook.measuredGrade +
      '등급</b>을 수능 척도에 옮긴 구간입니다' +
      (outlook.sampleSize > 1 ? ' (응시자 ' + outlook.sampleSize + '명 기준)' : '') + '.</p>' +
    '<p class="outlook-caveat">현 시점 진단이며 확정 예측이 아닙니다. 학습량과 응시 집단이 바뀌면 결과도 달라집니다.</p>' +
    '</div></div>';

  /** 등급 척도. 1 ~ 9 를 판정 구간 색으로 칠하고 수검자 자리를 표시한다. */
  const gradeToneOf = (g: number) => (g <= 2 ? 'vd-a' : g <= 4 ? 'vd-b' : g <= 6 ? 'vd-c' : 'vd-r');
  const myGrade = Number(reportData.scoreSummary.grade) || 0;
  // 판정 척도(A/B/C/R)와 등급 게이지는 같은 정보를 두 번 그리므로 하나로 합친다.
  // 게이지 위에 판정 구간 머리를 얹고, 아래 칸에 등급을 둔다.
  const gradeGaugeHTML =
    '<div class="ggauge">' +
    '<div class="ggauge-head">' + VERDICTS.map((v, i) =>
      '<div class="gg-band ' + v.tone + (v.code === verdict.code ? ' is-current' : '') + '"' +
      ' style="grid-column: span ' + [2, 2, 2, 3][i] + '">' +
      '<span class="gg-code">' + v.code + '</span>' +
      '<span class="gg-name">' + v.name + '</span>' +
      '<span class="gg-range">' + v.band + '</span>' +
      '</div>').join('') + '</div>' +
    '<div class="ggauge-track">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) =>
      '<div class="gg-seg ' + gradeToneOf(g) + (g === myGrade ? ' is-me' : '') + '">' +
      '<span class="gg-g">' + g + '</span>' +
      (g === myGrade ? '<span class="gg-me">수검자</span>' : '') +
      '</div>').join('') +
    '</div><div class="gg-foot"><span>1등급 (상위)</span>' +
    '<span>9등급 (하위)</span></div></div>';

  /** 종합 항목(전체 정답률) 위치 밴드. 요약 지면의 '상세' 참조가 가리키는 도판이다. */
  const overallBandHTML = () =>
    bandHTML('전체 정답률', questionRows.length + '문항 · ' + (overview ? overview.totalScore + '점' : ''),
      overallRate, overallRef, '--action');

  const categoryBandsHTML = categoryRows.map((c: any) =>
    bandHTML(c.name, c.count + '문항 · ' + c.points + '점', c.studentRate, catRefOf(c.name), catVarOf(c.name))
  ).join('');

  const difficultyBandsHTML = difficultyRows.map((d: any) =>
    bandHTML('난이도 ' + d.level, d.count + '문항 · ' + d.points + '점', d.studentRate, diffRefOf(d.level), diffVar(d.level))
  ).join('');

  // ===================================================================
  // 4. 기존 자산(정오 히트맵 / 문항표 / 해설)은 '상세 검사 결과' 지면으로 편입한다.
  // ===================================================================
  const heatmapHTML = !hasQuestionData ? '' :
    '<div class="omr">' + questionRows.map((q: any) =>
      '<div class="omr-cell ' + (q.isCorrect ? 'omr-o' : 'omr-x') + '"' +
      ' style="border-color: var(' + diffVar(q.difficulty) + ')">' +
      '<span class="omr-num">' + q.number + '</span>' +
      '<span class="omr-mark">' + (q.isCorrect ? 'O' : 'X') + '</span>' +
      '</div>').join('') + '</div>';

  /** 기준 대비 실점 문항 번호. 핵심 오답 선별이 쓴다. */
  const missSet = new Set(missedEasy.map((q: any) => q.number));

  const trendsHTML = examTrends.length === 0 ? '' :
    examTrends.map((t: any) =>
      '<div class="trend-item">' +
      '<p class="trend-q">' + escapeHtml(String(t.questionNumbers || '')) + '</p>' +
      '<p class="trend-d">' + escapeHtml(String(t.description || '')) + '</p>' +
      '</div>'
    ).join('');

  const wrongRows = questionRows.filter((q: any) => !q.isCorrect);
  /**
   * 핵심 오답. 전 문항 표 대신 변별 가치가 큰 오답만 골라 싣는다.
   * 순서: (1) 기준 대비 실점 - 다수가 맞힌 문항을 놓친 것 (2) 난이도 상 오답
   *      (3) 배점이 큰 오답. 같은 조건이면 전체 정답률이 높은 순.
   */
  const KEY_WRONG_MAX = 6;
  const keyWrongRows = questionRows
    .filter((q: any) => !q.isCorrect)
    .map((q: any) => ({
      q,
      tier: missSet.has(q.number) ? 0 : q.difficulty === '상' ? 1 : 2,
      rate: q.cohortRate === null || q.cohortRate === undefined ? -1 : q.cohortRate,
    }))
    .sort((a, b) => (a.tier - b.tier) || (b.rate - a.rate) || (b.q.points - a.q.points))
    .slice(0, KEY_WRONG_MAX)
    .map((x) => x.q);

  const keyWrongReason = (q: any) =>
    missSet.has(q.number)
      ? '기준 대비 실점'
      : q.difficulty === '상' ? '고난도 실점' : '배점 실점';

  /** 해설 요지. 원문 첫 두 문장만 싣고 잘렸으면 그 사실을 표시한다. */
  const gistOf = (text: string) => {
    const t = (text || '').trim();
    if (!t) return '';
    const parts = t.split(/(?<=\.)\s+/).filter(Boolean);
    if (parts.length <= 2) return t;
    return parts.slice(0, 2).join(' ') + ' (이하 생략)';
  };

  const keyWrongHTML = keyWrongRows.length === 0
    ? '<p class="empty-note">틀린 문항이 없습니다.</p>'
    : '<div class="kw-list">' + keyWrongRows.map((q: any) =>
        '<div class="kw-item">' +
        '<div class="kw-head">' +
        '<span class="kw-num">' + q.number + '번</span>' +
        '<span class="kw-tag ' + (missSet.has(q.number) ? 'is-miss' : 'is-hard') + '">' + keyWrongReason(q) + '</span>' +
        '<span class="cat-chip" style="background: var(' + catVarOf(q.category) + ')"></span>' +
        '<span class="kw-meta">' + escapeHtml(q.category) +
          (q.subcategory ? ' · ' + escapeHtml(q.subcategory) : '') +
          ' · 난이도 ' + escapeHtml(q.difficulty) + ' · ' + q.points + '점</span>' +
        '<span class="kw-rate ' + heatClass(q.cohortRate) + '">전체 ' + rateText(q.cohortRate) + '</span>' +
        '</div>' +
        (q.correctAnswer !== null && q.correctAnswer !== undefined
          ? '<p class="kw-answer">정답 ' + escapeHtml(String(q.correctAnswer)) + ' / 내 답안 ' +
            (q.studentAnswer === null || q.studentAnswer === undefined || Number(q.studentAnswer) === 0
              ? '무응답' : escapeHtml(String(q.studentAnswer))) + '</p>'
          : '') +
        (q.explanation ? '<p class="kw-text">' + escapeHtml(gistOf(q.explanation)) + '</p>' : '') +
        '</div>').join('') + '</div>';

  /** 출제자 총평. DB 원문의 '#' 는 마크다운 표시 기호이므로 제목으로 조판하고 문구는 그대로 둔다. */
  const reviewHTML = !overallReview ? '' : overallReview
    .split(/\r?\n/)
    .map((line: string) => {
      const t = line.trim();
      if (!t) return '';
      const heading = t.match(/^#{2,6}\s*(.+)$/);
      if (heading) return '<h4 class="review-head">' + escapeHtml(heading[1]) + '</h4>';
      return '<p class="review-para">' + escapeHtml(t) + '</p>';
    })
    .join('');

  // ===== 소견 문장. 모든 수치는 위에서 계산된 실데이터에서만 만든다. =====
  const sortedCats = categoryRows.slice().sort((a: any, b: any) => b.studentRate - a.studentRate);
  const bestCat = sortedCats[0];
  const worstCat = sortedCats[sortedCats.length - 1];
  const correctCount = questionRows.filter((q: any) => q.isCorrect).length;
  const wrongCount = questionRows.length - correctCount;
  const wrongHi = questionRows.filter((q: any) => !q.isCorrect && q.difficulty === '상').length;

  /** 검진지의 소견 블록. 결론 한 줄 + 근거 한 줄. */
  const finding = (main: string, sub: string) =>
    '<div class="finding"><div class="finding-bar"></div><div>' +
    '<p class="finding-text">' + main + '</p>' +
    (sub ? '<p class="finding-sub">' + sub + '</p>' : '') +
    '</div></div>';

  const summaryFinding = !hasQuestionData || !bestCat ? '' : finding(
    '<em>' + escapeHtml(bestCat.name) + '</em> 영역이 ' + bestCat.studentRate + '%로 가장 높고, ' +
    '<em>' + escapeHtml(worstCat.name) + '</em> 영역이 ' + worstCat.studentRate + '%로 가장 낮습니다.',
    '전체 ' + questionRows.length + '문항 중 ' + correctCount + '문항 정답' +
    (overview && overview.rank && overview.attemptCount > 1
      ? ' · 응시자 ' + overview.attemptCount + '명 중 ' + overview.rank + '위' : ''));

  const heatFinding = !hasQuestionData ? '' : finding(
    '틀린 문항은 <b>' + wrongCount + '문항</b>이고, 그중 난이도 상은 ' + wrongHi + '문항입니다.',
    '아래 격자에서 면 색은 정오, 테두리 색은 난이도입니다.');

  // ===================================================================
  // 5. 추이 (이전 검사 대비). 값이 없으면 첫 검사임을 그대로 적는다.
  // ===================================================================
  const deltaCell = (value: any, unit: string, betterWhenUp: boolean) => {
    if (value === null || value === undefined) return '<span class="dl dl-na">비교 불가</span>';
    const n = Number(value);
    if (n === 0) return '<span class="dl dl-flat">변화 없음</span>';
    const improved = betterWhenUp ? n > 0 : n < 0;
    const mark = n > 0 ? '▲' : '▼';
    const sign = n > 0 ? '+' : '';
    return '<span class="dl ' + (improved ? 'dl-up' : 'dl-down') + '">' +
      '<span class="dl-mark">' + mark + '</span>' + sign + n + unit + '</span>';
  };

  const historyHTML = !history || !history.available || !history.previous
    ? '<p class="empty-note">이전 검사 기록이 없습니다. 이번 결과가 최초 기준선이 되며, 다음 검사부터 변화를 추적합니다.</p>'
    : '<table class="ftable ftable-trend">' +
      '<colgroup><col style="width:22%"><col style="width:26%"><col style="width:26%"><col style="width:26%"></colgroup>' +
      '<thead><tr><th>측정 항목</th>' +
      '<th class="ft-num">직전 검사</th>' +
      '<th class="ft-num">금회 검사</th>' +
      '<th class="ft-num">변화량</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="ft-item"><span class="ft-item-name">검사명</span></td>' +
        '<td class="ft-small">' + escapeHtml(String(history.previous.examTitle)) + '</td>' +
        '<td class="ft-small">' + escapeHtml(String(history.current.examTitle)) + '</td>' +
        '<td class="ft-small">' + (history.sameExam ? '동일 검사 재응시' : '다른 검사') + '</td></tr>' +
      '<tr><td class="ft-item"><span class="ft-item-name">검사일</span></td>' +
        '<td class="ft-small">' + escapeHtml(String(history.previous.date)) + '</td>' +
        '<td class="ft-small">' + escapeHtml(String(history.current.date)) + '</td>' +
        '<td class="ft-small">-</td></tr>' +
      '<tr><td class="ft-item"><span class="ft-item-name">원점수</span></td>' +
        '<td class="ft-num">' + history.previous.score + ' / ' + history.previous.maxScore + '</td>' +
        '<td class="ft-num ft-result">' + history.current.score + ' / ' + history.current.maxScore + '</td>' +
        '<td class="ft-num">' + deltaCell(history.delta ? history.delta.score : null, '점', true) + '</td></tr>' +
      '<tr><td class="ft-item"><span class="ft-item-name">정답률</span></td>' +
        '<td class="ft-num">' + rateText(history.previous.rate) + '</td>' +
        '<td class="ft-num ft-result">' + rateText(history.current.rate) + '</td>' +
        '<td class="ft-num">' + deltaCell(history.delta ? history.delta.rate : null, '%p', true) + '</td></tr>' +
      '<tr><td class="ft-item"><span class="ft-item-name">등급</span></td>' +
        '<td class="ft-num">' + (history.previous.grade ?? '-') + '등급</td>' +
        '<td class="ft-num ft-result">' + (history.current.grade ?? '-') + '등급</td>' +
        '<td class="ft-num">' + deltaCell(history.delta ? history.delta.grade : null, '등급', true) + '</td></tr>' +
      '</tbody></table>' +
      (history.priorCount > 1
        ? '<p class="form-note">직전 검사 1건과 비교했습니다. 이전 응시 기록은 모두 ' + history.priorCount + '건입니다.</p>'
        : '');

  // ===================================================================
  // 6. 권고사항. 처방전처럼 번호를 매기되, 문장 안의 수치는 전부 실계산 값이다.
  // ===================================================================
  type Advice = { title: string; body: string; tag: string };
  const advices: Advice[] = [];

  /** 오답의 소분류를 묶어 많이 틀린 유형부터 센다. 교정 처방의 근거가 된다. */
  const wrongTypeTally = (() => {
    const m = new Map<string, { label: string; count: number; areas: Set<string> }>();
    questionRows.forEach((q: any) => {
      if (q.isCorrect) return;
      const label = (q.subcategory || q.type || '').trim();
      if (!label) return;
      if (!m.has(label)) m.set(label, { label, count: 0, areas: new Set<string>() });
      const e = m.get(label)!;
      e.count += 1;
      e.areas.add(q.category);
    });
    return [...m.values()].sort((a, b) => b.count - a.count);
  })();

  /** 처방 대상 영역: 참고치 미달이 있으면 그것, 없으면 정답률 하위 2개. */
  const rxAreas = (abnormalCats.length > 0
    ? abnormalCats.map((x) => x.row)
    : categoryRows.slice().sort((a: any, b: any) => a.studentRate - b.studentRate).slice(0, 2));

  const subsOfArea = (name: string) => {
    const seen: string[] = [];
    questionRows.forEach((q: any) => {
      if (!q.isCorrect && q.category === name) {
        const label = (q.subcategory || q.type || '').trim();
        if (label && seen.indexOf(label) === -1) seen.push(label);
      }
    });
    return seen;
  };

  const aiRx: any = data.analysis?.prescription || null;

  // ---------- (1) 영역별 처방 ----------
  const aiAreaPlans: any[] = Array.isArray(aiRx?.areaPlans) ? aiRx.areaPlans : [];
  if (aiAreaPlans.length > 0) {
    aiAreaPlans.forEach((p: any) => advices.push({
      tag: '영역 교정',
      title: escapeHtml(String(p.area || '')) + ' 교정 전략',
      body: escapeHtml(String(p.strategy || '')),
    }));
  } else {
    rxAreas.forEach((c: any) => {
      const ref = catRefOf(c.name);
      const subs = subsOfArea(c.name);
      const f = flagOf(c.studentRate, ref);
      const gap = ref && ref.available ? (ref.low as number) - c.studentRate : null;
      advices.push({
        tag: '영역 교정',
        title: escapeHtml(c.name) + ' 교정 전략 (' + c.studentRate + '%' +
          (ref && ref.available ? ' · 참고치 ' + refText(ref) : '') + ')',
        body: escapeHtml(c.name) + '은 ' + c.count + '문항 ' + c.points + '점 규모이고, 측정값 ' + c.studentRate + '%는 ' +
          (f.kind === 'fl-low' && gap !== null
            ? '참고치 하한을 ' + gap + '%p 밑돕니다. '
            : '참고치 구간 하단에 있습니다. ') +
          (subs.length > 0
            ? '실점이 ' + subs.slice(0, 3).join(', ') + ' 유형에 몰려 있으므로, 이 유형만 따로 묶어 풀이 근거를 문장으로 쓰게 하는 방식으로 교정합니다. '
            : '해당 영역의 기출 유형을 묶어 풀이 근거를 문장으로 쓰게 하는 방식으로 교정합니다. ') +
          '교정 성공 기준은 다음 검사에서 이 영역이 참고치 구간 안으로 들어오는 것입니다.',
      });
    });
  }

  // ---------- (2) 오답 유형별 교정 ----------
  const aiTypePlans: any[] = Array.isArray(aiRx?.errorTypePlans) ? aiRx.errorTypePlans : [];
  if (aiTypePlans.length > 0) {
    aiTypePlans.forEach((p: any) => advices.push({
      tag: '유형 교정',
      title: escapeHtml(String(p.type || '')) + ' 유형 교정',
      body: escapeHtml(String(p.correction || '')),
    }));
  } else if (wrongTypeTally.length > 0) {
    const top = wrongTypeTally.slice(0, 4);
    advices.push({
      tag: '유형 교정',
      title: '반복 실점 유형 ' + top.length + '종 집중 교정',
      body: top.map((t) =>
        '<b>' + escapeHtml(t.label) + '</b> ' + t.count + '문항(' + [...t.areas].map((a) => escapeHtml(a)).join(', ') + ')'
      ).join(' · ') +
        '. 같은 유형에서 반복해 실점하고 있으므로 문항 수가 많은 유형부터 처리합니다. ' +
        '오답 원인을 지식 부족과 조건 누락 중 어느 쪽인지 문항마다 표시하게 한 뒤, 같은 유형 5문항을 연속으로 풀려 재발 여부를 확인합니다.',
    });
  }

  // ---------- (3) 기준 대비 실점 회복 ----------
  if (missedEasy.length > 0) {
    advices.push({
      tag: '실점 회복',
      title: '먼저 회복 가능한 실점 ' + missedEasy.length + '문항',
      body: missedEasy.slice(0, 8).map((q: any) => q.number + '번(전체 ' + rateText(q.cohortRate) + ')').join(', ') +
        '. 다수 응시자가 정답한 문항이므로 난도가 아니라 처리 과정의 문제일 가능성이 큽니다. ' +
        '풀이 시간을 재면서 다시 풀게 하고, 시간 안에 맞히면 속도 문제, 시간을 더 줘도 틀리면 지식 문제로 분류해 처방을 나눕니다.',
    });
  }

  // ---------- (4) 주간 학습 설계 ----------
  const aiWeekly: any = aiRx?.weeklyDesign || null;
  if (aiWeekly && (aiWeekly.summary || aiWeekly.sessions || aiWeekly.twelveWeek)) {
    advices.push({
      tag: '학습 설계',
      title: '주간 학습 설계',
      body: [aiWeekly.summary, aiWeekly.sessions, aiWeekly.twelveWeek]
        .filter(Boolean).map((t: any) => escapeHtml(String(t))).join(' '),
    });
  } else {
    advices.push({
      tag: '학습 설계',
      title: '주간 학습 배분과 12주 교정 일정',
      body: '교정 대상은 ' + rxAreas.length + '개 영역, 오답 ' + wrongRows.length + '문항입니다. ' +
        '주간 학습 시간의 절반 이상을 ' + rxAreas.map((c: any) => escapeHtml(c.name)).join(', ') +
        '에 배정하고, 나머지를 유지 학습에 씁니다. ' +
        '<b>1단계(1 ~ 4주)</b> 약점 영역의 긴 지문 독해 훈련, 매 회 2개 지문을 시간 내에 풀고 오답 분석. ' +
        '<b>2단계(5 ~ 7주)</b> 위에서 분류한 실점 유형을 기출 문항에 적용하는 훈련. ' +
        '<b>3단계(8 ~ 12주)</b> 실전 형식 모의 응시(시간 측정 필수)와 오답 심층 분석으로 마무리합니다.',
    });
  }

  // ---------- (5) 경과 관찰 / 재검사 로드맵 ----------
  const aiRecheck: any = aiRx?.recheck || null;
  const targetLow = rxAreas.length > 0 && catRefOf(rxAreas[0].name)?.available
    ? (catRefOf(rxAreas[0].name).low as number) : null;
  if (aiRecheck && (aiRecheck.when || aiRecheck.targetBand || aiRecheck.metric)) {
    advices.push({
      tag: '경과 관찰',
      title: '재검사 로드맵',
      body: [aiRecheck.when, aiRecheck.targetBand, aiRecheck.metric]
        .filter(Boolean).map((t: any) => escapeHtml(String(t))).join(' '),
    });
  } else {
    advices.push({
      tag: '경과 관찰',
      title: '재검사 시점과 목표 구간',
      body: '12주 교정 일정을 마치는 시점에 동일 형식으로 재검사합니다. ' +
        '금회 기준선은 전체 정답률 ' + rateText(overallRate) +
        (overallRef && overallRef.available ? ' (참고치 ' + refText(overallRef) + ')' : '') + ', 등급 ' +
        reportData.scoreSummary.grade + '등급입니다. ' +
        (targetLow !== null
          ? '1차 목표는 ' + escapeHtml(rxAreas[0].name) + ' 영역을 참고치 하한 ' + targetLow + '% 이상으로 올려 기준 미달 판정을 해소하는 것입니다. '
          : '1차 목표는 기준 미달 판정 항목을 0으로 만드는 것입니다. ') +
        '측정 지표는 영역별 정답률과 판정이며, 등급은 응시 집단에 따라 흔들리므로 단독 지표로 쓰지 않습니다.',
    });
  }

  // ===================================================================
  // 심화 분기.
  // 오답이 적은 수검자는 교정할 실점 자체가 적어 처방이 얇아진다.
  // 이때는 없는 실점을 지어내는 대신, 이미 확보한 강점과 고난도 대응력을
  // 근거로 심화 과제를 얹는다. 근거는 전부 실제 채점 결과에서 나온다.
  // ===================================================================
  const hardCorrect = questionRows.filter((q: any) => q.difficulty === '상' && q.isCorrect).length;
  const hardTotal = questionRows.filter((q: any) => q.difficulty === '상').length;
  const enrichmentMode = hasQuestionData &&
    (wrongRows.length <= 6 || (Number(reportData.scoreSummary.grade) || 9) <= 2);

  if (enrichmentMode) {
    // (심화 1) 고난도 대응력 확장
    if (hardTotal > 0) {
      advices.push({
        tag: '심화',
        title: '고난도 문항 대응력 확장 (난이도 상 ' + hardCorrect + '/' + hardTotal + '문항)',
        body: '난이도 상 ' + hardTotal + '문항 중 ' + hardCorrect + '문항을 정답 처리했습니다' +
          (solvedHard.length > 0
            ? ', 그중 ' + solvedHard.length + '문항은 전체 정답률 40% 이하로 다수 응시자가 놓친 문항입니다(' +
              solvedHard.slice(0, 5).map((q: any) => q.number + '번 전체 ' + rateText(q.cohortRate)).join(', ') + ')'
            : '') + '. ' +
          '이 수준에서는 정답 여부보다 <b>선택지를 소거한 근거</b>가 남는지가 다음 단계를 가릅니다. ' +
          '맞힌 고난도 문항도 오답 선택지 4개를 각각 왜 버렸는지 문장으로 쓰게 해, 감으로 맞힌 문항을 골라내십시오.',
      });
    }

    // (심화 2) 참고치 상한 / 만점 도달 과제
    // 상한 도달 과제는 이미 높은 영역만 대상이다.
    // 교정 대상(rxAreas)이나 낮은 영역을 여기 섞으면 '상한 도달'이라는 말이 틀린 진술이 된다.
    const ceilingTargets = categoryRows
      .map((c: any) => ({ c, ref: catRefOf(c.name) }))
      .filter((x) => x.c.studentRate < 100 && x.c.studentRate >= 75 &&
        rxAreas.every((r: any) => r.name !== x.c.name))
      .sort((a, b) => b.c.studentRate - a.c.studentRate)
      .slice(0, 3);
    if (ceilingTargets.length > 0) {
      const hasRef = ceilingTargets.some((x) => x.ref && x.ref.available);
      advices.push({
        tag: '심화',
        title: '상한 도달 과제 ' + ceilingTargets.length + '개 영역',
        body: ceilingTargets.map((x) =>
          '<b>' + escapeHtml(x.c.name) + '</b> ' + x.c.studentRate + '%' +
          (x.ref && x.ref.available ? ' (참고치 상한 ' + x.ref.high + '%)' : '')
        ).join(' · ') + '. ' +
          (hasRef
            ? '이 영역들은 참고치 상한에 근접해 있어, 남은 격차는 지식이 아니라 조건 처리의 정밀도에서 나옵니다. '
            : '응시자 표본이 모자라 참고치를 내지 못했으므로 만점을 기준선으로 둡니다. 남은 격차는 조건 처리의 정밀도에서 나옵니다. ') +
          '문항의 발문 조건을 밑줄로 표시한 뒤 푸는 훈련을 붙여, 조건 누락으로 인한 실점을 0으로 만드는 것을 과제로 삼습니다.',
      });
    }

    // (심화 3) 상위 난도 지문으로 난도 상향
    const topArea = categoryRows.slice().sort((a: any, b: any) => b.studentRate - a.studentRate)[0];
    if (topArea) {
      advices.push({
        tag: '심화',
        title: '지문 난도 상향 훈련',
        body: '금회 검사의 오답은 ' + wrongRows.length + '문항으로, 현 난도에서는 변별이 거의 끝났습니다. ' +
          '같은 난도를 반복하면 측정만 되고 실력은 정체되므로, ' +
          escapeHtml(topArea.name) + '(' + topArea.studentRate + '%)처럼 이미 확보한 영역부터 ' +
          '상급 학년 기출로 지문 길이와 추상도를 올려 같은 정답률이 유지되는지 확인합니다. ' +
          '정답률이 떨어지는 지점이 다음 검사의 실제 취약 요인입니다.',
      });
    }
  }

  // ---------- (6) 강점 유지 처방 ----------
  // 심화 모드에서는 '지문 난도 상향' 처방이 같은 강점 영역을 이미 다루므로 중복으로 싣지 않는다.
  const keepArea = categoryRows.slice().sort((a: any, b: any) => b.studentRate - a.studentRate)[0];
  if (!enrichmentMode && keepArea && rxAreas.every((c: any) => c.name !== keepArea.name)) {
    const keepRef = catRefOf(keepArea.name);
    advices.push({
      tag: '강점 유지',
      title: escapeHtml(keepArea.name) + ' 방어선 유지 (' + keepArea.studentRate + '%)',
      body: escapeHtml(keepArea.name) + '은 ' + keepArea.count + '문항 ' + keepArea.points + '점 규모에서 측정값 ' +
        keepArea.studentRate + '%로 전 영역 중 가장 높습니다' +
        (keepRef && keepRef.available ? ' (참고치 ' + refText(keepRef) + ')' : '') + '. ' +
        '교정 영역에 시간을 몰아주는 동안 이 영역이 함께 내려앉는 경우가 많으므로, ' +
        '주 1회는 이 영역 문항을 유지 분량으로 배정해 정답률이 현 수준에서 떨어지지 않는지 확인합니다. ' +
        '다음 검사에서 이 영역이 하락했다면 배분을 되돌리는 신호로 봅니다.',
    });
  }

  // ---------- (7) 가정 협조 ----------
  const aiFamily = aiRx?.familyGuide;
  advices.push({
    tag: '가정 협조',
    title: '가정에서의 협조 사항',
    body: aiFamily
      ? escapeHtml(String(aiFamily))
      : '오답을 다시 풀렸을 때 정답 여부보다 <b>근거를 말로 설명할 수 있는지</b>를 확인해 주십시오. ' +
        '설명하지 못하는 문항은 맞혔더라도 교정 대상입니다. ' +
        '학습 시간의 총량보다 위 처방의 순서를 지키는 편이 다음 검사 결과에 더 크게 반영됩니다.',
  });

  const adviceHTML = advices.length === 0
    ? '<p class="empty-note">권고 항목을 생성할 데이터가 없습니다.</p>'
    : '<ol class="rx-list">' + advices.map((a, i) =>
        '<li class="rx-item">' +
        '<span class="rx-no">' + (i + 1) + '</span>' +
        '<div class="rx-body">' +
        '<p class="rx-title"><span class="rx-tag">' + a.tag + '</span>' + a.title + '</p>' +
        '<p class="rx-text">' + a.body + '</p>' +
        '</div></li>').join('') + '</ol>';

  /** 강점/보완으로 뽑힌 영역의 서술. 항목별 소견에서 우선 사용한다. */
  const swTextOf = new Map<string, { kind: string; text: string }>();
  (reportData.analysis.strengths || []).forEach((x: any) => {
    if (x && x.name) swTextOf.set(x.name, { kind: 'strong', text: x.analysisText || '' });
  });
  (reportData.analysis.weaknesses || []).forEach((x: any) => {
    if (x && x.name) swTextOf.set(x.name, { kind: 'weak', text: x.analysisText || '' });
  });

  // 항목별 소견. 결과/참고치/판정 수치는 2쪽 검사표가 단일 진실이므로 여기서는
  // 서술만 싣고 강점/보완 표시만 덧붙인다 (막대·점수 반복 제거).
  /**
   * AI 소견 길이는 보장되지 않는다. 프롬프트는 영역당 300-420자를 요구하지만
   * 그보다 길게 오는 경우가 있고, 그대로 얹으면 지면이 넘친다.
   * 지면을 늘리거나 활자를 더 줄이는 대신, 프롬프트가 이미 정한 상한을
   * 조판 단계에서 문장 경계로 강제한다. 잘린 경우 그 사실을 표시한다.
   */
  const OPINION_MAX = 360;
  const clampOpinion = (text: string) => {
    const t = String(text || '').trim();
    if (t.length <= OPINION_MAX) return t;
    const parts = t.split(/(?<=\.)\s+/).filter(Boolean);
    let out = '';
    for (const p of parts) {
      if ((out + ' ' + p).trim().length > OPINION_MAX) break;
      out = (out + ' ' + p).trim();
    }
    if (!out) out = t.slice(0, OPINION_MAX);
    return out + ' (이하 생략)';
  };

  const subjectDetailsHTML = reportData.analysis.subjectDetails.map((subject: any) => {
    const sw = swTextOf.get(subject.name);
    const f = flagOf(subject.score, catRefOf(subject.name));
    const tag = sw
      ? '<span class="op-tag ' + (sw.kind === 'strong' ? 'is-strong' : 'is-weak') + '">' +
        (sw.kind === 'strong' ? '강점' : '보완') + '</span>'
      : '';
    return '<div class="opinion-item">' +
      '<div class="opinion-item-head">' +
      '<span class="cat-chip" style="background: var(' + catVarOf(subject.name) + ')"></span>' +
      '<h3 class="opinion-item-name">' + escapeHtml(subject.name) + '</h3>' + tag +
      '<span class="opinion-item-score">' + subject.score + '%</span>' +
      '<span class="flag ' + f.kind + '">' + (f.mark ? '<span class="flag-mark">' + f.mark + '</span>' : '') + f.label + '</span>' +
      '</div>' +
      // v3 프롬프트에서 subjectDetails.analysisText 가 3단 구조(성취-원인-수능 시사점)의
      // 본 진단문이 됐다. 강점/보완 단문보다 이쪽이 길고 정보가 많으므로 이것을 먼저 쓴다.
      // (v2 응답처럼 analysisText 가 비어 있을 때만 강약점 문장으로 대체)
      '<p class="opinion-item-text">' + escapeHtml(clampOpinion(subject.analysisText || (sw && sw.text) || '')) + '</p>' +
      '</div>';
  }).join('');

  /**
   * 고교 진학 대비 소견. 프롬프트 v2 의 신규 필드이므로 이전에 생성된 보고서에는 없다.
   * 없으면 지면을 만들지 않고, 요약 지면의 목차에서도 빠진다 (빈 지면을 내지 않는다).
   */
  /**
   * AI 소견이 없을 때 쓰는 실데이터 폴백.
   * 문장 안의 영역명·문항수·배점·정답률·참고치·오답 소분류는 모두 이번 채점 결과에서 나온다.
   * 없는 사실을 지어내지 않고, 데이터가 부족하면 그 항목을 만들지 않는다.
   */
  function buildPrepFallback(): any {
    if (!hasQuestionData || categoryRows.length === 0) return null;
    if (rxAreas.length === 0) return null;

    const strongest = categoryRows.slice().sort((a: any, b: any) => b.studentRate - a.studentRate)[0];

    // ---- outlook: 현 약점이 고등 과정에서 어떻게 증폭/완화되는지 (4~6문장) ----
    const parts: string[] = [];
    if (outlook && outlook.measuredGrade) {
      parts.push('금회 검사에서 측정된 ' + outlook.measuredGrade + '등급이 유지되면 고등 진학 후에도 수능 국어 ' +
        outlook.bandLow + ' ~ ' + outlook.bandHigh + '등급대에서 출발하게 됩니다.');
    }
    parts.push('고등 과정의 지문은 금회 검사보다 길고 추상적이며, 한 지문에 딸린 문항 수도 늘어납니다.');
    parts.push('이 조건에서는 지금의 취약 요인이 완화되지 않고 <b>지문 하나당 실점</b>으로 묶여 확대됩니다.');
    const worstRef = catRefOf(rxAreas[0].name);
    parts.push('특히 ' + escapeHtml(rxAreas[0].name) + ' 영역은 측정값 ' + rxAreas[0].studentRate + '%로 ' +
      (worstRef && worstRef.available ? '참고치 ' + refText(worstRef) + ' 아래에 있어' : '전 영역 중 가장 낮아') +
      ', 고등 과정에서 이 영역이 결합된 지문을 만나면 시간 손실이 먼저 발생합니다.');
    if (strongest && strongest.name !== rxAreas[0].name) {
      parts.push('반면 ' + escapeHtml(strongest.name) + ' 영역은 ' + strongest.studentRate +
        '%로 유지 가능한 축이므로, 진학 후에도 이 영역을 점수 방어선으로 삼는 편이 유리합니다.');
    }
    parts.push('진학 전 남은 기간에 취약 영역을 참고치 안으로 올려 두면 고1 첫 학기의 학습 부담이 크게 줄어듭니다.');

    // ---- priorities: 영역마다 근거 + 행동 2개 이상 ----
    const priorities = rxAreas.slice(0, 3).map((c: any) => {
      const ref = catRefOf(c.name);
      const subs = subsOfArea(c.name);
      const gap = ref && ref.available ? (ref.low as number) - c.studentRate : null;
      return {
        area: c.name,
        why: '금회 검사에서 ' + c.name + '은 ' + c.count + '문항 ' + c.points + '점으로 배점 비중이 ' +
          (c.points >= 30 ? '가장 큰 축에 속합니다' : '작지 않습니다') + '. 측정값 ' + c.studentRate + '%는 참고치 ' +
          refText(ref) + (gap !== null && gap > 0 ? ' 하한을 ' + gap + '%p 밑돕니다' : ' 구간 하단입니다') +
          '. 수능 국어에서 이 영역은 매 회 출제되므로 미루면 손실이 누적됩니다.' +
          (subs.length > 0 ? ' 실점은 ' + subs.slice(0, 3).join(', ') + ' 유형에 집중돼 있습니다.' : ''),
        action: '① 진학 전까지 ' +
          (subs.length > 0 ? subs.slice(0, 2).join(', ') + ' 유형' : '이 영역의 기출 유형') +
          '만 따로 모아 주 2회 이상 풀고, 문항마다 정답 근거를 한 문장으로 적게 합니다. ' +
          '② 고1 3월 학력평가 기출에서 같은 영역 문항만 발췌해 시간을 재며 풀어, 지문 길이가 늘었을 때 정답률이 유지되는지 확인합니다. ' +
          '③ 재검사에서 이 영역이 참고치 구간 안으로 들어오는지를 성공 기준으로 삼습니다.',
      };
    });

    // ---- 고1 첫 학기 준비 체크 ----
    const checklist = [
      '취약 영역 ' + rxAreas.map((c: any) => escapeHtml(c.name)).join(', ') + ' 정답률을 참고치 구간 안으로 회복',
      '반복 실점 유형' + (wrongTypeTally.length > 0 ? ' (' + wrongTypeTally.slice(0, 3).map((t) => escapeHtml(t.label)).join(', ') + ')' : '') + ' 재발 여부 점검',
      '고1 3월 학력평가 기출 1회분을 시간 내 완주해 지문 길이 적응 확인',
      '오답을 말로 설명하는 복기 습관을 주 1회 이상 고정',
    ];

    return {
      headline: escapeHtml(rxAreas[0].name) + ' 영역을 상급 과정 진학 전에 참고치 안으로 회복해야 합니다.',
      outlook: parts.join(' '),
      priorities,
      checklist,
      closing: '이 소견은 금회 채점 결과에서 직접 산출한 항목만으로 작성했어요. 상담 때 학습 계획과 함께 자세히 설명해 드릴게요.',
      isFallback: true,
    };
  }

  const prepSource: any = (prep && (prep.headline || prep.outlook ||
    (Array.isArray(prep.priorities) && prep.priorities.length > 0))) ? prep : buildPrepFallback();
  const prepPriorities: any[] = Array.isArray(prepSource?.priorities) ? prepSource.priorities : [];
  const hasPrep = !!(prepSource && (prepSource.headline || prepSource.outlook || prepPriorities.length > 0));

  const prepHTML = !hasPrep ? '' :
    (prepSource.headline ? '<div class="finding"><div class="finding-bar"></div><div>' +
      '<p class="finding-text">' + escapeHtml(String(prepSource.headline)) + '</p>' +
      (prepSource.outlook ? '<p class="finding-sub prep-outlook">' +
        (prepSource.isFallback ? String(prepSource.outlook) : escapeHtml(String(prepSource.outlook))) +
        '</p>' : '') +
      '</div></div>' : '') +
    (prepPriorities.length === 0 ? '' :
      '<ol class="rx-list">' + prepPriorities.map((p: any, i: number) =>
        '<li class="rx-item">' +
        '<span class="rx-no">' + (i + 1) + '</span>' +
        '<div class="rx-body">' +
        '<p class="rx-title"><span class="rx-tag">우선</span>' + escapeHtml(String(p.area || '')) + '</p>' +
        (p.why ? '<p class="rx-text">' +
          (prepSource.isFallback ? String(p.why) : escapeHtml(String(p.why))) + '</p>' : '') +
        (p.action ? '<p class="rx-text rx-action"><b>준비</b> ' +
          (prepSource.isFallback ? String(p.action) : escapeHtml(String(p.action))) + '</p>' : '') +
        '</div></li>').join('') + '</ol>') +
    ((Array.isArray(prepSource.checklist) ? prepSource.checklist : []).length === 0 ? '' :
      '<div class="prep-check"><p class="prep-check-title">고1 첫 학기 준비 점검</p><ul class="prep-check-list">' +
      prepSource.checklist.map((c: any) => '<li>' + String(c) + '</li>').join('') + '</ul></div>') +
    (prepSource.closing ? '<div class="recheck"><p class="recheck-title">맺음말</p>' +
      '<p class="recheck-text">' + escapeHtml(String(prepSource.closing)) + '</p></div>' : '');

  // ===================================================================
  // 7. 지면 조립. 쪽 번호는 조립 순서에서 나오고,
  //    요약 지면의 '상세 N쪽' 참조는 자리표시자로 적었다가 마지막에 치환한다.
  // ===================================================================
  type PageBlock = { title: string; body: string };
  const pageBlocks: PageBlock[] = [];
  const pageRefs: Record<string, number> = {};
  const addPage = (key: string | null, title: string, body: string) => {
    pageBlocks.push({ title, body });
    if (key) pageRefs[key] = pageBlocks.length;
  };
  const ref = (key: string) => '@@PG_' + key + '@@';

  const studentName = escapeHtml(reportData.studentInfo.name);
  // ---------- 1쪽: 표지 · 종합판정 ----------
  addPage(null, '', `
            <div class="doc-band">
                <div>
                    <p class="doc-org">올가교육 수능연구소</p>
                    <h1 class="doc-title">학습 성취 분석 결과통보서</h1>
                    <p class="doc-sub">미리 보는 수능 등급 검사</p>
                    <p class="doc-en">OLGA MOCK SUNEUNG GRADE CHECKUP REPORT</p>
                </div>
                <div class="doc-issue">
                    <p><span>발행 기관</span>올가교육</p>
                    <p><span>발행일</span>${escapeHtml(String(overview?.issuedDate || reportData.studentInfo.date))}</p>
                    <p><span>문서번호</span>${escapeHtml(String(overview?.documentNo || '-'))}</p>
                </div>
            </div>

            <section class="fsection">
                <h2 class="fsection-title">수검자 정보</h2>
                <table class="ptable">
                    <tbody>
                        <tr>
                            <th>성명</th><td>${studentName}</td>
                            <th>학년</th><td>${escapeHtml(reportData.studentInfo.level)}</td>
                            <th>학교</th><td>${escapeHtml(reportData.studentInfo.school)}</td>
                        </tr>
                        <tr>
                            <th>검사명</th><td colspan="3">${escapeHtml(String(overview?.title || '국어 성취도 검사'))}</td>
                            <th>검사일</th><td>${escapeHtml(reportData.studentInfo.date)}</td>
                        </tr>
                        <tr>
                            <th>검사 구성</th><td>${overview ? overview.totalQuestions + '문항 / ' + overview.totalScore + '점' : reportData.scoreSummary.rawScoreMax + '점'}</td>
                            <th>응시 인원</th><td>${overview ? overview.attemptCount + '명' : '-'}</td>
                            <th>석차</th><td>${overview && overview.rank && overview.attemptCount > 1 ? overview.rank + ' / ' + overview.attemptCount : '단독 응시'}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="fsection">
                <h2 class="fsection-title">종합 판정</h2>
                <div class="verdict ${verdict.tone}">
                    <div class="verdict-code">
                        <span class="vc-letter">${verdict.code}</span>
                        <span class="vc-name">${verdict.name}</span>
                    </div>
                    <div class="verdict-body">
                        <p class="verdict-line">
                            <span class="verdict-grade">${reportData.scoreSummary.grade}</span><span class="verdict-gradeunit">등급</span>
                            <span class="verdict-band">판정 기준 ${verdict.band}</span>
                        </p>
                        <p class="verdict-mean">${verdict.meaning}</p>
                    </div>
                </div>
                ${gradeGaugeHTML}
                ${outlookHTML}
                <div class="statrow">
                    <div class="stat"><p class="stat-k">원점수</p><p class="stat-v">${reportData.scoreSummary.rawScore}<span class="stat-u">/${reportData.scoreSummary.rawScoreMax}</span></p></div>
                    <div class="stat"><p class="stat-k">표준점수</p><p class="stat-v">${reportData.scoreSummary.standardScore}</p></div>
                    <div class="stat"><p class="stat-k">백분위</p><p class="stat-v">${reportData.scoreSummary.percentile}<span class="stat-u">%</span></p></div>
                    <div class="stat"><p class="stat-k">전체 정답률</p><p class="stat-v">${overallRate === null ? '-' : overallRate}<span class="stat-u">%</span></p>
                        <p class="stat-ref">참고치 ${refText(overallRef)}</p></div>
                </div>
            </section>

            <section class="fsection-tight">
                <h2 class="fsection-title">경과 관찰 (직전 검사 대비)</h2>
                ${historyHTML}
            </section>

            <p class="doc-guard">이 통보서는 응시 기록과 같은 시험 응시자 집단의 실제 채점 결과로만 작성되었습니다. 참고치는 응시자 ${minSample}명 이상이 모인 항목에서만 산출하며, 표본이 모자란 항목은 '기준 축적 중'으로 표기합니다.</p>`);

  // ---------- 2쪽: 검사 결과 요약 (목차 역할) ----------
  if (hasQuestionData) {
    const abnormalHTML = abnormalCats.length === 0
      ? '<div class="alertbox is-clear"><p class="alert-title">참고치를 벗어난 항목 없음</p>' +
        '<p class="alert-text">' + (referenceReady
          ? '모든 영역이 응시자 평균 구간 안에 있습니다.'
          : '응시자가 ' + (overview ? overview.attemptCount : 0) + '명이라 참고치를 산출하지 못했습니다. 아래 결과는 절대 정답률입니다.') + '</p></div>'
      : '<div class="alertbox"><p class="alert-title">참고치 미달 ' + abnormalCats.length + '개 영역</p>' +
        '<p class="alert-text">' + abnormalCats.map((x) =>
          '<b>' + escapeHtml(x.row.name) + '</b> ' + x.row.studentRate + '% (참고치 ' + refText(x.ref) + ')'
        ).join(' · ') + '</p>' +
        (abnormalDiffs.length > 0
          ? '<p class="alert-text">난이도 ' + abnormalDiffs.map((x) =>
              '<b>' + escapeHtml(x.row.level) + '</b> ' + x.row.studentRate + '% (참고치 ' + refText(x.ref) + ')'
            ).join(' · ') + '</p>'
          : '') +
        '<p class="alert-sub">해당 항목의 상세 결과는 ' + ref('CAT') + ', 권고사항은 ' + ref('RX') + '에 있습니다.</p></div>';

    const excellentHTML = excellentCats.length === 0 ? '' :
      '<div class="alertbox is-good"><p class="alert-title">참고치 초과 ' + excellentCats.length + '개 항목</p>' +
      '<p class="alert-text">' + excellentCats.map((x) =>
        '<b>' + escapeHtml(x.row.name) + '</b> ' + x.row.studentRate + '% (참고치 ' + refText(x.ref) + ')'
      ).join(' · ') + '</p></div>';

    addPage('SUMMARY', '검사 항목별 판정 요약', `
            <p class="form-lead">전 검사 항목의 측정값과 판정을 한 자리에 모았습니다. ${referenceReady
              ? '참고치는 이 시험을 제출한 응시자 ' + overview.attemptCount + '명의 항목별 정답률 분포에서 가운데 80% 구간(제10 ~ 제90 백분위)이며, 그 구간을 벗어난 항목만 기호와 색으로 표시했습니다.'
              : '이 시험을 제출한 응시자가 ' + overview.attemptCount + '명이라 참고치를 산출하지 않았습니다. 참고치는 응시자가 ' + minSample + '명 이상 모인 뒤부터 표시되며, 그때까지 아래 결과는 비교 없이 절대 정답률로만 읽습니다.'}</p>

            <table class="ftable ftable-total">
                <colgroup><col style="width:34%"><col style="width:15%"><col style="width:20%"><col style="width:19%"><col style="width:12%"></colgroup>
                <thead><tr><th>종합 지표</th><th class="ft-num">측정값</th><th class="ft-num">참고치</th><th>판정</th><th class="ft-page">상세</th></tr></thead>
                <tbody>
                    <tr>
                        <td class="ft-item"><span class="ft-chip is-total"></span><span class="ft-item-name">전체 정답률</span><span class="ft-item-sub">${questionRows.length}문항 · ${overview.totalScore}점</span></td>
                        <td class="ft-num ft-result">${rateText(overallRate)}</td>
                        <td class="ft-num ft-ref">${refText(overallRef)}</td>
                        <td class="ft-verdict"><span class="flag ${overallFlag.kind}">${overallFlag.mark ? '<span class="flag-mark">' + overallFlag.mark + '</span>' : ''}${overallFlag.label}</span></td>
                        <td class="ft-page">${ref('BAND')}</td>
                    </tr>
                </tbody>
            </table>

            ${categoryExamTable(ref('OPINION'))}
            ${difficultyExamTable(ref('BAND'))}

            ${abnormalHTML}
            ${excellentHTML}

            <div class="toc">
                <p class="toc-title">상세 분석 지면 안내</p>
                <ul class="toc-list">
                    <li><span class="toc-p">${ref('BAND')}</span>참고범위 밴드 (항목별 위치)</li>
                    <li><span class="toc-p">${ref('OVERVIEW')}</span>검사 대상 구성 · 출제 경향</li>
                    <li><span class="toc-p">${ref('ITEM')}</span>정오 현황과 핵심 오답</li>
                    <li><span class="toc-p">${ref('OPINION')}</span>종합소견</li>
                    ${hasPrep ? `<li><span class="toc-p">${ref('PREP')}</span>고교 진학 대비 소견</li>` : ''}
                    <li><span class="toc-p">${ref('RX')}</span>권고사항</li>
                </ul>
            </div>

            <div class="notice">
                <p class="notice-title">판정 기호 범례</p>
                <div class="notice-grid">
                    <div><span class="flag fl-low"><span class="flag-mark">▼</span>미달</span><span class="notice-text">결과가 참고치 하한보다 낮은 항목</span></div>
                    <div><span class="flag fl-normal">정상</span><span class="notice-text">결과가 참고치 안에 있는 항목</span></div>
                    <div><span class="flag fl-high"><span class="flag-mark">▲</span>우수</span><span class="notice-text">결과가 참고치 상한보다 높은 항목</span></div>
                    <div><span class="flag fl-na">기준 축적 중</span><span class="notice-text">응시자가 ${minSample}명 미만이라 참고치를 내지 않은 항목</span></div>
                </div>
                <p class="notice-foot">판정은 같은 검사를 본 응시자 집단과의 상대 위치이며, 학습 능력 자체에 대한 진단이 아닙니다.</p>
            </div>`);

    // ---------- 참고범위 밴드 ----------
    addPage('BAND', '참고범위 대비 성취 분포', `
            <p class="form-lead">각 항목의 측정값을 참고범위 위의 상대 위치로 표시했습니다. 수치보다 위치가 먼저 읽히도록 조판한 지면입니다.</p>
            ${summaryFinding}
            <section class="fsection">
                <h2 class="fsection-title">종합 성취 수준</h2>
                ${overallBandHTML()}
            </section>
            <section class="fsection">
                <h2 class="fsection-title">영역별 성취 분포</h2>
                ${categoryBandsHTML}
            </section>
            <section class="fsection-tight">
                <h2 class="fsection-title">난이도별 성취 분포</h2>
                ${difficultyBandsHTML}
            </section>
            <div class="zone-legend">
                <div><span class="zk bz-low"></span>미달역 (참고치 하한 미만)</div>
                <div><span class="zk bz-caution"></span>주의역 (참고치 안쪽 아래 1/4)</div>
                <div><span class="zk bz-normal"></span>정상역</div>
                <div><span class="zk bz-high"></span>우수역 (상한 초과)</div>
                <div><span class="zk zk-marker"></span>수검자 위치</div>
            </div>`);

    // ---------- 4쪽: 검사 대상 구성 + 출제 경향과 총평 ----------
    // (영역별 성취 바는 3쪽 참고범위 밴드와 같은 정보라 삭제했다)
    addPage('OVERVIEW', '검사 구성 및 출제 경향 분석', `
            <p class="form-lead">금회 검사에 사용된 문항의 구성입니다. 판정의 근거가 되는 배점과 난이도 분포, 출제 의도를 함께 싣습니다.</p>
            <section class="fsection">
                <h2 class="fsection-title">검사 구성 개요</h2>
                <div class="info-grid">
                    <div><p class="info-label">총 문항</p><p class="info-value">${overview.totalQuestions}<span class="info-unit">문항</span></p></div>
                    <div><p class="info-label">총점</p><p class="info-value">${overview.totalScore}<span class="info-unit">점</span></p></div>
                    <div><p class="info-label">응시자</p><p class="info-value">${overview.attemptCount}<span class="info-unit">명</span></p></div>
                    <div><p class="info-label">출제 영역</p><p class="info-value">${overview.categoryCount}<span class="info-unit">개</span></p></div>
                </div>
            </section>
            <section class="fsection">
                <h2 class="fsection-title">영역별 배점 및 난이도 분포</h2>
                <div class="grid-2">
                    <div class="chart-frame h-32"><canvas id="categoryDonut"></canvas></div>
                    <div class="chart-frame h-32"><canvas id="difficultyBar"></canvas></div>
                </div>
            </section>
            ${trendsHTML ? `<section class="fsection">
                <h2 class="fsection-title">고난도 문항 출제 경향</h2>
                ${trendsHTML}
            </section>` : ''}
            ${overallReview ? `<section class="fsection-tight">
                <h2 class="fsection-title">출제자 총평</h2>
                <div class="review-body">${reviewHTML}</div>
            </section>` : ''}`);

    // ---------- 5쪽: 정오 현황 + 문항별 검사표 ----------
    // (변별 분석 목록은 문항표의 행 표시로 흡수했다)
    // ---------- 5쪽: 상세 검사 결과 (정오 한눈 + 핵심 오답) ----------
    // 전 문항 45행 표와 전체 오답 해설은 지면을 세 장 먹으면서 같은 사실을 반복했다.
    // 정오는 히트맵 하나로 충분하고, 해설은 변별 가치가 큰 오답만 남긴다.
    addPage('ITEM', '문항별 정오 분석', `
            ${heatFinding}
            ${heatmapHTML}
            <div class="omr-legend">
                <div><span class="key" style="background:var(--heat-5); border-color:var(--rule-mid)"></span>정답</div>
                <div><span class="key" style="background:var(--heat-1); border-color:var(--rule-mid)"></span>오답</div>
                <div><span class="key" style="background:transparent; border-color:var(--diff-hi)"></span>난이도 상</div>
                <div><span class="key" style="background:transparent; border-color:var(--diff-mid)"></span>난이도 중</div>
                <div><span class="key" style="background:transparent; border-color:var(--diff-lo)"></span>난이도 하</div>
            </div>

            <section class="fsection">
                <h2 class="fsection-title">주요 오답 문항 정밀 분석</h2>
                <p class="form-note nomargin">오답 ${wrongRows.length}문항 가운데 수능 대비 관점에서 교정 우선순위가 높은 ${keyWrongRows.length}문항입니다. 다수 응시자가 정답한 문항의 실점을 상위에 배치했습니다.</p>
                ${keyWrongHTML}
            </section>

            <p class="form-note">전 문항의 정오·영역·난이도·전체 정답률이 담긴 원자료는 지점 상담 시 제공합니다.</p>`);
  }

  // ---------- 6쪽: 종합소견 (항목별 소견 흡수) ----------
  addPage('OPINION', '종합 진단 소견', `
            <div class="opinion-head ${verdict.tone}">
                <span class="opinion-code">${verdict.code}</span>
                <p class="opinion-line"><b>${verdict.name}</b> · ${reportData.scoreSummary.grade}등급 · 전체 정답률 ${rateText(overallRate)}${overallRef && overallRef.available ? ' (참고치 ' + refText(overallRef) + ')' : ''}</p>
            </div>
            <div class="opinion-body">${escapeHtml(reportData.analysis.olgaSummary)}</div>

            <section class="fsection">
                <h2 class="fsection-title">영역별 진단 소견</h2>
                <div class="opinion-list">${subjectDetailsHTML || '<p class="empty-note">영역별 소견 데이터가 없습니다.</p>'}</div>
            </section>

            <section class="fsection-tight">
                <h2 class="fsection-title">학습 성향 유형</h2>
                <div class="opinion-note">
                    <p class="opinion-note-title">${escapeHtml(reportData.analysis.propensity.typeTitle)}</p>
                    <p class="opinion-note-text">${escapeHtml(reportData.analysis.propensity.typeDescription)}</p>
                </div>
            </section>`);

  // ---------- 7쪽: 고교 진학 대비 소견 (신설) ----------
  if (hasPrep) {
    addPage('PREP', '상급 과정 진학 대비 종합 소견', `
            <p class="form-lead">${escapeHtml(reportData.studentInfo.level)} 시점에서, 고등학교 진학 이후 수능 국어를 어떻게 준비해야 하는지에 대한 소견입니다. 이 학생의 검사 결과에서 확인된 약점 영역을 기준으로 작성했습니다.${prepSource && prepSource.isFallback ? ' 아래 내용은 이번 채점 결과에서 직접 산출한 항목이며, 지도 교사 소견은 상담 시 별도로 제공됩니다.' : ''}</p>
            ${prepHTML}`);
  }

  // ---------- 8쪽: 권고사항 (12주 처치 흡수, 장기 관리 단계표 삭제) ----------
  addPage('RX', '학습 처방 및 관리 권고', `
            <p class="form-lead">진단 소견에서 확인된 취약 요인을 교정 우선순위대로 배열한 학습 처방입니다. 위에서부터 배정하십시오.${enrichmentMode
              ? ' 금회 검사의 오답이 ' + wrongRows.length + '문항으로 적어, 교정 항목만으로는 처방이 얇아집니다. 그래서 이미 확보한 강점과 고난도 대응력을 근거로 <b>심화 과제</b>를 함께 제시합니다.'
              : ''}</p>
            ${adviceHTML}
            <div class="recheck">
                <p class="recheck-title">경과 관찰 및 재검사 계획</p>
                <p class="recheck-text">처치 일정을 마치는 12주 후 동일 형식의 검사를 다시 받아 이번 결과와 비교하십시오. 이번 검사의 전체 정답률 ${rateText(overallRate)}가 다음 검사의 기준선이 되며, 4주 간격 관리 목표는 ${(reportData.charts.predictionData.values || []).join('% → ')}%입니다. 예측된 성적이 아니라 관리 목표입니다.</p>
            </div>`);

  const totalPages = pageBlocks.length;
  const pagesHTML = pageBlocks.map((p, i) => `
        <div class="a4-page">
            ${p.title ? `<div class="page-head">
                <div>
                    <p class="page-head-doc">미수등 · 미리 보는 수능 등급 검사</p>
                    <h2 class="page-head-title">${p.title}</h2>
                </div>
                <div class="page-head-right">
                    <span class="page-head-name">${studentName}</span>
                    <span class="page-head-num">${i + 1} / ${totalPages}</span>
                </div>
            </div>` : ''}
            <div class="page-body">${p.body}</div>
            <div class="page-foot">
                <span>올가교육 수능연구소</span>
                <span>${escapeHtml(String(overview?.documentNo || ''))}</span>
                <span>${i + 1} / ${totalPages}</span>
            </div>
        </div>`).join('')
    .replace(/@@PG_([A-Z]+)@@/g, (_m: string, key: string) =>
      pageRefs[key] ? pageRefs[key] + '쪽' : '-');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>학습 성취 분석 결과통보서 - ${escapeHtml(reportData.studentInfo.name)}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
        /* ==========================================================
           학습 성취 분석 결과통보서 (v4)
           DESIGN.md 10장. 병원 건강검진 결과통보서의 조판 문법을 따른다.
           hex 리터럴은 이 :root 블록에만 존재한다. 이하 모든 규칙은 var() 참조.
           ========================================================== */
        :root {
            /* ---- ① 브랜드 ---- */
            --navy-50:#F4F6FA; --navy-100:#E6EBF4; --navy-200:#C9D4E7; --navy-300:#A3B4D3;
            --navy-400:#7189B5; --navy-500:#4C6595; --navy-600:#354C78; --navy-700:#27395C;
            --navy-800:#1B2942; --navy-900:#131E31; --navy-950:#0C1421;
            --brass-300:#E3C88E; --brass-400:#D4B26A; --brass-500:#C09A4E;
            --brass-600:#A07F3B; --brass-700:#7D622C;

            /* ---- ② 시맨틱 ---- */
            --surface:#FFFFFF;
            --surface-sunken:var(--navy-50);
            --surface-subtle:var(--navy-100);
            --surface-inverse:var(--navy-800);
            --text-primary:var(--navy-900);
            --text-secondary:var(--navy-600);
            --text-tertiary:var(--navy-400);
            --text-on-inverse:#FFFFFF;
            --border:var(--navy-200);
            --border-strong:var(--navy-300);
            --action:var(--navy-800);
            --accent:var(--brass-500);
            --accent-strong:var(--brass-700);
            --shadow-page:0 1px 2px rgba(19,30,49,0.10), 0 10px 26px rgba(19,30,49,0.07);
            --overlay:rgba(19,30,49,0.48);
            --selection:rgba(192,154,78,0.22);

            /* 괘선 */
            --rule-heavy:var(--navy-900);
            --rule-mid:var(--navy-300);
            --rule-hair:var(--navy-200);
            --rule-faint:var(--navy-100);

            /* ---- ③ 기능 (브랜드 독립) ---- */
            --fn-success:#1D7A4C; --fn-success-surface:#E8F4EE; --fn-success-border:#A8D4BE;
            --fn-warning:#8F5A00; --fn-warning-surface:#FBF1DF; --fn-warning-border:#E0C48A;
            --fn-error:#B3261E;   --fn-error-surface:#FCEDEC;   --fn-error-border:#E9B4B0;
            --fn-info:#0F6E7A;    --fn-info-surface:#E6F2F4;    --fn-info-border:#9FCBD2;

            /* ---- 10.5 시각화 팔레트 ---- */
            --cat-1:#1B2942; --cat-2:#146B72; --cat-3:#2C6B4F;
            --cat-4:#B07A1E; --cat-5:#8C2F39; --cat-6:#5A6B87;
            --diff-hi:var(--cat-5); --diff-mid:var(--cat-4); --diff-lo:var(--cat-3);
            --heat-1:#F6DCDE; --heat-2:#FAE7D2; --heat-3:#F3F0DF; --heat-4:#E4F0E2; --heat-5:#D3E7D8;
            --heat-ink-1:#7A2731; --heat-ink-2:#8A5A12; --heat-ink-3:#6B6535;
            --heat-ink-4:#2F5F41; --heat-ink-5:#1F5233;
            --series-1:var(--navy-800); --series-2:var(--navy-600); --series-3:var(--navy-400);
            --series-4:var(--navy-300); --series-5:var(--navy-200); --series-6:var(--navy-100);

            /* ---- 10.6 결과통보서 서식 토큰 (v4) ---- */
            --paper-bg:#E7EAF0;
            --form-line:#C7D0DE;
            --form-line-strong:#7F8FA9;
            --form-head:#EEF1F6;
            --form-zebra:#F8FAFC;
            --form-lead:#F6F8FB;
            --zone-low:#F7DFDF; --zone-caution:#FAEEDA;
            --zone-normal:#E6F0E9; --zone-high:#D2E6D9; --zone-none:#EDEFF4;

            --font-sans:'Pretendard Variable',Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
        }

        * { margin:0; padding:0; box-sizing:border-box; }

        body {
            font-family: var(--font-sans);
            background: var(--paper-bg);
            color: var(--text-primary);
            font-feature-settings: 'tnum' 1;
            font-variant-numeric: tabular-nums;
            word-break: keep-all;
            line-height: 1.6;
            padding: 26px 0 40px;
            -webkit-font-smoothing: antialiased;
        }
        ::selection { background: var(--selection); }
        :focus-visible { outline: 2px solid var(--action); outline-offset: 3px; }

        /* ==================== 지면 ==================== */
        .a4-page {
            width: 794px;
            height: 1123px;
            margin: 0 auto 22px;
            padding: 34px 40px 26px;
            background: var(--surface);
            border: 1px solid var(--form-line);
            box-shadow: var(--shadow-page);
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .page-body { flex: 1 1 auto; min-height: 0; }
        /* 표지의 고지문은 서식지처럼 지면 맨 아래에 붙인다 */
        .page-body:has(.doc-guard) { display: flex; flex-direction: column; }

        /* 러닝헤드: 문서명 + 지면 제목 + 수검자 + 쪽 */
        .page-head {
            display: flex; align-items: flex-end; justify-content: space-between;
            padding-bottom: 9px; margin-bottom: 16px;
            border-bottom: 2px solid var(--rule-heavy);
        }
        .page-head-doc {
            margin: 0 0 3px; font-size: 8.5px; font-weight: 700;
            letter-spacing: 0.16em; color: var(--text-tertiary);
        }
        .page-head-title { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.03em; color: var(--text-primary); }
        .page-head-right { display: flex; align-items: center; gap: 10px; }
        .page-head-name { font-size: 10.5px; font-weight: 700; color: var(--text-secondary); }
        .page-head-num {
            font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-on-inverse);
            background: var(--surface-inverse); border-radius: 999px; padding: 3px 9px;
        }
        .page-foot {
            flex-shrink: 0; margin-top: 14px; padding-top: 8px;
            border-top: 1px solid var(--rule-faint);
            display: flex; justify-content: space-between;
            font-size: 8.5px; letter-spacing: 0.08em; color: var(--text-tertiary);
        }

        /* ==================== 표지 문서 헤더 ==================== */
        .doc-band {
            background: var(--surface-inverse); color: var(--text-on-inverse);
            padding: 22px 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px;
        }
        .doc-org { margin: 0 0 7px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.2em; color: var(--navy-200); }
        .doc-title { margin: 0; font-size: 27px; font-weight: 800; letter-spacing: -0.045em; line-height: 1.15; }
        .doc-en { margin: 7px 0 0; font-size: 8.5px; font-weight: 600; letter-spacing: 0.16em; color: var(--navy-300); }
        .doc-issue { flex-shrink: 0; text-align: right; }
        .doc-issue p { margin: 0 0 4px; font-size: 9.5px; font-weight: 600; color: var(--navy-100); }
        .doc-issue p:last-child { margin-bottom: 0; }
        .doc-issue span {
            display: inline-block; min-width: 52px; margin-right: 8px;
            font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--navy-300);
        }
        .doc-sub {
            margin: 7px 0 0; font-size: 13px; font-weight: 700; letter-spacing: -0.01em;
            color: var(--brass-400);
        }

        /* 예상 수능 등급 (측정 등급을 수능 척도로 옮긴 구간) */
        .outlook {
            display: flex; align-items: stretch; margin-top: 8px;
            border: 1px solid var(--form-line-strong); background: var(--form-head);
        }
        .outlook-key {
            flex-shrink: 0; width: 176px; padding: 9px 12px;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            background: var(--surface-inverse); color: var(--text-on-inverse);
        }
        .outlook-label { margin: 0 0 5px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--navy-200); }
        .outlook-band { margin: 0; font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; color: var(--brass-400); }
        .outlook-tilde { margin: 0 3px; font-size: 20px; font-weight: 600; color: var(--navy-200); }
        .outlook-unit { margin-left: 3px; font-size: 12px; font-weight: 700; color: var(--navy-200); }
        .outlook-body { flex: 1; padding: 9px 14px; }
        .outlook-lead { margin: 0 0 5px; font-size: 12px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); }
        .outlook-lead em { font-style: normal; color: var(--accent-strong); }
        .outlook-basis { margin: 0 0 4px; font-size: 9.5px; color: var(--text-secondary); }
        .outlook-caveat { margin: 0; font-size: 9px; color: var(--text-tertiary); }

        /* 핵심 오답 */
        .kw-list { display: flex; flex-direction: column; gap: 7px; }
        .kw-item { border: 1px solid var(--form-line); border-left: 3px solid var(--fn-error); padding: 8px 11px; }
        .kw-head { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 4px; }
        .kw-num { font-size: 12px; font-weight: 800; color: var(--text-primary); }
        .kw-tag {
            padding: 1px 7px; border: 1px solid var(--form-line);
            font-size: 8.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-secondary);
        }
        .kw-tag.is-miss { color: var(--fn-error); border-color: var(--fn-error-border); background: var(--fn-error-surface); }
        .kw-tag.is-hard { color: var(--fn-warning); border-color: var(--fn-warning-border); background: var(--fn-warning-surface); }
        .kw-meta { font-size: 9px; color: var(--text-tertiary); }
        .kw-rate { margin-left: auto; font-size: 9.5px; font-weight: 700; padding: 1px 6px; }
        .kw-answer { margin: 0 0 3px; font-size: 9.5px; font-weight: 700; color: var(--action); }
        .kw-text { margin: 0; font-size: 9.5px; line-height: 1.7; color: var(--text-secondary); }

        .prep-check { margin-top: 12px; border: 1px solid var(--form-line); background: var(--form-head); padding: 14px 16px; }
        .prep-check-title { margin: 0 0 6px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.1em; color: var(--text-tertiary); }
        .prep-check-list { list-style: none; display: grid; gap: 4px; }
        .prep-check-list li { position: relative; padding-left: 16px; font-size: 10.5px; line-height: 1.85; color: var(--text-secondary); }
        .prep-check-list li::before {
            content: ''; position: absolute; left: 0; top: 4px;
            width: 9px; height: 9px; border: 1px solid var(--form-line-strong);
        }

        .rx-action { margin-top: 4px; color: var(--text-primary); }
        .rx-action b { font-weight: 800; margin-right: 5px; color: var(--action); }

        .doc-guard {
            margin-top: auto; padding-top: 12px;
            font-size: 9px; line-height: 1.65; color: var(--text-tertiary);
            border-top: 1px dashed var(--form-line);
        }

        /* ==================== 서식 섹션 ==================== */
        .fsection { margin-top: 18px; }
        .fsection-tight { margin-top: 16px; }
        .fsection-title {
            margin: 0 0 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
            color: var(--text-primary); padding-left: 8px; border-left: 3px solid var(--action);
            line-height: 1.35;
        }
        .form-lead {
            margin: 0 0 12px; padding: 9px 12px; background: var(--form-lead);
            border: 1px solid var(--form-line); font-size: 10px; line-height: 1.7; color: var(--text-secondary);
        }
        .form-note { margin: 8px 0 0; font-size: 9px; line-height: 1.6; color: var(--text-tertiary); }
        .form-note.nomargin { margin: 0 0 8px; }
        .empty-note { padding: 12px; font-size: 10px; color: var(--text-tertiary); background: var(--form-head); border: 1px solid var(--form-line); }

        /* ==================== 수검자 정보표 ==================== */
        .ptable { width: 100%; border-collapse: collapse; border: 1px solid var(--form-line-strong); }
        .ptable th, .ptable td { border: 1px solid var(--form-line); padding: 8px 10px; text-align: left; }
        .ptable th {
            width: 76px; background: var(--form-head); font-size: 9.5px; font-weight: 700;
            letter-spacing: 0.06em; color: var(--text-secondary); white-space: nowrap;
        }
        .ptable td { font-size: 11.5px; font-weight: 600; color: var(--text-primary); }

        /* ==================== 종합판정 ==================== */
        .verdict {
            display: flex; align-items: stretch; gap: 0;
            border: 1px solid var(--form-line-strong); border-left-width: 1px;
        }
        .verdict-code {
            flex-shrink: 0; width: 108px; padding: 14px 10px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border-right: 1px solid var(--form-line-strong);
        }
        .vc-letter { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; }
        .vc-name { margin-top: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
        .verdict-body { padding: 14px 16px; flex: 1; }
        .verdict-line { margin: 0 0 7px; display: flex; align-items: baseline; gap: 4px; }
        /* 브라스 1/1: 이 지면에서 성취를 나타내는 유일한 수치가 등급이다 (DESIGN.md 1.3) */
        .verdict-grade { font-size: 34px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; color: var(--accent-strong); }
        .verdict-gradeunit { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
        .verdict-band {
            margin-left: 10px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
            color: var(--text-tertiary); border: 1px solid var(--form-line); padding: 2px 7px;
        }
        .verdict-mean { margin: 0; font-size: 10.5px; line-height: 1.7; color: var(--text-secondary); }

        .vd-a .verdict-code { background: var(--fn-success-surface); color: var(--fn-success); }
        .vd-b .verdict-code { background: var(--fn-info-surface); color: var(--fn-info); }
        .vd-c .verdict-code { background: var(--surface-subtle); color: var(--text-secondary); }
        .vd-r .verdict-code { background: var(--fn-warning-surface); color: var(--fn-warning); }

        /* 등급 척도 (판정 구간을 머리에 통합) */
        .ggauge { margin-top: 10px; }
        .ggauge-head { display: grid; grid-template-columns: repeat(9, 1fr); gap: 0; }
        .gg-band {
            display: flex; align-items: baseline; gap: 5px; padding: 5px 8px;
            border: 1px solid var(--form-line); border-bottom: 0;
            font-size: 9px; color: var(--text-tertiary); overflow: hidden; white-space: nowrap;
        }
        .gg-band + .gg-band { border-left: 0; }
        .gg-code { font-size: 11.5px; font-weight: 800; }
        .gg-name { font-weight: 700; color: var(--text-secondary); }
        .gg-range { margin-left: auto; font-size: 8px; }
        .gg-band.is-current { background: var(--form-head); border-color: var(--form-line-strong); }
        .gg-band.is-current .gg-name { color: var(--text-primary); }
        .gg-band.vd-a .gg-code { color: var(--fn-success); }
        .gg-band.vd-b .gg-code { color: var(--fn-info); }
        .gg-band.vd-c .gg-code { color: var(--text-secondary); }
        .gg-band.vd-r .gg-code { color: var(--fn-warning); }
        .ggauge-track { display: grid; grid-template-columns: repeat(9, 1fr); border: 1px solid var(--form-line-strong); }
        .gg-seg {
            position: relative; height: 34px; border-right: 1px solid var(--form-line);
            display: flex; align-items: center; justify-content: center; padding-bottom: 6px;
            font-size: 11px; font-weight: 700; color: var(--text-secondary);
        }
        .gg-seg:last-child { border-right: 0; }
        .gg-seg.vd-a { background: var(--fn-success-surface); }
        .gg-seg.vd-b { background: var(--fn-info-surface); }
        .gg-seg.vd-c { background: var(--surface-subtle); }
        .gg-seg.vd-r { background: var(--fn-warning-surface); }
        .gg-seg.is-me { background: var(--surface-inverse); }
        .gg-seg.is-me .gg-g { color: var(--text-on-inverse); font-size: 14px; font-weight: 800; }
        /* 수검자 표시는 칸 안에 넣는다. 칸 위는 판정 구간 머리가 쓰고 있다. */
        .gg-me {
            position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
            font-size: 7.5px; font-weight: 700; letter-spacing: 0.04em;
            color: var(--text-on-inverse); white-space: nowrap;
        }
        .gg-foot { display: flex; justify-content: space-between; margin-top: 5px; font-size: 8.5px; color: var(--text-tertiary); }

        .statrow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; }
        .stat { border: 1px solid var(--form-line); padding: 9px 11px; background: var(--form-head); }
        .stat-k { margin: 0 0 5px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--text-tertiary); }
        .stat-v { margin: 0; font-size: 21px; font-weight: 800; line-height: 1; letter-spacing: -0.035em; color: var(--text-primary); }
        .stat-u { font-size: 10px; font-weight: 600; letter-spacing: 0; color: var(--text-tertiary); margin-left: 2px; }
        .stat-ref { margin: 5px 0 0; font-size: 8.5px; color: var(--text-tertiary); }

        /* ==================== 검사표 ==================== */
        .ftable { width: 100%; border-collapse: collapse; border: 1px solid var(--form-line-strong); margin-bottom: 12px; }
        .ft-caption {
            caption-side: top; text-align: left; padding: 0 0 5px;
            font-size: 10px; font-weight: 800; letter-spacing: 0.04em; color: var(--text-secondary);
        }
        .ftable th {
            background: var(--form-head); border: 1px solid var(--form-line);
            padding: 7px 9px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
            color: var(--text-secondary); text-align: left; white-space: nowrap;
        }
        .ftable td { border: 1px solid var(--form-line); padding: 7px 9px; font-size: 10.5px; vertical-align: middle; }
        .ftable tbody tr:nth-child(even) { background: var(--form-zebra); }
        .ft-item { white-space: nowrap; }
        .ft-chip { display: inline-block; width: 8px; height: 8px; margin-right: 7px; vertical-align: -1px; }
        .ft-chip.is-total { background: var(--action); }
        .ft-item-name { font-weight: 700; color: var(--text-primary); }
        .ft-item-sub { margin-left: 8px; font-size: 9px; font-weight: 500; color: var(--text-tertiary); }
        .ft-num { text-align: right; white-space: nowrap; }
        th.ft-num { text-align: right; }
        .ft-result { font-size: 12.5px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); }
        .ft-ref { font-size: 10px; color: var(--text-secondary); }
        .ft-verdict { white-space: nowrap; }
        .ft-page, th.ft-page { text-align: right; font-size: 9.5px; color: var(--text-tertiary); white-space: nowrap; }
        .ft-small { font-size: 10px; line-height: 1.6; color: var(--text-secondary); }
        .ft-strong { font-size: 10.5px; font-weight: 700; color: var(--text-primary); }
        .ftable-total { margin-bottom: 14px; }
        .ftable-total td { padding: 9px; }
        .ftable-trend td { padding: 8px 9px; }
        .ftable-plan td { vertical-align: top; }

        /* 판정 플래그 (검진지의 H / L) */
        .flag {
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 9.5px; font-weight: 700; letter-spacing: 0.02em;
            padding: 2px 8px; border: 1px solid var(--form-line); background: var(--surface);
            color: var(--text-secondary); white-space: nowrap;
        }
        .flag-mark { font-size: 9px; line-height: 1; }
        .fl-high { color: var(--fn-success); border-color: var(--fn-success-border); background: var(--fn-success-surface); }
        .fl-low { color: var(--fn-error); border-color: var(--fn-error-border); background: var(--fn-error-surface); }
        .fl-normal { color: var(--text-secondary); }
        .fl-na { color: var(--text-tertiary); border-style: dashed; }

        /* 추이 변화량 */
        .dl { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 700; }
        .dl-mark { font-size: 9px; }
        .dl-up { color: var(--fn-success); }
        .dl-down { color: var(--fn-error); }
        .dl-flat, .dl-na { color: var(--text-tertiary); font-weight: 600; }

        /* ==================== 이상 항목 하이라이트 ==================== */
        .alertbox {
            border: 1px solid var(--fn-error-border); border-left: 4px solid var(--fn-error);
            background: var(--fn-error-surface); padding: 10px 13px; margin-bottom: 10px;
        }
        .alertbox.is-clear { border-color: var(--fn-success-border); border-left-color: var(--fn-success); background: var(--fn-success-surface); }
        .alertbox.is-good { border-color: var(--fn-success-border); border-left-color: var(--fn-success); background: var(--fn-success-surface); }
        .alert-title { margin: 0 0 4px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.02em; color: var(--text-primary); }
        .alert-text { margin: 0; font-size: 10px; line-height: 1.7; color: var(--text-secondary); }
        .alert-sub { margin: 5px 0 0; font-size: 9px; color: var(--text-tertiary); }

        /* 목차 */
        .toc { margin-top: 14px; border: 1px solid var(--form-line); background: var(--form-head); padding: 11px 14px; }
        .toc-title { margin: 0 0 7px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; color: var(--text-tertiary); }
        .toc-list { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
        .toc-list li { font-size: 10px; color: var(--text-secondary); display: flex; gap: 9px; align-items: baseline; }
        .toc-p { flex-shrink: 0; width: 30px; text-align: right; font-weight: 800; color: var(--text-primary); }

        /* 판정 기호 안내 */
        .notice { margin-top: 12px; border: 1px solid var(--form-line); padding: 11px 14px; }
        .notice-title { margin: 0 0 8px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; color: var(--text-tertiary); }
        .notice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
        .notice-grid > div { display: flex; align-items: center; gap: 9px; }
        .notice-grid .flag { flex-shrink: 0; min-width: 74px; justify-content: center; }
        .notice-text { font-size: 9.5px; color: var(--text-secondary); }
        .notice-foot { margin: 9px 0 0; font-size: 9px; color: var(--text-tertiary); }

        /* ==================== 참고범위 밴드 ==================== */
        .band { margin-bottom: 8px; }
        .band-head { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
        .band-chip { width: 8px; height: 8px; flex-shrink: 0; }
        .band-name { font-size: 11px; font-weight: 700; color: var(--text-primary); }
        .band-sub { font-size: 9px; color: var(--text-tertiary); }
        .band-head .flag { margin-left: auto; }
        .band-track {
            position: relative; height: 16px; margin-top: 15px;
            border: 1px solid var(--form-line);
            background: var(--zone-none); overflow: visible;
        }
        .bz { position: absolute; top: 0; bottom: 0; }
        .bz-low { background: var(--zone-low); }
        .bz-caution { background: var(--zone-caution); }
        .bz-normal { background: var(--zone-normal); }
        .bz-high { background: var(--zone-high); }
        .bz-none { background: var(--zone-none); }
        .bz-edge { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--form-line-strong); }
        .band-marker {
            position: absolute; top: -4px; bottom: -4px; width: 2px;
            background: var(--text-primary); transform: translateX(-1px);
        }
        /* 수치는 눈금 위에 띄운다. 눈금 안에 두면 구역 색을 가린다. */
        .band-value {
            position: absolute; top: -16px; transform: translateX(-50%);
            font-size: 9.5px; font-weight: 800; color: var(--text-on-inverse);
            background: var(--surface-inverse); padding: 1px 6px; white-space: nowrap;
        }
        .band-foot {
            display: flex; justify-content: space-between; align-items: baseline;
            margin-top: 4px; font-size: 8.5px; color: var(--text-tertiary);
        }
        .band-refnote { font-weight: 600; color: var(--text-secondary); }
        .zone-legend {
            display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px;
            padding: 8px 12px; border: 1px solid var(--form-line); background: var(--form-head);
            font-size: 9px; color: var(--text-secondary);
        }
        .zone-legend div { display: flex; align-items: center; gap: 6px; }
        .zk { width: 16px; height: 9px; border: 1px solid var(--form-line); }
        .zk-marker { width: 2px; height: 12px; background: var(--text-primary); border: 0; }

        /* ==================== 소견 블록 ==================== */
        .finding {
            display: flex; gap: 10px; align-items: stretch;
            border: 1px solid var(--form-line); background: var(--form-lead);
            padding: 10px 13px 10px 0; margin-bottom: 12px;
        }
        .finding-bar { width: 3px; flex-shrink: 0; background: var(--action); margin-left: -1px; }
        .finding-text { margin: 0; font-size: 12.5px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.5; color: var(--text-primary); }
        .finding-text em { font-style: normal; color: var(--action); }
        .finding-text b { font-weight: 800; }
        .finding-sub { margin: 4px 0 0; font-size: 9.5px; color: var(--text-secondary); }
        /* 진학 대비 소견의 전망 문단만 본문 크기로 키운다 (지면 하나 전용) */
        .prep-outlook { font-size: 10.5px; line-height: 1.85; }

        /* ==================== 개요 그리드 ==================== */
        .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .info-grid > div { border: 1px solid var(--form-line); background: var(--form-head); padding: 9px 11px; }
        .info-label { margin: 0 0 5px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--text-tertiary); }
        .info-value { margin: 0; font-size: 19px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; color: var(--text-primary); }
        .info-unit { font-size: 10px; font-weight: 600; color: var(--text-tertiary); margin-left: 2px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        /* ==================== 도판 ==================== */
        .chart-frame { position: relative; width: 100%; border: 1px solid var(--form-line); padding: 10px; }
        .h-32 { height: 128px; } .h-36 { height: 172px; } .h-40 { height: 190px; } .h-48 { height: 232px; }
        .h-56 { height: 268px; } .h-60 { height: 286px; }

        /* ==================== 정오 히트맵 ==================== */
        .omr { display: grid; grid-template-columns: repeat(15, 1fr); gap: 5px; }
        .omr-cell {
            aspect-ratio: 1 / 1; border: 2px solid var(--rule-mid);
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        }
        .omr-o { background: var(--heat-5); }
        .omr-x { background: var(--heat-1); }
        .omr-num { font-size: 8px; font-weight: 600; line-height: 1; color: var(--text-tertiary); }
        .omr-mark { font-size: 12px; font-weight: 800; line-height: 1; }
        .omr-o .omr-mark { color: var(--heat-ink-5); }
        .omr-x .omr-mark { color: var(--heat-ink-1); }
        .omr-legend {
            display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 11px;
            padding: 8px 11px; border: 1px solid var(--form-line); background: var(--form-head);
            font-size: 9px; color: var(--text-secondary);
        }
        .omr-legend div { display: flex; align-items: center; gap: 6px; }
        .omr-legend .key { width: 13px; height: 13px; border: 2px solid var(--rule-mid); flex-shrink: 0; }

        /* ==================== 영역 성취 바 ==================== */
        .catbars { display: flex; flex-direction: column; gap: 9px; }
        .catbar-head { display: flex; align-items: baseline; gap: 7px; margin-bottom: 4px; }
        .cat-chip { width: 8px; height: 8px; flex-shrink: 0; }
        .catbar-name { font-size: 10.5px; font-weight: 700; color: var(--text-primary); }
        .catbar-meta { font-size: 8.5px; color: var(--text-tertiary); }
        .catbar-val { margin-left: auto; font-size: 11.5px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); }
        .catbar-track { position: relative; height: 9px; background: var(--form-head); border: 1px solid var(--form-line); }
        .catbar-fill { position: absolute; top: 0; bottom: 0; left: 0; }
        .catbar-avg { position: absolute; top: -3px; bottom: -3px; width: 1.5px; background: var(--text-primary); }
        .catbar-note { margin: 9px 0 0; font-size: 8.5px; color: var(--text-tertiary); display: flex; align-items: center; gap: 6px; }
        .avgkey { display: inline-block; width: 1.5px; height: 11px; background: var(--text-primary); flex-shrink: 0; }

        /* ==================== 문항 표 ==================== */
        .qtable-split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .qtable { width: 100%; border-collapse: collapse; border: 1px solid var(--form-line-strong); }
        .qtable th {
            background: var(--form-head); border: 1px solid var(--form-line); padding: 5px 4px;
            font-size: 8.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-secondary);
        }
        .qtable td { border: 1px solid var(--form-line); padding: 4px; font-size: 8.5px; color: var(--text-secondary); }
        .qtable tbody tr:nth-child(even) { background: var(--form-zebra); }
        .c-num { text-align: center; font-weight: 700; color: var(--text-primary); }
        .c-mid { text-align: center; }
        .c-rate { text-align: center; font-weight: 700; }
        .c-cat { white-space: nowrap; }
        .c-type { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-dot { display: inline-block; width: 6px; height: 6px; margin-right: 4px; vertical-align: 0; }
        .dbadge { display: inline-block; border: 1px solid; padding: 0 4px; font-size: 8px; font-weight: 700; }
        .ox { font-weight: 800; font-size: 10px; }
        .ox-o { color: var(--heat-ink-5); }
        .ox-x { color: var(--fn-error); }
        .heat-1 { background: var(--heat-1); color: var(--heat-ink-1); }
        .heat-2 { background: var(--heat-2); color: var(--heat-ink-2); }
        .heat-3 { background: var(--heat-3); color: var(--heat-ink-3); }
        .heat-4 { background: var(--heat-4); color: var(--heat-ink-4); }
        .heat-5 { background: var(--heat-5); color: var(--heat-ink-5); }
        .heat-na { color: var(--text-tertiary); }
        /* 변별 표시 (기준 대비 실점 / 강점 근거) */
        .qmark {
            display: inline-block; margin-left: 3px; width: 10px; height: 10px; line-height: 10px;
            text-align: center; font-size: 8px; font-weight: 800; vertical-align: 1px;
        }
        .qm-miss { color: var(--fn-error); border: 1px solid var(--fn-error-border); background: var(--fn-error-surface); }
        .qm-won { color: var(--fn-success); border: 1px solid var(--fn-success-border); background: var(--fn-success-surface); }
        .qtable tr.is-miss .c-num { box-shadow: inset 2px 0 0 var(--fn-error); }
        .qtable tr.is-won .c-num { box-shadow: inset 2px 0 0 var(--fn-success); }
        .omr-legend .qmark { margin-left: 0; }

        .heat-legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 8.5px; color: var(--text-tertiary); }
        .heat-legend .lab-right { margin-left: auto; }
        .heat-legend i { width: 26px; height: 9px; display: inline-block; }
        .heat-legend .lab { margin: 0 5px; }

        /* ==================== 출제 경향 / 총평 ==================== */
        .trend-item { border-top: 1px solid var(--form-line); padding: 7px 0; }
        .trend-item:last-child { border-bottom: 1px solid var(--form-line); }
        .trend-q { margin: 0 0 3px; font-size: 10px; font-weight: 800; letter-spacing: 0.02em; color: var(--action); }
        .trend-d { margin: 0; font-size: 10px; line-height: 1.65; color: var(--text-secondary); }
        .review-body { border: 1px solid var(--form-line); background: var(--form-lead); padding: 10px 13px; }
        .review-head { margin: 11px 0 5px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.02em; color: var(--text-primary); }
        .review-head:first-child { margin-top: 0; }
        .review-para { margin: 0 0 5px; font-size: 10px; line-height: 1.7; color: var(--text-secondary); }
        .review-para:last-child { margin-bottom: 0; }

        /* ==================== 변별 ==================== */
        .disc-panel { border: 1px solid var(--form-line); }
        .disc-list { list-style: none; }
        .disc-title { margin: 0 0 5px; font-size: 10.5px; font-weight: 800; color: var(--text-primary); }
        .disc-item {
            display: flex; align-items: baseline; gap: 9px; padding: 7px 11px;
            border-bottom: 1px solid var(--form-line); font-size: 10px; color: var(--text-secondary);
        }
        .disc-item:last-child { border-bottom: 0; }
        .disc-item:nth-child(even) { background: var(--form-zebra); }
        .disc-num { font-weight: 800; color: var(--text-primary); min-width: 34px; }
        .disc-rate { margin-left: auto; font-weight: 700; }
        .disc-item.miss .disc-rate { color: var(--fn-error); }
        .disc-item.won .disc-rate { color: var(--fn-success); }

        /* ==================== 오답 해설 ==================== */
        .wrong-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .wrong-item { border: 1px solid var(--form-line); border-top: 2px solid var(--fn-error); padding: 7px 10px; }
        .wrong-head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; margin-bottom: 5px; }
        .wrong-num { font-size: 11.5px; font-weight: 800; color: var(--text-primary); }
        .wrong-meta { font-size: 8.5px; color: var(--text-tertiary); }
        .wrong-rate { margin-left: auto; font-size: 8.5px; font-weight: 700; color: var(--text-secondary); }
        .wrong-answer { margin: 0 0 4px; font-size: 9px; font-weight: 700; color: var(--action); }
        .wrong-text { margin: 0; font-size: 9px; line-height: 1.6; color: var(--text-secondary); }

        /* ==================== 영역별 소견 ==================== */
        .subject-item { border: 1px solid var(--form-line); padding: 14px 16px; }
        .subject-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .subject-name { margin: 0; font-size: 12.5px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); }
        .subject-head .flag { margin-left: auto; }
        .subject-score { font-size: 14px; font-weight: 800; letter-spacing: -0.03em; color: var(--text-primary); }
        .subject-scoretext { margin: 0 0 8px; font-size: 9px; color: var(--text-tertiary); }
        .meter { width: 100%; height: 5px; background: var(--form-head); border: 1px solid var(--form-line); margin-bottom: 9px; }
        .meter-fill { height: 100%; background: var(--text-tertiary); }
        .is-excellent .meter-fill { background: var(--fn-success); }
        .is-good .meter-fill { background: var(--fn-info); }
        .is-fair .meter-fill { background: var(--text-tertiary); }
        .is-weak .meter-fill { background: var(--fn-warning); }
        .subject-body { font-size: 10.5px; line-height: 1.85; color: var(--text-secondary); }
        .analysis-label { margin: 0 0 3px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.12em; color: var(--text-tertiary); }
        .analysis-text { margin: 0; }

        /* ==================== 강약점 ==================== */
        .sw-col-title { margin: 0 0 8px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.04em; color: var(--fn-success); }
        .sw-col-title.is-weak-title { color: var(--fn-warning); }
        .sw-stack { display: flex; flex-direction: column; gap: 8px; }
        .sw-item { border: 1px solid var(--form-line); border-left: 3px solid var(--fn-success); padding: 10px 13px; }
        .sw-item.is-weak-item { border-left-color: var(--fn-warning); }
        .sw-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
        .sw-name { margin: 0; font-size: 11px; font-weight: 800; color: var(--text-primary); }
        .sw-score { margin-left: auto; font-size: 12px; font-weight: 800; color: var(--fn-success); }
        .sw-score.is-weak-score { color: var(--fn-warning); }
        .sw-body { font-size: 10px; line-height: 1.8; color: var(--text-secondary); }
        .sw-body .analysis-label { color: var(--fn-success); }
        .sw-body .is-weak-label { color: var(--fn-warning); }

        /* ==================== 종합소견 ==================== */
        .opinion-head { display: flex; align-items: center; gap: 12px; border: 1px solid var(--form-line-strong); padding: 8px 13px; }
        .opinion-code { font-size: 24px; font-weight: 800; line-height: 1; letter-spacing: -0.04em; }
        .vd-a.opinion-head { background: var(--fn-success-surface); }
        .vd-a.opinion-head .opinion-code { color: var(--fn-success); }
        .vd-b.opinion-head { background: var(--fn-info-surface); }
        .vd-b.opinion-head .opinion-code { color: var(--fn-info); }
        .vd-c.opinion-head { background: var(--surface-subtle); }
        .vd-c.opinion-head .opinion-code { color: var(--text-secondary); }
        .vd-r.opinion-head { background: var(--fn-warning-surface); }
        .vd-r.opinion-head .opinion-code { color: var(--fn-warning); }
        .opinion-line { margin: 0; font-size: 11px; color: var(--text-secondary); }
        .opinion-line b { font-size: 12.5px; font-weight: 800; color: var(--text-primary); }
        .opinion-body {
            margin-top: 8px; border: 1px solid var(--form-line); padding: 10px 13px;
            font-size: 10.5px; line-height: 1.75; color: var(--text-secondary); white-space: pre-line;
        }
        .opinion-list { border-top: 1px solid var(--form-line-strong); }
        .opinion-item { padding: 6px 2px; border-bottom: 1px solid var(--form-line); }
        .opinion-item-head { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
        .opinion-item-name { margin: 0; font-size: 11.5px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); }
        .opinion-item-score { margin-left: auto; font-size: 12px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-primary); }
        .op-tag {
            padding: 1px 6px; border: 1px solid var(--form-line);
            font-size: 8.5px; font-weight: 700; letter-spacing: 0.04em;
        }
        .op-tag.is-strong { color: var(--fn-success); border-color: var(--fn-success-border); background: var(--fn-success-surface); }
        .op-tag.is-weak { color: var(--fn-warning); border-color: var(--fn-warning-border); background: var(--fn-warning-surface); }
        .opinion-item-text { margin: 0; font-size: 9.5px; line-height: 1.7; color: var(--text-secondary); }

        .opinion-note { border: 1px solid var(--form-line); background: var(--form-lead); padding: 11px 13px; }
        .opinion-note-title { margin: 0 0 5px; font-size: 11.5px; font-weight: 800; color: var(--text-primary); }
        .opinion-note-text { margin: 0; font-size: 10px; line-height: 1.75; color: var(--text-secondary); }

        /* ==================== 권고사항 (처방) ==================== */
        .rx-list { list-style: none; border-top: 1px solid var(--form-line-strong); }
        .rx-item { display: flex; gap: 12px; padding: 11px 2px; border-bottom: 1px solid var(--form-line); }
        .rx-no {
            flex-shrink: 0; width: 20px; height: 20px; border: 1px solid var(--form-line-strong);
            display: flex; align-items: center; justify-content: center;
            font-size: 10.5px; font-weight: 800; color: var(--text-primary);
        }
        .rx-body { flex: 1; }
        .rx-title { margin: 0 0 3px; font-size: 11px; font-weight: 800; letter-spacing: -0.01em; color: var(--text-primary); }
        .rx-tag {
            display: inline-block; margin-right: 8px; padding: 1px 7px;
            border: 1px solid var(--form-line); background: var(--form-head);
            font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em; color: var(--text-secondary);
            vertical-align: 1.5px;
        }
        .rx-text { margin: 0; font-size: 10.5px; line-height: 1.78; color: var(--text-secondary); }
        .recheck { margin-top: 10px; border: 1px solid var(--form-line-strong); background: var(--form-head); padding: 10px 13px; }
        .recheck-title { margin: 0 0 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: var(--text-tertiary); }
        .recheck-text { margin: 0; font-size: 10.5px; line-height: 1.75; color: var(--text-secondary); }

        /* ==================== PDF 버튼 ==================== */
        .pdf-download-button {
            position: fixed; bottom: 26px; right: 26px; z-index: 1000;
            display: inline-flex; align-items: center; gap: 8px;
            min-height: 44px; padding: 0 20px;
            background: var(--action); color: var(--text-on-inverse);
            border: 0; font-family: inherit; font-size: 13px; font-weight: 700;
            cursor: pointer; box-shadow: var(--shadow-page);
            transition: background-color 150ms ease-out;
        }
        .pdf-download-button:hover { background: var(--navy-700); }
        .pdf-download-button svg { width: 17px; height: 17px; }
        .pdf-loading-overlay {
            display: none; position: fixed; inset: 0; z-index: 1100;
            background: var(--overlay); align-items: center; justify-content: center; flex-direction: column; gap: 16px;
        }
        .pdf-loading-overlay p { color: var(--text-on-inverse); font-size: 14px; font-weight: 600; }
        .spinner {
            width: 34px; height: 34px; border: 3px solid var(--navy-300);
            border-top-color: var(--text-on-inverse); border-radius: 50%;
            animation: spin 800ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2400ms; } }

        /* ==================== 인쇄 ==================== */
        @media print {
            @page { size: A4; margin: 0; }
            body { background: var(--surface); padding: 0; }
            .a4-page {
                width: 210mm; height: 297mm; margin: 0; border: 0; box-shadow: none;
                page-break-after: always;
            }
            .a4-page:last-child { page-break-after: auto; }
            .pdf-download-button, .pdf-loading-overlay { display: none !important; }
            /* 데이터 색은 정보이므로 인쇄에서도 유지한다 (DESIGN.md 10.5.6) */
            .omr-cell, .bz, .band-value, .flag, .heat-1, .heat-2, .heat-3, .heat-4, .heat-5,
            .catbar-fill, .doc-band, .verdict-code, .alertbox, .heat-legend i, .zk {
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            table, .band, .rx-item, .wrong-item, .subject-item { break-inside: avoid; }
            .fsection-title, .page-head-title { break-after: avoid; }
        }
    </style>
</head>
<body>
    <div id="pdf-loading-overlay" class="pdf-loading-overlay">
        <div class="spinner"></div>
        <p>PDF 파일을 생성 중입니다. 잠시만 기다려주세요...</p>
    </div>

    <button id="pdf-download-btn" class="pdf-download-button">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        PDF 다운로드
    </button>

    <section id="report-content">${pagesHTML}
    </section>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // ===== INJECT REPORT DATA =====
            const reportData = ${reportDataJson};

            console.log('[DEBUG] reportData injected:', reportData);

            // 도판 색도 DESIGN.md 토큰을 따른다. 캔버스에는 CSS 클래스를 적용할 수 없으므로
            // :root 의 CSS 변수 계산값을 읽어서 넘긴다 (새 hex 를 만들지 않는다).
            const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const tokenAlpha = (name, alpha) => {
                const raw = token(name).replace('#', '');
                if (raw.length !== 3 && raw.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
                const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
                const n = parseInt(full, 16);
                return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
            };

            // 도판 공통 규격: 지면 서체와 옅은 괘선으로 통일한다
            const sansStack = getComputedStyle(document.body).fontFamily;
            Chart.defaults.font.family = sansStack;
            Chart.defaults.font.size = 10;
            Chart.defaults.color = token('--text-tertiary');
            Chart.defaults.borderColor = token('--rule-faint');
            Chart.defaults.plugins.tooltip.enabled = false;
            const gridStyle = { color: token('--rule-faint'), drawTicks: false };
            const axisBorder = { display: false };
            const legendStyle = {
                labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rect', padding: 12,
                          font: { size: 10 }, color: token('--text-secondary') }
            };

            // DESIGN.md 10.5.2 영역 색은 이름 기준 고정 (서버 조판과 같은 배정)
            const CAT_VAR_JS = {
                '화법': '--cat-1', '화법과 작문': '--cat-1', '작문': '--cat-2',
                '수능독서': '--cat-3', '독서': '--cat-3', '문학': '--cat-4',
                '문법': '--cat-6', '언어와 매체': '--cat-6', '언어와매체': '--cat-6', '매체': '--cat-6'
            };
            const FALLBACK_JS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6'];
            const catColor = (name, i) => token(CAT_VAR_JS[name] || FALLBACK_JS[i % FALLBACK_JS.length]);
            const diffColor = (d) => token(d === '상' ? '--diff-hi' : d === '하' ? '--diff-lo' : '--diff-mid');

            // 막대 위에 값을 적는 최소 플러그인 (외부 플러그인 없이)
            const valueLabel = {
                id: 'valueLabel',
                afterDatasetsDraw(chart, args, opts) {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.font = '700 9.5px ' + sansStack;
                    ctx.fillStyle = token('--text-secondary');
                    ctx.textAlign = 'center';
                    chart.data.datasets.forEach((ds, di) => {
                        const meta = chart.getDatasetMeta(di);
                        if (meta.hidden) return;
                        meta.data.forEach((el, i) => {
                            const v = ds.data[i];
                            if (v === null || v === undefined) return;
                            const suffix = opts && opts.suffix ? opts.suffix : '';
                            if (opts && opts.horizontal) {
                                ctx.textAlign = 'left';
                                ctx.fillText(v + suffix, el.x + 6, el.y + 3);
                            } else {
                                ctx.fillText(v + suffix, el.x, el.y - 5);
                            }
                        });
                    });
                    ctx.restore();
                }
            };

            // 영역별 배점 구성
            const ctxDonut = document.getElementById('categoryDonut');
            if (ctxDonut && reportData.categoryPointsMap) {
                const cats = reportData.categoryPointsMap;
                new Chart(ctxDonut, {
                    type: 'doughnut',
                    data: {
                        labels: cats.map(c => c.name + ' ' + c.points + '점'),
                        datasets: [{
                            data: cats.map(c => c.points),
                            backgroundColor: cats.map((c, i) => catColor(c.name, i)),
                            borderColor: token('--surface'), borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '58%',
                        plugins: { legend: Object.assign({ display: true, position: 'right' }, legendStyle) }
                    }
                });
            }

            // 난이도 구성
            const ctxDiffBar = document.getElementById('difficultyBar');
            if (ctxDiffBar && reportData.difficultyStats) {
                const ds = reportData.difficultyStats;
                new Chart(ctxDiffBar, {
                    type: 'bar',
                    data: {
                        labels: ds.map(d => '난이도 ' + d.level),
                        datasets: [{
                            label: '문항 수',
                            data: ds.map(d => d.count),
                            backgroundColor: ds.map(d => diffColor(d.level)),
                            borderRadius: 0, barPercentage: 0.45
                        }]
                    },
                    plugins: [valueLabel],
                    options: {
                        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                        layout: { padding: { right: 26 } },
                        plugins: { legend: { display: false }, valueLabel: { horizontal: true, suffix: '문항' } },
                        scales: {
                            x: { beginAtZero: true, border: axisBorder, grid: gridStyle, ticks: { padding: 6, precision: 0 } },
                            y: { border: axisBorder, grid: { display: false }, ticks: { color: token('--text-secondary'), font: { size: 10.5 } } }
                        }
                    }
                });
            }

            // 문항별 전체 정답률
            const ctxQrate = document.getElementById('questionRateChart');
            if (ctxQrate && reportData.questionAnalysis) {
                const qs = reportData.questionAnalysis;
                new Chart(ctxQrate, {
                    type: 'bar',
                    data: {
                        labels: qs.map(q => q.number),
                        datasets: [{
                            label: '전체 정답률',
                            data: qs.map(q => q.cohortRate),
                            backgroundColor: qs.map((q, i) => catColor(q.category, i)),
                            borderColor: qs.map(q => q.isCorrect ? 'transparent' : token('--fn-error')),
                            borderWidth: qs.map(q => q.isCorrect ? 0 : 1.5),
                            borderRadius: 0, barPercentage: 0.9, categoryPercentage: 0.92
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, max: 100, border: axisBorder, grid: gridStyle,
                                 ticks: { stepSize: 25, padding: 6, callback: v => v + '%' } },
                            x: { border: axisBorder, grid: { display: false },
                                 ticks: { autoSkip: false, maxRotation: 0, font: { size: 7 }, color: token('--text-tertiary') } }
                        }
                    }
                });
            }

            // 난이도별 정답률 비교 (내 결과 vs 응시자 평균)
            const ctxDiffCmp = document.getElementById('difficultyCompareChart');
            if (ctxDiffCmp && reportData.difficultyStats) {
                const ds2 = reportData.difficultyStats;
                new Chart(ctxDiffCmp, {
                    type: 'bar',
                    data: {
                        labels: ds2.map(d => '난이도 ' + d.level + ' (' + d.count + '문항)'),
                        datasets: [
                            { label: '내 결과', data: ds2.map(d => d.studentRate),
                              backgroundColor: token('--action'), borderRadius: 0, barPercentage: 0.7 },
                            { label: '응시자 평균', data: ds2.map(d => d.cohortRate),
                              backgroundColor: token('--navy-300'), borderRadius: 0, barPercentage: 0.7 }
                        ]
                    },
                    plugins: [valueLabel],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: Object.assign({ display: true, position: 'top', align: 'end' }, legendStyle),
                            valueLabel: { suffix: '%' }
                        },
                        layout: { padding: { top: 16 } },
                        scales: {
                            y: { beginAtZero: true, max: 100, border: axisBorder, grid: gridStyle,
                                 ticks: { stepSize: 25, padding: 6, callback: v => v + '%' } },
                            x: { border: axisBorder, grid: { display: false },
                                 ticks: { color: token('--text-secondary'), font: { size: 10 } } }
                        }
                    }
                });
            }

            // 응시자 점수 누적 분포. 서버가 실제 점수로 계산한 10분위 값만 쓴다.
            const ctxDist = document.getElementById('distributionChart');
            const dist = reportData.scoreDistribution || { cumulative: [], sampleSize: 0 };
            if (ctxDist && dist.cumulative.length > 0) {
                const labels = dist.cumulative.map((_, i) => ((i + 1) * 10) + '%');
                const myRate = reportData.scoreSummary.rawScoreMax
                    ? Math.round((reportData.scoreSummary.rawScore / reportData.scoreSummary.rawScoreMax) * 100)
                    : 0;
                const myIndex = Math.min(9, Math.max(0, Math.ceil(myRate / 10) - 1));
                const markerLine = {
                    id: 'markerLine',
                    afterDatasetsDraw(chart) {
                        const x = chart.scales.x.getPixelForValue(myIndex);
                        const { ctx, chartArea } = chart;
                        ctx.save();
                        ctx.strokeStyle = token('--text-primary');
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(x, chartArea.top);
                        ctx.lineTo(x, chartArea.bottom);
                        ctx.stroke();
                        ctx.font = '700 9.5px ' + sansStack;
                        ctx.fillStyle = token('--text-primary');
                        ctx.textAlign = 'center';
                        ctx.fillText('수검자 ' + myRate + '%', x, chartArea.top - 3);
                        ctx.restore();
                    }
                };
                new Chart(ctxDist, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '이하 점수 응시자 비율 (누적)',
                            data: dist.cumulative,
                            borderColor: token('--action'),
                            backgroundColor: tokenAlpha('--action', 0.07),
                            borderWidth: 1.5, pointRadius: 2.5,
                            pointBackgroundColor: token('--surface'),
                            pointBorderColor: token('--action'), pointBorderWidth: 1.2,
                            fill: true, tension: 0.25
                        }]
                    },
                    plugins: [markerLine],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        layout: { padding: { top: 16 } },
                        plugins: { legend: Object.assign({ display: true, position: 'top', align: 'end' }, legendStyle) },
                        scales: {
                            y: { min: 0, max: 100, border: axisBorder, grid: gridStyle,
                                 ticks: { stepSize: 25, padding: 6, callback: v => v + '%' } },
                            x: { border: axisBorder, grid: { display: false },
                                 ticks: { padding: 6, color: token('--text-secondary'), font: { size: 9 } } }
                        }
                    }
                });
            }

            // 응시자 평균 대비 항목 분포
            const ctxRadar = document.getElementById('radarChart');
            if (ctxRadar) {
                new Chart(ctxRadar, {
                    type: 'radar',
                    data: {
                        labels: reportData.charts.radarChartData.labels,
                        datasets: [{
                            label: '수검자',
                            data: reportData.charts.radarChartData.student,
                            borderColor: token('--action'),
                            backgroundColor: tokenAlpha('--action', 0.12),
                            borderWidth: 1.5, pointRadius: 2.5,
                            pointBackgroundColor: token('--action')
                        }, {
                            label: '응시자 평균',
                            data: reportData.charts.radarChartData.average,
                            borderColor: token('--text-tertiary'),
                            backgroundColor: tokenAlpha('--navy-400', 0.08),
                            borderWidth: 1.5, borderDash: [4, 3], pointRadius: 2.5,
                            pointBackgroundColor: token('--text-tertiary')
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: Object.assign({ display: true, position: 'top', align: 'end' }, legendStyle) },
                        scales: {
                            r: {
                                beginAtZero: true, max: 100,
                                grid: { color: token('--rule-faint') },
                                angleLines: { color: token('--rule-faint') },
                                pointLabels: { font: { size: 10.5 }, color: token('--text-secondary') },
                                ticks: { stepSize: 25, backdropColor: 'transparent', font: { size: 9 }, color: token('--text-tertiary') }
                            }
                        }
                    }
                });
            }

            // 단계별 목표 정답률 (예측이 아니라 관리 목표선)
            const ctxPlan = document.getElementById('predictionChart');
            if (ctxPlan) {
                new Chart(ctxPlan, {
                    type: 'line',
                    data: {
                        labels: reportData.charts.predictionData.labels,
                        datasets: [{
                            label: '목표 정답률',
                            data: reportData.charts.predictionData.values,
                            borderColor: token('--fn-success'),
                            backgroundColor: tokenAlpha('--fn-success', 0.08),
                            borderWidth: 1.5, borderDash: [5, 3], pointRadius: 3,
                            pointBackgroundColor: token('--surface'),
                            pointBorderColor: token('--fn-success'), pointBorderWidth: 1.5,
                            fill: true, tension: 0.25
                        }]
                    },
                    plugins: [valueLabel],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        layout: { padding: { top: 18 } },
                        plugins: {
                            legend: Object.assign({ display: true, position: 'top', align: 'end' }, legendStyle),
                            valueLabel: { suffix: '%' }
                        },
                        scales: {
                            y: { min: 0, max: 100, border: axisBorder, grid: gridStyle, ticks: { stepSize: 25, padding: 6, callback: v => v + '%' } },
                            x: { border: axisBorder, grid: { display: false },
                                 ticks: { padding: 6, color: token('--text-secondary'), font: { size: 10.5 } } }
                        }
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
                    const filename = \`올가_학습성취_결과통보서_\${studentName}.pdf\`;
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
