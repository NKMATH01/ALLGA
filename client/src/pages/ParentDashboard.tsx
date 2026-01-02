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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">학부모 대시보드</h1>
            <p className="text-sm text-gray-600">{user.name}님 환영합니다</p>
          </div>
          <Button variant="outline" onClick={() => logoutMutation.mutate()}>
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
            <p className="text-gray-600">연결된 자녀의 정보가 여기에 표시됩니다.</p>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>자녀 성적</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">자녀의 최근 시험 성적이 여기에 표시됩니다.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
