import type { ReportSummary } from '../lib/reportClient';

function Findings({ items, title }: { items: ReportSummary['abnormal']; title: string }) {
  if (!items.length) return null;
  return <section className="space-y-5">
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    {items.map((item) => <div key={`${item.kind}:${item.name}`} className="border-b border-line pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-ink">{item.name}</span>
        <span className="text-sm text-ink-secondary">정답률 <strong className="text-lg text-ink">{item.studentRate}%</strong></span>
      </div>
      <div className="relative my-3 h-2 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
        <div className="absolute inset-y-0 bg-line-strong" style={{ left: `${Math.max(0, Math.min(100, item.low))}%`, width: `${Math.max(0, Math.min(100, item.high) - Math.max(0, item.low))}%` }} />
        <div className="absolute inset-y-0 w-1 bg-ink" style={{ left: `clamp(0px, ${Math.max(0, Math.min(100, item.studentRate))}%, calc(100% - 4px))` }} />
      </div>
      <p className="text-sm leading-6 text-ink-secondary">참고 범위 {item.low}–{item.high}% · {item.direction === 'below' ? '참고 범위보다 낮음' : '참고 범위보다 높음'}</p>
    </div>)}
  </section>;
}

/** 인증된 summary API의 측정값과 소견을 그대로 읽기 화면으로 표현한다. */
export function ReportReadingView({ summary }: { summary: ReportSummary }) {
  const v = summary.verdict;
  return <article className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 text-ink sm:px-10 sm:pt-14">
    <header className="border-b border-line pb-8 sm:pb-10">
      <h1 className="break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{v.studentName ? `${v.studentName} 학생의` : '나의'}<br />학습 분석 보고서</h1>
      {v.examDate && <p className="mt-4 text-sm text-ink-secondary">시험일 {v.examDate}</p>}
      <p className="mt-3 max-w-xl text-base leading-7 text-ink-secondary">이번 시험의 결과와 다음 학습에서 집중할 내용을 살펴보세요.</p>
    </header>
    <section aria-labelledby="report-result" className="py-8 sm:py-10">
      <h2 id="report-result" className="text-xl font-semibold">이번 시험 결과</h2>
      <dl className="mt-6 grid grid-cols-2 gap-y-6 rounded-xl bg-accent-surface px-5 py-6 sm:grid-cols-3 sm:px-7">
        <div><dt className="text-sm text-ink-secondary">원점수</dt><dd className="mt-2"><strong className="text-4xl font-semibold tracking-tight text-accent-strong">{v.rawScore ?? '-'}</strong><span className="ml-1 text-sm text-ink-secondary">/ {v.rawScoreMax ?? '-'}점</span></dd></div>
        <div className="border-l border-line pl-5"><dt className="text-sm text-ink-secondary">등급</dt><dd className={`mt-2 font-semibold ${v.grade != null ? 'text-3xl' : 'text-xl leading-snug break-keep'}`}>{v.grade != null ? `${v.grade}등급` : '등급 기준 축적 중'}{v.grade == null && <p className="mt-1 text-xs text-ink-secondary">응시자 표본이 모이기 전이라 등급을 내지 않았습니다.</p>}</dd></div>
        <div className="col-span-2 border-t border-line pt-4 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><dt className="text-sm text-ink-secondary">백분위</dt><dd className="mt-2 text-2xl font-semibold sm:text-3xl">{v.percentile ?? '-'}</dd></div>
      </dl>
      {v.overallReference?.available && <p className="mt-4 text-sm leading-6 text-ink-secondary">전체 정답률 참고 범위 {v.overallReference.low}–{v.overallReference.high}%</p>}
    </section>
    <section id="report-overview" className="scroll-mt-24 border-t border-line py-8 sm:py-10">
      <h2 className="text-xl font-semibold">핵심 분석</h2>
      <p className="mt-5 max-w-prose whitespace-pre-line break-words text-base leading-8 text-ink-secondary">{summary.keyFinding || '등록된 핵심 분석이 없습니다.'}</p>
    </section>
    <section id="report-areas" className="scroll-mt-24 border-t border-line py-8 sm:py-10">
      <h2 className="text-xl font-semibold">영역별 살펴보기</h2>
      <p className="mt-3 text-sm leading-6 text-ink-secondary">참고 범위를 벗어난 항목을 모았습니다. 막대의 넓은 구간은 참고 범위, 짧은 세로선은 학생의 정답률입니다.</p>
      {summary.abnormal.length ? <div className="mt-7 grid gap-8 sm:grid-cols-2">
        <Findings title="보완할 영역" items={summary.abnormal.filter((item) => item.direction === 'below')} />
        <Findings title="강점으로 나타난 영역" items={summary.abnormal.filter((item) => item.direction === 'above')} />
      </div> : <p className="mt-6 rounded-lg bg-surface-subtle p-5 text-sm leading-7 text-ink-secondary">참고 범위를 벗어난 항목이 없습니다. 비교 자료가 없는 항목은 이 목록에 표시되지 않습니다.</p>}
    </section>
    <section id="report-next" className="scroll-mt-24 border-t border-line py-8 sm:py-10">
      <h2 className="text-xl font-semibold">다음 학습 제안</h2>
      {summary.recommendations.length ? <ol className="mt-6 divide-y divide-line">
        {summary.recommendations.map((item, index) => <li key={index} className="flex gap-4 py-5 first:pt-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-sm font-semibold" aria-hidden="true">{index + 1}</span>
          <div className="min-w-0"><h3 className="break-words text-base font-semibold leading-7">{item.title}</h3>{item.detail && <p className="mt-2 whitespace-pre-line break-words text-base leading-8 text-ink-secondary">{item.detail}</p>}</div>
        </li>)}
      </ol> : <p className="mt-5 text-sm text-ink-secondary">등록된 학습 제안이 없습니다.</p>}
    </section>
    <footer className="border-t border-line pt-6 text-sm leading-6 text-ink-secondary">ALLGA 올가 미수등 · 웹 요약 보고서<br />문항별 상세 분석은 인쇄용 전체 보고서에서 확인할 수 있습니다.</footer>
  </article>;
}
