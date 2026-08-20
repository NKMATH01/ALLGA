import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { GraduationCap, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState('');
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; userType?: string }) => {
      const res = await api.post('/auth/login', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '로그인에 실패했습니다.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password, userType: userType || undefined });
  };

  /*
   * DESIGN.md 9.2 매핑 적용 (오렌지레드 -> 네이비 체계)
   *   배경 그라디언트와 pulse 글로우 원은 제거 (1.4 그라디언트 금지, 8.2 자동 애니메이션 금지)
   *   로고 타일과 주 버튼은 --surface-inverse / --action 네이비로 통합
   *   브라스 사용 0곳. 로그인 화면에는 강조할 성취가 없으므로 브라스를 쓰지 않는다 (1.2)
   */
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-sunken p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-surface-inverse">
              <GraduationCap className="h-9 w-9 text-ink-inverse" strokeWidth={1.5} />
            </div>
          </div>
          <CardTitle className="text-center">
            <div className="text-2xl font-bold tracking-[-0.02em] text-ink">
              올가 미수등 시스템
            </div>
            <div className="mt-2 text-sm font-normal text-ink-tertiary">
              ALLGA Academy Management System
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-username" className="block text-sm font-semibold text-ink">
                아이디
              </label>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm font-semibold text-ink">
                비밀번호
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-usertype" className="block text-sm font-semibold text-ink">
                계정 유형 (선택)
              </label>
              {/* 네이티브 select 는 브라우저별 포커스 처리가 가장 불안정하므로
                  index.css 의 전역 :focus-visible 에 기대지 않고 DESIGN.md 5.1 을 명시한다 */}
              <select
                id="login-usertype"
                className="flex h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
              >
                <option value="">자동 감지</option>
                <option value="admin">관리자</option>
                <option value="branch">지점 관리자</option>
                <option value="student">학생</option>
                <option value="parent">학부모</option>
              </select>
            </div>
            <Button type="submit" className="h-12 w-full" disabled={loginMutation.isPending}>
              <LogIn className="mr-2 h-4 w-4" strokeWidth={1.5} />
              {loginMutation.isPending ? '로그인 중...' : '로그인'}
            </Button>
          </form>
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-md border border-line bg-surface-subtle p-4">
              <p className="mb-2 text-xs font-semibold text-ink">테스트 계정 (개발 환경)</p>
              <div className="space-y-1.5 text-xs text-ink-secondary">
                <p>
                  관리자
                  <span className="ml-2 rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-ink">
                    allga / allga
                  </span>
                </p>
                <p>
                  지점장
                  <span className="ml-2 rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-ink">
                    allga1 / allga1
                  </span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
