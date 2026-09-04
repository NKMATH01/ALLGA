import { describe, it, expect } from 'vitest';
import {
  resolveDistributionTargetKind,
  distributionAppliesToStudent,
  type DistributionTargetKind,
} from './helpers';

/*
  배포 대상 판정 검증 (S-4).

  예전에는 "class_id 없음 + 지정 행 0건" 을 지점 전원 공개로 읽었다.
  그래서 배정 INSERT 가 실패하거나 지정 학생이 CASCADE 로 사라지면
  "아무에게도 안 감" 이 "전원에게 감" 으로 조용히 뒤집혔다.

  이제 대상 종류는 target_kind 컬럼이 들고 있고, 판정은 아래 함수 하나뿐이다.
  가장 중요한 케이스는 'students' + 배정 0건 → false 다.
*/

const NO_CLASSES: ReadonlySet<string> = new Set<string>();
const NO_STUDENTS: ReadonlySet<string> = new Set<string>();

function applies(input: {
  targetKind: DistributionTargetKind;
  classId?: string | null;
  studentId?: string;
  studentClassIds?: ReadonlySet<string>;
  assignedStudentIds?: ReadonlySet<string>;
}) {
  return distributionAppliesToStudent({
    targetKind: input.targetKind,
    classId: input.classId ?? null,
    studentId: input.studentId ?? 'stu-1',
    studentClassIds: input.studentClassIds ?? NO_CLASSES,
    assignedStudentIds: input.assignedStudentIds ?? NO_STUDENTS,
  });
}

describe("distributionAppliesToStudent — 'branch' (지점 전원)", () => {
  it('반 소속·지정 여부와 무관하게 적용된다', () => {
    expect(applies({ targetKind: 'branch' })).toBe(true);
  });

  it('class_id 가 남아 있어도 전원 공개는 전원 공개다', () => {
    expect(applies({ targetKind: 'branch', classId: 'class-a' })).toBe(true);
  });
});

describe("distributionAppliesToStudent — 'class' (반 배포)", () => {
  it('학생이 그 반에 속하면 적용된다', () => {
    expect(
      applies({ targetKind: 'class', classId: 'class-a', studentClassIds: new Set(['class-a']) })
    ).toBe(true);
  });

  it('다른 반에만 속하면 적용되지 않는다', () => {
    expect(
      applies({ targetKind: 'class', classId: 'class-a', studentClassIds: new Set(['class-b']) })
    ).toBe(false);
  });

  it('반 배포인데 class_id 가 비어 있으면 전원으로 승격하지 않는다', () => {
    expect(applies({ targetKind: 'class', classId: null })).toBe(false);
  });

  it('지정 학생 목록에 있어도 반 배포는 반으로만 판정한다', () => {
    expect(
      applies({
        targetKind: 'class',
        classId: 'class-a',
        studentClassIds: NO_CLASSES,
        assignedStudentIds: new Set(['stu-1']),
      })
    ).toBe(false);
  });
});

describe("distributionAppliesToStudent — 'students' (학생 지정)", () => {
  it('지정된 학생이면 적용된다', () => {
    expect(
      applies({ targetKind: 'students', studentId: 'stu-1', assignedStudentIds: new Set(['stu-1']) })
    ).toBe(true);
  });

  it('지정 목록에 없으면 적용되지 않는다', () => {
    expect(
      applies({ targetKind: 'students', studentId: 'stu-1', assignedStudentIds: new Set(['stu-2']) })
    ).toBe(false);
  });

  // 이 테스트가 S-4 의 핵심이다. 회귀하면 배포가 지점 전원에게 열린다.
  it('배정이 0건이면 대상이 없다 — 전원으로 승격하지 않는다', () => {
    expect(applies({ targetKind: 'students', assignedStudentIds: new Set<string>() })).toBe(false);
  });

  it('배정 0건 + 반 소속이 있어도 여전히 false', () => {
    expect(
      applies({
        targetKind: 'students',
        classId: 'class-a',
        studentClassIds: new Set(['class-a']),
        assignedStudentIds: new Set<string>(),
      })
    ).toBe(false);
  });
});

describe('resolveDistributionTargetKind', () => {
  it('둘 다 없으면 branch', () => {
    expect(resolveDistributionTargetKind({ classId: null, studentIds: undefined })).toBe('branch');
  });

  it('빈 studentIds 배열은 지정으로 치지 않는다', () => {
    expect(resolveDistributionTargetKind({ classId: null, studentIds: [] })).toBe('branch');
  });

  it('classId 만 있으면 class', () => {
    expect(resolveDistributionTargetKind({ classId: 'class-a', studentIds: undefined })).toBe('class');
  });

  it('빈 문자열 classId 는 반 배포가 아니다', () => {
    expect(resolveDistributionTargetKind({ classId: '', studentIds: undefined })).toBe('branch');
  });

  it('studentIds 만 있으면 students', () => {
    expect(resolveDistributionTargetKind({ classId: null, studentIds: ['stu-1'] })).toBe('students');
  });

  it('studentIds 가 classId 보다 우선한다', () => {
    expect(resolveDistributionTargetKind({ classId: 'class-a', studentIds: ['stu-1'] })).toBe(
      'students'
    );
  });
});
