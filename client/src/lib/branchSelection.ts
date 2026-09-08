export type BranchSelection = {
  mode: 'grade' | 'class'; groupId: string | null; studentId: string | null; distributionId: string | null;
};
export const emptySelection = (): BranchSelection => ({ mode: 'grade', groupId: null, studentId: null, distributionId: null });
export const selectionKey = (userId: string, branchId?: string) => `allga:branch-selection:${encodeURIComponent(userId)}:${encodeURIComponent(branchId || '')}`;
export function parseSelection(raw: string | null): BranchSelection {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !['grade', 'class'].includes(value.mode)) return emptySelection();
    const id = (v: unknown) => typeof v === 'string' && v.length < 200 ? v : null;
    return { mode: value.mode, groupId: id(value.groupId), studentId: id(value.studentId), distributionId: id(value.distributionId) };
  } catch { return emptySelection(); }
}
export function readSelection(key: string): BranchSelection {
  try { return parseSelection(sessionStorage.getItem(key)); } catch { return emptySelection(); }
}
export function saveSelection(key: string, value: BranchSelection): void {
  try { sessionStorage.setItem(key, JSON.stringify(parseSelection(JSON.stringify(value)))); } catch { /* Private browsing/storage limits must not block navigation. */ }
}
export const gradeName = (student: { grade?: string | null }) => String(student.grade || '').trim() || '학년 미지정';
export function filterGroupStudents<T extends { id: string; grade?: string | null }>(students: T[], mode: BranchSelection['mode'], groupId: string | null, roster: { id: string }[] = []): T[] {
  if (!groupId) return students;
  if (mode === 'grade') return students.filter((s) => gradeName(s) === groupId);
  const ids = new Set(roster.map((s) => s.id));
  return students.filter((s) => ids.has(s.id));
}
export function validateSelection(selection: BranchSelection, students: { id: string; grade?: string | null }[], classes: { id: string }[], roster?: { id: string }[]): BranchSelection {
  const validGroup = !selection.groupId || (selection.mode === 'class' ? classes.some((c) => c.id === selection.groupId) : students.some((s) => gradeName(s) === selection.groupId));
  if (!validGroup) return { ...emptySelection(), mode: selection.mode };
  if (!selection.studentId) return selection;
  // A class roster that has not loaded is unknown, not empty.
  const candidates = selection.mode === 'class' && selection.groupId && roster === undefined ? students : filterGroupStudents(students, selection.mode, selection.groupId, roster);
  return candidates.some((s) => s.id === selection.studentId) ? selection : { ...selection, studentId: null };
}
export function getAttemptState(row?: { isSubmitted?: boolean; hasAttempt?: boolean; score?: number | string | null }) {
  if (!row) return { label: '배포 대상 아님', score: null };
  if (!row.isSubmitted) return { label: row.hasAttempt ? '작성 중' : '미응시', score: null };
  const score = row.score === null || row.score === undefined ? null : Number(row.score);
  return { label: '제출 완료', score: score !== null && Number.isFinite(score) ? score : null };
}
export function retainCurrentDistributions<T extends { distribution: { id: string } }>(cached: T[], current: { id: string }[]): T[] {
  const ids = new Set(current.map((d) => d.id));
  return cached.filter((row) => ids.has(row.distribution.id));
}
