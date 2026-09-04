import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index';
import { students } from '../db/schema';

/**
 * studentIds 가 전부 지정한 지점 소속인지 검증한다.
 * 문제가 있으면 오류 메시지를, 정상이면 null 을 돌려준다(호출부에서 403).
 *
 * 지점 스코프의 핵심 경계다. `distributions.ts` 와 `classes.ts` 가 같은 함수를 각자
 * 복사해 갖고 있었고, `parents.ts` 는 아예 빠뜨려 타 지점 학생을 학부모에 링크할 수
 * 있었다(P-3). 규칙이 갈라지지 않도록 한 곳에 모은다.
 *
 * 빈 배열은 통과시킨다(검증할 대상이 없으므로). 호출부가 "0명"의 의미를 판단한다.
 */
export async function validateStudentsInBranch(
  studentIds: string[],
  branchId: string
): Promise<string | null> {
  if (studentIds.length === 0) return null;

  const rows = await db
    .select({ id: students.id })
    .from(students)
    .where(and(inArray(students.id, studentIds), eq(students.branchId, branchId)));

  if (rows.length !== studentIds.length) {
    return '본인 지점에 속하지 않은 학생이 포함되어 있습니다.';
  }
  return null;
}
