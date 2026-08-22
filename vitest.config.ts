import { defineConfig } from 'vitest/config';

/*
  테스트 전용 설정.

  vite.config.ts 는 `root: 'client'` 라 클라이언트 번들 기준이다. 그대로 두면
  vitest 가 client/ 안에서만 테스트를 찾아 서버 테스트를 놓친다.
  테스트는 서버 순수 함수만 다루므로 루트를 프로젝트 루트로 두고 대상만 지정한다.
*/
export default defineConfig({
  test: {
    root: '.',
    include: ['server/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
});
