import { describe, expect, it } from 'vitest';
import { filterGroupStudents, getAttemptState, parseSelection, validateSelection, selectionKey, readSelection, saveSelection, retainCurrentDistributions } from './branchSelection';

describe('branch selection', () => {
  const students = [{ id: 'a', grade: '고1' }, { id: 'b', grade: '고2' }];
  it('preserves submitted zero and separates non-target from unattempted', () => {
    expect(getAttemptState({ isSubmitted: true, score: 0 })).toEqual({ label: '제출 완료', score: 0 });
    expect(getAttemptState(undefined).label).toBe('배포 대상 아님');
    expect(getAttemptState({ isSubmitted: false, hasAttempt: false }).label).toBe('미응시');
  });
  it('filters empty, overlapping class rosters and grades by student IDs', () => {
    expect(filterGroupStudents(students, 'class', 'c', []).length).toBe(0);
    expect(filterGroupStudents(students, 'class', 'c', [{ id: 'a' }, { id: 'a' }])).toEqual([students[0]]);
    expect(filterGroupStudents(students, 'class', 'other', [{ id: 'a' }])).toEqual([students[0]]);
    expect(filterGroupStudents(students, 'grade', '고2', [])).toEqual([students[1]]);
  });
  it('resets invalid group and clears student outside changed roster', () => {
    expect(validateSelection({ mode: 'class', groupId: 'missing', studentId: 'a', distributionId: null }, students, [], undefined).groupId).toBeNull();
    expect(validateSelection({ mode: 'class', groupId: 'c', studentId: 'b', distributionId: null }, students, [{ id: 'c' }], [{ id: 'a' }]).studentId).toBeNull();
  });
  it('rejects malformed storage and retains IDs only', () => {
    expect(parseSelection('{bad').studentId).toBeNull();
    expect(parseSelection(JSON.stringify({ mode: 'class', groupId: 'c', studentId: 'a', distributionId: null, name: 'private' }))).not.toHaveProperty('name');
    expect(selectionKey('u1', 'b')).not.toBe(selectionKey('u2', 'b'));
  });
  it('remains usable when session storage is unavailable', () => {
    expect(readSelection('unavailable').studentId).toBeNull();
    expect(() => saveSelection('unavailable', parseSelection(null))).not.toThrow();
  });
  it('excludes deleted distributions from cached results, including the last deletion', () => {
    const cached = [{ distribution: { id: 'old' } }, { distribution: { id: 'current' } }];
    expect(retainCurrentDistributions(cached, [{ id: 'current' }])).toEqual([cached[1]]);
    expect(retainCurrentDistributions(cached, [])).toEqual([]);
  });
});
