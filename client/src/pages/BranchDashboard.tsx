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
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-5 mb-8">
        <Card
          className={`border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-blue-500 to-indigo-600 text-white overflow-hidden relative group cursor-pointer ${
            selectedDashboardView === 'students' ? 'ring-4 ring-blue-300 scale-105' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'students' ? null : 'students')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-blue-100">총 학생 수</CardTitle>
              <Users className="w-8 h-8 text-white/80" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{students?.length || 0}</div>
            <p className="text-xs text-blue-100 mt-2">등록된 학생 • 클릭하여 보기</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-500 to-pink-600 text-white overflow-hidden relative group cursor-pointer">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-purple-100">보고서 완료</CardTitle>
              <Sparkles className="w-8 h-8 text-white/80" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithReports = distData.students?.filter((s: any) => s.hasReport) || [];
                return total + studentsWithReports.length;
              }, 0) || 0}
            </div>
            <p className="text-xs text-purple-100 mt-2">AI 분석 완료 학생</p>
          </CardContent>
        </Card>

        <Card
          className={`border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-500 to-emerald-600 text-white overflow-hidden relative group cursor-pointer ${
            selectedDashboardView === 'classes' ? 'ring-4 ring-green-300 scale-105' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'classes' ? null : 'classes')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-green-100">총 반 수</CardTitle>
              <Home className="w-8 h-8 text-white/80" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{classes?.length || 0}</div>
            <p className="text-xs text-green-100 mt-2">운영 중인 반 • 클릭하여 보기</p>
          </CardContent>
        </Card>

        <Card
          className={`border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-teal-500 to-cyan-600 text-white overflow-hidden relative group cursor-pointer ${
            selectedDashboardView === 'exam-attempts' ? 'ring-4 ring-teal-300 scale-105' : ''
          }`}
          onClick={() => setSelectedDashboardView(selectedDashboardView === 'exam-attempts' ? null : 'exam-attempts')}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-teal-100">시험</CardTitle>
              <BarChart3 className="w-8 h-8 text-white/80" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithAttempts = distData.students?.filter((s: any) => s.hasAttempt) || [];
                return total + studentsWithAttempts.length;
              }, 0) || 0}
            </div>
            <p className="text-xs text-teal-100 mt-2">응시/채점 학생 • 클릭하여 보기</p>
          </CardContent>
        </Card>
      </div>

      {/* 상세 정보 표 */}
      {selectedDashboardView === 'students' && (
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm mb-8">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              학생 목록
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {students && students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-blue-200">
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">이름</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">학년</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">학교</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">연락처</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">학부모 연락처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student: any) => (
                      <tr key={student.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                        <td className="p-3 font-medium text-gray-900">{student.user?.name}</td>
                        <td className="p-3 text-gray-700">{student.grade || '-'}</td>
                        <td className="p-3 text-gray-700">{student.school || '-'}</td>
                        <td className="p-3 text-gray-700">{student.user?.phone || '-'}</td>
                        <td className="p-3 text-gray-700">{student.parentPhone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">등록된 학생이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedDashboardView === 'classes' && (
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm mb-8">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Home className="w-5 h-5 text-green-600" />
              반 목록
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {classes && classes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-green-200">
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">반 이름</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">학년</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">설명</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((cls: any) => (
                      <tr key={cls.id} className="border-b border-gray-100 hover:bg-green-50 transition-colors">
                        <td className="p-3 font-medium text-gray-900">{cls.name}</td>
                        <td className="p-3 text-gray-700">{cls.grade || '-'}</td>
                        <td className="p-3 text-gray-700">{cls.description || '-'}</td>
                        <td className="p-3 text-gray-700">{new Date(cls.createdAt).toLocaleDateString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Home className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">등록된 반이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedDashboardView === 'exam-attempts' && (
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm mb-8">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-teal-50 to-cyan-50">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-600" />
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
                    <div key={distData.distribution.id} className="border-2 border-teal-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">{distData.exam?.title}</h3>
                          <p className="text-sm text-gray-600">
                            {distData.exam?.subject} • {distData.exam?.totalQuestions}문항 • {distData.exam?.totalScore}점
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-gray-500">배부 학생</span>
                          <div className="text-2xl font-bold text-teal-600">{allStudents.length}명</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-teal-200">
                              <th className="text-left p-2 text-sm font-semibold text-gray-700">학생</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">점수</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">등급</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">상태</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allStudents.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-gray-100 hover:bg-teal-50 transition-colors">
                                <td className="p-2 font-medium text-gray-900">{student.studentName}</td>
                                <td className="p-2 text-center text-gray-700">
                                  {student.hasAttempt ? `${student.score || 0} / ${student.maxScore || 0}` : '- / -'}
                                </td>
                                <td className="p-2 text-center">
                                  {student.hasAttempt && student.grade ? (
                                    <span className="inline-block px-2 py-1 bg-teal-100 text-teal-700 rounded text-sm font-medium">
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {student.hasAttempt ? (
                                    student.isSubmitted ? (
                                      <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                        제출 완료
                                      </span>
                                    ) : (
                                      <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                                        작성 중
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                      미응시
                                    </span>
                                  )}
                                </td>
                                <td className="p-2">
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
                                          className="border-blue-300 text-blue-600 hover:bg-blue-50"
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
                                          className="border-red-300 text-red-600 hover:bg-red-50"
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
                                              ? 'border-purple-300 text-purple-600 hover:bg-purple-50'
                                              : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
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
                                          className="border-green-300 text-green-600 hover:bg-green-50"
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
                <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">배부된 시험이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 최근 활동 - 시험 응시 학생 */}
      {!selectedDashboardView && (
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
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
                    <div key={distData.distribution.id} className="border-2 border-indigo-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">{distData.exam?.title}</h3>
                          <p className="text-sm text-gray-600">
                            {distData.exam?.subject} • {distData.exam?.totalQuestions}문항 • {distData.exam?.totalScore}점
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-gray-500">응시 학생</span>
                          <div className="text-2xl font-bold text-indigo-600">{studentsWithAttempts.length}명</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-indigo-200">
                              <th className="text-left p-2 text-sm font-semibold text-gray-700">학생</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">점수</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">등급</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">상태</th>
                              <th className="text-center p-2 text-sm font-semibold text-gray-700">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsWithAttempts.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-gray-100 hover:bg-indigo-50 transition-colors">
                                <td className="p-2 font-medium text-gray-900">{student.studentName}</td>
                                <td className="p-2 text-center text-gray-700">
                                  {student.score || 0} / {student.maxScore || 0}
                                </td>
                                <td className="p-2 text-center">
                                  {student.grade ? (
                                    <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm font-medium">
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {student.isSubmitted ? (
                                    <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      제출 완료
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                                      작성 중
                                    </span>
                                  )}
                                </td>
                                <td className="p-2">
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
                                      className="border-blue-300 text-blue-600 hover:bg-blue-50"
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
                                      className="border-red-300 text-red-600 hover:bg-red-50"
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
                                          ? 'border-purple-300 text-purple-600 hover:bg-purple-50'
                                          : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
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
                <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">시험을 응시한 학생이 없습니다.</p>
                <p className="text-sm text-gray-400 mt-2">위의 카드를 클릭하여 상세 정보를 확인하세요.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );

  const renderStudents = () => (
    <>
      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              학생 관리
            </CardTitle>
            <Button
              onClick={() => {
                setEditingStudent(null);
                setShowStudentModal(true);
              }}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              학생 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {students && students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-blue-200">
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">이름</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">학년</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">학교</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">아이디</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">연락처</th>
                    <th className="text-center p-3 text-sm font-semibold text-gray-700">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student: any) => (
                    <tr key={student.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                      <td className="p-3 font-medium text-gray-900">{student.user?.name}</td>
                      <td className="p-3 text-gray-700">{student.grade || '-'}</td>
                      <td className="p-3 text-gray-700">{student.school || '-'}</td>
                      <td className="p-3 text-gray-700">{student.user?.username}</td>
                      <td className="p-3 text-gray-700">{student.user?.phone || '-'}</td>
                      <td className="p-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`${student.user?.name} 학생으로 로그인하시겠습니까?`)) {
                                loginAsStudentMutation.mutate(student.id);
                              }
                            }}
                            className="border-green-300 text-green-600 hover:bg-green-50"
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
                            className="border-blue-300 text-blue-600 hover:bg-blue-50"
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
              <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">등록된 학생이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 학생 추가/수정 모달 */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {editingStudent ? '학생 수정' : '학생 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleStudentSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">이름 *</label>
                    <Input name="name" defaultValue={editingStudent?.user?.name} required className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">학년</label>
                    <Input name="grade" defaultValue={editingStudent?.grade} className="mt-1" placeholder="예: 중3" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">학교</label>
                  <Input name="school" defaultValue={editingStudent?.school} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">학생 연락처 * (로그인 아이디)</label>
                    <Input
                      name="phone"
                      defaultValue={editingStudent?.user?.phone}
                      required
                      className="mt-1"
                      placeholder="01012345678"
                      disabled={!!editingStudent}
                    />
                    {!editingStudent && (
                      <p className="text-xs text-gray-500 mt-1">※ 연락처가 로그인 아이디가 되며, 비밀번호는 끝 4자리로 자동 설정됩니다.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">학부모 연락처 (로그인 아이디)</label>
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
                    <label className="text-sm font-semibold text-gray-700">새 비밀번호 (선택)</label>
                    <Input
                      type="password"
                      name="password"
                      className="mt-1"
                      placeholder="변경하지 않으려면 비워두세요"
                    />
                    <p className="text-xs text-gray-500 mt-1">※ 비밀번호를 입력하면 새 비밀번호로 변경됩니다.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
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
      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Home className="w-5 h-5 text-green-600" />
              반 관리
            </CardTitle>
            <Button
              onClick={() => {
                setEditingClass(null);
                setSelectedClassStudents([]);
                setGradeFilter('');
                setShowClassModal(true);
              }}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
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
                <Card key={cls.id} className="border-2 border-green-100 hover:border-green-300 transition-colors">
                  <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{cls.name}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">{cls.grade || '-'}</p>
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
                        className="border-green-300 text-green-600 hover:bg-green-50"
                      >
                        수정
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-gray-600">{cls.description || '설명 없음'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Home className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">등록된 반이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 반 추가/수정 모달 */}
      {showClassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5 text-green-600" />
                {editingClass ? '반 수정' : '반 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleClassSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">반 이름 *</label>
                  <Input name="name" defaultValue={editingClass?.name} required className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">학년</label>
                  <Input name="grade" defaultValue={editingClass?.grade} className="mt-1" placeholder="예: 중3" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">설명</label>
                  <textarea
                    name="description"
                    defaultValue={editingClass?.description}
                    className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm"
                    rows={3}
                  />
                </div>

                {/* 학생 선택 섹션 */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-semibold text-gray-700">학생 선택</label>
                    <select
                      value={gradeFilter}
                      onChange={(e) => setGradeFilter(e.target.value)}
                      className="text-sm border border-gray-200 rounded-md px-3 py-1"
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
                  <div className="border border-gray-200 rounded-md p-3 max-h-60 overflow-y-auto bg-gray-50">
                    {students && students.length > 0 ? (
                      students
                        .filter((student: any) => !gradeFilter || student.grade === gradeFilter)
                        .map((student: any) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-white cursor-pointer rounded transition-colors">
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
                              className="w-4 h-4 text-green-600"
                            />
                            <span className="text-sm">
                              {student.user?.name}
                              <span className="text-gray-500 ml-2">({student.grade || '미지정'})</span>
                            </span>
                          </label>
                        ))
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">등록된 학생이 없습니다.</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedClassStudents.length}명 선택됨
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700">
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
      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-orange-50 to-red-50">
          <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-600" />
            배포된 시험
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {distributions && distributions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-orange-200">
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">시험명</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">시작일</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">종료일</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">총괄 배포일</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">지점 배포일</th>
                    <th className="text-center p-3 text-sm font-semibold text-gray-700">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist: any) => (
                    <tr key={dist.id} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                      <td className="p-3 font-medium text-gray-900">{dist.exam?.title || '-'}</td>
                      <td className="p-3 text-gray-700">
                        {new Date(dist.startDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="p-3 text-gray-700">
                        {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="p-3 text-gray-700">
                        {dist.parentDistribution
                          ? new Date(dist.parentDistribution.createdAt).toLocaleDateString('ko-KR')
                          : new Date(dist.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="p-3 text-gray-700">
                        {dist.parentDistribution
                          ? new Date(dist.createdAt).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                      <td className="p-3">
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
                            className="border-orange-300 text-orange-600 hover:bg-orange-50"
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
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">배포된 시험이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 지점내 배포 모달 */}
      {showRedistributeModal && selectedDistribution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                지점내 배포: {selectedDistribution.exam?.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleRedistributeSubmit} className="space-y-4">
                {/* 배포 유형 선택 */}
                <div>
                  <label className="text-sm font-semibold text-gray-700">배포 유형 *</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="redistributeType"
                        value="class"
                        checked={redistributeType === 'class'}
                        onChange={(e) => setRedistributeType(e.target.value as 'class' | 'student')}
                        className="w-4 h-4 text-orange-600"
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
                        className="w-4 h-4 text-orange-600"
                      />
                      <span>학생별 배포</span>
                    </label>
                  </div>
                </div>

                {/* 반 선택 */}
                {redistributeType === 'class' && (
                  <div>
                    <label className="text-sm font-semibold text-gray-700">반 선택 *</label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm"
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
                    <label className="text-sm font-semibold text-gray-700">학생 선택 * (복수 선택 가능)</label>
                    <div className="mt-2 border border-gray-200 rounded-md p-3 max-h-60 overflow-y-auto">
                      {students && students.length > 0 ? (
                        students.map((student: any) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded">
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
                              className="w-4 h-4 text-orange-600"
                            />
                            <span>{student.user?.name} ({student.grade || '-'})</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">등록된 학생이 없습니다.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 시험 기간 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">시작일 *</label>
                    <Input
                      type="datetime-local"
                      name="startDate"
                      required
                      className="mt-1"
                      defaultValue={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">종료일 *</label>
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
                    className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
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
      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-orange-50 to-red-50">
          <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-600" />
            배포된 시험 목록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {distributions && distributions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-orange-200">
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">시험명</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">과목</th>
                    <th className="text-center p-3 text-sm font-semibold text-gray-700">문항 수</th>
                    <th className="text-center p-3 text-sm font-semibold text-gray-700">총점</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">시작일</th>
                    <th className="text-left p-3 text-sm font-semibold text-gray-700">종료일</th>
                    <th className="text-center p-3 text-sm font-semibold text-gray-700">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist: any) => (
                    <tr key={dist.id} className="border-b border-gray-100 hover:bg-orange-50 transition-colors">
                      <td
                        className="p-3 font-medium text-gray-900 cursor-pointer hover:text-orange-600 hover:underline"
                        onClick={() => {
                          setSelectedDistributionId(dist.id);
                          setActiveSection('dashboard');
                          setSelectedDashboardView('exam-attempts');
                        }}
                      >
                        {dist.exam?.title || '-'}
                      </td>
                      <td className="p-3 text-gray-700">{dist.exam?.subject || '-'}</td>
                      <td className="p-3 text-center text-gray-700">{dist.exam?.totalQuestions || 0}</td>
                      <td className="p-3 text-center text-gray-700">{dist.exam?.totalScore || 0}</td>
                      <td className="p-3 text-gray-700">{new Date(dist.startDate).toLocaleDateString('ko-KR')}</td>
                      <td className="p-3 text-gray-700">{new Date(dist.endDate).toLocaleDateString('ko-KR')}</td>
                      <td className="p-3 text-center">
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
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
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
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">배포된 시험이 없습니다.</p>
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
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
            <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              보고서 및 성적 관리
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {distributions && distributions.length > 0 ? (
              <div className="grid gap-4">
                {distributions.map((dist: any) => (
                  <Card
                    key={dist.id}
                    className="border-2 border-indigo-100 hover:border-indigo-300 transition-all cursor-pointer hover:shadow-lg"
                    onClick={() => setSelectedReportDistribution(dist)}
                  >
                    <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{dist.exam?.title || '-'}</CardTitle>
                          <div className="flex gap-4 mt-2 text-sm text-gray-600">
                            <span>과목: {dist.exam?.subject || '-'}</span>
                            <span>문항: {dist.exam?.totalQuestions || 0}개</span>
                            <span>배점: {dist.exam?.totalScore || 0}점</span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500">
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
                          className="border-red-300 text-red-600 hover:bg-red-50"
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
                <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">배포된 시험이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    // Show student list for selected distribution
    return (
      <>
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
          <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedReportDistribution(null)}
                className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                뒤로
              </Button>
              <div className="flex-1">
                <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  {selectedReportDistribution.exam?.title}
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedReportDistribution.exam?.subject} • 총 {selectedReportDistribution.exam?.totalQuestions}문항 • {selectedReportDistribution.exam?.totalScore}점
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {distributionStudents && distributionStudents.students && distributionStudents.students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-indigo-200">
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">학생</th>
                      <th className="text-left p-3 text-sm font-semibold text-gray-700">연락처</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700">응시 상태</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700">점수</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700">등급</th>
                      <th className="text-center p-3 text-sm font-semibold text-gray-700">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionStudents.students.map((student: any) => (
                      <tr key={student.studentId} className="border-b border-gray-100 hover:bg-indigo-50 transition-colors">
                        <td className="p-3 font-medium text-gray-900">{student.studentName}</td>
                        <td className="p-3 text-gray-700">{student.studentPhone || '-'}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            {student.isSubmitted ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="text-sm text-green-600 font-medium">제출 완료</span>
                              </>
                            ) : student.hasAttempt ? (
                              <>
                                <XCircle className="w-5 h-5 text-orange-500" />
                                <span className="text-sm text-orange-500 font-medium">작성 중</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-gray-400" />
                                <span className="text-sm text-gray-500">미응시</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center text-gray-700">
                          {student.isSubmitted ? `${student.score || 0} / ${student.maxScore || 0}` : '-'}
                        </td>
                        <td className="p-3 text-center">
                          {student.grade ? (
                            <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm font-medium">
                              {student.grade}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3">
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
                              className="border-blue-300 text-blue-600 hover:bg-blue-50"
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
                                className="border-red-300 text-red-600 hover:bg-red-50"
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
                                    ? 'border-purple-300 text-purple-600 hover:bg-purple-50'
                                    : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
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
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">배포된 학생이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Dark Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-gray-900 shadow-2xl border-r border-gray-800 transition-all duration-300 flex flex-col`}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <h2 className="font-bold text-lg text-white whitespace-nowrap">
                  지점 관리
                </h2>
                <p className="text-xs text-gray-400 truncate">{user.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/50'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {sidebarOpen && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-red-900/50 hover:text-red-400 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">로그아웃</span>}
          </button>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-transform"
        >
          {sidebarOpen ? <X className="w-3 h-3" /> : <Menu className="w-3 h-3" />}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-md border-b border-blue-100 sticky top-0 z-10">
          <div className="px-8 py-5">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {menuItems.find((item) => item.id === activeSection)?.label}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {user.name}님 환영합니다
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-8">
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
              {/* 상단 헤더: 학생 정보 및 점수 */}
              <div className="p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{selectedAttempt.studentName}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedAttempt.isSubmitted && selectedAttempt.submittedAt
                      ? `${new Date(selectedAttempt.submittedAt).toLocaleString('ko-KR')} 제출`
                      : '답안 입력 중'}
                  </p>
                </div>
                {selectedAttempt.score !== undefined && selectedAttempt.score !== null && (
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <span className="text-2xl font-bold text-gray-800">{selectedAttempt.score}점</span>
                  </div>
                )}
              </div>

              {/* 중단: 필터 버튼 */}
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
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
                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
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
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
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
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    전체 오답
                  </button>
                </div>
              </div>

              {/* 메인: 채점 목록 (스크롤 가능) */}
              <div className="flex-1 overflow-y-auto">
                <form id="answer-form" onSubmit={handleAnswerSubmit}>
                  <div className="divide-y divide-gray-200">
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
                          <div key={qNum} className="grading-item group flex items-center transition-colors duration-150 hover:bg-gray-50">
                            {/* 문항 번호 + 정답 표시 */}
                            <div className="flex-1 p-4 flex items-center gap-6">
                              <span className="text-sm font-medium text-gray-500 w-10">{qNum}번</span>
                              {correctAnswer && (
                                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded">
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
                                <label
                                  htmlFor={`q${qNum}-correct`}
                                  className="flex items-center justify-center w-20 h-20 border-l border-gray-200 cursor-pointer text-gray-400 hover:text-blue-500 peer-checked:text-blue-600 peer-checked:bg-blue-50 transition-colors"
                                >
                                  <CheckCircle className="w-9 h-9" />
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
                                <label
                                  htmlFor={`q${qNum}-incorrect`}
                                  className="flex items-center justify-center w-20 h-20 border-l border-gray-200 cursor-pointer text-gray-400 hover:text-red-500 peer-checked:text-red-600 peer-checked:bg-red-50 transition-colors"
                                >
                                  <XCircle className="w-9 h-9" />
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* 하단: 제출 버튼 */}
                  <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-2">
                    <Button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
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
