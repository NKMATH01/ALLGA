import { Request, Response, NextFunction } from 'express';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'branch' | 'student' | 'parent';
  branchId?: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    /** impersonation 시작 전의 원 신원. 복귀(restore) 용도로 보존한다. */
    originalUser?: SessionUser;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  next();
};

/*
  역할 검사 미들웨어 생성기.

  인증(누구인가)과 인가(무엇을 할 수 있는가)를 구분한다.
    세션 없음   → 401 UNAUTHORIZED (api-spec §12). 클라이언트 401 인터셉터가
                  세션 만료를 잡아 로그인 화면으로 보낸다.
    역할 불일치 → 403 FORBIDDEN
  둘을 뭉뚱그려 403 으로 내면 만료된 세션이 "권한 없음"으로 보여 재로그인 유도가 끊긴다.
*/
const requireRole = (roles: SessionUser['role'][], message: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ message });
    }
    next();
  };
};

export const requireAdmin = requireRole(['admin'], '관리자 권한이 필요합니다.');

export const requireBranchManager = requireRole(['branch'], '지점 관리자 권한이 필요합니다.');

export const requireStudent = requireRole(['student'], '학생 권한이 필요합니다.');

export const requireAdminOrBranch = requireRole(
  ['admin', 'branch'],
  '관리자 또는 지점 관리자 권한이 필요합니다.'
);
