import { useState } from 'react';

type Branch = { branchName: string; studentCount: number; examCount: number };
type Props = { branches: Branch[]; grades: { grade: number; count: number }[]; loading: boolean; error: boolean; onRetry: () => void };
export function AdminAnalytics({ branches, grades, loading, error, onRetry }: Props) {
  const [metric, setMetric] = useState<'studentCount' | 'examCount'>('studentCount');
  if (loading) return <div role="status" className="admin-analysis-state">지점과 성적 데이터를 불러오는 중입니다.</div>;
  if (error) return <div role="alert" className="admin-analysis-state">분석 데이터를 불러오지 못했습니다. <button type="button" onClick={onRetry} className="ml-3 underline underline-offset-4">다시 시도</button></div>;
  // 0 인 지점은 막대가 보이지 않아 '작은 지점'과 '기록 없는 지점'이 구분되지 않는다. 차트에서 뺀다.
  const ranked = branches.filter((b) => Number(b[metric]) > 0).sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const rows = ranked.slice(0, 6);
  const max = Math.max(1, ...rows.map((b) => Number(b[metric]) || 0));
  const maxGrade = Math.max(1, ...grades.map((g) => Number(g.count) || 0));
  const total = grades.reduce((sum, g) => sum + Number(g.count), 0);
  return <div className="admin-analysis-grid">
    <section className="admin-chart-panel" aria-labelledby="branch-comparison">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 id="branch-comparison" className="text-lg font-semibold text-ink">지점별 운영 규모</h2><p className="mt-1 text-sm text-ink-secondary">{metric === 'studentCount' ? '현재 등록 학생 수' : '제출 전 기록을 포함한 누적 응시 수'}</p></div>
        <div className="flex rounded-lg bg-surface-subtle p-1" aria-label="지점 비교 기준">
          {([['studentCount', '학생'], ['examCount', '응시 기록']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setMetric(key)} aria-pressed={metric === key} className={`min-h-10 rounded-md px-3 text-xs font-semibold ${metric === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-secondary'}`}>{label}</button>)}
        </div>
      </div>
      {rows.length ? <dl className="mt-7 space-y-5">{rows.map((b, i) => <div key={`${b.branchName}:${i}`}>
        <div className="mb-2 flex items-baseline justify-between gap-3"><dt className="min-w-0 break-words text-sm font-medium text-ink">{b.branchName}</dt><dd className="shrink-0 text-sm font-semibold tabular-nums text-ink">{b[metric]}{metric === 'studentCount' ? '명' : '건'}</dd></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Number(b[metric]) / max * 100)}%` }} /></div>
      </div>)}</dl> : <p className="py-16 text-center text-sm text-ink-secondary">등록된 지점이 없습니다.</p>}
      {rows.length < branches.length && <p className="mt-5 text-xs text-ink-secondary">표시 {rows.length}개 / 전체 {branches.length}개 지점(0은 제외) · 전체 지점은 아래 통계표에서 확인</p>}
    </section>
    <section className="admin-chart-panel" aria-labelledby="grade-distribution">
      <div className="flex items-start justify-between gap-3"><div><h2 id="grade-distribution" className="text-lg font-semibold text-ink">등급 분포</h2><p className="mt-1 text-sm text-ink-secondary">제출 완료 · 등급이 산출된 응시 기록</p></div><span className="rounded-full bg-accent-surface px-3 py-1.5 text-sm font-semibold text-accent-strong">{total}건</span></div>
      {total ? <div className="mt-8 grid h-48 grid-cols-9 items-end gap-1.5 sm:gap-3" role="list" aria-label="등급별 응시 건수">{Array.from({ length: 9 }, (_, i) => {
        const count = Number(grades.find((g) => Number(g.grade) === i + 1)?.count) || 0;
        return <div key={i} role="listitem" aria-label={`${i + 1}등급 ${count}건`} className="flex h-full flex-col items-center justify-end gap-2">
          <span className="text-xs font-semibold tabular-nums text-ink">{count}</span><div className="w-full max-w-9 rounded-t-md bg-accent" style={{ height: `${count / maxGrade * 132}px`, opacity: count ? 0.85 : 0 }} aria-hidden="true" /><span className="text-xs text-ink-secondary">{i + 1}<span className="sr-only">등급</span></span>
        </div>;
      })}</div> : <p className="py-16 text-center text-sm text-ink-secondary">표시할 등급 기록이 없습니다.</p>}
      <p className="mt-6 border-t border-line pt-4 text-xs leading-6 text-ink-secondary">학생 수가 아닌 응시 건수입니다. 여러 시험의 기록을 포함하며, 같은 학생이 중복 집계될 수 있습니다.</p>
    </section>
  </div>;
}
