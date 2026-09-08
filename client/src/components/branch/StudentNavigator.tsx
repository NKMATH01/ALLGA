import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { gradeName, type BranchSelection } from '../../lib/branchSelection';
import { Input } from '../ui/input';

export type NavigatorStudent = { id: string; grade?: string | null; user?: { name?: string }; school?: string };
export type NavigatorClass = { id: string; name: string; studentCount?: number };
export const rosterKey = (branchId: string | undefined, classId: string | null) => ['class-roster', branchId, classId];
export const fetchRoster = async (classId: string) => (await api.get(`/classes/${classId}/students`)).data.data as { id: string }[];

type Props = {
  students: NavigatorStudent[]; classes: NavigatorClass[]; branchId?: string;
  selection: BranchSelection; onSelect: (selection: BranchSelection) => void;
  loading: boolean; error: boolean; onRetry: () => void; unattemptedCount: (id: string) => number;
};
function StudentGroup({ id, name, count, members, props, search, sort }: {
  id: string; name: string; count: number; members?: NavigatorStudent[]; props: Props; search: string; sort: boolean;
}) {
  const { selection, onSelect, students, branchId } = props;
  const [open, setOpen] = useState(selection.groupId === id);
  const isClass = selection.mode === 'class';
  const roster = useQuery({ queryKey: rosterKey(branchId, id), queryFn: () => fetchRoster(id), enabled: isClass && (open || selection.groupId === id), staleTime: 60_000 });
  const ids = new Set((roster.data || []).map((s) => s.id));
  const rows = (isClass ? students.filter((s) => ids.has(s.id)) : members || [])
    .filter((s) => (s.user?.name || '').toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => (sort ? props.unattemptedCount(b.id) - props.unattemptedCount(a.id) : 0) || (a.user?.name || '').localeCompare(b.user?.name || '', 'ko'));
  const select = (studentId: string | null) => onSelect({ ...selection, groupId: id, studentId, distributionId: selection.groupId === id ? selection.distributionId : null });
  const expanded = open || (!isClass && search.trim().length > 0 && rows.length > 0);
  return <div className="border-b border-line-subtle">
    <button type="button" aria-expanded={expanded} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-surface-subtle">
      {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate font-semibold">{name}</span><span className="text-xs text-ink-secondary">{count}명</span>
    </button>
    {expanded && <div className="pb-2">
      <button type="button" onClick={() => select(null)} aria-current={selection.groupId === id && !selection.studentId ? 'page' : undefined} className={`w-full px-10 py-2 text-left text-sm font-semibold hover:bg-surface-subtle ${selection.groupId === id && !selection.studentId ? 'bg-accent-surface text-ink' : 'text-ink-secondary'}`}>{name} 전체</button>
      {isClass && roster.isLoading ? <p role="status" className="px-5 py-3 text-xs text-ink-secondary">학생 명단을 불러오는 중...</p> : isClass && roster.isError ? <button type="button" onClick={() => roster.refetch()} className="px-5 py-3 text-sm text-fn-error">명단 조회 실패 · 다시 시도</button> : <>
        {rows.length === 0 && <p className="px-5 py-3 text-xs text-ink-secondary">{search ? '일치하는 학생이 없습니다.' : '배정된 학생이 없습니다.'}</p>}
        {rows.map((s) => <button key={s.id} type="button" onClick={() => select(s.id)} aria-current={selection.groupId === id && selection.studentId === s.id ? 'page' : undefined} className={`flex w-full items-center px-10 py-2 text-left text-sm hover:bg-surface-subtle ${selection.groupId === id && selection.studentId === s.id ? 'bg-accent-surface font-semibold text-ink' : 'text-ink-secondary'}`}><span className="truncate">{s.user?.name || '이름 미등록'}</span></button>)}
      </>}
    </div>}
  </div>;
}
export function StudentNavigator(props: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(false);
  const grades = [...new Set(props.students.map(gradeName))].sort((a, b) => a.localeCompare(b, 'ko'));
  return <div className="flex h-full flex-col bg-surface text-ink">
    <div className="border-b border-line p-4">
      <h2 className="mb-3 text-base font-semibold">학생 성적</h2>
      <div className="flex rounded-lg bg-surface-subtle p-1" aria-label="학생 그룹 기준">
        {(['grade', 'class'] as const).map((mode) => <button key={mode} type="button" aria-pressed={props.selection.mode === mode} onClick={() => props.onSelect({ mode, groupId: null, studentId: null, distributionId: null })} className={`flex-1 rounded-md px-3 py-2 text-sm ${props.selection.mode === mode ? 'bg-surface font-semibold shadow-sm' : 'text-ink-secondary'}`}>{mode === 'grade' ? '학년별' : '반별'}</button>)}
      </div>
      <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-secondary" /><Input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="학생 이름 검색" placeholder="학생 이름 검색" className="pl-9" /></div>
      {props.selection.mode === 'class' && search && <p className="mt-2 text-xs text-ink-secondary">반을 펼치면 해당 반에서 검색합니다.</p>}
    </div>
    <div className="flex items-center justify-between border-b border-line px-3 py-2">
      <button type="button" onClick={() => props.onSelect({ ...props.selection, groupId: null, studentId: null, distributionId: null })} className="rounded-md px-2 py-2 text-xs text-ink-secondary hover:bg-surface-subtle">지점 전체</button>
      <button type="button" onClick={() => setSort(!sort)} className="rounded-md px-2 py-2 text-xs text-ink-secondary hover:bg-surface-subtle">{sort ? '미응시 우선' : '이름순'}</button>
    </div>
    <nav className="flex-1 overflow-y-auto" aria-label="학년 및 반별 학생 목록">
      {props.loading ? <p role="status" className="p-4 text-sm text-ink-secondary">목록을 불러오는 중...</p> : props.error ? <button type="button" onClick={props.onRetry} className="p-4 text-sm text-fn-error">목록 조회 실패 · 다시 시도</button> : props.selection.mode === 'class' ? <>
        {props.classes.length === 0 && <p className="p-4 text-sm text-ink-secondary">등록된 반이 없습니다.</p>}
        {props.classes.map((c) => <StudentGroup key={`class:${c.id}`} id={c.id} name={c.name} count={c.studentCount || 0} props={props} search={search} sort={sort} />)}
      </> : grades.map((g) => { const members = props.students.filter((s) => gradeName(s) === g); return <StudentGroup key={`grade:${g}`} id={g} name={g} count={members.length} members={members} props={props} search={search} sort={sort} />; })}
    </nav>
  </div>;
}
