/*
  최소 구조화 로거.

  라이브러리를 새로 들이지 않고 JSON 한 줄만 출력한다. 로그 수집기가
  붙었을 때 파싱되도록 형태만 갖춘다.

    {"ts":"2026-08-22T...","level":"error","event":"exam.submit_failed","message":"...","...":...}

  event 는 `도메인.동작` 형태로 붙인다. 문장이 아니라 식별자여야
  나중에 카운트·알림 조건으로 쓸 수 있다.

  주의: data 에 학생 이름·답안·전화 같은 PII 를 넣지 않는다.
  식별이 필요하면 id 만 넣는다.
*/

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(data || {}),
  };

  const text = JSON.stringify(line);
  if (level === 'error') {
    console.error(text);
  } else if (level === 'warn') {
    console.warn(text);
  } else {
    console.log(text);
  }
}

/** Error 객체를 로그에 넣기 좋은 형태로 줄인다 (스택은 첫 3줄만). */
export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    };
  }
  return { message: String(error) };
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
};
