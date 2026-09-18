import { describe, expect, it } from 'vitest';
import { loginErrorMessage } from './loginError';
describe('로그인 오류 안내', () => {
  it('서버 연결 실패를 인증 실패와 구분한다', () => {
    expect(loginErrorMessage({ code: 'ERR_NETWORK' })).toContain('서버에 연결할 수 없습니다');
  });
  it('개발 프록시 실패의 빈 500 응답도 서버 문제로 안내한다', () => {
    expect(loginErrorMessage({ response: { status: 500, data: '' } })).toContain('서버');
  });
  it('계정 유형과 비밀번호에 대한 서버 안내는 유지한다', () => {
    expect(loginErrorMessage({ response: { status: 401, data: { message: '계정 유형이 올바르지 않습니다.' } } })).toBe('계정 유형이 올바르지 않습니다.');
  });
});
