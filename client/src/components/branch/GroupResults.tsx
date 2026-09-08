import { getAttemptState } from '../../lib/branchSelection';
import type { NavigatorStudent } from './StudentNavigator';

type Distribution = { distribution: { id: string; createdAt?: string; startDate?: string; exam?: { title?: string } }; exam?: { title?: string }; students?: any[] };
export function GroupResults({ title, mode, students, distributions, distributionId, onDistribution, onStudent, loading, error, onRetry }: {
  title: string; mode: 'grade' | 'class'; students: NavigatorStudent[]; distributions: Distribution[];
  distributionId: string | null; onDistribution: (id: string) => void; onStudent: (id: string) => void;
  loading: boolean; error: boolean; onRetry: () => void;
}) {
  const selected = distributions.find((d) => d.distribution.id === distributionId);
  const byStudent = new Map((selected?.students || []).map((s) => [s.studentId, s]));
  const datedDistributions = distributions.slice().sort((a, b) => new Date(b.distribution.createdAt || b.distribution.startDate || 0).getTime() - new Date(a.distribution.createdAt || a.distribution.startDate || 0).getTime() || a.distribution.id.localeCompare(b.distribution.id));
  const optionLabel = (d: Distribution, index: number) => {
    const date = new Date(d.distribution.createdAt || d.distribution.startDate || '');
    const when = Number.isNaN(date.getTime()) ? '날짜 미등록' : date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${d.exam?.title || d.distribution.exam?.title || '시험'} · ${when} (배포 ${datedDistributions.length - index})`;
  };
  return <section>
    <div className="mb-7"><h1 className="page-heading">{title} 전체</h1><p className="page-description">{mode === 'class' ? '현재 반에 배정된 학생 기준입니다. 과거 시험의 배포 대상과 다를 수 있습니다.' : '현재 학년의 학생 기준입니다.'}</p></div>
    <div className="workspace-panel p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-semibold text-ink">시험별 성적</h2><p className="mt-1 text-sm text-ink-secondary">현재 학생 {students.length}명 · 학생 이름을 누르면 상세 기록으로 이동합니다.</p></div>
        <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold text-ink">시험 / 배포 선택<select value={selected?.distribution.id || ''} onChange={(e) => onDistribution(e.target.value)} className="h-11 w-full max-w-full rounded-md border border-line-strong bg-surface px-3 text-sm sm:max-w-80"><option value="">시험을 선택하세요</option>{datedDistributions.map((d, index) => <option key={d.distribution.id} value={d.distribution.id}>{optionLabel(d, index)}</option>)}</select></label>
      </div>
      {loading ? <p role="status" className="py-10 text-center text-sm text-ink-secondary">성적과 명단을 불러오는 중...</p> : error ? <div role="alert" className="py-10 text-center"><p>성적 또는 명단을 불러오지 못했습니다.</p><button type="button" onClick={onRetry} className="mt-3 rounded-md border border-line px-4 py-2 text-sm">다시 시도</button></div> : students.length === 0 ? <p className="py-10 text-center text-sm text-ink-secondary">현재 소속 학생이 없습니다.</p> : !selected ? <p className="py-10 text-center text-sm text-ink-secondary">{distributions.length ? '시험을 선택하면 학생별 응시 상태와 성적을 확인할 수 있습니다.' : '조회할 시험 배포가 없습니다.'}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm tabular-nums"><thead className="bg-surface-subtle text-ink-secondary"><tr>{['학생', '점수', '등급', '응시 상태', '보고서'].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr></thead><tbody>{students.map((student) => {
        const row = byStudent.get(student.id);
        const state = getAttemptState(row);
        return <tr key={student.id} className="border-b border-line-subtle hover:bg-surface-subtle"><td className="px-4 py-3"><button type="button" onClick={() => onStudent(student.id)} className="text-left font-semibold text-ink underline decoration-line-strong underline-offset-4">{student.user?.name || '이름 미등록'}</button></td><td className="px-4 py-3">{state.score === null ? '-' : `${state.score}${row?.maxScore != null ? ` / ${row.maxScore}` : '점'}`}</td><td className="px-4 py-3">{row?.isSubmitted && row?.grade != null ? `${row.grade}등급` : '-'}</td><td className="px-4 py-3">{state.label}</td><td className="px-4 py-3">{row?.hasReport ? '보고서 완료' : row?.isSubmitted ? '미생성' : '-'}</td></tr>;
      })}</tbody></table></div>}
    </div>
  </section>;
}
