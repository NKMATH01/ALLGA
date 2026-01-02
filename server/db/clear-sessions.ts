import 'dotenv/config';

async function clearSessions() {
  try {
    console.log('세션 정리 스크립트 실행...');
    console.log('');
    console.log('브라우저에서 다음 단계를 따라주세요:');
    console.log('1. 브라우저 개발자 도구 열기 (F12)');
    console.log('2. Application 탭 클릭');
    console.log('3. 왼쪽 메뉴에서 Cookies → http://localhost:5173 클릭');
    console.log('4. 모든 쿠키 삭제');
    console.log('5. 페이지 새로고침 (F5)');
    console.log('');
    console.log('또는 시크릿/프라이빗 창으로 http://localhost:5173 을 열어주세요.');

    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

clearSessions();
