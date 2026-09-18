import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { loginErrorMessage } from '../lib/loginError';
import { toast } from '../components/ui/toast';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { GraduationCap, ArrowRight, BookOpen, ClipboardCheck, ChartNoAxesCombined } from 'lucide-react';

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
      toast.error(loginErrorMessage(error));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password, userType: userType || undefined });
  };

  return (
    <main className="grid min-h-[100dvh] bg-surface lg:grid-cols-[1.05fr_1fr]">
      <section className="login-brand relative flex flex-col justify-between px-6 py-5 md:px-12 lg:min-h-screen lg:px-16 lg:py-12 xl:px-20">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-9 w-9" strokeWidth={1.5} aria-hidden="true" />
          <span className="text-xl font-bold tracking-[0.06em]">ALLGA<span className="ml-3 text-sm font-normal tracking-normal login-brand-copy">올가 미수등</span></span>
        </div>
        <div className="max-w-lg pb-1 pt-5 lg:py-20">
          <h1 className="text-2xl font-semibold leading-[1.3] tracking-[-0.035em] lg:text-5xl">배움의 과정이,<br className="hidden lg:block" /> 성장의 기록으로.</h1>
          <p className="login-brand-copy mt-6 hidden max-w-sm text-sm leading-7 lg:block lg:text-base">시험부터 성적 확인까지.<br />학생의 배움과 학원의 일상을 한곳에서 연결합니다.</p>
          <div className="mt-12 hidden border-t border-line-inverse pt-7 lg:block">
            <div className="flex items-center gap-4 py-3"><BookOpen className="h-5 w-5 shrink-0 login-brand-copy" strokeWidth={1.5} /><span className="text-sm">학생과 수업 관리</span></div>
            <div className="flex items-center gap-4 py-3"><ClipboardCheck className="h-5 w-5 shrink-0 login-brand-copy" strokeWidth={1.5} /><span className="text-sm">시험 운영과 답안 채점</span></div>
            <div className="flex items-center gap-4 py-3"><ChartNoAxesCombined className="h-5 w-5 shrink-0 login-brand-copy" strokeWidth={1.5} /><span className="text-sm">성적 분석과 학습 기록</span></div>
          </div>
        </div>
        <p className="login-brand-copy hidden text-xs lg:block">ALLGA Academy Management System</p>
      </section>
      <section className="relative flex flex-col px-6 pb-8 pt-2 md:px-12 lg:px-16 lg:pb-10 lg:pt-6">
        <div className="flex justify-end"><ThemeToggle /></div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center pb-6 pt-2 lg:py-12">
          <div className="mb-6 lg:mb-9">
            <h2 className="text-2xl font-bold tracking-[-0.03em] text-ink lg:text-3xl">반갑습니다</h2>
            <p className="mt-3 text-sm leading-6 text-ink-secondary">올가 미수등 시스템에 로그인하세요.</p>
          </div>
          <form onSubmit={handleSubmit} className="login-form space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-username" className="block text-sm font-semibold text-ink">
                아이디
              </label>
              <Input
                id="login-username"
                autoComplete="username"
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
                autoComplete="current-password"
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
                className="flex h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              {loginMutation.isPending ? '로그인 중...' : '로그인'}
              <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
            </Button>
          </form>
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-md border border-line bg-surface-subtle p-4">
              <p className="mb-2 text-xs font-semibold text-ink">테스트 계정 (개발 환경)</p>
              <div className="space-y-1.5 text-xs text-ink-secondary">
                <p>
                  관리자
                  <span className="ml-2 rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-ink">
                    allga / allga
                  </span>
                </p>
                <p>
                  지점장
                  <span className="ml-2 rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-ink">
                    allga1 / allga1
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
        <p className="pb-2 text-center text-xs text-ink-secondary">계정 정보는 소속 학원에 문의해 주세요.</p>
      </section>
    </main>
  );
}
