import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 세션 만료 처리를 한 번만 수행하기 위한 플래그.
// 여러 요청이 동시에 401 을 받아도 이동은 1회만 일어난다.
let sessionExpiredHandled = false;

/** 401 이 정상 응답인 엔드포인트 (로그인 실패, 미로그인 조회) */
function isExpectedUnauthorized(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('/auth/login') || url.includes('/auth/me');
}

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string | undefined = error.config?.url;

      // 로그인 요청 자체의 401(자격 증명 오류)과 /auth/me 의 미인증 응답은
      // 화면을 이동시키지 않고 호출부가 처리하게 둔다.
      if (!isExpectedUnauthorized(url) && !sessionExpiredHandled) {
        sessionExpiredHandled = true;
        // reload() 는 401 을 다시 유발해 새로고침 루프가 될 수 있으므로
        // 로그인 화면으로 한 번만 이동한다.
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);
