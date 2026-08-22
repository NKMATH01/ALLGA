import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/*
 * 커넥션 예산
 *   앱 쿼리 풀(여기)        : 10
 *   세션 스토어 풀(index.ts): 5
 *   ------------------------------
 *   프로세스당 합계          : 15
 *
 * 인스턴스를 N 개 띄우면 15 × N 이 되므로 Neon 프로젝트 커넥션 한도 안에 들어와야 한다.
 * 버스트(동시 응시) 때는 커넥션을 늘리는 것보다 큐잉이 안전하다 —
 * 한도를 넘기면 새 연결이 거부되어 제출 자체가 실패한다.
 */
const client = postgres(process.env.DATABASE_URL, { max: 10 });

/** /health 의 SELECT 1 용. 앱 쿼리는 db(drizzle) 를 쓴다. */
export const dbClient = client;
export const db = drizzle(client, { schema });
