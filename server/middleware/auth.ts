import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      name: string;
      role: 'admin' | 'branch' | 'student' | 'parent';
      branchId?: string;
    };
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session?.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
};

export const requireBranchManager = (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.user?.role !== 'branch') {
    return res.status(403).json({ message: '지점 관리자 권한이 필요합니다.' });
  }
  next();
};

export const requireStudent = (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.user?.role !== 'student') {
    return res.status(403).json({ message: '학생 권한이 필요합니다.' });
  }
  next();
};

export const requireAdminOrBranch = (req: Request, res: Response, next: NextFunction) => {
  const role = req.session?.user?.role;
  if (role !== 'admin' && role !== 'branch') {
    return res.status(403).json({ message: '관리자 또는 지점 관리자 권한이 필요합니다.' });
  }
  next();
};
