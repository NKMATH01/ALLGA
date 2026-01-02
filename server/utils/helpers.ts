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
