import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

export default function ParentDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  return (
    /*
      DESIGN.md 시각 레이어만 적용한다. 이 화면은 정적 스텁이므로 기능은 그대로 두고
      헤더는 --surface-inverse 네이비 골격, 카드는 5.2, 빈 상태는 차분한 문장으로만 표현한다.
      사이드바는 원래 없으므로 새로 만들지 않는다. 브라스 0곳(성취 요소 없음).
    */
    <div className="min-h-[100dvh] bg-surface-sunken">
      <header className="bg-surface-inverse text-ink-inverse border-b border-line-inverse">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-[-0.015em] md:text-2xl">학부모 대시보드</h1>
            <p className="mt-1 text-sm text-ink-inverse-muted">{user.name}님 환영합니다</p>
          </div>
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            className="flex-shrink-0 border-line-inverse bg-transparent text-ink-inverse hover:bg-line-inverse"
          >
            로그아웃
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>자녀 목록</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="py-8 text-center text-sm text-ink-secondary">
              연결된 자녀의 정보가 여기에 표시됩니다.
            </p>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>자녀 성적</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-sm text-ink-secondary">
                자녀의 최근 시험 성적이 여기에 표시됩니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
