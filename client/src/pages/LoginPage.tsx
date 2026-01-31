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

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 relative overflow-hidden">
      {/* Animated background circles */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <Card className="w-full max-w-md shadow-2xl border-0 relative z-10 backdrop-blur-sm bg-white/95">
        <CardHeader className="space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform duration-300">
              <GraduationCap className="w-12 h-12 text-white" />
            </div>
          </div>
          <CardTitle className="text-center">
            <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              올가 미수등 시스템
            </div>
            <div className="mt-2 text-sm font-normal text-gray-500">
              ALLGA Academy Management System
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">아이디</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                required
                className="h-11 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">비밀번호</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="h-11 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">계정 유형 (선택사항)</label>
              <select
                className="flex h-11 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0 transition-all"
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
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
              disabled={loginMutation.isPending}
            >
              <LogIn className="w-4 h-4 mr-2" />
              {loginMutation.isPending ? '로그인 중...' : '로그인'}
            </Button>
          </form>
          {import.meta.env.DEV && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-2">테스트 계정 (개발 환경)</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p>👨‍💼 관리자: <span className="font-mono bg-white px-2 py-0.5 rounded">allga / allga</span></p>
                <p>🏢 지점장: <span className="font-mono bg-white px-2 py-0.5 rounded">allga1 / allga1</span></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
