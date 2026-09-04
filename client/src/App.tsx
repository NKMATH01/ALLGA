import { Route, Router, Switch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import BranchDashboard from './pages/BranchDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './pages/ParentDashboard';
import { Toaster } from './components/ui/toaster';

function App() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const res = await api.get('/auth/me');
        if (!res.data.user) return null;
        // impersonation 중이면 원 신원을 함께 실어 보낸다. 학생·학부모 화면이
        // 이걸 보고 "원래 계정으로 돌아가기" 버튼을 띄운다.
        return { ...res.data.user, originalUser: res.data.originalUser ?? null };
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Toaster 는 로그인 화면과 로딩 화면에서도 필요하다.
  // (로그인 실패 알림이 여기서 뜬다) 그래서 분기 밖에서 항상 렌더한다.
  const content = isLoading ? (
    <div className="flex h-screen items-center justify-center">
      <div className="text-xl">로딩 중...</div>
    </div>
  ) : !user ? (
    <LoginPage />
  ) : (
    <Router>
      <Switch>
        <Route path="/" nest>
          {user.role === 'admin' && <AdminDashboard user={user} />}
          {user.role === 'branch' && <BranchDashboard user={user} />}
          {user.role === 'student' && <StudentDashboard user={user} />}
          {user.role === 'parent' && <ParentDashboard user={user} />}
        </Route>
        <Route>
          <div className="flex h-screen items-center justify-center">
            <div className="text-xl">페이지를 찾을 수 없습니다.</div>
          </div>
        </Route>
      </Switch>
    </Router>
  );

  return (
    <>
      {content}
      <Toaster />
    </>
  );
}

export default App;
