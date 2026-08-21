import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeForJson(obj: any): string {
  const json = JSON.stringify(obj);
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022');
}

/**
 * 'YYYY-MM-DD' 문자열을 서버 로컬 타임존의 그 날 00:00:00 으로 해석한다.
 * `new Date('2026-08-20')` 은 UTC 자정으로 파싱되어 KST 에서는 09:00 이 되므로 직접 쓰지 않는다.
 * 이미 시각까지 포함한 문자열이나 Date 객체는 그대로 통과시킨다.
 * 파싱할 수 없으면 null 을 돌려준다(호출부에서 400 처리).
 */
export function parseLocalDateStart(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 'YYYY-MM-DD' 를 그 날의 마지막 순간(로컬 23:59:59.999)으로 해석한다.
 * 마감일 당일까지 응시를 허용하기 위한 용도.
 * 시각이 포함된 값은 그대로 둔다(이미 의도된 시각이므로).
 */
export function parseLocalDateEnd(value: unknown): Date | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const start = parseLocalDateStart(value);
    if (!start) return null;
    start.setHours(23, 59, 59, 999);
    return start;
  }
  return parseLocalDateStart(value);
}

/**
 * 저장된 마감 timestamp 를 "그 날 23:59:59.999" 로 확장한다.
 * 과거에 UTC 자정으로 저장된 레코드도 당일 마감으로 취급하기 위함.
 */
export function endOfLocalDay(value: Date | string): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

// 등급 산출 로직 (백분율 기준)
export function calculateGrade(percentage: number): number {
  if (percentage >= 96) return 1;
  if (percentage >= 89) return 2;
  if (percentage >= 77) return 3;
  if (percentage >= 60) return 4;
  if (percentage >= 40) return 5;
  if (percentage >= 25) return 6;
  if (percentage >= 15) return 7;
  if (percentage >= 8) return 8;
  return 9;
}
