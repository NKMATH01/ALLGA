import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Users, GraduationCap, FileText, BarChart3, LogOut, LayoutDashboard, Menu, X, UserCircle, Home, Plus, Trash2, LogIn, CheckCircle, XCircle, Edit, Sparkles, ArrowLeft } from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  branchId?: string;
}

type MenuSection = 'dashboard' | 'students' | 'classes' | 'exams' | 'distributions' | 'reports';

// DESIGN.md 2.4 등급 매핑. 1-2 우수 / 3-4 양호 / 5-6 보통 / 7-9 보완 필요.
// 등급은 시스템 오류가 아니므로 낮은 등급에도 --fn-error 를 쓰지 않는다.
const gradeBadgeClass = (grade?: number | string | null): string => {
  const g = Number(grade);
  if (!g || Number.isNaN(g)) return 'border-line bg-surface-subtle text-ink-secondary';
  if (g <= 2) return 'border-fn-success-border bg-fn-success-surface text-fn-success';
  if (g <= 4) return 'border-fn-info-border bg-fn-info-surface text-fn-info';
  if (g <= 6) return 'border-line bg-surface-subtle text-ink-secondary';
  return 'border-fn-warning-border bg-fn-warning-surface text-fn-warning';
};

export default function BranchDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<MenuSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editingClass, setEditingClass] = useState<any>(null);
  const [showRedistributeModal, setShowRedistributeModal] = useState(false);
  const [selectedDistribution, setSelectedDistribution] = useState<any>(null);
  const [redistributeType, setRedistributeType] = useState<'class' | 'student'>('class');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedReportDistribution, setSelectedReportDistribution] = useState<any>(null);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [selectedDashboardView, setSelectedDashboardView] = useState<'students' | 'classes' | 'distributions' | 'exam-attempts' | null>(null);
  const [selectedDistributionId, setSelectedDistributionId] = useState<string | null>(null);
  const [selectedClassStudents, setSelectedClassStudents] = useState<string[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('');

  const { data: branchStats } = useQuery({
    queryKey: ['branch', 'stats', user.branchId],
    queryFn: async () => {
      const res = await api.get(`/branch-students/stats`);
      return res.data.data;
    },
    enabled: !!user.branchId,
  });

  const { data: students, refetch: refetchStudents } = useQuery({
    queryKey: ['students', user.branchId],
    queryFn: async () => {
      const res = await api.get('/students');
      return res.data.data;
    },
  });

  const { data: classes, refetch: refetchClasses } = useQuery({
    queryKey: ['classes', user.branchId],
    queryFn: async () => {
      const res = await api.get('/classes');
      return res.data.data;
    },
  });

  const { data: distributions } = useQuery({
    queryKey: ['distributions', user.branchId],
    queryFn: async () => {
      const res = await api.get('/distributions');
      return res.data.data;
    },
  });

  const { data: distributionStudents, refetch: refetchDistributionStudents } = useQuery({
    queryKey: ['distribution-students', selectedReportDistribution?.id],
    queryFn: async () => {
      if (!selectedReportDistribution?.id) return null;
      const res = await api.get(`/distributions/${selectedReportDistribution.id}/students`);
      return res.data.data;
    },
    enabled: !!selectedReportDistribution?.id,
  });

  // 대시보드용: 모든 배포의 학생 정보 가져오기
  const { data: allDistributionStudents, refetch: refetchAllDistributionStudents } = useQuery({
    queryKey: ['all-distribution-students', user.branchId],
    queryFn: async () => {
      if (!distributions || distributions.length === 0) return [];

      // 모든 배포에 대해 학생 정보 가져오기
      const allStudents = await Promise.all(
        distributions.map(async (dist: any) => {
          try {
            const res = await api.get(`/distributions/${dist.id}/students`);
            return {
              distribution: dist,
              ...res.data.data,
            };
          } catch (error) {
            return null;
          }
        })
      );

      return allStudents.filter(Boolean);
    },
    enabled: !!distributions && distributions.length > 0,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const createStudentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/students', data);
      return res.data;
    },
    onSuccess: () => {
      refetchStudents();
      setShowStudentModal(false);
      alert('학생이 등록되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '학생 등록에 실패했습니다.');
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/students/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      refetchStudents();
      setShowStudentModal(false);
      setEditingStudent(null);
      alert('학생 정보가 수정되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '학생 수정에 실패했습니다.');
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/classes', data);
      return res.data;
    },
    onSuccess: () => {
      refetchClasses();
      setShowClassModal(false);
      alert('반이 생성되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '반 생성에 실패했습니다.');
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/classes/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      refetchClasses();
      setShowClassModal(false);
      setEditingClass(null);
      alert('반이 수정되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '반 수정에 실패했습니다.');
    },
  });

  const redistributeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/distributions/${id}`, data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['distributions', user.branchId] });
      setShowRedistributeModal(false);
      setSelectedDistribution(null);
      setSelectedClassId('');
      setSelectedStudentIds([]);
      alert(data.message || '지점내 배포가 완료되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '지점내 배포에 실패했습니다.');
    },
  });

  const loginAsStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await api.post(`/students/${studentId}/login-as`);
      return res.data;
    },
    onSuccess: (data) => {
      alert(data.message || '학생으로 로그인되었습니다.');
      window.location.href = '/student';
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '학생 로그인에 실패했습니다.');
    },
  });

  const createAttemptMutation = useMutation({
    mutationFn: async ({ studentId, distributionId }: { studentId: string; distributionId: string }) => {
      const res = await api.post('/exam-attempts/branch-create', { studentId, distributionId });
      return res.data;
    },
    onSuccess: () => {
      refetchDistributionStudents();
      refetchAllDistributionStudents();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '답안지 생성에 실패했습니다.');
    },
  });

  const gradeAttemptMutation = useMutation({
    mutationFn: async ({ attemptId, answers }: { attemptId: string; answers: any }) => {
      const res = await api.put(`/exam-attempts/${attemptId}/branch-grade`, { answers });
      return res.data;
    },
    onSuccess: async () => {
      // Invalidate all related queries to force refetch
      await queryClient.invalidateQueries({ queryKey: ['distribution-students'] });
      await queryClient.invalidateQueries({ queryKey: ['all-distribution-students'] });
      refetchDistributionStudents();
      refetchAllDistributionStudents();
      setShowAnswerModal(false);
      setSelectedAttempt(null);
      alert('답안이 저장되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '답안 저장에 실패했습니다.');
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: async (attemptId: string) => {
      const res = await api.post(`/reports/generate/${attemptId}`);
      return res.data;
    },
    onSuccess: (data) => {
      refetchDistributionStudents();
      refetchAllDistributionStudents();
      alert(data.message || 'AI 분석이 완료되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'AI 분석에 실패했습니다.');
    },
  });

  const deleteDistributionMutation = useMutation({
    mutationFn: async (distributionId: string) => {
      const res = await api.delete(`/distributions/${distributionId}`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['distributions', user.branchId] });
      setSelectedReportDistribution(null);
      alert(data.message || '배포가 삭제되었습니다.');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '배포 삭제에 실패했습니다.');
    },
  });

  const handleStudentSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      school: formData.get('school'),
      grade: formData.get('grade'),
      parentPhone: formData.get('parentPhone'),
    };

    if (editingStudent) {
      // Add password if provided
      const password = formData.get('password');
      if (password && password.toString().trim() !== '') {
        data.password = password;
      }
      updateStudentMutation.mutate({ id: editingStudent.id, data });
    } else {
      createStudentMutation.mutate(data);
    }
  };

  const handleClassSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      grade: formData.get('grade'),
      description: formData.get('description'),
      studentIds: selectedClassStudents,
    };

    if (editingClass) {
      updateClassMutation.mutate({ id: editingClass.id, data });
    } else {
      createClassMutation.mutate(data);
    }
  };

  const handleRedistributeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedDistribution) return;

    const data: any = {};

    if (redistributeType === 'class') {
      if (!selectedClassId) {
        alert('반을 선택해주세요.');
        return;
      }
      data.classId = selectedClassId;
    } else {
      if (selectedStudentIds.length === 0) {
        alert('학생을 선택해주세요.');
        return;
      }
      data.studentIds = selectedStudentIds;
    }

    redistributeMutation.mutate({ id: selectedDistribution.id, data });
  };

  const handleAnswerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Get exam info from either distributionStudents or allDistributionStudents
    let totalQuestions = 30; // default
    if (distributionStudents?.exam?.totalQuestions) {
      totalQuestions = distributionStudents.exam.totalQuestions;
    } else if (selectedAttempt?.distributionId && allDistributionStudents) {
      const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
      if (distData?.exam?.totalQuestions) {
        totalQuestions = distData.exam.totalQuestions;
      }
    }

    // Build answers object from form data
    const answers: any = {};
    for (let i = 1; i <= totalQuestions; i++) {
      const value = formData.get(`q${i}`);
      if (value !== null && value !== '') {
        answers[i] = parseInt(value.toString());
      }
    }

    if (Object.keys(answers).length === 0) {
      alert('최소 1개 이상의 답안을 입력해주세요.');
      return;
    }

    // 답안이 있는 경우: 기존 답안 수정
    if (selectedAttempt.attemptId) {
      gradeAttemptMutation.mutate({ attemptId: selectedAttempt.attemptId, answers });
    } else {
      // 답안이 없는 경우: 새 답안 생성 후 답안 입력
      if (!selectedAttempt.studentId || !selectedAttempt.distributionId) {
        alert('학생 정보가 올바르지 않습니다.');
        return;
      }

      // 먼저 답안지 생성
      createAttemptMutation.mutate(
        {
          studentId: selectedAttempt.studentId,
          distributionId: selectedAttempt.distributionId,
        },
        {
          onSuccess: (data) => {
            // 생성된 답안지 ID로 답안 입력
            const newAttemptId = data.data?.id || data.id;
            if (newAttemptId) {
              gradeAttemptMutation.mutate({ attemptId: newAttemptId, answers });
            } else {
              alert('답안지 생성은 성공했으나 ID를 찾을 수 없습니다.');
            }
          },
        }
      );
    }
  };

  const menuItems = [
    { id: 'dashboard' as MenuSection, label: '대시보드', icon: LayoutDashboard },
    { id: 'students' as MenuSection, label: '학생 관리', icon: Users },
    { id: 'classes' as MenuSection, label: '반 관리', icon: Home },
    { id: 'exams' as MenuSection, label: '배포 시험', icon: FileText },
    { id: 'distributions' as MenuSection, label: '배포된 시험', icon: FileText },
    { id: 'reports' as MenuSection, label: '보고서', icon: BarChart3 },
  ];

  const renderDashboard = () => (
    <>
      {/*
        통계 카드: DESIGN.md 5.2. 아이콘 타일과 장식 원을 제거하고 라벨 / 수치 / 각주 3단으로.
        선택 상태는 확대(scale)가 아니라 테두리와 면으로 표시한다 (8.2 자동 애니메이션 금지).
        카드가 4개이므로 그리드도 4열로 맞춘다 (기존 5열은 빈 칸이 남았다).
        브라스 0곳: 관리 화면에는 강조할 성취 요소가 없다 (DESIGN.md 1.2).
      */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card
          className={`cursor-pointer transition-colors duration-150 ease-out hover:border-line-strong ${
            selectedDashboardView === 'students' ? 'border-line-strong bg-surface-subtle' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'students' ? null : 'students')}
        >
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 학생 수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">{students?.length || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">등록된 학생. 눌러서 목록 보기</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">보고서 완료</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">
              {allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithReports = distData.students?.filter((s: any) => s.hasReport) || [];
                return total + studentsWithReports.length;
              }, 0) || 0}
            </div>
            <p className="text-xs text-ink-secondary mt-3">AI 분석 완료 학생</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors duration-150 ease-out hover:border-line-strong ${
            selectedDashboardView === 'classes' ? 'border-line-strong bg-surface-subtle' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'classes' ? null : 'classes')}
        >
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 반 수</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">{classes?.length || 0}</div>
            <p className="text-xs text-ink-secondary mt-3">운영 중인 반. 눌러서 목록 보기</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors duration-150 ease-out hover:border-line-strong ${
            selectedDashboardView === 'exam-attempts' ? 'border-line-strong bg-surface-subtle' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'exam-attempts' ? null : 'exam-attempts')}
        >
          <CardContent className="p-5 pt-5">
            <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">시험</p>
            <div className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">
              {allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithAttempts = distData.students?.filter((s: any) => s.hasAttempt) || [];
                return total + studentsWithAttempts.length;
              }, 0) || 0}
            </div>
            <p className="text-xs text-ink-secondary mt-3">응시와 채점 학생. 눌러서 목록 보기</p>
          </CardContent>
        </Card>
      </div>

      {/* 상세 정보 표 */}
      {selectedDashboardView === 'students' && (
        <Card className="border-0 shadow-xl bg-surface mb-8">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-ink-secondary" />
              학생 목록
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {students && students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">이름</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학년</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학교</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">연락처</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학부모 연락처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student: any) => (
                      <tr key={student.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-4 py-3 font-medium text-ink">{student.user?.name}</td>
                        <td className="px-4 py-3 text-ink">{student.grade || '-'}</td>
                        <td className="px-4 py-3 text-ink">{student.school || '-'}</td>
                        <td className="px-4 py-3 text-ink">{student.user?.phone || '-'}</td>
                        <td className="px-4 py-3 text-ink">{student.parentPhone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">등록된 학생이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedDashboardView === 'classes' && (
        <Card className="border-0 shadow-xl bg-surface mb-8">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Home className="w-5 h-5 text-fn-success" />
              반 목록
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {classes && classes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">반 이름</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학년</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">설명</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((cls: any) => (
                      <tr key={cls.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-4 py-3 font-medium text-ink">{cls.name}</td>
                        <td className="px-4 py-3 text-ink">{cls.grade || '-'}</td>
                        <td className="px-4 py-3 text-ink">{cls.description || '-'}</td>
                        <td className="px-4 py-3 text-ink">{new Date(cls.createdAt).toLocaleDateString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Home className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">등록된 반이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedDashboardView === 'exam-attempts' && (
        <Card className="border-0 shadow-xl bg-surface mb-8">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-fn-info" />
              시험 응시 및 채점 학생
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {allDistributionStudents && allDistributionStudents.length > 0 ? (
              <div className="space-y-6">
                {allDistributionStudents
                  .filter((distData: any) => !selectedDistributionId || distData.distribution.id === selectedDistributionId)
                  .map((distData: any) => {
                  // 배부된 모든 학생 표시 (응시 여부 상관없이)
                  const allStudents = distData.students || [];
                  if (allStudents.length === 0) return null;

                  return (
                    <div key={distData.distribution.id} className="border border-line rounded-md p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-ink">{distData.exam?.title}</h3>
                          <p className="text-sm text-ink-secondary">
                            {distData.exam?.subject} • {distData.exam?.totalQuestions}문항 • {distData.exam?.totalScore}점
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-ink-secondary">배부 학생</span>
                          <div className="text-2xl font-bold text-fn-info">{allStudents.length}명</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                          <thead>
                            <tr className="border-b border-line-subtle">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학생</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">점수</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">등급</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">상태</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allStudents.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                                <td className="px-4 py-3 font-medium text-ink">{student.studentName}</td>
                                <td className="px-4 py-3 text-center text-ink">
                                  {student.hasAttempt ? `${student.score || 0} / ${student.maxScore || 0}` : '- / -'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {student.hasAttempt && student.grade ? (
                                    <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(student.grade)}`}>
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {student.hasAttempt ? (
                                    student.isSubmitted ? (
                                      <span className="inline-block px-2 py-1 bg-fn-success-surface text-fn-success rounded text-xs font-medium">
                                        제출 완료
                                      </span>
                                    ) : (
                                      <span className="inline-block px-2 py-1 bg-fn-warning-surface text-fn-warning rounded text-xs font-medium">
                                        작성 중
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-surface-subtle text-ink-secondary rounded text-xs font-medium">
                                      미응시
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1 justify-center flex-wrap">
                                    {student.hasAttempt ? (
                                      <>
                                        {/* 답안이 있는 경우: 수정, 삭제, AI 분석 버튼 */}
                                        {/* 수정 버튼 */}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            console.log('수정 버튼 클릭됨!', student);

                                            try {
                                              // Fetch attempt details to get answers
                                              const attemptRes = await api.get(`/exam-attempts/${student.attemptId}`);
                                              const attemptData = attemptRes.data.data || attemptRes.data;

                                              console.log('답안 데이터:', attemptData);

                                              setSelectedAttempt({
                                                ...student,
                                                distributionId: distData.distribution.id,
                                                answers: attemptData.answers || {},
                                              });
                                              setShowAnswerModal(true);
                                            } catch (error: any) {
                                              console.error('답안 조회 실패:', error);
                                              alert(error.response?.data?.message || '답안 정보를 불러오는데 실패했습니다.');
                                            }
                                          }}
                                          className="border-line text-ink-secondary hover:bg-surface-subtle"
                                        >
                                          <Edit className="w-3 h-3 mr-1" />
                                          수정
                                        </Button>

                                        {/* 삭제 버튼 */}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`${student.studentName} 학생의 답안을 삭제하시겠습니까?`)) {
                                              // Delete attempt API call
                                              api.delete(`/exam-attempts/${student.attemptId}`)
                                                .then(() => {
                                                  refetchAllDistributionStudents();
                                                  alert('답안이 삭제되었습니다.');
                                                })
                                                .catch((error) => {
                                                  alert(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                                });
                                            }
                                          }}
                                          className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                                        >
                                          <Trash2 className="w-3 h-3 mr-1" />
                                          삭제
                                        </Button>

                                        {/* AI 분석 버튼 */}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (student.hasReport) {
                                              // Open report in new window (HTML format)
                                              const reportUrl = `/api/reports/${student.reportId}`;
                                              window.open(reportUrl, '_blank', 'width=1000,height=800');
                                            } else {
                                              // Generate report
                                              if (confirm(`${student.studentName} 학생의 AI 분석을 시작하시겠습니까?`)) {
                                                generateReportMutation.mutate(student.attemptId);
                                              }
                                            }
                                          }}
                                          disabled={generateReportMutation.isPending}
                                          className={
                                            student.hasReport
                                              ? 'border-line text-ink-secondary hover:bg-surface-subtle'
                                              : 'border-line text-ink-secondary hover:bg-surface-subtle'
                                          }
                                        >
                                          <Sparkles className="w-3 h-3 mr-1" />
                                          {student.hasReport ? '보고서' : 'AI 분석'}
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        {/* 답안이 없는 경우: 답안 입력 버튼만 */}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            alert(`${student.studentName} 학생의 답안 입력을 시작합니다.`);
                                            console.log('답안 입력 버튼 클릭!', student);
                                            console.log('distData:', distData);

                                            const attemptData = {
                                              studentId: student.studentId,
                                              studentName: student.studentName,
                                              distributionId: distData.distribution.id,
                                              examId: distData.exam.id,
                                              answers: {},
                                            };
                                            console.log('설정할 attemptData:', attemptData);

                                            setSelectedAttempt(attemptData);
                                            setShowAnswerModal(true);

                                            console.log('모달 열림 상태 설정 완료');
                                          }}
                                          className="border-line-strong text-ink hover:bg-surface-subtle"
                                        >
                                          <Plus className="w-3 h-3 mr-1" />
                                          답안 입력
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">배부된 시험이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 최근 활동 - 시험 응시 학생 */}
      {!selectedDashboardView && (
        <Card className="border-0 shadow-xl bg-surface">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ink-secondary" />
              시험 응시 학생
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {allDistributionStudents && allDistributionStudents.length > 0 ? (
              <div className="space-y-6">
                {allDistributionStudents.map((distData: any) => {
                  // 최근 활동에서는 응시한 학생만 표시
                  const studentsWithAttempts = distData.students?.filter((s: any) => s.hasAttempt) || [];
                  if (studentsWithAttempts.length === 0) return null;

                  return (
                    <div key={distData.distribution.id} className="border-2 border-line rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-ink">{distData.exam?.title}</h3>
                          <p className="text-sm text-ink-secondary">
                            {distData.exam?.subject} • {distData.exam?.totalQuestions}문항 • {distData.exam?.totalScore}점
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-ink-secondary">응시 학생</span>
                          <div className="text-2xl font-bold text-ink-secondary">{studentsWithAttempts.length}명</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                          <thead>
                            <tr className="border-b border-line">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학생</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">점수</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">등급</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">상태</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsWithAttempts.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                                <td className="px-4 py-3 font-medium text-ink">{student.studentName}</td>
                                <td className="px-4 py-3 text-center text-ink">
                                  {student.score || 0} / {student.maxScore || 0}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {student.grade ? (
                                    <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(student.grade)}`}>
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {student.isSubmitted ? (
                                    <span className="inline-block px-2 py-1 bg-fn-success-surface text-fn-success rounded text-xs font-medium">
                                      제출 완료
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-fn-warning-surface text-fn-warning rounded text-xs font-medium">
                                      작성 중
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1 justify-center flex-wrap">
                                    {/* 수정 버튼 */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        console.log('수정 버튼 클릭됨!', student);

                                        try {
                                          // Fetch attempt details to get answers
                                          const attemptRes = await api.get(`/exam-attempts/${student.attemptId}`);
                                          const attemptData = attemptRes.data.data || attemptRes.data;

                                          console.log('답안 데이터:', attemptData);

                                          setSelectedAttempt({
                                            ...student,
                                            distributionId: distData.distribution.id,
                                            answers: attemptData.answers || {},
                                          });
                                          setShowAnswerModal(true);
                                        } catch (error: any) {
                                          console.error('답안 조회 실패:', error);
                                          alert(error.response?.data?.message || '답안 정보를 불러오는데 실패했습니다.');
                                        }
                                      }}
                                      className="border-line text-ink-secondary hover:bg-surface-subtle"
                                    >
                                      <Edit className="w-3 h-3 mr-1" />
                                      수정
                                    </Button>

                                    {/* 삭제 버튼 */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`${student.studentName} 학생의 답안을 삭제하시겠습니까?`)) {
                                          // Delete attempt API call
                                          api.delete(`/exam-attempts/${student.attemptId}`)
                                            .then(() => {
                                              refetchAllDistributionStudents();
                                              alert('답안이 삭제되었습니다.');
                                            })
                                            .catch((error) => {
                                              alert(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                            });
                                        }
                                      }}
                                      className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                                    >
                                      <Trash2 className="w-3 h-3 mr-1" />
                                      삭제
                                    </Button>

                                    {/* AI 분석 버튼 */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (student.hasReport) {
                                          // Open report in new window (HTML format)
                                          const reportUrl = `/api/reports/${student.reportId}`;
                                          window.open(reportUrl, '_blank', 'width=1000,height=800');
                                        } else {
                                          // Generate report
                                          if (confirm(`${student.studentName} 학생의 AI 분석을 시작하시겠습니까?`)) {
                                            generateReportMutation.mutate(student.attemptId);
                                          }
                                        }
                                      }}
                                      disabled={generateReportMutation.isPending}
                                      className={
                                        student.hasReport
                                          ? 'border-line text-ink-secondary hover:bg-surface-subtle'
                                          : 'border-line text-ink-secondary hover:bg-surface-subtle'
                                      }
                                    >
                                      <Sparkles className="w-3 h-3 mr-1" />
                                      {student.hasReport ? '보고서' : 'AI 분석'}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">시험을 응시한 학생이 없습니다.</p>
                <p className="text-sm text-ink-tertiary mt-2">위의 카드를 클릭하여 상세 정보를 확인하세요.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );

  const renderStudents = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-ink-secondary" />
              학생 관리
            </CardTitle>
            <Button
              onClick={() => {
                setEditingStudent(null);
                setShowStudentModal(true);
              }}
              className="bg-action hover:bg-action-hover"
            >
              <Plus className="w-4 h-4 mr-2" />
              학생 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {students && students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">이름</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학년</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학교</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">아이디</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">연락처</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student: any) => (
                    <tr key={student.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                      <td className="px-4 py-3 font-medium text-ink">{student.user?.name}</td>
                      <td className="px-4 py-3 text-ink">{student.grade || '-'}</td>
                      <td className="px-4 py-3 text-ink">{student.school || '-'}</td>
                      <td className="px-4 py-3 text-ink">{student.user?.username}</td>
                      <td className="px-4 py-3 text-ink">{student.user?.phone || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`${student.user?.name} 학생으로 로그인하시겠습니까?`)) {
                                loginAsStudentMutation.mutate(student.id);
                              }
                            }}
                            className="border-line-strong text-ink hover:bg-surface-subtle"
                          >
                            <LogIn className="w-4 h-4 mr-1" />
                            로그인
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingStudent(student);
                              setShowStudentModal(true);
                            }}
                            className="border-line text-ink-secondary hover:bg-surface-subtle"
                          >
                            수정
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
              <Users className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
              <p className="text-ink-secondary">등록된 학생이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 학생 추가/수정 모달 */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-ink-secondary" />
                {editingStudent ? '학생 수정' : '학생 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleStudentSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-ink">이름 *</label>
                    <Input name="name" defaultValue={editingStudent?.user?.name} required className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-ink">학년</label>
                    <Input name="grade" defaultValue={editingStudent?.grade} className="mt-1" placeholder="예: 중3" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-ink">학교</label>
                  <Input name="school" defaultValue={editingStudent?.school} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-ink">학생 연락처 * (로그인 아이디)</label>
                    <Input
                      name="phone"
                      defaultValue={editingStudent?.user?.phone}
                      required
                      className="mt-1"
                      placeholder="01012345678"
                      disabled={!!editingStudent}
                    />
                    {!editingStudent && (
                      <p className="text-xs text-ink-secondary mt-1">※ 연락처가 로그인 아이디가 되며, 비밀번호는 끝 4자리로 자동 설정됩니다.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-ink">학부모 연락처 (로그인 아이디)</label>
                    <Input
                      name="parentPhone"
                      defaultValue={editingStudent?.parentPhone}
                      className="mt-1"
                      placeholder="01087654321"
                    />
                  </div>
                </div>
                {editingStudent && (
                  <div>
                    <label className="text-sm font-semibold text-ink">새 비밀번호 (선택)</label>
                    <Input
                      type="password"
                      name="password"
                      className="mt-1"
                      placeholder="변경하지 않으려면 비워두세요"
                    />
                    <p className="text-xs text-ink-secondary mt-1">※ 비밀번호를 입력하면 새 비밀번호로 변경됩니다.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-action hover:bg-action-hover">
                    {editingStudent ? '수정' : '추가'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowStudentModal(false);
                      setEditingStudent(null);
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

  const renderClasses = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <Home className="w-5 h-5 text-fn-success" />
              반 관리
            </CardTitle>
            <Button
              onClick={() => {
                setEditingClass(null);
                setSelectedClassStudents([]);
                setGradeFilter('');
                setShowClassModal(true);
              }}
              className="bg-action hover:bg-action-hover"
            >
              <Plus className="w-4 h-4 mr-2" />
              반 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {classes && classes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls: any) => (
                <Card key={cls.id} className="transition-colors duration-150 ease-out hover:border-line-strong">
                  <CardHeader className="border-b border-line bg-surface-subtle">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{cls.name}</CardTitle>
                        <p className="text-sm text-ink-secondary mt-1">{cls.grade || '-'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setEditingClass(cls);
                          // Load students in this class
                          try {
                            const res = await api.get(`/classes/${cls.id}/students`);
                            const classStudents = res.data.data || [];
                            setSelectedClassStudents(classStudents.map((s: any) => s.id));
                          } catch (error) {
                            console.error('반 학생 조회 실패:', error);
                            setSelectedClassStudents([]);
                          }
                          setShowClassModal(true);
                        }}
                        className="border-line-strong text-ink hover:bg-surface-subtle"
                      >
                        수정
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-ink-secondary">{cls.description || '설명 없음'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Home className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
              <p className="text-ink-secondary">등록된 반이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 반 추가/수정 모달 */}
      {showClassModal && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl mx-4 max-h-[90dvh] overflow-y-auto rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5 text-fn-success" />
                {editingClass ? '반 수정' : '반 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleClassSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-ink">반 이름 *</label>
                  <Input name="name" defaultValue={editingClass?.name} required className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-ink">학년</label>
                  <Input name="grade" defaultValue={editingClass?.grade} className="mt-1" placeholder="예: 중3" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-ink">설명</label>
                  <textarea
                    name="description"
                    defaultValue={editingClass?.description}
                    className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                    rows={3}
                  />
                </div>

                {/* 학생 선택 섹션 */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-semibold text-ink">학생 선택</label>
                    <select
                      value={gradeFilter}
                      onChange={(e) => setGradeFilter(e.target.value)}
                      className="text-sm border border-line rounded-md px-3 py-1"
                    >
                      <option value="">전체 학년</option>
                      <option value="중1">중1</option>
                      <option value="중2">중2</option>
                      <option value="중3">중3</option>
                      <option value="고1">고1</option>
                      <option value="고2">고2</option>
                      <option value="고3">고3</option>
                    </select>
                  </div>
                  <div className="border border-line rounded-md p-3 max-h-60 overflow-y-auto bg-surface-sunken">
                    {students && students.length > 0 ? (
                      students
                        .filter((student: any) => !gradeFilter || student.grade === gradeFilter)
                        .map((student: any) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-surface cursor-pointer rounded transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedClassStudents.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedClassStudents([...selectedClassStudents, student.id]);
                                } else {
                                  setSelectedClassStudents(selectedClassStudents.filter(id => id !== student.id));
                                }
                              }}
                              className="w-4 h-4 text-fn-success"
                            />
                            <span className="text-sm">
                              {student.user?.name}
                              <span className="text-ink-secondary ml-2">({student.grade || '미지정'})</span>
                            </span>
                          </label>
                        ))
                    ) : (
                      <p className="text-sm text-ink-secondary text-center py-4">등록된 학생이 없습니다.</p>
                    )}
                  </div>
                  <p className="text-xs text-ink-secondary mt-2">
                    {selectedClassStudents.length}명 선택됨
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-action hover:bg-action-hover">
                    {editingClass ? '수정' : '추가'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowClassModal(false);
                      setEditingClass(null);
                      setSelectedClassStudents([]);
                      setGradeFilter('');
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
          <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
            <FileText className="w-5 h-5 text-fn-warning" />
            배포된 시험
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {distributions && distributions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시험명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시작일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">종료일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">총괄 배포일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">지점 배포일</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist: any) => (
                    <tr key={dist.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                      <td className="px-4 py-3 font-medium text-ink">{dist.exam?.title || '-'}</td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(dist.startDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {dist.parentDistribution
                          ? new Date(dist.parentDistribution.createdAt).toLocaleDateString('ko-KR')
                          : new Date(dist.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {dist.parentDistribution
                          ? new Date(dist.createdAt).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDistribution(dist);
                              setShowRedistributeModal(true);
                              setRedistributeType('class');
                              setSelectedClassId('');
                              setSelectedStudentIds([]);
                            }}
                            className="border-line-strong text-ink hover:bg-surface-subtle"
                          >
                            지점내 배포
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
              <p className="text-ink-secondary">배포된 시험이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 지점내 배포 모달 */}
      {showRedistributeModal && selectedDistribution && (
        <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 max-h-[90dvh] overflow-y-auto rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-fn-warning" />
                지점내 배포: {selectedDistribution.exam?.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleRedistributeSubmit} className="space-y-4">
                {/* 배포 유형 선택 */}
                <div>
                  <label className="text-sm font-semibold text-ink">배포 유형 *</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="redistributeType"
                        value="class"
                        checked={redistributeType === 'class'}
                        onChange={(e) => setRedistributeType(e.target.value as 'class' | 'student')}
                        className="w-4 h-4 text-fn-warning"
                      />
                      <span>반별 배포</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="redistributeType"
                        value="student"
                        checked={redistributeType === 'student'}
                        onChange={(e) => setRedistributeType(e.target.value as 'class' | 'student')}
                        className="w-4 h-4 text-fn-warning"
                      />
                      <span>학생별 배포</span>
                    </label>
                  </div>
                </div>

                {/* 반 선택 */}
                {redistributeType === 'class' && (
                  <div>
                    <label className="text-sm font-semibold text-ink">반 선택 *</label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-line p-2 text-sm"
                      required
                    >
                      <option value="">반을 선택하세요</option>
                      {classes && classes.map((cls: any) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} {cls.grade ? `(${cls.grade})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 학생 선택 */}
                {redistributeType === 'student' && (
                  <div>
                    <label className="text-sm font-semibold text-ink">학생 선택 * (복수 선택 가능)</label>
                    <div className="mt-2 border border-line rounded-md p-3 max-h-60 overflow-y-auto">
                      {students && students.length > 0 ? (
                        students.map((student: any) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-surface-sunken cursor-pointer rounded">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStudentIds([...selectedStudentIds, student.id]);
                                } else {
                                  setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.id));
                                }
                              }}
                              className="w-4 h-4 text-fn-warning"
                            />
                            <span>{student.user?.name} ({student.grade || '-'})</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-ink-secondary">등록된 학생이 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 시험 기간 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-ink">시작일 *</label>
                    <Input
                      type="datetime-local"
                      name="startDate"
                      required
                      className="mt-1"
                      defaultValue={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-ink">종료일 *</label>
                    <Input
                      type="datetime-local"
                      name="endDate"
                      required
                      className="mt-1"
                      defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    className="flex-1 bg-action hover:bg-action-hover"
                    disabled={redistributeMutation.isPending}
                  >
                    {redistributeMutation.isPending ? '배포 중...' : '지점내 배포'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowRedistributeModal(false);
                      setSelectedDistribution(null);
                      setSelectedClassId('');
                      setSelectedStudentIds([]);
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

  const renderDistributions = () => (
    <>
      <Card className="border-0 shadow-xl bg-surface">
        <CardHeader className="border-b border-line-subtle bg-surface-subtle">
          <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
            <FileText className="w-5 h-5 text-fn-warning" />
            배포된 시험 목록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {distributions && distributions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시험명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">과목</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">문항 수</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">총점</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">시작일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">종료일</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist: any) => (
                    <tr key={dist.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                      <td className="px-4 py-3 font-medium text-ink cursor-pointer hover:text-fn-warning hover:underline"
                        onClick={() => {
                          setSelectedDistributionId(dist.id);
                          setActiveSection('dashboard');
                          setSelectedDashboardView('exam-attempts');
                        }}
                      >
                        {dist.exam?.title || '-'}
                      </td>
                      <td className="px-4 py-3 text-ink">{dist.exam?.subject || '-'}</td>
                      <td className="px-4 py-3 text-center text-ink">{dist.exam?.totalQuestions || 0}</td>
                      <td className="px-4 py-3 text-center text-ink">{dist.exam?.totalScore || 0}</td>
                      <td className="px-4 py-3 text-ink">{new Date(dist.startDate).toLocaleDateString('ko-KR')}</td>
                      <td className="px-4 py-3 text-ink">{new Date(dist.endDate).toLocaleDateString('ko-KR')}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async () => {
                            if (confirm('이 배포를 삭제하시겠습니까?')) {
                              try {
                                await api.delete(`/distributions/${dist.id}`);
                                refetchDistributions();
                              } catch (error) {
                                console.error('삭제 실패:', error);
                                alert('삭제에 실패했습니다.');
                              }
                            }
                          }}
                          className="px-3 py-1.5 border border-fn-error-border bg-surface text-fn-error text-sm font-semibold rounded-sm transition-colors duration-150 ease-out hover:bg-fn-error-surface active:scale-[0.98]"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
              <p className="text-ink-secondary">배포된 시험이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderReports = () => {
    if (!selectedReportDistribution) {
      // Show list of distributions
      return (
        <Card className="border-0 shadow-xl bg-surface">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-ink-secondary" />
              보고서 및 성적 관리
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {distributions && distributions.length > 0 ? (
              <div className="grid gap-4">
                {distributions.map((dist: any) => (
                  <Card
                    key={dist.id}
                    className="border-2 border-line hover:border-line transition-all cursor-pointer hover:shadow-lg"
                    onClick={() => setSelectedReportDistribution(dist)}
                  >
                    <CardHeader className="border-b border-line bg-surface-subtle">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{dist.exam?.title || '-'}</CardTitle>
                          <div className="flex gap-4 mt-2 text-sm text-ink-secondary">
                            <span>과목: {dist.exam?.subject || '-'}</span>
                            <span>문항: {dist.exam?.totalQuestions || 0}개</span>
                            <span>배점: {dist.exam?.totalScore || 0}점</span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-ink-secondary">
                            <span>시작: {new Date(dist.startDate).toLocaleDateString('ko-KR')}</span>
                            <span>종료: {new Date(dist.endDate).toLocaleDateString('ko-KR')}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`"${dist.exam?.title}" 배포를 삭제하시겠습니까?`)) {
                              deleteDistributionMutation.mutate(dist.id);
                            }
                          }}
                          className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">배포된 시험이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    // Show student list for selected distribution
    return (
      <>
        <Card className="border-0 shadow-xl bg-surface">
          <CardHeader className="border-b border-line-subtle bg-surface-subtle">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedReportDistribution(null)}
                className="border-line text-ink-secondary hover:bg-surface-subtle"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                뒤로
              </Button>
              <div className="flex-1">
                <CardTitle className="text-xl font-bold text-ink flex items-center gap-2">
                  <FileText className="w-5 h-5 text-ink-secondary" />
                  {selectedReportDistribution.exam?.title}
                </CardTitle>
                <p className="text-sm text-ink-secondary mt-1">
                  {selectedReportDistribution.exam?.subject} • 총 {selectedReportDistribution.exam?.totalQuestions}문항 • {selectedReportDistribution.exam?.totalScore}점
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {distributionStudents && distributionStudents.students && distributionStudents.students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-10 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:bg-surface">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">학생</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">연락처</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">응시 상태</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">점수</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">등급</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-ink-secondary bg-surface-subtle whitespace-nowrap">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionStudents.students.map((student: any) => (
                      <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-4 py-3 font-medium text-ink">{student.studentName}</td>
                        <td className="px-4 py-3 text-ink">{student.studentPhone || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {student.isSubmitted ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-fn-success" />
                                <span className="text-sm text-fn-success font-medium">제출 완료</span>
                              </>
                            ) : student.hasAttempt ? (
                              <>
                                <XCircle className="w-5 h-5 text-fn-warning" />
                                <span className="text-sm text-fn-warning font-medium">작성 중</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-ink-tertiary" />
                                <span className="text-sm text-ink-secondary">미응시</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-ink">
                          {student.isSubmitted ? `${student.score || 0} / ${student.maxScore || 0}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {student.grade ? (
                            <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(student.grade)}`}>
                              {student.grade}등급
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-center">
                            {/* 답안 입력/수정 버튼 */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('수정 버튼 클릭됨!', student);
                                if (!student.hasAttempt) {
                                  console.log('답안 없음 - 생성 중...');
                                  // Create attempt first
                                  createAttemptMutation.mutate(
                                    { studentId: student.studentId, distributionId: selectedReportDistribution.id },
                                    {
                                      onSuccess: async (data) => {
                                        console.log('답안 생성 완료:', data);
                                        // Refetch to get updated data
                                        await refetchDistributionStudents();
                                        await refetchAllDistributionStudents();

                                        console.log('데이터 다시 조회 완료, 모달 열기');
                                        // Open modal with created attempt data
                                        setSelectedAttempt({
                                          ...student,
                                          attemptId: data.data?.id || data.id,
                                          hasAttempt: true,
                                          answers: {},
                                          distributionId: selectedReportDistribution.id,
                                        });
                                        setShowAnswerModal(true);
                                      },
                                    }
                                  );
                                } else {
                                  console.log('답안 있음 - 바로 모달 열기', {
                                    ...student,
                                    distributionId: selectedReportDistribution.id,
                                  });
                                  setSelectedAttempt({
                                    ...student,
                                    distributionId: selectedReportDistribution.id,
                                  });
                                  setShowAnswerModal(true);
                                }
                              }}
                              className="border-line text-ink-secondary hover:bg-surface-subtle"
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              {student.hasAttempt ? '수정' : '입력'}
                            </Button>

                            {/* 삭제 버튼 (답안이 있는 경우만) */}
                            {student.hasAttempt && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`${student.studentName} 학생의 답안을 삭제하시겠습니까?`)) {
                                    api.delete(`/exam-attempts/${student.attemptId}`)
                                      .then(() => {
                                        refetchDistributionStudents();
                                        refetchAllDistributionStudents();
                                        alert('답안이 삭제되었습니다.');
                                      })
                                      .catch((error) => {
                                        alert(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                      });
                                  }
                                }}
                                className="border-fn-error-border text-fn-error hover:bg-fn-error-surface"
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                삭제
                              </Button>
                            )}

                            {/* AI 분석 버튼 (제출 완료된 경우만) */}
                            {student.isSubmitted && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (student.hasReport) {
                                    // View report
                                    window.open(`/reports/${student.reportId}`, '_blank');
                                  } else {
                                    // Generate report
                                    if (confirm(`${student.studentName} 학생의 AI 분석을 시작하시겠습니까?`)) {
                                      generateReportMutation.mutate(student.attemptId);
                                    }
                                  }
                                }}
                                disabled={generateReportMutation.isPending}
                                className={
                                  student.hasReport
                                    ? 'border-line text-ink-secondary hover:bg-surface-subtle'
                                    : 'border-line text-ink-secondary hover:bg-surface-subtle'
                                }
                              >
                                <Sparkles className="w-4 h-4 mr-1" />
                                {student.hasReport ? '보고서 보기' : 'AI 분석'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-ink-tertiary mb-4" />
                <p className="text-ink-secondary">배포된 학생이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  };

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
                  지점 관리
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
          </div>
        </header>

        {/* Content */}
        <main className="p-4 md:p-8">
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'students' && renderStudents()}
          {activeSection === 'classes' && renderClasses()}
          {activeSection === 'exams' && renderExams()}
          {activeSection === 'distributions' && renderDistributions()}
          {activeSection === 'reports' && renderReports()}
        </main>
      </div>

      {/* 답안 입력/수정 모달 - 전역으로 이동 */}
      {(() => {
        console.log('모달 체크:', { showAnswerModal, selectedAttempt });
        if (!showAnswerModal || !selectedAttempt) {
          console.log('모달 렌더링 안됨 - showAnswerModal:', showAnswerModal, 'selectedAttempt:', selectedAttempt);
          return null;
        }
        console.log('모달 렌더링 중!');
        return (
          <div className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl bg-surface-raised rounded-lg shadow-lg overflow-hidden max-h-[90dvh] flex flex-col">
              {/* 상단 헤더: 학생 정보 및 점수 */}
              <div className="p-6 border-b border-line flex justify-between items-center flex-shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-ink">{selectedAttempt.studentName}</h3>
                  <p className="text-sm text-ink-secondary mt-1">
                    {selectedAttempt.isSubmitted && selectedAttempt.submittedAt
                      ? `${new Date(selectedAttempt.submittedAt).toLocaleString('ko-KR')} 제출`
                      : '답안 입력 중'}
                  </p>
                </div>
                {selectedAttempt.score !== undefined && selectedAttempt.score !== null && (
                  <div className="bg-surface-subtle rounded-lg px-4 py-2">
                    <span className="text-2xl font-bold text-ink">{selectedAttempt.score}점</span>
                  </div>
                )}
              </div>

              {/* 중단: 필터 버튼 */}
              <div className="p-4 bg-surface-sunken border-b border-line flex-shrink-0">
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        let totalQuestions = 30;
                        if (distributionStudents?.exam?.totalQuestions) {
                          totalQuestions = distributionStudents.exam.totalQuestions;
                        } else if (selectedAttempt?.distributionId && allDistributionStudents) {
                          const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
                          if (distData?.exam?.totalQuestions) {
                            totalQuestions = distData.exam.totalQuestions;
                          }
                        }

                        for (let i = 1; i <= totalQuestions; i++) {
                          const inputs = form.querySelectorAll(`input[name="q${i}"]`) as NodeListOf<HTMLInputElement>;
                          inputs.forEach(input => {
                            input.checked = false;
                          });
                        }
                      }
                    }}
                    className="px-4 py-2 h-10 border border-line-strong bg-surface text-ink rounded-md text-sm font-semibold transition-colors duration-150 ease-out hover:bg-surface-subtle active:scale-[0.98]"
                  >
                    전체 취소
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        let totalQuestions = 30;
                        if (distributionStudents?.exam?.totalQuestions) {
                          totalQuestions = distributionStudents.exam.totalQuestions;
                        } else if (selectedAttempt?.distributionId && allDistributionStudents) {
                          const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
                          if (distData?.exam?.totalQuestions) {
                            totalQuestions = distData.exam.totalQuestions;
                          }
                        }

                        for (let i = 1; i <= totalQuestions; i++) {
                          const correctInput = form.querySelector(`input[name="q${i}"][value="1"]`) as HTMLInputElement;
                          if (correctInput) {
                            correctInput.checked = true;
                          }
                        }
                      }
                    }}
                    className="px-4 py-2 h-10 border border-fn-success-border bg-fn-success-surface text-fn-success rounded-md text-sm font-semibold transition-colors duration-150 ease-out hover:border-fn-success active:scale-[0.98]"
                  >
                    전체 정답
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        let totalQuestions = 30;
                        if (distributionStudents?.exam?.totalQuestions) {
                          totalQuestions = distributionStudents.exam.totalQuestions;
                        } else if (selectedAttempt?.distributionId && allDistributionStudents) {
                          const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
                          if (distData?.exam?.totalQuestions) {
                            totalQuestions = distData.exam.totalQuestions;
                          }
                        }

                        for (let i = 1; i <= totalQuestions; i++) {
                          const incorrectInput = form.querySelector(`input[name="q${i}"][value="0"]`) as HTMLInputElement;
                          if (incorrectInput) {
                            incorrectInput.checked = true;
                          }
                        }
                      }
                    }}
                    className="px-4 py-2 h-10 border border-fn-error-border bg-fn-error-surface text-fn-error rounded-md text-sm font-semibold transition-colors duration-150 ease-out hover:border-fn-error active:scale-[0.98]"
                  >
                    전체 오답
                  </button>
                </div>
              </div>

              {/* 메인: 채점 목록 (스크롤 가능) */}
              <div className="flex-1 overflow-y-auto">
                <form id="answer-form" onSubmit={handleAnswerSubmit}>
                  <div className="divide-y divide-line-subtle">
                    {(() => {
                      let totalQuestions = 30;
                      if (distributionStudents?.exam?.totalQuestions) {
                        totalQuestions = distributionStudents.exam.totalQuestions;
                      } else if (selectedAttempt?.distributionId && allDistributionStudents) {
                        const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
                        if (distData?.exam?.totalQuestions) {
                          totalQuestions = distData.exam.totalQuestions;
                        }
                      }

                      // Get questions data for correct answers
                      let questionsData: any[] = [];
                      if (distributionStudents?.exam?.questionsData) {
                        questionsData = distributionStudents.exam.questionsData;
                      } else if (selectedAttempt?.distributionId && allDistributionStudents) {
                        const distData = allDistributionStudents.find((d: any) => d.distribution.id === selectedAttempt.distributionId);
                        if (distData?.exam?.questionsData) {
                          questionsData = distData.exam.questionsData;
                        }
                      }

                      return Array.from({ length: totalQuestions }, (_, i) => {
                        const qNum = i + 1;
                        const currentAnswer = selectedAttempt.answers?.[qNum];

                        // Find the correct answer from questions data
                        const questionData = questionsData.find((q: any) => (q.number || q.questionNumber) === qNum);
                        const correctAnswer = questionData?.correctAnswer;

                        return (
                          <div key={qNum} className="grading-item group flex items-center transition-colors duration-150 hover:bg-surface-sunken">
                            {/* 문항 번호 + 정답 표시 */}
                            <div className="flex-1 p-4 flex items-center gap-6">
                              <span className="text-sm font-medium text-ink-secondary w-10">{qNum}번</span>
                              {correctAnswer && (
                                <span className="text-xs font-semibold text-fn-success bg-fn-success-surface px-2 py-1 rounded">
                                  정답: {correctAnswer}
                                </span>
                              )}
                            </div>

                            {/* O/X 선택 버튼 */}
                            <div className="flex">
                              {/* O (정답) 버튼 */}
                              <div className="relative">
                                <input
                                  type="radio"
                                  id={`q${qNum}-correct`}
                                  name={`q${qNum}`}
                                  value="1"
                                  defaultChecked={currentAnswer === 1}
                                  className="peer absolute inset-0 opacity-0 cursor-pointer"
                                />
                                {/* O = 정답. DESIGN.md 기능 계층 success (라디오 value="1" 불변) */}
                                <label
                                  htmlFor={`q${qNum}-correct`}
                                  className="flex items-center justify-center w-20 h-20 border-l border-line cursor-pointer text-ink-tertiary transition-colors duration-150 ease-out hover:text-fn-success peer-checked:text-fn-success peer-checked:bg-fn-success-surface"
                                >
                                  <CheckCircle className="w-9 h-9" strokeWidth={1.5} />
                                </label>
                              </div>
                              {/* X (오답) 버튼 */}
                              <div className="relative">
                                <input
                                  type="radio"
                                  id={`q${qNum}-incorrect`}
                                  name={`q${qNum}`}
                                  value="0"
                                  defaultChecked={currentAnswer === 0}
                                  className="peer absolute inset-0 opacity-0 cursor-pointer"
                                />
                                {/* X = 오답. DESIGN.md 기능 계층 error (라디오 value="0" 불변) */}
                                <label
                                  htmlFor={`q${qNum}-incorrect`}
                                  className="flex items-center justify-center w-20 h-20 border-l border-line cursor-pointer text-ink-tertiary transition-colors duration-150 ease-out hover:text-fn-error peer-checked:text-fn-error peer-checked:bg-fn-error-surface"
                                >
                                  <XCircle className="w-9 h-9" strokeWidth={1.5} />
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* 하단: 제출 버튼 */}
                  <div className="p-4 bg-surface-sunken border-t border-line flex gap-2">
                    <Button
                      type="submit"
                      className="flex-1 bg-action hover:bg-action-hover"
                      disabled={createAttemptMutation.isPending || gradeAttemptMutation.isPending}
                    >
                      {createAttemptMutation.isPending || gradeAttemptMutation.isPending
                        ? '저장 중...'
                        : selectedAttempt.attemptId
                        ? '저장 및 채점'
                        : '답안 입력 및 채점'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowAnswerModal(false);
                        setSelectedAttempt(null);
                      }}
                      className="flex-1"
                    >
                      취소
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
