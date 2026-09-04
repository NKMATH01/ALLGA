import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  requireAuth,
  requireAdmin,
  requireBranchManager,
  requireStudent,
  requireAdminOrBranch,
} from './auth';
import type { SessionUser } from './auth';

/*
  역할 미들웨어의 인증/인가 분리 검증.

  과거 결함(P-5): 세션이 아예 없어도 "역할이 admin 이 아님"으로 취급해 403 을 냈다.
  그러면 클라이언트 api.ts 의 401 인터셉터가 세션 만료를 못 잡아, 만료된 사용자가
  "권한이 없습니다" 화면에 갇힌다. 세션 없음은 401, 역할 불일치만 403 이어야 한다.
*/

function makeUser(role: SessionUser['role']): SessionUser {
  return { id: 'u1', username: 'tester', name: '테스터', role };
}

/** status().json() 체인을 기록하는 가짜 res. */
function makeRes() {
  const recorded: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      recorded.status = code;
      return this;
    },
    json(body: unknown) {
      recorded.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, recorded };
}

function makeReq(user?: SessionUser): Request {
  return { session: user ? { user } : {} } as unknown as Request;
}

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  user?: SessionUser
) {
  const req = makeReq(user);
  const { res, recorded } = makeRes();
  const next = vi.fn();
  middleware(req, res, next);
  return { recorded, next };
}

const cases: Array<{
  name: string;
  middleware: (req: Request, res: Response, next: NextFunction) => unknown;
  allowed: SessionUser['role'][];
  denied: SessionUser['role'][];
}> = [
  { name: 'requireAdmin', middleware: requireAdmin, allowed: ['admin'], denied: ['branch', 'student', 'parent'] },
  {
    name: 'requireBranchManager',
    middleware: requireBranchManager,
    allowed: ['branch'],
    denied: ['admin', 'student', 'parent'],
  },
  {
    name: 'requireStudent',
    middleware: requireStudent,
    allowed: ['student'],
    denied: ['admin', 'branch', 'parent'],
  },
  {
    name: 'requireAdminOrBranch',
    middleware: requireAdminOrBranch,
    allowed: ['admin', 'branch'],
    denied: ['student', 'parent'],
  },
];

describe.each(cases)('$name', ({ middleware, allowed, denied }) => {
  it('세션이 없으면 401 이고 next 를 부르지 않는다', () => {
    const { recorded, next } = run(middleware);
    expect(recorded.status).toBe(401);
    expect(recorded.body).toEqual({ message: '로그인이 필요합니다.' });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(denied)('역할이 %s 면 403 이고 next 를 부르지 않는다', (role) => {
    const { recorded, next } = run(middleware, makeUser(role));
    expect(recorded.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(allowed)('역할이 %s 면 next 를 부르고 응답하지 않는다', (role) => {
    const { recorded, next } = run(middleware, makeUser(role));
    expect(next).toHaveBeenCalledTimes(1);
    expect(recorded.status).toBeUndefined();
  });
});

describe('requireAuth', () => {
  it('세션이 없으면 401', () => {
    const { recorded, next } = run(requireAuth);
    expect(recorded.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('역할과 무관하게 세션이 있으면 통과', () => {
    for (const role of ['admin', 'branch', 'student', 'parent'] as const) {
      const { recorded, next } = run(requireAuth, makeUser(role));
      expect(next).toHaveBeenCalledTimes(1);
      expect(recorded.status).toBeUndefined();
    }
  });
});
