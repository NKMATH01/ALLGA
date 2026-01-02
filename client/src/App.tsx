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
        return res.data.user;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
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
      <Toaster />
    </Router>
  );
}

export default App;
