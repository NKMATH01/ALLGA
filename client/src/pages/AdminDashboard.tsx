import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Users, Building2, FileText, TrendingUp, LogOut, GraduationCap, Plus, Send, LayoutDashboard, Menu, X, ArrowUp, ArrowDown } from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

type MenuSection = 'dashboard' | 'branches' | 'exams' | 'distributions';

export default function AdminDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<MenuSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [viewingExam, setViewingExam] = useState<any>(null);
  const [editingExam, setEditingExam] = useState(false);
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return res.data.data;
    },
  });

  const { data: branches, refetch: refetchBranches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return res.data.data;
    },
  });

  const { data: exams, refetch: refetchExams } = useQuery({
    queryKey: ['exams'],
    queryFn: async () => {
      const res = await api.get('/exams');
      return res.data.data;
    },
  });

  const { data: distributions, refetch: refetchDistributions } = useQuery({
    queryKey: ['distributions'],
    queryFn: async () => {
      const res = await api.get('/distributions');
      return res.data.data;
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const createBranchMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/branches', data);
      return res.data;
    },
    onSuccess: () => {
      refetchBranches();
      setShowBranchModal(false);
      toast.success('지점이 등록되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '지점 등록에 실패했습니다.');
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/branches/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      refetchBranches();
      setShowBranchModal(false);
      setEditingBranch(null);
      toast.success('지점이 수정되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '지점 수정에 실패했습니다.');
    },
  });

  const deleteBranchMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/branches/${id}`);
      return res.data;
    },
    onSuccess: () => {
      refetchBranches();
      toast.success('지점이 삭제되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '지점 삭제에 실패했습니다.');
    },
  });

  const impersonateBranchMutation = useMutation({
    mutationFn: async (branchId: string) => {
      const res = await api.post(`/auth/impersonate/${branchId}`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success(data.message || '지점 관리자로 전환되었습니다.');
      // 페이지 새로고침하여 지점 관리자 대시보드로 이동
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '전환에 실패했습니다.');
    },
  });

  const uploadExamMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/exams/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      refetchExams();
      setUploadingFile(false);
      toast.success(data.message || '시험이 업로드되었습니다.');
    },
    onError: (error: any) => {
      setUploadingFile(false);
      toast.error(error.response?.data?.message || '시험 업로드에 실패했습니다.');
    },
  });

  const deleteExamMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/exams/${id}`);
      return res.data;
    },
    onSuccess: () => {
      refetchExams();
      toast.success('시험이 삭제되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '시험 삭제에 실패했습니다.');
    },
  });

  const createExamMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/exams', data);
      return res.data;
    },
    onSuccess: () => {
      refetchExams();
      setShowExamModal(false);
      toast.success('시험이 생성되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '시험 생성에 실패했습니다.');
    },
  });

  const updateExamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/exams/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      refetchExams();
      setViewingExam(null);
      setEditingExam(false);
      toast.success('시험이 수정되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '시험 수정에 실패했습니다.');
    },
  });

  const createDistributionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/distributions', data);
      return res.data;
    },
    onSuccess: (data) => {
      refetchDistributions();
      setShowDistributionModal(false);
      setSelectedBranches([]);
      toast.success(data.message || '시험이 배포되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '시험 배포에 실패했습니다.');
    },
  });

  const deleteDistributionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/distributions/${id}`);
      return res.data;
    },
    onSuccess: () => {
      refetchDistributions();
      toast.success('배포가 삭제되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '배포 삭제에 실패했습니다.');
    },
  });

  const reorderBranchesMutation = useMutation({
    mutationFn: async (branchIds: string[]) => {
      const res = await api.post('/branches/reorder', { branchIds });
      return res.data;
    },
    onSuccess: () => {
      refetchBranches();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '순서 변경에 실패했습니다.');
    },
  });

  const handleBranchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      address: formData.get('address'),
      phone: formData.get('phone'),
      managerName: formData.get('managerName'),
      username: formData.get('username'),
      password: formData.get('password'),
    };

    if (editingBranch) {
      updateBranchMutation.mutate({ id: editingBranch.id, data });
    } else {
      createBranchMutation.mutate(data);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingFile(true);
      uploadExamMutation.mutate(file);
      e.target.value = ''; // Reset input
    }
  };

  const handleExamSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const totalQuestions = parseInt(formData.get('totalQuestions') as string);

    if (!Number.isInteger(totalQuestions) || totalQuestions < 1) {
      toast.error('총 문제 수를 1 이상의 정수로 입력해주세요.');
      return;
    }

    // 정답키 파싱: 쉼표/공백 구분, 1~5 범위의 정수만 허용
    const answerKeyRaw = ((formData.get('answerKey') as string) || '').trim();

    if (!answerKeyRaw) {
      toast.error('정답을 입력해주세요. (예: 1,3,2,5,4)');
      return;
    }

    const answerKeyTokens = answerKeyRaw.split(/[\s,]+/).filter((t) => t !== '');

    if (answerKeyTokens.length !== totalQuestions) {
      toast.error(`정답 개수(${answerKeyTokens.length}개)가 총 문제 수(${totalQuestions}개)와 일치하지 않습니다.`);
      return;
    }

    const answerKey: number[] = [];
    for (let i = 0; i < answerKeyTokens.length; i++) {
      const token = answerKeyTokens[i];
      const value = Number(token);
      if (!/^[1-5]$/.test(token) || !Number.isInteger(value)) {
        toast.error(`${i + 1}번 문항의 정답 "${token}"이(가) 올바르지 않습니다. 정답은 1~5 사이의 숫자여야 합니다.`);
        return;
      }
      answerKey.push(value);
    }

    // Parse questions data - 간단 버전: 정답은 입력값, 나머지는 기본값
    const questionsData = [];
    for (let i = 1; i <= totalQuestions; i++) {
      questionsData.push({
        questionNumber: i,
        difficulty: '중',
        category: '미분류',
        subcategory: '',
        correctAnswer: answerKey[i - 1],
        points: 2,
      });
    }

    const data = {
      title: formData.get('title'),
      subject: formData.get('subject'),
      grade: formData.get('grade'),
      description: formData.get('description'),
      totalQuestions,
      totalScore: questionsData.reduce((sum, q) => sum + q.points, 0),
      questionsData,
      examTrends: [],
      overallReview: '',
    };

    createExamMutation.mutate(data);
  };

  const handleDistributionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      examId: formData.get('examId'),
      branchIds: selectedBranches,
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
    };

    createDistributionMutation.mutate(data);
  };

  const moveBranch = (index: number, direction: 'up' | 'down') => {
    if (!branches) return;

    const newBranches = [...branches];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newBranches.length) return;

    // Swap
    [newBranches[index], newBranches[targetIndex]] = [newBranches[targetIndex], newBranches[index]];

    // Update server
    const branchIds = newBranches.map((b: any) => b.id);
    reorderBranchesMutation.mutate(branchIds);
  };

  const menuItems = [
    { id: 'dashboard' as MenuSection, label: '대시보드', icon: LayoutDashboard },
    { id: 'branches' as MenuSection, label: '지점 관리', icon: Building2 },
    { id: 'exams' as MenuSection, label: '시험 생성', icon: Plus },
    { id: 'distributions' as MenuSection, label: '시험 배포', icon: Send },
  ];

  const renderDashboard = () => (
    <>
      {/*
        통계 카드: DESIGN.md 5.2. 아이콘 타일과 장식 원을 제거하고 라벨 / 수치 / 각주 3단으로.
        브라스 1곳 / 최대 2: 전사 평균 점수. 이 화면에서 유일한 성취 지표다 (DESIGN.md 1.2).
      */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 학생 수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">{stats?.totalStudents || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">전체 등록 학생</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 지점 수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">{stats?.totalBranches || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">운영 중인 지점</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 시험 수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">{stats?.totalExams || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">생성된 시험</p>
          </CardContent>
        </Card>

        <Card className="border-t-[3px] border-t-accent">
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">평균 점수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-accent-strong">{stats?.averageScore || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">전체 평균</p>
          </CardContent>
        </Card>
      </div>

      {/* Branch Statistics Table */}
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
            <Building2 className="w-5 h-5 text-ink-secondary" strokeWidth={1.5} />
            지점별 통계
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">지점명</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학생 수</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시험 응시 수</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">평균 점수</th>
                </tr>
              </thead>
              <tbody>
                {stats?.branchStats?.map((branch: any) => (
                  <tr
                    key={branch.branchName}
                    className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{branch.branchName}</td>
                    {/* 집계 수치는 상태가 아니라 데이터이므로 기능색을 쓰지 않는다 (DESIGN.md 2.3) */}
                    <td className="text-right px-4 py-3 text-ink">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <Users className="w-4 h-4 text-ink-tertiary" strokeWidth={1.5} />
                        {branch.studentCount}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 text-ink">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <FileText className="w-4 h-4 text-ink-tertiary" strokeWidth={1.5} />
                        {branch.examCount}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-ink">
                        <TrendingUp className="w-4 h-4 text-ink-tertiary" strokeWidth={1.5} />
                        {branch.averageScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderBranches = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Building2 className="w-5 h-5 text-ink-secondary" />
              지점 관리
            </CardTitle>
            <Button
              onClick={() => {
                setEditingBranch(null);
                setShowBranchModal(true);
              }}
              className="bg-action hover:bg-action-hover"
            >
              <Plus className="w-4 h-4 mr-2" />
              지점 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">순서</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">지점명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">주소</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">전화번호</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">관리자</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                </tr>
              </thead>
              <tbody>
                {branches?.map((branch: any, index: number) => (
                  <tr key={branch.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveBranch(index, 'up')}
                          disabled={index === 0}
                          className="h-8 w-8 p-0 border-line text-ink-secondary hover:bg-surface-subtle disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveBranch(index, 'down')}
                          disabled={index === branches.length - 1}
                          className="h-8 w-8 p-0 border-line text-ink-secondary hover:bg-surface-subtle disabled:opacity-30"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{branch.name}</td>
                    <td className="px-4 py-3 text-ink">{branch.address || '-'}</td>
                    <td className="px-4 py-3 text-ink">{branch.phone || '-'}</td>
                    <td className="px-4 py-3 text-ink">{branch.managerName || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(`${branch.name} 관리자로 로그인하시겠습니까?`)) {
                              impersonateBranchMutation.mutate(branch.id);
                            }
                          }}
                          className="border-line-strong text-ink hover:bg-surface-subtle"
                        >
                          로그인
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingBranch(branch);
                            setShowBranchModal(true);
                          }}
                          className="border-line text-ink-secondary hover:bg-surface-subtle"
                        >
                          수정
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('정말 삭제하시겠습니까?')) {
                              deleteBranchMutation.mutate(branch.id);
                            }
                          }}
                          className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-ink-secondary" />
                {editingBranch ? '지점 수정' : '지점 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleBranchSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-ink">지점명 *</label>
                  <Input
                    name="name"
                    defaultValue={editingBranch?.name}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink">주소</label>
                  <Input
                    name="address"
                    defaultValue={editingBranch?.address}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink">전화번호</label>
                  <Input
                    name="phone"
                    defaultValue={editingBranch?.phone}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink">관리자명 *</label>
                  <Input
                    name="managerName"
                    defaultValue={editingBranch?.managerName}
                    required
                    className="mt-1"
                  />
                </div>
                {!editingBranch && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-ink">관리자 아이디 *</label>
                      <Input
                        name="username"
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink">관리자 비밀번호 *</label>
                      <Input
                        name="password"
                        type="password"
                        required
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    className="flex-1 bg-action hover:bg-action-hover"
                  >
                    {editingBranch ? '수정' : '추가'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowBranchModal(false);
                      setEditingBranch(null);
                    }}
                    className="flex-1"
                  >
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  const renderExams = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Plus className="w-5 h-5 text-ink-secondary" />
              시험 생성
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowExamModal(true)}
                className="bg-action hover:bg-action-hover"
              >
                <Plus className="w-4 h-4 mr-2" />
                직접 생성
              </Button>
              <label
                htmlFor="exam-file-upload"
                className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-action-text transition-colors duration-150 ease-out ${
                  uploadingFile
                    ? 'cursor-not-allowed bg-ink-tertiary'
                    : 'cursor-pointer bg-action hover:bg-action-hover active:scale-[0.98]'
                }`}
              >
                <FileText className="w-4 h-4" />
                {uploadingFile ? '업로드 중...' : 'Excel 업로드'}
              </label>
              <input
                id="exam-file-upload"
                type="file"
                accept=".xlsx"
                onChange={handleFileUpload}
                disabled={uploadingFile}
                className="hidden"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {exams && exams.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시험명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">과목</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">문제 수</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">총점</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">생성일</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam: any) => (
                    <tr key={exam.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                      <td className="px-4 py-3 font-medium text-ink">{exam.title}</td>
                      <td className="px-4 py-3 text-ink">{exam.subject || '-'}</td>
                      <td className="text-center px-4 py-3 text-ink">{exam.totalQuestions}</td>
                      <td className="text-center px-4 py-3 text-ink">{exam.totalScore}점</td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(exam.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingExam(exam)}
                            className="border-line text-ink-secondary hover:bg-surface-subtle"
                          >
                            상세보기
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm('정말 삭제하시겠습니까?')) {
                                deleteExamMutation.mutate(exam.id);
                              }
                            }}
                            className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
              <p className="text-ink-secondary mb-4">등록된 시험이 없습니다.</p>
              <p className="text-sm text-ink-tertiary">Excel 파일을 업로드하거나 직접 생성하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 시험 직접 생성 간단 모달 */}
      {showExamModal && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 overflow-y-auto">
          <Card className="w-full max-w-2xl mx-4 my-8 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-ink-secondary" />
                시험 직접 생성 (간단 버전)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleExamSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink">시험명 *</label>
                    <Input name="title" required className="mt-1" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink">과목</label>
                    <Input name="subject" className="mt-1" placeholder="예: 수학" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink">학년</label>
                    <Input name="grade" className="mt-1" placeholder="예: 중3" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink">총 문제 수 *</label>
                    <Input name="totalQuestions" type="number" required defaultValue="20" className="mt-1" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink">정답 입력 *</label>
                  <textarea
                    name="answerKey"
                    required
                    className="mt-1 w-full rounded-md border border-line p-2 text-sm font-mono"
                    rows={3}
                    placeholder="1,3,2,5,4,..."
                  />
                  <p className="text-xs text-ink-secondary mt-1">
                    1번 문항부터 순서대로, 쉼표 또는 공백으로 구분해 입력하세요. 각 정답은 1~5 사이의 숫자이며,
                    개수는 총 문제 수와 같아야 합니다.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink">설명</label>
                  <textarea
                    name="description"
                    className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                    rows={2}
                  />
                </div>
                <div className="rounded-sm border border-fn-info-border bg-fn-info-surface p-3">
                  <p className="text-xs text-fn-info">
                    간단 버전: 모든 문제는 2점, 난이도 '중', 카테고리 '미분류'로 자동 설정됩니다.
                    정답은 위에 입력한 값이 그대로 사용됩니다. 난이도·영역별 상세 정보가 필요하면 Excel 업로드를 이용하세요.
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-action hover:bg-action-hover">
                    생성
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowExamModal(false)} className="flex-1">
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 시험 상세보기/수정 모달 */}
      {viewingExam && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 overflow-y-auto p-4">
          <Card className="w-full max-w-4xl mx-4 my-8 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <div className="flex justify-between items-start">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-ink-secondary" />
                  {editingExam ? '시험 수정' : '시험 상세 정보'}
                </CardTitle>
                <div className="flex gap-2">
                  {!editingExam && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingExam(true)}
                      className="border-line text-ink-secondary hover:bg-surface-subtle"
                    >
                      수정
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => {
                    setViewingExam(null);
                    setEditingExam(false);
                  }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[600px] overflow-y-auto">
              {editingExam ? (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);

                  // 문제 데이터 파싱
                  const questionsData = viewingExam.questionsData.map((q: any, idx: number) => ({
                    questionNumber: q.questionNumber,
                    difficulty: formData.get(`difficulty_${idx}`) as string,
                    category: formData.get(`category_${idx}`) as string,
                    subcategory: formData.get(`subcategory_${idx}`) as string || '',
                    correctAnswer: parseInt(formData.get(`correctAnswer_${idx}`) as string),
                    points: parseInt(formData.get(`points_${idx}`) as string),
                  }));

                  const data = {
                    title: formData.get('title'),
                    subject: formData.get('subject'),
                    grade: formData.get('grade'),
                    description: formData.get('description'),
                    totalQuestions: questionsData.length,
                    totalScore: questionsData.reduce((sum: number, q: any) => sum + q.points, 0),
                    questionsData,
                    overallReview: formData.get('overallReview'),
                  };

                  updateExamMutation.mutate({ id: viewingExam.id, data });
                }} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-ink">시험명 *</label>
                      <Input name="title" defaultValue={viewingExam.title} required className="mt-1" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink">과목</label>
                      <Input name="subject" defaultValue={viewingExam.subject} className="mt-1" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink">학년</label>
                      <Input name="grade" defaultValue={viewingExam.grade} className="mt-1" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-ink">총 문제 수</label>
                      <Input value={viewingExam.totalQuestions} disabled className="mt-1 bg-surface-subtle" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink">설명</label>
                    <textarea
                      name="description"
                      defaultValue={viewingExam.description}
                      className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                      rows={2}
                    />
                  </div>

                  {viewingExam.questionsData && viewingExam.questionsData.length > 0 && (
                    <div>
                      <h3 className="font-bold text-ink mb-3">문제 목록</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                          <thead>
                            <tr className="border-b border-line-strong bg-surface-subtle">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">번호</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">난이도</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">출제영역</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">유형분석</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">소분류</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">해설</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">정답</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">배점</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewingExam.questionsData.map((q: any, idx: number) => (
                              <tr key={q.number || q.questionNumber} className="border-b border-line-subtle">
                                <td className="px-4 py-3">{q.number || q.questionNumber}</td>
                                <td className="px-4 py-3">
                                  <select
                                    name={`difficulty_${idx}`}
                                    defaultValue={q.difficulty}
                                    className="w-full border border-line rounded px-2 py-1"
                                  >
                                    <option value="상">상</option>
                                    <option value="중">중</option>
                                    <option value="하">하</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    name={`domain_${idx}`}
                                    defaultValue={q.domain || q.category}
                                    className="h-8"
                                    placeholder="출제영역"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    name={`typeAnalysis_${idx}`}
                                    defaultValue={q.typeAnalysis}
                                    className="h-8"
                                    placeholder="유형분석"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    name={`subcategory_${idx}`}
                                    defaultValue={q.subcategory}
                                    className="h-8"
                                    placeholder="소분류"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    name={`explanation_${idx}`}
                                    defaultValue={q.explanation}
                                    className="h-8"
                                    placeholder="해설"
                                  />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Input
                                    name={`correctAnswer_${idx}`}
                                    type="number"
                                    defaultValue={q.correctAnswer}
                                    className="h-8 w-16 text-center mx-auto"
                                    min="1"
                                    max="5"
                                  />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Input
                                    name={`points_${idx}`}
                                    type="number"
                                    defaultValue={q.points}
                                    className="h-8 w-16 text-center mx-auto"
                                    min="1"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-ink">종합 평가</label>
                    <textarea
                      name="overallReview"
                      defaultValue={viewingExam.overallReview}
                      className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1 bg-action hover:bg-action-hover">
                      저장
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingExam(false)} className="flex-1">
                      취소
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-ink-secondary">시험명</p>
                      <p className="font-semibold text-lg">{viewingExam.title}</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-secondary">과목</p>
                      <p className="font-semibold">{viewingExam.subject || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-secondary">총 문제 수</p>
                      <p className="font-semibold">{viewingExam.totalQuestions}문제</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-secondary">총점</p>
                      <p className="font-semibold">{viewingExam.totalScore}점</p>
                    </div>
                  </div>

                  {viewingExam.questionsData && viewingExam.questionsData.length > 0 && (
                    <div>
                      <h3 className="font-bold text-ink mb-3">문제 목록</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                          <thead>
                            <tr className="border-b border-line-strong bg-surface-subtle">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">번호</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">난이도</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">출제영역</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">유형분석</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">소분류</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">해설</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">정답</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">배점</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewingExam.questionsData.map((q: any) => (
                              <tr key={q.number || q.questionNumber} className="border-b border-line-subtle hover:bg-surface-subtle">
                                <td className="px-4 py-3">{q.number || q.questionNumber}</td>
                                <td className="px-4 py-3">{q.difficulty || '-'}</td>
                                <td className="px-4 py-3">{q.domain || q.category || '-'}</td>
                                <td className="px-4 py-3">{q.typeAnalysis || '-'}</td>
                                <td className="px-4 py-3">{q.subcategory || '-'}</td>
                                <td className="px-4 py-3 max-w-xs truncate" title={q.explanation}>{q.explanation || '-'}</td>
                                <td className="px-4 py-3 text-center font-semibold text-ink">{q.correctAnswer}</td>
                                <td className="px-4 py-3 text-center">{q.points || q.score}점</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {viewingExam.examTrends && viewingExam.examTrends.length > 0 && (
                    <div>
                      <h3 className="font-bold text-ink mb-3">출제 경향</h3>
                      <div className="space-y-2">
                        {viewingExam.examTrends.map((trend: any, idx: number) => (
                          <div key={idx} className="bg-surface-subtle border border-line p-3 rounded-lg">
                            <p className="text-sm">
                              <span className="font-semibold text-ink-secondary">문항 {trend.questionNumbers}:</span>
                              <span className="text-ink ml-2">{trend.description}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewingExam.overallReview && (
                    <div>
                      <h3 className="font-bold text-ink mb-2">종합 평가</h3>
                      <p className="text-ink bg-surface-sunken p-3 rounded-lg">{viewingExam.overallReview}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  const renderDistributions = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Send className="w-5 h-5 text-ink-secondary" strokeWidth={1.5} />
              시험 배포
            </CardTitle>
            <Button
              onClick={() => setShowDistributionModal(true)}
              className="bg-action hover:bg-action-hover"
            >
              <Plus className="w-4 h-4 mr-2" />
              시험 배포
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {distributions && distributions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시험명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">지점</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시작일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">종료일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">배포일</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist: any) => (
                    <tr key={dist.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                      <td className="px-4 py-3 font-medium text-ink">{dist.exam?.title || '-'}</td>
                      <td className="px-4 py-3 text-ink">{dist.branchId}</td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(dist.startDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(dist.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm('정말 삭제하시겠습니까?')) {
                                deleteDistributionMutation.mutate(dist.id);
                              }
                            }}
                            className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Send className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
              <p className="text-ink-secondary mb-4">배포된 시험이 없습니다.</p>
              <p className="text-sm text-ink-tertiary">시험을 지점에 배포하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 배포 모달 */}
      {showDistributionModal && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-ink-secondary" strokeWidth={1.5} />
                시험 배포
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleDistributionSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-ink">시험 선택 *</label>
                  <select
                    name="examId"
                    required
                    className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                  >
                    <option value="">시험을 선택하세요</option>
                    {exams?.map((exam: any) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} ({exam.subject}, {exam.totalQuestions}문제)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-ink mb-2 block">
                    배포 지점 선택 * ({selectedBranches.length}개 선택됨)
                  </label>
                  <div className="max-h-40 overflow-y-auto border border-line rounded-md p-3 space-y-2">
                    {branches?.map((branch: any) => (
                      <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-sm p-1.5 transition-colors duration-150 ease-out hover:bg-surface-subtle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-line accent-action"
                          checked={selectedBranches.includes(branch.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBranches([...selectedBranches, branch.id]);
                            } else {
                              setSelectedBranches(selectedBranches.filter((id) => id !== branch.id));
                            }
                          }}
                        />
                        <span className="text-sm">{branch.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink">시작일 *</label>
                    <Input
                      name="startDate"
                      type="date"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink">종료일 *</label>
                    <Input
                      name="endDate"
                      type="date"
                      required
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    disabled={selectedBranches.length === 0}
                    className="flex-1 bg-action hover:bg-action-hover"
                  >
                    배포 ({selectedBranches.length}개 지점)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowDistributionModal(false);
                      setSelectedBranches([]);
                    }}
                    className="flex-1"
                  >
                    취소
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-[100dvh] bg-surface-sunken">
      {/*
        DESIGN.md 7.2 사이드바
          >= 768px : 문서 흐름 안 고정 기둥 (펼침 264px / 접힘 72px, 기존 동작 유지)
          <  768px : 흐름에서 제거하고 오버레이 드로어. 본문은 항상 100% 폭.
        기존 sidebarOpen 상태를 그대로 재사용한다.
      */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] flex flex-col bg-surface-inverse border-r border-line-inverse transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:static md:z-auto md:translate-x-0 md:transition-[width] ${
          sidebarOpen ? 'md:w-[264px]' : 'md:w-[72px]'
        }`}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-line-inverse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-line-inverse rounded-sm flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-ink-inverse" strokeWidth={1.5} />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <h2 className="font-semibold tracking-[-0.01em] text-ink-inverse whitespace-nowrap">
                  ALLGA 시스템
                </h2>
                <p className="text-xs text-ink-inverse-muted truncate">{user.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm transition-colors duration-150 ease-out ${
                  isActive
                    ? 'bg-surface text-ink font-semibold'
                    : 'text-ink-inverse-muted hover:bg-line-inverse hover:text-ink-inverse'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                {sidebarOpen && (
                  <span className="whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-line-inverse">
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm text-ink-inverse-muted transition-colors duration-150 ease-out hover:bg-line-inverse hover:text-ink-inverse"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {sidebarOpen && <span>로그아웃</span>}
          </button>
        </div>

        {/* Toggle Button (데스크톱 전용. 모바일에서는 드로어가 화면 밖으로 나가므로 헤더 토글을 쓴다) */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
          className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-surface border border-line-strong rounded-full items-center justify-center text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
        >
          {sidebarOpen ? <X className="w-3 h-3" strokeWidth={1.5} /> : <Menu className="w-3 h-3" strokeWidth={1.5} />}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        {/* Header */}
        <header className="bg-surface border-b border-line sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8 md:py-5">
            {/* 모바일 전용 드로어 토글. 기존 sidebarOpen 상태를 그대로 쓴다 */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="메뉴 열기"
              className="md:hidden h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-md text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
            >
              <Menu className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-[-0.015em] text-ink md:text-2xl">
                {menuItems.find((item) => item.id === activeSection)?.label}
              </h1>
              <p className="text-xs text-ink-tertiary mt-1 md:text-sm">
                {user.name}님 환영합니다
              </p>
            </div>

            {/* 야간 모드 토글 (DESIGN.md 6장) */}
            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 md:p-8">
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'branches' && renderBranches()}
          {activeSection === 'exams' && renderExams()}
          {activeSection === 'distributions' && renderDistributions()}
        </main>
      </div>
    </div>
  );
}
