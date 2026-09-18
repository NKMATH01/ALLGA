type LoginError = { code?: string; response?: { status?: number; data?: unknown } };

/** 연결 장애를 잘못된 계정 정보와 구분하여 로그인 화면에 안내한다. */
export function loginErrorMessage(error: LoginError): string {
  const data = error.response?.data;
  const message = data && typeof data === 'object' && 'message' in data ? data.message : undefined;
  if (typeof message === 'string' && message.trim()) return message;
  if (!error.response || error.code === 'ERR_NETWORK') {
    return '서버에 연결할 수 없습니다. 인터넷 연결과 서버 실행 상태를 확인한 뒤 다시 시도해주세요.';
  }
  if ((error.response.status ?? 0) >= 500) {
    return '로그인 서버가 응답하지 않습니다. 잠시 후 다시 시도해주세요.';
  }
  return '로그인에 실패했습니다. 아이디와 계정 유형을 확인해주세요.';
}
