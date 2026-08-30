import { Fragment, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { StatValue } from '../components/ui/stat-value';
import { StatStrip, StatStripItem } from '../components/ui/stat-strip';
import { PageHeader } from '../components/ui/page-header';
import { SegmentedControl } from '../components/ui/segmented-control';
import { StatusBoard, StatusBoardCard, type StatusTone } from '../components/ui/status-board';
import { ensureReport, openFullReport } from '../lib/reportClient';
import { useModalA11y, isMobileViewport } from '../lib/useModalA11y';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Users, GraduationCap, FileText, BarChart3, LogOut, LayoutDashboard, Menu, Home, Plus, Trash2, CheckCircle, XCircle, Edit, Sparkles, ArrowLeft, Search } from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  branchId?: string;
}

type MenuSection = 'dashboard' | 'students' | 'classes' | 'exams' | 'distributions' | 'reports';

// 상단 GNB 3탭. 학생 점수를 보는 화면이 첫 탭이다 (DESIGN.md 11.6)
type TopTab = 'grades' | 'manage' | 'exams';
type StudentTab = 'history' | 'trend' | 'reports';

const TOP_TABS: { id: TopTab; label: string; sections: MenuSection[] }[] = [
  { id: 'grades', label: '성적 관리', sections: ['dashboard'] },
  { id: 'manage', label: '학생·반 관리', sections: ['students', 'classes'] },
  { id: 'exams', label: '시험 배포', sections: ['exams', 'distributions', 'reports'] },
];

/**
 * 교사 관리 화면 전용 등급 스케일 (DESIGN.md 2.4 예외).
 * 학생·학부모 화면과 AI 보고서 지면은 gradeBadgeClass 를 그대로 쓴다.
 * 교사는 명단을 훑으며 성적 차이를 즉시 읽어야 하므로 등급대별 대비를 준다.
 */
const gradeBadgeOperate = (grade?: number | string | null): string => {
  const g = Number(grade);
  if (!g || Number.isNaN(g)) return 'border-line bg-surface-subtle text-ink-secondary';
  if (g <= 2) return 'border-fn-success bg-fn-success text-ink-inverse';
  if (g <= 4) return 'border-fn-success-border bg-fn-success-surface text-fn-success';
  if (g <= 6) return 'border-fn-warning-border bg-fn-warning-surface text-fn-warning';
  return 'border-line-strong bg-surface-subtle text-ink-secondary';
};

export default function BranchDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<MenuSection>('dashboard');
  // 데스크톱은 열림, 모바일은 닫힘으로 시작한다.
  // true 로 고정하면 390px 진입 시 드로어가 첫 화면을 덮는다.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
  );
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
  // 응시 현황 보드가 보고 있는 배포. null 이면 가장 최근 배포를 쓴다.
  const [boardDistributionId, setBoardDistributionId] = useState<string | null>(null);
  const [selectedClassStudents, setSelectedClassStudents] = useState<string[]>([]);
  const [classRosterLoading, setClassRosterLoading] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string>('');

  // 학생 관리 목록 도구 상태 (DESIGN.md 11.2). 서버 호출은 늘리지 않고 전부 클라이언트에서 건다.
  const [studentSearch, setStudentSearch] = useState('');
  const [studentGradeTab, setStudentGradeTab] = useState<string>('all');
  const [studentSort, setStudentSort] = useState<{ key: 'name' | 'grade'; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc',
  });
  const [studentPage, setStudentPage] = useState(1);
  const STUDENTS_PER_PAGE = 20;

  // ---- 학생 중심 네비게이션 (DESIGN.md 11.6) ----
  // 상단 GNB 3탭 + 좌측 학생 패널 + 학생 컨텍스트 탭.
  // 데이터 호출은 늘리지 않고 기존 쿼리 결과를 학생 기준으로 다시 묶기만 한다.
  const [topTab, setTopTab] = useState<TopTab>('grades');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentTab, setStudentTab] = useState<StudentTab>('history');
  const [panelSearch, setPanelSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSort, setPanelSort] = useState<'name' | 'unattempted'>('name');

  // 관리 목록 툴바 상태 (DESIGN.md 11.2). 전부 클라이언트 필터라 서버 호출이 늘지 않는다.
  const [classSearch, setClassSearch] = useState('');
  const [classRosterUnavailable, setClassRosterUnavailable] = useState(false);
  const [distSearch, setDistSearch] = useState('');
  const [distStatus, setDistStatus] = useState<'all' | 'upcoming' | 'ongoing' | 'ended'>('all');

  // 응시 행을 펼쳐 보는 문항별 답안 패널 (DESIGN.md 11.6.5).
  // 서버는 그대로 두고 기존 GET /api/exam-attempts/:id 만 쓴다.
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);
  const [answerCache, setAnswerCache] = useState<Record<string, any>>({});
  const [answerLoading, setAnswerLoading] = useState<string | null>(null);

  // 모달 닫기 핸들러. Esc 와 취소 버튼이 동일 경로를 타도록 한 곳에 둔다.
  const closeStudentModal = () => {
    setShowStudentModal(false);
    setEditingStudent(null);
  };
  const closeClassModal = () => {
    setShowClassModal(false);
    setEditingClass(null);
    setSelectedClassStudents([]);
    setGradeFilter('');
  };
  const closeRedistributeModal = () => {
    setShowRedistributeModal(false);
    setSelectedDistribution(null);
    setSelectedClassId('');
    setSelectedStudentIds([]);
  };
  const closeAnswerModal = () => {
    setShowAnswerModal(false);
    setSelectedAttempt(null);
  };

  const studentModalRef = useModalA11y<HTMLDivElement>({ active: showStudentModal, onClose: closeStudentModal });
  const classModalRef = useModalA11y<HTMLDivElement>({ active: showClassModal, onClose: closeClassModal });
  const redistributeModalRef = useModalA11y<HTMLDivElement>({ active: showRedistributeModal, onClose: closeRedistributeModal });
  const answerModalRef = useModalA11y<HTMLDivElement>({ active: showAnswerModal, onClose: closeAnswerModal });
  const drawerRef = useModalA11y<HTMLElement>({
    active: sidebarOpen && isMobileViewport(),
    onClose: () => setSidebarOpen(false),
  });

  // 결과값은 쓰지 않지만 캐시 예열 목적으로 조회는 유지한다 (구독을 없애면 요청 자체가 사라진다)
  useQuery({
    queryKey: ['branch', 'stats', user.branchId],
    queryFn: async () => {
      const res = await api.get(`/branch-students/stats`);
      return res.data.data;
    },
    enabled: !!user.branchId,
  });

  const {
    data: students,
    refetch: refetchStudents,
    isLoading: studentsLoading,
    isError: studentsError,
  } = useQuery({
    queryKey: ['students', user.branchId],
    queryFn: async () => {
      const res = await api.get('/students');
      return res.data.data;
    },
  });

  const {
    data: classes,
    refetch: refetchClasses,
    isLoading: classesLoading,
    isError: classesError,
  } = useQuery({
    queryKey: ['classes', user.branchId],
    queryFn: async () => {
      const res = await api.get('/classes');
      return res.data.data;
    },
  });

  const {
    data: distributions,
    refetch: refetchDistributions,
    isLoading: distributionsLoading,
    isError: distributionsError,
  } = useQuery({
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
  const {
    data: allDistributionStudents,
    refetch: refetchAllDistributionStudents,
    isLoading: allDistLoading,
    isError: allDistError,
  } = useQuery({
    queryKey: ['all-distribution-students', user.branchId],
    queryFn: async () => {
      if (!distributions || distributions.length === 0) return [];

      // 배포마다 요청하면 배포 수만큼 왕복이 생긴다. 배치 엔드포인트로 1회에 받는다.
      // 항목 모양은 기존과 같은 { distribution, exam, students } 이다.
      // 실패 시 배포별로 조용히 누락되지 않고 쿼리 전체가 에러가 된다(allDistError 경로).
      const res = await api.get('/distributions/students');
      return res.data.data;
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
      toast.success('학생이 등록되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '학생 등록에 실패했습니다.');
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
      toast.success('학생 정보가 수정되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '학생 수정에 실패했습니다.');
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
      toast.success('반이 생성되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '반 생성에 실패했습니다.');
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
      toast.success('반이 수정되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '반 수정에 실패했습니다.');
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
      toast.success(data.message || '지점내 배포가 완료되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '지점내 배포에 실패했습니다.');
    },
  });

  const loginAsStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await api.post(`/students/${studentId}/login-as`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || '학생으로 로그인되었습니다.');
      window.location.href = '/student';
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '학생 로그인에 실패했습니다.');
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
      toast.error(error.response?.data?.message || '답안지 생성에 실패했습니다.');
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
      toast.success('답안이 저장되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '답안 저장에 실패했습니다.');
    },
  });

  const generateReportMutation = useMutation({
    // 서버가 큐에 적재만 하고 즉시 응답하므로, 완료까지 폴링해야
    // "완료" 알림이 실제 완료를 의미한다.
    mutationFn: async (attemptId: string) => {
      return await ensureReport(attemptId, (stage) => {
        if (stage === 'generating') {
          toast.info('AI 분석을 시작했습니다...', '완료까지 시간이 걸릴 수 있습니다.');
        }
      });
    },
    onSuccess: () => {
      refetchDistributionStudents();
      refetchAllDistributionStudents();
      toast.success('AI 분석이 완료되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || 'AI 분석에 실패했습니다.');
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
      toast.success(data.message || '배포가 삭제되었습니다.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '배포 삭제에 실패했습니다.');
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

    // 현재 배정을 못 불러온 상태로 저장하면 서버가 studentIds 를 "전체 배정"으로
    // 받아들여 기존 배정이 전부 해제된다. 그 경우 저장을 막는다.
    if (editingClass && (classRosterUnavailable || classRosterLoading)) {
      toast.error('배정 학생을 불러오는 중이거나 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

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
        toast.error('반을 선택해주세요.');
        return;
      }
      data.classId = selectedClassId;
    } else {
      if (selectedStudentIds.length === 0) {
        toast.error('학생을 선택해주세요.');
        return;
      }
      data.studentIds = selectedStudentIds;
    }

    redistributeMutation.mutate({ id: selectedDistribution.id, data });
  };

  // 채점 대상 시험 정보를 현재 선택된 배포 기준으로 찾는다.
  const resolveSelectedExam = (): any | null => {
    if (distributionStudents?.exam) return distributionStudents.exam;
    if (selectedAttempt?.distributionId && allDistributionStudents) {
      const distData = allDistributionStudents.find(
        (d: any) => d.distribution.id === selectedAttempt.distributionId
      );
      if (distData?.exam) return distData.exam;
    }
    return null;
  };

  // 문항 수: exam.totalQuestions → questionsData 길이 순. 둘 다 없으면 null.
  // 30 으로 넘겨짚으면 31번 이후 답안이 조용히 누락된 채 채점된다.
  const resolveTotalQuestions = (): number | null => {
    const exam = resolveSelectedExam();
    if (!exam) return null;
    if (exam.totalQuestions) return Number(exam.totalQuestions);
    if (Array.isArray(exam.questionsData) && exam.questionsData.length > 0) {
      return exam.questionsData.length;
    }
    return null;
  };

  const handleAnswerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const totalQuestions = resolveTotalQuestions();
    if (!totalQuestions) {
      toast.error('시험의 문항 수를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
      return;
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
      toast.error('최소 1개 이상의 답안을 입력해주세요.');
      return;
    }

    // 답안이 있는 경우: 기존 답안 수정
    if (selectedAttempt.attemptId) {
      gradeAttemptMutation.mutate({ attemptId: selectedAttempt.attemptId, answers });
    } else {
      // 답안이 없는 경우: 새 답안 생성 후 답안 입력
      if (!selectedAttempt.studentId || !selectedAttempt.distributionId) {
        toast.error('학생 정보가 올바르지 않습니다.');
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
              toast.error('답안지 생성은 성공했으나 ID를 찾을 수 없습니다.');
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

  /*
    보기 전환은 세그먼트 토글과 KPI 첫 칸 두 곳에서 걸린다. 두 입력이 각자
    상태를 들면 서로 어긋나므로, 원래부터 있던 selectedDashboardView 하나만
    쓰고 토글은 그것을 다른 모양으로 보여 줄 뿐이다. null(= 전체)을 세그먼트
    값으로 다룰 수 없어 'all' 이라는 이름만 씌운다.
  */
  type DashboardViewKey = 'all' | 'students' | 'classes' | 'exam-attempts';
  const dashboardViewKey: DashboardViewKey =
    selectedDashboardView === 'students' ||
    selectedDashboardView === 'classes' ||
    selectedDashboardView === 'exam-attempts'
      ? selectedDashboardView
      : 'all';
  const setDashboardViewKey = (key: DashboardViewKey) =>
    setSelectedDashboardView(key === 'all' ? null : key);

  const renderDashboard = () => (
    <>
      {/*
        요약 화면이므로 제목 블록을 둔다 (DESIGN.md 11.9). 관리 목록과 달리
        한 화면에 성격이 다른 덩어리가 섞여 있어 좌측 내비만으로는 무엇을
        보고 있는지가 설명되지 않는다. 우측 토글은 본문 보기를 실제로 바꾼다.
      */}
      <PageHeader
        overline="지점 관리"
        title="한눈에 보기"
        description="지점의 학생·반·응시 현황을 한 화면에서 확인합니다."
        actions={
          <SegmentedControl
            ariaLabel="본문 보기 선택"
            value={dashboardViewKey}
            onChange={setDashboardViewKey}
            options={[
              { value: 'all', label: '전체' },
              { value: 'students', label: '학생' },
              { value: 'classes', label: '반' },
              { value: 'exam-attempts', label: '응시' },
            ]}
          />
        }
      />

      {/*
        KPI 스트립: DESIGN.md 5.2 / 11.9. 카드 4장으로 흩지 않고 한 컨테이너
        안에서 구분선으로 가른다. 네 숫자는 지점의 한 상태를 함께 말하는
        한 벌이므로 각각 독립된 카드로 세울 이유가 없다.
        선택 상태는 확대(scale)가 아니라 면으로 표시한다 (8.2 자동 애니메이션 금지).
        브라스 0곳: 관리 화면에는 강조할 성취 요소가 없다 (DESIGN.md 1.2).
      */}
      <div className="mb-8">
        <StatStrip>
          <StatStripItem
            label="총 학생 수"
            footnote="등록된 학생. 눌러서 목록 보기"
            isActive={selectedDashboardView === 'students'}
            onClick={() => setSelectedDashboardView(selectedDashboardView === 'students' ? null : 'students')}
          >
            <StatValue
              value={students?.length}
              isLoading={studentsLoading}
              isError={studentsError}
              onRetry={() => refetchStudents()}
              valueClassName="text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
            />
          </StatStripItem>

          <StatStripItem label="보고서 완료" footnote="AI 분석 완료 학생">
            <StatValue
              value={allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithReports = distData.students?.filter((s: any) => s.hasReport) || [];
                return total + studentsWithReports.length;
              }, 0)}
              isLoading={distributionsLoading || allDistLoading}
              isError={distributionsError || allDistError}
              onRetry={() => {
                refetchDistributions();
                refetchAllDistributionStudents();
              }}
              valueClassName="text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
            />
          </StatStripItem>

          <StatStripItem
            label="총 반 수"
            footnote="운영 중인 반. 눌러서 목록 보기"
            isActive={selectedDashboardView === 'classes'}
            onClick={() => setSelectedDashboardView(selectedDashboardView === 'classes' ? null : 'classes')}
          >
            <StatValue
              value={classes?.length}
              isLoading={classesLoading}
              isError={classesError}
              onRetry={() => refetchClasses()}
              valueClassName="text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
            />
          </StatStripItem>

          <StatStripItem
            label="시험"
            footnote="응시와 채점 학생. 눌러서 목록 보기"
            isActive={selectedDashboardView === 'exam-attempts'}
            onClick={() => setSelectedDashboardView(selectedDashboardView === 'exam-attempts' ? null : 'exam-attempts')}
          >
            <StatValue
              value={allDistributionStudents?.reduce((total: number, distData: any) => {
                const studentsWithAttempts = distData.students?.filter((s: any) => s.hasAttempt) || [];
                return total + studentsWithAttempts.length;
              }, 0)}
              isLoading={distributionsLoading || allDistLoading}
              isError={distributionsError || allDistError}
              onRetry={() => {
                refetchDistributions();
                refetchAllDistributionStudents();
              }}
              valueClassName="text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
            />
          </StatStripItem>
        </StatStrip>
      </div>

      {/* 상세 정보 표 */}
      {selectedDashboardView === 'students' && (
        <section className="mb-6">
          <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">학생 목록</h2>
          <div>
            {students && students.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">이름</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학년</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학교</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">연락처</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학부모 연락처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student: any) => (
                      <tr key={student.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-3 py-1.5 font-medium text-ink">{student.user?.name}</td>
                        <td className="px-3 py-1.5 text-ink">{student.grade || '-'}</td>
                        <td className="px-3 py-1.5 text-ink">{student.school || '-'}</td>
                        <td className="px-3 py-1.5 text-ink">{student.user?.phone || '-'}</td>
                        <td className="px-3 py-1.5 text-ink">{student.parentPhone || '-'}</td>
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
          </div>
        </section>
      )}

      {selectedDashboardView === 'classes' && (
        <section className="mb-6">
          <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">반 목록</h2>
          <div>
            {classes && classes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">반 이름</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학년</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">설명</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((cls: any) => (
                      <tr key={cls.id} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-3 py-1.5 font-medium text-ink">{cls.name}</td>
                        <td className="px-3 py-1.5 text-ink">{cls.grade || '-'}</td>
                        <td className="px-3 py-1.5 text-ink">{cls.description || '-'}</td>
                        <td className="px-3 py-1.5 text-ink">{new Date(cls.createdAt).toLocaleDateString('ko-KR')}</td>
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
          </div>
        </section>
      )}

      {selectedDashboardView === 'exam-attempts' && (
        <section className="mb-6">
          <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">시험 응시 및 채점 학생</h2>
          <div>
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
                        <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-line-subtle">
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학생</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">점수</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">등급</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">상태</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allStudents.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                                <td className="px-3 py-1.5 font-medium text-ink">{student.studentName}</td>
                                <td className="px-3 py-1.5 text-center text-ink">
                                  {student.hasAttempt ? `${student.score || 0} / ${student.maxScore || 0}` : '- / -'}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  {student.hasAttempt && student.grade ? (
                                    <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeOperate(student.grade)}`}>
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  {student.hasAttempt ? (
                                    student.isSubmitted ? (
                                      <span className="text-xs text-ink-secondary">
                                        제출 완료
                                      </span>
                                    ) : (
                                      <span className="text-xs text-fn-warning">
                                        작성 중
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-block px-2 py-1 bg-surface-subtle text-ink-secondary rounded text-xs font-medium">
                                      미응시
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5">
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
                                              toast.error(error.response?.data?.message || '답안 정보를 불러오는데 실패했습니다.');
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
                                                  toast.success('답안이 삭제되었습니다.');
                                                })
                                                .catch((error) => {
                                                  toast.error(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                                });
                                            }
                                          }}
                                          className="border-fn-error-border text-fn-error hover:bg-surface-subtle"
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
                                            toast.info(`${student.studentName} 학생의 답안 입력을 시작합니다.`);
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
          </div>
        </section>
      )}

      {/*
        응시 현황 보드 + 최근 활동. 두 덩어리 모두 "전체" 보기에서만 나온다.
        학생/반/응시 목록으로 파고든 상태에서 요약을 다시 겹쳐 놓으면
        무엇을 보고 있는지가 흐려진다.
      */}
      {!selectedDashboardView && (
        <>
          {renderAttemptBoard()}
        <section className="mb-6">
          <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">시험 응시 학생</h2>
          <div>
            {allDistributionStudents && allDistributionStudents.length > 0 ? (
              <div className="space-y-6">
                {allDistributionStudents.map((distData: any) => {
                  // 최근 활동에서는 응시한 학생만 표시
                  const studentsWithAttempts = distData.students?.filter((s: any) => s.hasAttempt) || [];
                  if (studentsWithAttempts.length === 0) return null;

                  return (
                    <div key={distData.distribution.id} className="border border-line p-4">
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
                        <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap">
                          <thead>
                            <tr className="border-b border-line">
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학생</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">점수</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">등급</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">상태</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsWithAttempts.map((student: any) => (
                              <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                                <td className="px-3 py-1.5 font-medium text-ink">{student.studentName}</td>
                                <td className="px-3 py-1.5 text-center text-ink">
                                  {student.score || 0} / {student.maxScore || 0}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  {student.grade ? (
                                    <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeOperate(student.grade)}`}>
                                      {student.grade}등급
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  {student.isSubmitted ? (
                                    <span className="text-xs text-ink-secondary">
                                      제출 완료
                                    </span>
                                  ) : (
                                    <span className="text-xs text-fn-warning">
                                      작성 중
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5">
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
                                          toast.error(error.response?.data?.message || '답안 정보를 불러오는데 실패했습니다.');
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
                                              toast.success('답안이 삭제되었습니다.');
                                            })
                                            .catch((error) => {
                                              toast.error(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                            });
                                        }
                                      }}
                                      className="border-fn-error-border text-fn-error hover:bg-surface-subtle"
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
          </div>
        </section>
        </>
      )}
    </>
  );

  // ---- 학생 목록 파생 데이터. 원본 배열은 건드리지 않는다. ----
  const studentList: any[] = Array.isArray(students) ? students : [];

  // 학년 세그먼트는 실제 데이터에서 뽑는다 (없는 학년 버튼을 만들지 않는다)
  const gradeTabs = Array.from(
    new Set(studentList.map((s: any) => String(s.grade || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  const filteredStudents = studentList.filter((s: any) => {
    if (studentGradeTab !== 'all' && String(s.grade || '').trim() !== studentGradeTab) return false;
    const q = studentSearch.trim().toLowerCase();
    if (!q) return true;
    return [s.user?.name, s.user?.phone, s.user?.username, s.school, s.parentPhone, s.parent?.user?.name]
      .some((v: any) => String(v || '').toLowerCase().includes(q));
  });

  const sortedStudents = filteredStudents.slice().sort((a: any, b: any) => {
    const dir = studentSort.dir === 'asc' ? 1 : -1;
    if (studentSort.key === 'grade') {
      return String(a.grade || '').localeCompare(String(b.grade || ''), 'ko') * dir;
    }
    return String(a.user?.name || '').localeCompare(String(b.user?.name || ''), 'ko') * dir;
  });

  const studentPageCount = Math.max(1, Math.ceil(sortedStudents.length / STUDENTS_PER_PAGE));
  const currentStudentPage = Math.min(studentPage, studentPageCount);
  const pagedStudents = sortedStudents.slice(
    (currentStudentPage - 1) * STUDENTS_PER_PAGE,
    currentStudentPage * STUDENTS_PER_PAGE
  );

  /** 필터가 바뀌면 1쪽으로 돌린다 (DESIGN.md 11.2) */
  const resetStudentPage = () => setStudentPage(1);

  const toggleStudentSort = (key: 'name' | 'grade') =>
    setStudentSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));

  const sortMark = (key: 'name' | 'grade') =>
    studentSort.key !== key ? '' : studentSort.dir === 'asc' ? ' ▲' : ' ▼';

  const openStudentEditor = (student: any) => {
    setEditingStudent(student);
    setShowStudentModal(true);
  };

  const impersonateStudent = (student: any) => {
    if (confirm(`${student.user?.name} 학생으로 로그인하시겠습니까?`)) {
      loginAsStudentMutation.mutate(student.id);
    }
  };

  // ===================================================================
  // 학생 중심 뷰 (DESIGN.md 11.6).
  // allDistributionStudents 는 배포 기준으로 묶여 있다. 같은 데이터를
  // 학생 기준으로 뒤집기만 하고 새 API 를 부르지 않는다.
  // ===================================================================
  type ExamRow = {
    distributionId: string;
    examTitle: string;
    subject: string;
    score: number | null;
    maxScore: number | null;
    grade: number | null;
    submittedAt: string | null;
    isSubmitted: boolean;
    hasAttempt: boolean;
    hasReport: boolean;
    attemptId: string | null;
  };

  const examsByStudent = new Map<string, ExamRow[]>();
  (Array.isArray(allDistributionStudents) ? allDistributionStudents : []).forEach((distData: any) => {
    const dist = distData?.distribution;
    if (!dist) return;
    (distData.students || []).forEach((row: any) => {
      if (!examsByStudent.has(row.studentId)) examsByStudent.set(row.studentId, []);
      examsByStudent.get(row.studentId)!.push({
        distributionId: dist.id,
        examTitle: distData.exam?.title || dist.exam?.title || '-',
        subject: distData.exam?.subject || dist.exam?.subject || '',
        score: row.score ?? null,
        maxScore: row.maxScore ?? null,
        grade: row.grade ?? null,
        submittedAt: row.submittedAt ?? null,
        isSubmitted: !!row.isSubmitted,
        hasAttempt: !!row.hasAttempt,
        hasReport: !!row.hasReport,
        attemptId: row.attemptId ?? null,
      });
    });
  });
  // 최신 응시가 위로 오도록 정렬 (제출일 없으면 뒤로)
  examsByStudent.forEach((rows) =>
    rows.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    })
  );

  const selectedStudent = studentList.find((s: any) => s.id === selectedStudentId) || null;
  const selectedStudentExams = selectedStudentId ? examsByStudent.get(selectedStudentId) || [] : [];

  // 패널용 학년 그룹. 반 정보는 학생 목록 API 가 주지 않으므로 이번에는 학년만 쓴다.
  const panelFiltered = studentList.filter((s: any) => {
    const q = panelSearch.trim().toLowerCase();
    if (!q) return true;
    return String(s.user?.name || '').toLowerCase().includes(q);
  });
  const panelGroups = Array.from(
    panelFiltered.reduce((m: Map<string, any[]>, s: any) => {
      const key = String(s.grade || '').trim() || '학년 미지정';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
      return m;
    }, new Map<string, any[]>())
  ).sort((a, b) => a[0].localeCompare(b[0], 'ko'));

  const pickStudent = (id: string) => {
    setSelectedStudentId(id);
    setStudentTab('history');
    setPanelOpen(false);
    setOpenAttemptId(null);
  };

  /** 패널 정렬: 이름순 또는 미응시 우선 (미응시가 많은 학생을 위로) */
  const unattemptedCount = (studentId: string) =>
    (examsByStudent.get(studentId) || []).filter((r) => !r.isSubmitted).length;

  const allGroupsCollapsed =
    panelGroups.length > 0 && panelGroups.every(([name]) => collapsedGroups[name]);

  const toggleAllGroups = () => {
    if (allGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      panelGroups.forEach(([name]) => {
        next[name] = true;
      });
      setCollapsedGroups(next);
    }
  };

  const sortPanelStudents = (rows: any[]) =>
    rows.slice().sort((a: any, b: any) => {
      if (panelSort === 'unattempted') {
        const d = unattemptedCount(b.id) - unattemptedCount(a.id);
        if (d !== 0) return d;
      }
      return String(a.user?.name || '').localeCompare(String(b.user?.name || ''), 'ko');
    });

  /** 학생 헤더 요약 지표. 제출 완료 건만 집계한다. */
  const studentSummary = (() => {
    if (!selectedStudentId) return null;
    const submitted = (examsByStudent.get(selectedStudentId) || []).filter((r) => r.isSubmitted);
    if (submitted.length === 0) return null;
    const scores = submitted.map((r) => Number(r.score) || 0);
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    const best = Math.max(...scores);
    const latest = submitted.find((r) => r.grade !== null);
    return { count: submitted.length, avg, best, grade: latest ? Number(latest.grade) : null };
  })();

  /** 답안 입력/수정 모달을 성적 관리 탭에서 바로 연다. 기존 핸들러와 같은 형태로 넘긴다. */
  const openAnswerEditor = async (r: ExamRow) => {
    if (!selectedStudent) return;
    const base: any = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.user?.name,
      attemptId: r.attemptId,
      hasAttempt: r.hasAttempt,
      isSubmitted: r.isSubmitted,
      score: r.score,
      maxScore: r.maxScore,
      submittedAt: r.submittedAt,
      distributionId: r.distributionId,
      answers: {},
    };
    if (r.attemptId) {
      try {
        const res = await api.get(`/exam-attempts/${r.attemptId}`);
        base.answers = (res.data.data || res.data)?.answers || {};
      } catch (error: any) {
        toast.error(error.response?.data?.message || '답안 정보를 불러오는데 실패했습니다.');
        return;
      }
    }
    setSelectedAttempt(base);
    setShowAnswerModal(true);
  };

  const renderStudentPanel = () => (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-semibold tracking-wide text-ink-tertiary">학생 성적</p>
        <p className="mt-0.5 truncate text-base font-semibold text-ink">
          {selectedStudent ? selectedStudent.user?.name : '학생을 선택하세요'}
        </p>
      </div>
      <div className="border-b border-line px-4 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.5} />
          <Input
            value={panelSearch}
            onChange={(e) => setPanelSearch(e.target.value)}
            placeholder="학생 이름 검색"
            aria-label="학생 이름 검색"
            className="h-9 pl-9"
          />
        </div>
      </div>
      {/* 패널 보조 컨트롤 (DESIGN.md 11.6.2) */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <button
          type="button"
          onClick={toggleAllGroups}
          className="h-7 rounded-sm border border-line px-2 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
        >
          {allGroupsCollapsed ? '전체 펴기' : '전체 접기'}
        </button>
        <button
          type="button"
          onClick={() => setPanelSort((p) => (p === 'name' ? 'unattempted' : 'name'))}
          title="눌러서 정렬 기준을 바꿉니다"
          className="ml-auto h-7 rounded-sm border border-line px-2 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
        >
          정렬 · {panelSort === 'name' ? '이름순' : '미응시 우선'}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-1" aria-label="학생 목록">
        {panelGroups.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-ink-tertiary">일치하는 학생이 없습니다.</p>
        )}
        {panelGroups.map(([groupName, groupStudents]) => {
          const collapsed = !!collapsedGroups[groupName];
          return (
            <div key={groupName}>
              <button
                type="button"
                onClick={() => setCollapsedGroups((p) => ({ ...p, [groupName]: !p[groupName] }))}
                aria-expanded={!collapsed}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle"
              >
                <span className="w-3 flex-shrink-0 text-xs text-ink-tertiary">{collapsed ? '▸' : '▾'}</span>
                <span className="font-semibold text-ink">{groupName}</span>
                <span className="ml-auto tabular-nums text-xs text-ink-tertiary">{groupStudents.length}명</span>
              </button>
              {!collapsed &&
                sortPanelStudents(groupStudents)
                  .map((s: any) => {
                    const active = s.id === selectedStudentId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickStudent(s.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`flex w-full items-center py-1.5 pl-9 pr-3 text-left text-sm transition-colors duration-150 ease-out ${
                          active
                            ? 'bg-surface-subtle font-semibold text-ink'
                            : 'text-ink-secondary hover:bg-surface-subtle'
                        }`}
                      >
                        {/* 사이드는 이름만. 성적은 본문에서 본다 (DESIGN.md 11.6.2) */}
                        <span className="truncate">{s.user?.name}</span>
                      </button>
                    );
                  })}
            </div>
          );
        })}
      </nav>
    </div>
  );

  /**
   * 보고서 확보 후 실제로 연다. ensureReport 는 참조만 돌려주므로
   * 그것만 부르면 사용자에게는 아무 일도 일어나지 않는다 (학생·학부모 화면과 같은 흐름).
   */
  const openStudentReport = async (attemptId: string) => {
    try {
      const ref = await ensureReport(attemptId, (stage) => {
        if (stage === 'generating') {
          toast.info('AI 분석을 시작했습니다...', '완료까지 시간이 걸릴 수 있습니다.');
        }
      });
      await openFullReport(ref);
      refetchAllDistributionStudents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || '보고서를 열 수 없습니다.');
    }
  };

  /*
    응시 현황 보드 (DESIGN.md 11.9).

    이미 받아 둔 allDistributionStudents 만 뒤집어 쓰고 새 API 를 부르지 않는다 (11.6.5).
    칸을 가르는 것은 사람이 아니라 데이터다. 그래서 카드를 끌어 옮기지 않는다.

      미응시      !hasAttempt                neutral
      작성 중     hasAttempt && !isSubmitted warning   <- 손이 가야 하는 유일한 칸
      채점 완료   isSubmitted && !hasReport  neutral
      보고서 완료 hasReport                  neutral

    카드 클릭은 새 핸들러를 만들지 않고 기존 openStudentReport 로 보낸다.
    보고서가 있으면 그것을 열고, 없으면 ensureReport 가 생성한 뒤 연다
    (= 기존 목록의 [보고서 / AI 분석] 버튼과 같은 경로). 응시 기록이 없거나
    아직 제출되지 않은 카드는 누를 곳이 없다 - 답안 입력은 배포를 고른
    상태에서만 성립하는 인라인 동작이라 재사용할 명명된 핸들러가 없다.
  */
  const renderAttemptBoard = () => {
    const boardTitle = (
      <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">
        응시 현황
      </h2>
    );

    // 못 받아온 것과 0명은 다르다. 거짓 0 을 그리지 않는다 (11.7).
    if (distributionsLoading || allDistLoading) {
      return (
        <section className="mb-6">
          {boardTitle}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="불러오는 중">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-lg border border-line bg-surface-subtle" />
            ))}
          </div>
        </section>
      );
    }

    if (distributionsError || allDistError) {
      return (
        <section className="mb-6">
          {boardTitle}
          <div className="rounded-lg border border-line bg-surface p-8 text-center">
            <p className="text-sm font-semibold text-fn-error">응시 현황을 불러오지 못했습니다</p>
            <p className="mt-1 text-xs text-ink-secondary">배포 목록 또는 배포별 학생 조회가 실패했습니다.</p>
            <button
              type="button"
              onClick={() => {
                refetchDistributions();
                refetchAllDistributionStudents();
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
            >
              재시도
            </button>
          </div>
        </section>
      );
    }

    // 기본값은 가장 최근 배포(생성일 기준)다.
    const boardDistributions = (Array.isArray(allDistributionStudents) ? allDistributionStudents : [])
      .filter((d: any) => d?.distribution?.id)
      .slice()
      .sort(
        (a: any, b: any) =>
          new Date(b.distribution.createdAt || 0).getTime() - new Date(a.distribution.createdAt || 0).getTime()
      );

    const boardDist =
      boardDistributions.find((d: any) => d.distribution.id === boardDistributionId) || boardDistributions[0] || null;

    /*
      배포 선택 라벨. 제목이 완전히 같은 배포가 실제로 있어서 제목만으로는
      드롭다운의 두 항목이 구분되지 않는다. startDate 까지 같은 경우가 있어
      구분에 쓸 수 없으므로 배포 생성 시각(createdAt)을 병기한다.
      시각 표기는 새 유틸을 만들지 않고 이 파일이 이미 쓰는
      toLocaleString('ko-KR') 을 그대로 쓴다.
    */
    const boardLabelEntries = boardDistributions.map((d: any) => {
      const title = d.exam?.title || '제목 없는 시험';
      const created = d.distribution.createdAt;
      const stamp = created
        ? new Date(created).toLocaleString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : '';
      return {
        id: d.distribution.id as string,
        createdAt: created ? new Date(created).getTime() : 0,
        base: stamp ? `${title} · 배포 ${stamp}` : title,
      };
    });

    // 겹치는 라벨에만 순번을 붙인다. 멀쩡한 이름에 번호를 달면 지면만 시끄러워진다.
    const boardLabelCounts = new Map<string, number>();
    boardLabelEntries.forEach((e) => boardLabelCounts.set(e.base, (boardLabelCounts.get(e.base) || 0) + 1));

    const boardLabelSeq = new Map<string, number>();
    const boardLabels = new Map<string, string>();
    boardLabelEntries
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((e) => {
        if ((boardLabelCounts.get(e.base) || 0) > 1) {
          const n = (boardLabelSeq.get(e.base) || 0) + 1;
          boardLabelSeq.set(e.base, n);
          boardLabels.set(e.id, `${e.base} (${n})`);
        } else {
          boardLabels.set(e.id, e.base);
        }
      });

    if (!boardDist) {
      return (
        <section className="mb-6">
          {boardTitle}
          <div className="rounded-lg border border-line bg-surface p-8 text-center">
            <p className="text-sm text-ink-secondary">배포된 시험이 없습니다.</p>
          </div>
        </section>
      );
    }

    // 학년은 배포별 학생 응답에 없다. 이미 받아 둔 학생 목록에서만 붙이고,
    // 없으면 칩을 만들지 않는다 (11.8 데이터가 없는 열은 만들지 않습니다).
    const gradeByStudentId = new Map<string, string>();
    studentList.forEach((s: any) => {
      const g = String(s?.grade || '').trim();
      if (s?.id && g) gradeByStudentId.set(s.id, g);
    });

    const rows: any[] = Array.isArray(boardDist.students) ? boardDist.students : [];

    const toCard = (row: any, tone: StatusTone) => {
      const meta = row.isSubmitted
        ? `${row.score ?? 0} / ${row.maxScore ?? 0}${row.grade ? ` · ${row.grade}등급` : ''}`
        : '-';
      return (
        <StatusBoardCard
          key={row.studentId}
          chip={gradeByStudentId.get(row.studentId)}
          tone={tone}
          title={row.studentName || '이름 없음'}
          meta={meta}
          footnote={row.submittedAt ? new Date(row.submittedAt).toLocaleString('ko-KR') : undefined}
          onClick={
            row.isSubmitted && row.attemptId ? () => openStudentReport(row.attemptId) : undefined
          }
        />
      );
    };

    const columns = [
      {
        key: 'not-attempted',
        label: '미응시',
        tone: 'neutral' as StatusTone,
        cards: rows.filter((r) => !r.hasAttempt).map((r) => toCard(r, 'neutral')),
        emptyText: '전원 응시했습니다',
      },
      {
        key: 'writing',
        label: '작성 중',
        tone: 'warning' as StatusTone,
        cards: rows.filter((r) => r.hasAttempt && !r.isSubmitted).map((r) => toCard(r, 'warning')),
        emptyText: '작성 중인 학생이 없습니다',
      },
      {
        key: 'scored',
        label: '채점 완료',
        tone: 'neutral' as StatusTone,
        cards: rows.filter((r) => r.isSubmitted && !r.hasReport).map((r) => toCard(r, 'neutral')),
        emptyText: '채점만 끝난 학생이 없습니다',
      },
      {
        key: 'reported',
        label: '보고서 완료',
        tone: 'neutral' as StatusTone,
        cards: rows.filter((r) => r.hasReport).map((r) => toCard(r, 'neutral')),
        emptyText: '생성된 보고서가 없습니다',
      },
    ];

    return (
      <section className="mb-6">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">
            응시 현황
          </h2>
          {boardDistributions.length > 1 && (
            <Select
              value={boardDist.distribution.id}
              onValueChange={(value) => setBoardDistributionId(value)}
            >
              <SelectTrigger className="h-9 w-full sm:w-72" aria-label="배포 선택">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boardDistributions.map((d: any) => (
                  <SelectItem key={d.distribution.id} value={d.distribution.id}>
                    {boardLabels.get(d.distribution.id) || d.exam?.title || '제목 없는 시험'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-secondary">
          {boardLabels.get(boardDist.distribution.id) || boardDist.exam?.title || '제목 없는 시험'} · 대상{' '}
          {rows.length}명
        </p>
        <StatusBoard columns={columns} />
      </section>
    );
  };

  /** 배포 id 로 시험 원본(questionsData 포함)을 찾는다. 이미 받아 둔 응답에서만 꺼낸다. */
  const examOfDistribution = (distributionId: string): any | null => {
    const found = (Array.isArray(allDistributionStudents) ? allDistributionStudents : []).find(
      (d: any) => d?.distribution?.id === distributionId
    );
    return found?.exam || null;
  };

  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  /** 객관식 번호는 원문자로, 그 밖(주관식 등)은 값 그대로 보여 준다. */
  const answerLabel = (v: any): string => {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= CIRCLED.length) return CIRCLED[n - 1];
    return String(v);
  };

  const toggleAnswerPanel = async (row: ExamRow) => {
    if (!row.isSubmitted || !row.attemptId) return;
    if (openAttemptId === row.attemptId) {
      setOpenAttemptId(null);
      return;
    }
    setOpenAttemptId(row.attemptId);
    if (answerCache[row.attemptId]) return;
    setAnswerLoading(row.attemptId);
    try {
      const res = await api.get(`/exam-attempts/${row.attemptId}`);
      const data = res.data.data || res.data;
      setAnswerCache((prev) => ({ ...prev, [row.attemptId!]: data }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || '답안 정보를 불러오지 못했습니다.');
      setOpenAttemptId(null);
    } finally {
      setAnswerLoading(null);
    }
  };

  const renderAnswerPanel = (row: ExamRow) => {
    const attempt = row.attemptId ? answerCache[row.attemptId] : null;
    if (answerLoading === row.attemptId) {
      return <p className="px-3 py-6 text-center text-sm text-ink-secondary">답안을 불러오는 중입니다.</p>;
    }
    if (!attempt) return null;

    const answers: any = attempt.answers || {};
    // O/X 수동 채점 기록은 값이 정답 번호가 아니라 O=1 / X=0 이다.
    const isOx = answers._gradingMode === 'ox';
    const exam = examOfDistribution(row.distributionId);
    const questions: any[] = Array.isArray(exam?.questionsData) ? exam.questionsData : [];

    const items = (questions.length > 0
      ? questions.map((q: any, i: number) => {
          const num = q.number || i + 1;
          const raw = answers[String(num)];
          const correct = isOx ? Number(raw) === 1 : raw === q.correctAnswer;
          return {
            num,
            raw,
            correctAnswer: q.correctAnswer ?? null,
            points: Number(q.points ?? q.score) || 0,
            answered: raw !== undefined && raw !== null && raw !== '' && Number(raw) !== 0,
            correct,
          };
        })
      : Object.keys(answers)
          .filter((k) => !k.startsWith('_'))
          .map((k) => ({
            num: Number(k),
            raw: answers[k],
            correctAnswer: null,
            points: 0,
            answered: true,
            correct: isOx ? Number(answers[k]) === 1 : false,
          }))
          .sort((a, b) => a.num - b.num));

    const correctCount = items.filter((it) => it.correct).length;
    const earned = items.reduce((s, it) => s + (it.correct ? it.points : 0), 0);

    return (
      <div className="border-t border-line bg-surface-subtle px-3 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2">
          <p className="text-sm font-semibold text-ink">{row.examTitle}</p>
          <span className="text-xs text-ink-tertiary">
            {row.submittedAt ? new Date(row.submittedAt).toLocaleString('ko-KR') : '-'} 제출
          </span>
          {row.grade ? (
            <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${gradeBadgeOperate(row.grade)}`}>
              {row.grade}등급
            </span>
          ) : null}
          <span className="ml-auto flex items-baseline gap-1">
            <span className="text-xl font-bold tabular-nums text-ink">{row.score ?? 0}</span>
            <span className="text-xs text-ink-tertiary">/ {row.maxScore ?? 0}점</span>
          </span>
          <button
            type="button"
            onClick={() => setOpenAttemptId(null)}
            aria-label="답안 패널 닫기"
            className="h-7 w-7 rounded-sm border border-line text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface hover:text-ink"
          >
            ×
          </button>
        </div>

        <p className="mb-2 border-y border-line bg-surface px-2 py-1.5 text-xs text-ink-secondary">
          {items.length}문항 중 <b className="text-ink">{correctCount}문항</b> 정답
          {items.length > 0 && earned > 0 ? ` · 취득 ${earned}점` : ''}
          {isOx ? ' · 지점에서 O/X 수동 채점한 기록이라 선택 답안이 없습니다.' : ''}
        </p>

        {/* 45문항을 세로로 나열하면 지면이 길어진다. 폭에 따라 2~3열로 접는다 */}
        <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.num}
              className={`flex items-center gap-2 border-l-[3px] px-2 py-1.5 text-sm ${
                it.correct
                  ? 'border-fn-success bg-fn-success-surface'
                  : it.answered
                    ? 'border-fn-error bg-surface'
                    : 'border-line bg-surface'
              }`}
            >
              <span className="w-8 flex-shrink-0 text-xs tabular-nums text-ink-tertiary">{it.num}번</span>
              <span className="w-8 flex-shrink-0 text-center font-semibold text-ink">
                {isOx ? (Number(it.raw) === 1 ? 'O' : 'X') : it.answered ? answerLabel(it.raw) : '-'}
              </span>
              {!isOx && (
                <span className="w-14 flex-shrink-0 text-xs text-ink-tertiary">
                  정답 {answerLabel(it.correctAnswer)}
                </span>
              )}
              <span
                className={`ml-auto flex-shrink-0 text-sm font-bold ${
                  it.correct ? 'text-fn-success' : 'text-fn-error'
                }`}
              >
                {it.correct ? 'O' : 'X'}
              </span>
              {it.points > 0 && (
                <span className="w-8 flex-shrink-0 text-right text-xs tabular-nums text-ink-tertiary">
                  {it.points}점
                </span>
              )}
            </div>
          ))}
        </div>

        {questions.length === 0 && (
          <p className="mt-2 text-xs text-ink-tertiary">
            이 시험의 문항 정보가 없어 정답 대조 없이 제출한 답만 표시했습니다.
          </p>
        )}
      </div>
    );
  };

  const renderStudentContext = () => {
    if (!selectedStudent) return renderDashboard();
    const submitted = selectedStudentExams.filter((r) => r.isSubmitted);
    const tabs: { id: StudentTab; label: string }[] = [
      { id: 'history', label: '응시 이력' },
      { id: 'trend', label: '성적 추이' },
      { id: 'reports', label: '보고서' },
    ];
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-ink">{selectedStudent.user?.name}</h1>
          <span className="text-sm text-ink-tertiary">
            {selectedStudent.grade || '학년 미지정'} · {selectedStudent.school || '학교 미등록'}
          </span>
          <button
            type="button"
            onClick={() => impersonateStudent(selectedStudent)}
            className="ml-auto h-8 rounded-sm border border-line px-3 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
          >
            학생 화면
          </button>
        </div>
        {/* 요약 지표: 제출 완료 건만 집계 (DESIGN.md 11.6.3) */}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-secondary">
          {studentSummary ? (
            <>
              <span>응시 <b className="tabular-nums text-ink">{studentSummary.count}</b>회</span>
              <span className="text-ink-tertiary">·</span>
              <span>평균 <b className="tabular-nums text-ink">{studentSummary.avg}</b>점</span>
              <span className="text-ink-tertiary">·</span>
              <span>최고 <b className="tabular-nums text-ink">{studentSummary.best}</b>점</span>
              {studentSummary.grade !== null && (
                <>
                  <span className="text-ink-tertiary">·</span>
                  <span className="flex items-center gap-1">
                    최근
                    <span className={`rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${gradeBadgeOperate(studentSummary.grade)}`}>
                      {studentSummary.grade}등급
                    </span>
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-ink-tertiary">응시 기록 없음</span>
          )}
        </p>

        {/* 학생 컨텍스트 탭 */}
        <div className="mt-3 flex gap-1 overflow-x-auto border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStudentTab(t.id)}
              aria-current={studentTab === t.id ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-150 ease-out ${
                studentTab === t.id
                  ? 'border-action font-semibold text-ink'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {studentTab === 'history' && (
          selectedStudentExams.length === 0 ? (
            <p className="mt-4 border border-line bg-surface-subtle py-10 text-center text-sm text-ink-secondary">
              배포된 시험이 없습니다.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">시험</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">응시일</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">상태</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-ink-secondary">등급</th>
                  <th className="w-32 px-3 py-2 text-right text-xs font-semibold text-ink-secondary">점수</th>
                  <th className="w-44 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">작업</th>
                </tr>
              </thead>
              <tbody>
                {selectedStudentExams.map((r) => (
                  <Fragment key={r.distributionId}>
                  <tr
                    onClick={() => toggleAnswerPanel(r)}
                    aria-expanded={r.attemptId ? openAttemptId === r.attemptId : undefined}
                    className={`border-b border-line-subtle ${
                      r.isSubmitted ? 'cursor-pointer hover:bg-surface-subtle' : 'cursor-default'
                    } ${openAttemptId && openAttemptId === r.attemptId ? 'bg-surface-subtle' : ''}`}
                  >
                    <td className="px-3 py-1.5">
                      <span className="block leading-tight font-medium text-ink">
                        {r.isSubmitted && (
                          <span className="mr-1.5 text-xs text-ink-tertiary">
                            {openAttemptId === r.attemptId ? '▾' : '▸'}
                          </span>
                        )}
                        {r.examTitle}
                      </span>
                      {r.subject && <span className="block text-xs leading-tight text-ink-tertiary">{r.subject}</span>}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                      {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-3 py-1.5">
                      {/* 제출은 정상 상태다. 성공색은 예외 상황에만 쓴다 (DESIGN.md 2.4) */}
                      {r.isSubmitted ? (
                        <span className="text-xs text-ink-secondary">제출 완료</span>
                      ) : r.hasAttempt ? (
                        <span className="text-xs text-fn-warning">작성 중</span>
                      ) : (
                        <span className="text-xs text-ink-tertiary">미응시</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {r.grade ? (
                        <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeOperate(r.grade)}`}>
                          {r.grade}등급
                        </span>
                      ) : (
                        <span className="text-xs text-ink-tertiary">-</span>
                      )}
                    </td>
                    {/* 점수가 시선의 종착점 (11.6.3) */}
                    <td className="px-3 py-1.5 text-right">
                      {r.isSubmitted ? (
                        <>
                          <span className="text-xl font-bold tabular-nums text-ink">{r.score ?? 0}</span>
                          <span className="text-[11px] text-ink-tertiary"> / {r.maxScore ?? 0}</span>
                        </>
                      ) : (
                        <span className="text-sm text-ink-tertiary">-</span>
                      )}
                    </td>
                    {/* 행 액션: 무채색 아웃라인 (11.2). 기존 핸들러를 그대로 부른다 */}
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={!r.isSubmitted || !r.attemptId}
                          onClick={() => r.attemptId && openStudentReport(r.attemptId)}
                          className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink disabled:opacity-40"
                        >
                          {r.hasReport ? '보고서' : 'AI 분석'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAnswerEditor(r)}
                          className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                        >
                          답안 입력
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openAttemptId && openAttemptId === r.attemptId && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        {renderAnswerPanel(r)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )
        )}

        {studentTab === 'trend' && (
          submitted.length === 0 ? (
            <p className="mt-4 border border-line bg-surface-subtle py-10 text-center text-sm text-ink-secondary">
              제출된 응시 기록이 없어 추이를 그릴 수 없습니다.
            </p>
          ) : (
            <div className="mt-4 border border-line p-4">
              {/* 응시 순서대로(과거 -> 최근) 정답률 막대. 실제 점수만 쓴다. */}
              <div className="flex items-end gap-3" style={{ height: '180px' }}>
                {submitted
                  .slice()
                  .reverse()
                  .map((r) => {
                    const pct = r.maxScore ? Math.round(((r.score ?? 0) / r.maxScore) * 100) : 0;
                    return (
                      <div key={r.distributionId} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-xs font-semibold tabular-nums text-ink">{pct}%</span>
                        <div
                          className="w-full max-w-[56px] bg-action"
                          style={{ height: `${Math.max(2, pct * 1.3)}px` }}
                          aria-hidden="true"
                        />
                        <span className="w-full truncate text-center text-[10px] text-ink-tertiary" title={r.examTitle}>
                          {r.examTitle}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <p className="mt-3 border-t border-line-subtle pt-2 text-xs text-ink-tertiary">
                제출 완료된 {submitted.length}개 응시의 정답률입니다. 왼쪽이 이전 응시입니다.
              </p>
            </div>
          )
        )}

        {studentTab === 'reports' && (
          selectedStudentExams.filter((r) => r.isSubmitted).length === 0 ? (
            <p className="mt-4 border border-line bg-surface-subtle py-10 text-center text-sm text-ink-secondary">
              제출된 응시 기록이 없습니다.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {selectedStudentExams
                .filter((r) => r.isSubmitted)
                .map((r) => (
                  <div key={r.distributionId} className="flex items-center gap-3 border border-line px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{r.examTitle}</p>
                      <p className="text-xs text-ink-tertiary">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('ko-KR') : '-'} · {r.score ?? 0}/{r.maxScore ?? 0}점
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-xs ${r.hasReport ? 'text-fn-success' : 'text-ink-tertiary'}`}>
                      {r.hasReport ? '생성됨' : '미생성'}
                    </span>
                    <button
                      type="button"
                      disabled={!r.attemptId}
                      onClick={() => r.attemptId && openStudentReport(r.attemptId)}
                      className="h-8 flex-shrink-0 rounded-sm border border-line px-3 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink disabled:opacity-50"
                    >
                      {r.hasReport ? '보고서 열기' : '보고서 생성'}
                    </button>
                  </div>
                ))}
            </div>
          )
        )}
      </>
    );
  };

  const renderStudents = () => (
    <>
      {/* 툴바 (DESIGN.md 11.2). 페이지 제목은 사이드바 활성 표시로 대체한다. */}
      <div className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-center md:gap-4">
        <div className="flex items-center gap-3 overflow-x-auto md:overflow-visible">
          <div className="flex flex-shrink-0 rounded-sm border border-line">
            <button
              type="button"
              onClick={() => {
                setStudentGradeTab('all');
                resetStudentPage();
              }}
              aria-pressed={studentGradeTab === 'all'}
              className={`h-8 whitespace-nowrap px-3 text-sm transition-colors duration-150 ease-out ${
                studentGradeTab === 'all'
                  ? 'bg-surface-subtle font-semibold text-ink'
                  : 'text-ink-secondary hover:bg-surface-subtle'
              }`}
            >
              전체
            </button>
            {gradeTabs.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setStudentGradeTab(g);
                  resetStudentPage();
                }}
                aria-pressed={studentGradeTab === g}
                className={`h-8 whitespace-nowrap border-l border-line px-3 text-sm transition-colors duration-150 ease-out ${
                  studentGradeTab === g
                    ? 'bg-surface-subtle font-semibold text-ink'
                    : 'text-ink-secondary hover:bg-surface-subtle'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <span className="flex-shrink-0 text-sm text-ink-secondary">
            <strong className="font-semibold text-ink tabular-nums">{sortedStudents.length}</strong>명
          </span>
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          <div className="relative flex-1 md:w-64 md:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.5} />
            <Input
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                resetStudentPage();
              }}
              placeholder="이름 · 연락처 · 학교 검색"
              aria-label="학생 검색"
              className="h-9 pl-9"
            />
          </div>
          <Button
            onClick={() => {
              setEditingStudent(null);
              setShowStudentModal(true);
            }}
            className="h-9 flex-shrink-0 bg-action hover:bg-action-hover"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            학생 추가
          </Button>
        </div>
      </div>

      {sortedStudents.length > 0 ? (
        <>
          {/* 데스크톱: 표가 본문 폭 전체를 쓴다. 카드로 감싸지 않는다 (11.2) */}
          <table className="mt-3 hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="w-20 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">
                  <button
                    type="button"
                    onClick={() => toggleStudentSort('grade')}
                    className="hover:text-ink"
                  >
                    학년{sortMark('grade')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">
                  <button
                    type="button"
                    onClick={() => toggleStudentSort('name')}
                    className="hover:text-ink"
                  >
                    이름{sortMark('name')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">학교</th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">학생 연락처</th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">학부모</th>
                <th className="w-44 whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-ink-secondary">작업</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.map((student: any) => (
                <tr
                  key={student.id}
                  className="border-b border-line-subtle transition-colors duration-150 ease-out hover:bg-surface-subtle"
                >
                  <td className="px-3 py-1.5 text-ink-secondary">{student.grade || '-'}</td>
                  <td className="px-3 py-1.5 font-semibold text-ink">{student.user?.name}</td>
                  <td className="px-3 py-1.5 text-ink-secondary">{student.school || '-'}</td>
                  {/* 한 셀 두 줄: 연락처 + 아이디 (11.2) */}
                  <td className="px-3 py-1.5">
                    <span className="block leading-tight tabular-nums text-ink">{student.user?.phone || '-'}</span>
                    {/* 이 시스템은 연락처가 곧 아이디다. 같은 값이면 둘째 줄을 만들지 않는다. */}
                    {student.user?.username && student.user.username !== student.user.phone && (
                      <span className="block text-xs leading-tight text-ink-tertiary">{student.user.username}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {student.parent?.user?.name || student.parent?.user?.phone || student.parentPhone ? (
                      <>
                        <span className="block leading-tight text-ink">{student.parent?.user?.name || '이름 미등록'}</span>
                        <span className="block text-xs leading-tight tabular-nums text-ink-tertiary">
                          {student.parent?.user?.phone || student.parentPhone}
                        </span>
                      </>
                    ) : (
                      <span className="block leading-tight text-ink-tertiary">미등록</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {/* 행 액션은 무채색 아웃라인 (11.2) */}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openStudentEditor(student)}
                        className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                      >
                        상세
                      </button>
                      <button
                        type="button"
                        onClick={() => impersonateStudent(student)}
                        className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                      >
                        학생 화면
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 모바일: 표 대신 카드 리스트 (11.3) */}
          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {pagedStudents.map((student: any) => (
              <div key={student.id} className="rounded-sm border border-line bg-surface p-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-base font-semibold text-ink">{student.user?.name}</p>
                  <span className="text-xs text-ink-tertiary">{student.grade || '-'}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-secondary">{student.school || '학교 미등록'}</p>
                <p className="mt-1 text-xs tabular-nums text-ink-tertiary">
                  {student.user?.phone || '-'}
                  {student.parent?.user?.phone || student.parentPhone
                    ? ` · 학부모 ${student.parent?.user?.phone || student.parentPhone}`
                    : ''}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openStudentEditor(student)}
                    className="h-11 flex-1 rounded-sm border border-line text-sm text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle"
                  >
                    상세
                  </button>
                  <button
                    type="button"
                    onClick={() => impersonateStudent(student)}
                    className="h-11 flex-1 rounded-sm border border-line text-sm text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle"
                  >
                    학생 화면
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 페이저 (11.2) */}
          {studentPageCount > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-1" aria-label="학생 목록 페이지">
              {Array.from({ length: studentPageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStudentPage(p)}
                  aria-current={p === currentStudentPage ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-sm px-2 text-sm tabular-nums transition-colors duration-150 ease-out ${
                    p === currentStudentPage
                      ? 'bg-surface-inverse font-semibold text-ink-inverse'
                      : 'border border-line text-ink-secondary hover:bg-surface-subtle'
                  }`}
                >
                  {p}
                </button>
              ))}
            </nav>
          )}
        </>
      ) : (
        <div className="mt-3 border border-line bg-surface-subtle py-12 text-center">
          <p className="text-sm text-ink-secondary">
            {studentList.length === 0 ? '등록된 학생이 없습니다.' : '조건에 맞는 학생이 없습니다.'}
          </p>
        </div>
      )}

      {/* 학생 추가/수정 모달 */}
      {showStudentModal && (
        <div
          ref={studentModalRef}
          role="dialog"
          aria-modal="true"
          aria-label={editingStudent ? '학생 수정' : '학생 등록'}
          className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50"
        >
          <Card className="w-full max-w-2xl mx-4 rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle>{editingStudent ? '학생 수정' : '학생 추가'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* 섹션 라벨 + 2열 그리드로 밀도를 올린다 (DESIGN.md 11.4) */}
              <form onSubmit={handleStudentSubmit}>
                <p className="border-b border-line bg-surface-subtle px-6 py-2 text-xs font-bold tracking-wide text-ink-secondary">
                  필수 입력 사항
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6 py-4">
                  <div>
                    <label className="text-xs font-semibold text-ink">이름</label>
                    <Input name="name" defaultValue={editingStudent?.user?.name} required className="mt-1 h-9" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink">학생 연락처 (로그인 아이디)</label>
                    <Input
                      name="phone"
                      defaultValue={editingStudent?.user?.phone}
                      required
                      className="mt-1 h-9"
                      placeholder="01012345678"
                      disabled={!!editingStudent}
                    />
                    {!editingStudent && (
                      <p className="mt-1 text-xs text-ink-tertiary">연락처가 로그인 아이디가 되며, 비밀번호는 끝 4자리로 자동 설정됩니다.</p>
                    )}
                  </div>
                </div>

                <p className="border-y border-line bg-surface-subtle px-6 py-2 text-xs font-bold tracking-wide text-ink-secondary">
                  선택 입력 사항
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6 py-4">
                  <div>
                    <label className="text-xs font-semibold text-ink">학년</label>
                    <Input name="grade" defaultValue={editingStudent?.grade} className="mt-1 h-9" placeholder="예: 중3" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink">학교</label>
                    <Input name="school" defaultValue={editingStudent?.school} className="mt-1 h-9" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-ink">학부모 연락처 (로그인 아이디)</label>
                    <Input
                      name="parentPhone"
                      defaultValue={editingStudent?.parentPhone}
                      className="mt-1 h-9"
                      placeholder="01087654321"
                    />
                  </div>
                  {editingStudent && (
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-ink">새 비밀번호</label>
                      <Input
                        type="password"
                        name="password"
                        className="mt-1 h-9"
                        placeholder="변경하지 않으려면 비워두세요"
                      />
                      <p className="mt-1 text-xs text-ink-tertiary">입력하면 새 비밀번호로 변경됩니다.</p>
                    </div>
                  )}
                </div>

                {/* 좌측 보조 동작 / 우측 주 동작 (11.4) */}
                <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-4">
                  <Button type="button" variant="outline" onClick={closeStudentModal}>
                    취소
                  </Button>
                  <Button type="submit" className="bg-action hover:bg-action-hover">
                    {editingStudent ? '저장하기' : '등록하기'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );

  /**
   * 반 상세/학생 배정 모달.
   * 반 상세는 이름·학년·설명 수정만 실제로 저장된다.
   * 학생 배정은 서버 PUT /classes/:id 가 studentIds 를 무시하므로 반영되지 않는다.
   * 두 사실을 화면에서 숨기지 않고 모달에 적는다.
   */
  const openClassEditor = async (cls: any) => {
    setEditingClass(cls);
    setSelectedClassStudents([]);
    setClassRosterUnavailable(false);
    setClassRosterLoading(true);
    setShowClassModal(true);

    // 현재 배정된 학생을 서버에서 불러와 체크 상태로 표시한다.
    try {
      const res = await api.get(`/classes/${cls.id}/students`);
      const ids = (res.data?.data || []).map((x: any) => x.id);
      setSelectedClassStudents(ids);
    } catch (error: any) {
      // 못 불러온 채로 저장하면 기존 배정이 전부 해제되므로, 사실대로 알리고
      // 저장을 막는다(모달의 저장 버튼이 classRosterUnavailable 을 본다).
      setClassRosterUnavailable(true);
      toast.error(error.response?.data?.message || '배정 학생을 불러오지 못했습니다.');
    } finally {
      setClassRosterLoading(false);
    }
  };

  const deleteClass = async (cls: any) => {
    if (!confirm(`'${cls.name}' 반을 삭제하시겠습니까?`)) return;
    try {
      await api.delete(`/classes/${cls.id}`);
      toast.success('반이 삭제되었습니다.');
      refetchClasses();
    } catch (error: any) {
      if (error.response?.status === 409) {
        const msg = error.response.data?.message || '배정된 학생이 있습니다.';
        if (confirm(`${msg}\n\n그래도 삭제하시겠습니까? 배정이 함께 해제됩니다.`)) {
          try {
            await api.delete(`/classes/${cls.id}?force=true`);
            toast.success('반이 삭제되었습니다.');
            refetchClasses();
          } catch (e: any) {
            toast.error(e.response?.data?.message || '반 삭제에 실패했습니다.');
          }
        }
        return;
      }
      toast.error(error.response?.data?.message || '반 삭제에 실패했습니다.');
    }
  };

  const renderClasses = () => {
    const q = classSearch.trim().toLowerCase();
    const rows = (Array.isArray(classes) ? classes : []).filter(
      (c: any) =>
        !q ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.grade || '').toLowerCase().includes(q)
    );
    return (
    <>
      {/* 툴바 (DESIGN.md 11.2) */}
      <div className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-center md:gap-4">
        <span className="text-sm text-ink-secondary">
          <strong className="font-semibold text-ink tabular-nums">{rows.length}</strong>개 반
        </span>
        <div className="flex items-center gap-2 md:ml-auto">
          <div className="relative flex-1 md:w-56 md:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.5} />
            <Input
              value={classSearch}
              onChange={(e) => setClassSearch(e.target.value)}
              placeholder="반 이름 · 학년 검색"
              aria-label="반 검색"
              className="h-9 pl-9"
            />
          </div>
          <Button
            onClick={() => {
              setEditingClass(null);
              setSelectedClassStudents([]);
              setGradeFilter('');
              setShowClassModal(true);
            }}
            className="h-9 flex-shrink-0 bg-action hover:bg-action-hover"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            반 만들기
          </Button>
        </div>
      </div>

      {rows.length > 0 ? (
        <>
          <table className="mt-3 hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">반 이름</th>
                <th className="w-24 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">학년</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">설명</th>
                <th className="w-20 px-3 py-2 text-right text-xs font-semibold text-ink-secondary">학생</th>
                <th className="w-24 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">상태</th>
                <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cls: any) => (
                <tr key={cls.id} className="border-b border-line-subtle transition-colors duration-150 ease-out hover:bg-surface-subtle">
                  <td className="px-3 py-1.5 font-semibold text-ink">{cls.name}</td>
                  <td className="px-3 py-1.5 text-ink-secondary">{cls.grade || '-'}</td>
                  <td className="max-w-0 truncate px-3 py-1.5 text-ink-secondary">{cls.description || '-'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink">{cls.studentCount ?? 0}</td>
                  <td className="px-3 py-1.5">
                    {/* 운영 중은 정상 상태이므로 무채색 (DESIGN.md 2.4) */}
                    <span className={`text-xs ${cls.isActive === false ? 'text-fn-warning' : 'text-ink-secondary'}`}>
                      {cls.isActive === false ? '비활성' : '운영 중'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openClassEditor(cls)}
                        className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                      >
                        상세
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteClass(cls)}
                        className="h-7 rounded-sm border border-fn-error-border px-2.5 text-xs text-fn-error transition-colors duration-150 ease-out hover:bg-fn-error-surface"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 모바일: 카드 리스트 (11.3) */}
          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {rows.map((cls: any) => (
              <div key={cls.id} className="rounded-sm border border-line bg-surface p-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-base font-semibold text-ink">{cls.name}</p>
                  <span className="text-xs text-ink-tertiary">{cls.grade || '-'}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-secondary">{cls.description || '설명 없음'}</p>
                <p className="mt-0.5 text-xs text-ink-tertiary">학생 {cls.studentCount ?? 0}명</p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openClassEditor(cls)}
                    className="h-11 flex-1 rounded-sm border border-line text-sm text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle"
                  >
                    상세
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteClass(cls)}
                    className="h-11 flex-1 rounded-sm border border-fn-error-border text-sm text-fn-error transition-colors duration-150 ease-out hover:bg-fn-error-surface"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 border border-line bg-surface-subtle py-12 text-center">
          <p className="text-sm text-ink-secondary">
            {(classes || []).length === 0 ? '등록된 반이 없습니다.' : '조건에 맞는 반이 없습니다.'}
          </p>
          {(classes || []).length === 0 && (
            <Button
              onClick={() => {
                setEditingClass(null);
                setSelectedClassStudents([]);
                setGradeFilter('');
                setShowClassModal(true);
              }}
              className="mt-3 h-9 bg-action hover:bg-action-hover"
            >
              <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
              첫 반 만들기
            </Button>
          )}
        </div>
      )}

      {/* 반 추가/수정 모달 */}
      {showClassModal && (
        <div
          ref={classModalRef}
          role="dialog"
          aria-modal="true"
          aria-label={editingClass ? '반 수정' : '반 등록'}
          className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 p-4"
        >
          <Card className="w-full max-w-2xl mx-4 max-h-[90dvh] overflow-y-auto rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle>{editingClass ? '반 수정' : '반 추가'}
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
                  {editingClass && classRosterLoading && (
                    <p className="mt-1 text-xs text-ink-secondary">배정 학생을 불러오는 중입니다.</p>
                  )}
                  {editingClass && classRosterUnavailable && (
                    <p className="mt-1 text-xs text-fn-error">
                      배정 학생을 불러오지 못했습니다. 이대로 저장하면 기존 배정이 해제되므로 저장할 수 없습니다. 모달을 닫고 다시 열어주세요.
                    </p>
                  )}
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
                    onClick={closeClassModal}
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
  };

  const renderExams = () => {
    const rows = Array.isArray(distributions) ? distributions : [];
    return (
    <>
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <span className="text-sm text-ink-secondary">
          본사에서 내려온 배포 <strong className="font-semibold text-ink tabular-nums">{rows.length}</strong>건
        </span>
        <span className="ml-auto text-xs text-ink-tertiary">반이나 특정 학생에게 다시 배포할 수 있습니다.</span>
      </div>

      {rows.length > 0 ? (
        <>
          <table className="mt-3 hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line-strong">
                <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">시험명</th>
                <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">시작일</th>
                <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">종료일</th>
                <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">총괄 배포일</th>
                <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">지점 배포일</th>
                <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((dist: any) => (
                <tr key={dist.id} className="border-b border-line-subtle transition-colors duration-150 ease-out hover:bg-surface-subtle">
                  <td className="px-3 py-1.5">
                    <span className="block leading-tight font-medium text-ink">{dist.exam?.title || '-'}</span>
                    <span className="block text-xs leading-tight text-ink-tertiary">
                      {dist.exam?.subject || '과목 미지정'} · {dist.exam?.totalQuestions || 0}문항
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-secondary">{new Date(dist.startDate).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-secondary">{new Date(dist.endDate).toLocaleDateString('ko-KR')}</td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                    {dist.parentDistribution
                      ? new Date(dist.parentDistribution.createdAt).toLocaleDateString('ko-KR')
                      : new Date(dist.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                    {dist.parentDistribution ? new Date(dist.createdAt).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDistribution(dist);
                        setShowRedistributeModal(true);
                        setRedistributeType('class');
                        setSelectedClassId('');
                        setSelectedStudentIds([]);
                      }}
                      className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                    >
                      지점내 배포
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {rows.map((dist: any) => (
              <div key={dist.id} className="rounded-sm border border-line bg-surface p-3">
                <p className="text-base font-semibold text-ink">{dist.exam?.title || '-'}</p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  {new Date(dist.startDate).toLocaleDateString('ko-KR')} ~ {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDistribution(dist);
                    setShowRedistributeModal(true);
                    setRedistributeType('class');
                    setSelectedClassId('');
                    setSelectedStudentIds([]);
                  }}
                  className="mt-2.5 h-11 w-full rounded-sm border border-line text-sm text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle"
                >
                  지점내 배포
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 border border-line bg-surface-subtle py-12 text-center">
          <p className="text-sm text-ink-secondary">본사에서 내려온 배포가 없습니다.</p>
        </div>
      )}

      {/* 지점내 배포 모달 */}
      {showRedistributeModal && selectedDistribution && (
        <div
          ref={redistributeModalRef}
          role="dialog"
          aria-modal="true"
          aria-label="지점내 배포"
          className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50"
        >
          <Card className="w-full max-w-2xl mx-4 max-h-[90dvh] overflow-y-auto rounded-lg border-0 bg-surface-raised shadow-lg">
            <CardHeader className="border-b border-line bg-surface-subtle">
              <CardTitle>지점내 배포: {selectedDistribution.exam?.title}
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
                    onClick={closeRedistributeModal}
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
  };

  /** 날짜로 배포 상태를 판정한다. 서버에 상태 필드가 없으므로 화면에서 계산한다. */
  const distStatusOf = (dist: any): { key: 'upcoming' | 'ongoing' | 'ended'; label: string; cls: string } => {
    const now = Date.now();
    const s0 = new Date(dist.startDate).getTime();
    const e0 = new Date(dist.endDate).getTime();
    if (now < s0) return { key: 'upcoming', label: '예정', cls: 'text-ink-tertiary' };
    if (now > e0) return { key: 'ended', label: '종료', cls: 'text-ink-secondary' };
    return { key: 'ongoing', label: '진행 중', cls: 'text-fn-warning' };
  };

  /** 응시 현황. 이미 받아 둔 배포별 학생 목록에서 센다. */
  const distProgressOf = (distributionId: string): { done: number; total: number } | null => {
    const found = (Array.isArray(allDistributionStudents) ? allDistributionStudents : []).find(
      (d: any) => d?.distribution?.id === distributionId
    );
    if (!found) return null;
    const rows = found.students || [];
    return { done: rows.filter((r: any) => r.isSubmitted).length, total: rows.length };
  };

  const classNameOf = (classId?: string | null) =>
    classId ? (classes || []).find((c: any) => c.id === classId)?.name || '지정 반' : '지점 전체';

  const renderDistributions = () => {
    const q = distSearch.trim().toLowerCase();
    const rows = (Array.isArray(distributions) ? distributions : []).filter((d: any) => {
      if (distStatus !== 'all' && distStatusOf(d).key !== distStatus) return false;
      if (!q) return true;
      return [d.exam?.title, d.exam?.subject, classNameOf(d.classId)]
        .some((v: any) => String(v || '').toLowerCase().includes(q));
    });

    const filters: { id: typeof distStatus; label: string }[] = [
      { id: 'all', label: '전체' },
      { id: 'ongoing', label: '진행 중' },
      { id: 'upcoming', label: '예정' },
      { id: 'ended', label: '종료' },
    ];

    return (
      <>
        <div className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-3 overflow-x-auto md:overflow-visible">
            <div className="flex flex-shrink-0 rounded-sm border border-line">
              {filters.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDistStatus(f.id)}
                  aria-pressed={distStatus === f.id}
                  className={`h-8 whitespace-nowrap px-3 text-sm transition-colors duration-150 ease-out ${
                    i > 0 ? 'border-l border-line' : ''
                  } ${
                    distStatus === f.id
                      ? 'bg-surface-subtle font-semibold text-ink'
                      : 'text-ink-secondary hover:bg-surface-subtle'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="flex-shrink-0 text-sm text-ink-secondary">
              <strong className="font-semibold text-ink tabular-nums">{rows.length}</strong>건
            </span>
          </div>
          <div className="relative md:ml-auto md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.5} />
            <Input
              value={distSearch}
              onChange={(e) => setDistSearch(e.target.value)}
              placeholder="시험명 · 과목 · 대상 검색"
              aria-label="배포 검색"
              className="h-9 pl-9"
            />
          </div>
        </div>

        {rows.length > 0 ? (
          <>
            <table className="mt-3 hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-secondary">시험명</th>
                  <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">대상</th>
                  <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">시작일</th>
                  <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">종료일</th>
                  <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">응시 현황</th>
                  <th className="w-20 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">상태</th>
                  <th className="w-32 px-3 py-2 text-left text-xs font-semibold text-ink-secondary">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((dist: any) => {
                  const st = distStatusOf(dist);
                  const pg = distProgressOf(dist.id);
                  const pct = pg && pg.total > 0 ? Math.round((pg.done / pg.total) * 100) : 0;
                  return (
                    <tr key={dist.id} className="border-b border-line-subtle transition-colors duration-150 ease-out hover:bg-surface-subtle">
                      <td className="px-3 py-1.5">
                        <span className="block leading-tight font-medium text-ink">{dist.exam?.title || '-'}</span>
                        <span className="block text-xs leading-tight text-ink-tertiary">
                          {dist.exam?.subject || '과목 미지정'} · {dist.exam?.totalQuestions || 0}문항 · {dist.exam?.totalScore || 0}점
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-ink-secondary">{classNameOf(dist.classId)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                        {new Date(dist.startDate).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                        {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                      </td>
                      {/* 진행률: 교사가 가장 먼저 보는 수치 (DESIGN.md 11.7) */}
                      <td className="px-3 py-1.5">
                        {pg ? (
                          <div className="flex items-center gap-2">
                            <span className="w-14 flex-shrink-0 text-sm font-semibold tabular-nums text-ink">
                              {pg.done}<span className="text-xs font-normal text-ink-tertiary">/{pg.total}</span>
                            </span>
                            <span className="h-1.5 min-w-0 flex-1 bg-surface-subtle" aria-hidden="true">
                              <span className="block h-full bg-action" style={{ width: `${pct}%` }} />
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-tertiary">집계 중</span>
                        )}
                      </td>
                      <td className={`px-3 py-1.5 text-xs ${st.cls}`}>{st.label}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            // 이 배포의 응시 현황으로 이동 (기존 시험명 클릭 동작을 액션으로 옮겼다)
                            setSelectedDistributionId(dist.id);
                            setTopTab('grades');
                            setSelectedStudentId(null);
                            setSelectedDashboardView('exam-attempts');
                          }}
                          className="h-7 rounded-sm border border-line px-2.5 text-xs text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
                        >
                          현황
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm('이 배포를 삭제하시겠습니까?')) {
                              try {
                                await api.delete(`/distributions/${dist.id}`);
                                refetchDistributions();
                              } catch (error) {
                                console.error('삭제 실패:', error);
                                toast.error('삭제에 실패했습니다.');
                              }
                            }
                          }}
                          className="h-7 rounded-sm border border-fn-error-border px-2.5 text-xs text-fn-error transition-colors duration-150 ease-out hover:bg-surface-subtle"
                        >
                          삭제
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex flex-col gap-2 md:hidden">
              {rows.map((dist: any) => {
                const st = distStatusOf(dist);
                const pg = distProgressOf(dist.id);
                return (
                  <div key={dist.id} className="rounded-sm border border-line bg-surface p-3">
                    <p className="text-base font-semibold text-ink">{dist.exam?.title || '-'}</p>
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      {classNameOf(dist.classId)} · {new Date(dist.startDate).toLocaleDateString('ko-KR')} ~{' '}
                      {new Date(dist.endDate).toLocaleDateString('ko-KR')}
                    </p>
                    <p className="mt-1 text-xs">
                      <span className={st.cls}>{st.label}</span>
                      {pg && (
                        <span className="ml-2 tabular-nums text-ink-secondary">
                          응시 {pg.done}/{pg.total}
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-3 border border-line bg-surface-subtle py-12 text-center">
            <p className="text-sm text-ink-secondary">
              {(distributions || []).length === 0 ? '배포된 시험이 없습니다.' : '조건에 맞는 배포가 없습니다.'}
            </p>
          </div>
        )}
      </>
    );
  };

  const renderReports = () => {
    if (!selectedReportDistribution) {
      // Show list of distributions
      return (
        <section className="mb-6">
          <h2 className="mb-2 border-l-[3px] border-action pl-2 text-sm font-bold tracking-wide text-ink">보고서 및 성적 관리</h2>
          <div>
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
                          className="border-fn-error-border text-fn-error hover:bg-surface-subtle"
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
          </div>
        </section>
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
                <table className="w-full min-w-[640px] text-sm [&_td]:whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-line-strong">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">학생</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">연락처</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">응시 상태</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">점수</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">등급</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-ink-secondary whitespace-nowrap">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionStudents.students.map((student: any) => (
                      <tr key={student.studentId} className="border-b border-line-subtle hover:bg-surface-subtle transition-colors duration-150 ease-out">
                        <td className="px-3 py-1.5 font-medium text-ink">{student.studentName}</td>
                        <td className="px-3 py-1.5 text-ink">{student.studentPhone || '-'}</td>
                        <td className="px-3 py-1.5">
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
                        <td className="px-3 py-1.5 text-center text-ink">
                          {student.isSubmitted ? `${student.score || 0} / ${student.maxScore || 0}` : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {student.grade ? (
                            <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeOperate(student.grade)}`}>
                              {student.grade}등급
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-3 py-1.5">
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
                                        toast.success('답안이 삭제되었습니다.');
                                      })
                                      .catch((error) => {
                                        toast.error(error.response?.data?.message || '답안 삭제에 실패했습니다.');
                                      });
                                  }
                                }}
                                className="border-fn-error-border text-fn-error hover:bg-surface-subtle"
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

  const subSections = TOP_TABS.find((t) => t.id === topTab)?.sections ?? [];

  const switchTopTab = (id: TopTab) => {
    setTopTab(id);
    const first = TOP_TABS.find((t) => t.id === id)?.sections[0];
    if (first) setActiveSection(first);
    setPanelOpen(false);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-sunken">
      {/* ── 상단 GNB (DESIGN.md 11.6). 주요 메뉴가 여기 있고, 사이드바는 학생 패널이 된다 ── */}
      <header className="sticky top-0 z-30 border-b border-line-inverse bg-surface-inverse">
        <div className="flex items-center gap-2 px-3 md:px-6">
          <div className="flex flex-shrink-0 items-center gap-2.5 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-line-inverse">
              <GraduationCap className="h-4 w-4 text-ink-inverse" strokeWidth={1.5} />
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-ink-inverse">지점 관리</p>
              <p className="truncate text-xs text-ink-inverse-muted">{user.name}</p>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto" aria-label="주요 메뉴">
            {TOP_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTopTab(t.id)}
                aria-current={topTab === t.id ? 'page' : undefined}
                className={`h-11 whitespace-nowrap rounded-sm px-3 text-sm transition-colors duration-150 ease-out md:px-4 ${
                  topTab === t.id
                    ? 'bg-surface font-semibold text-ink'
                    : 'text-ink-inverse-muted hover:bg-line-inverse hover:text-ink-inverse'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              aria-label="로그아웃"
              className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-inverse-muted transition-colors duration-150 ease-out hover:bg-line-inverse hover:text-ink-inverse"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── 좌측 학생 패널: 성적 관리 탭에서만. 흰 배경 + 네이비 GNB 조합 (11.6) ── */}
        {topTab === 'grades' && (
          <>
            {panelOpen && (
              <div
                className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden"
                onClick={() => setPanelOpen(false)}
                aria-hidden="true"
              />
            )}
            <aside
              ref={drawerRef}
              className={`fixed inset-y-0 left-0 z-40 w-[264px] border-r border-line bg-surface transition-transform duration-200 ease-out ${
                panelOpen ? 'translate-x-0' : '-translate-x-full'
              } md:sticky md:top-[57px] md:z-auto md:h-[calc(100dvh-57px)] md:translate-x-0 md:flex-shrink-0`}
            >
              {renderStudentPanel()}
            </aside>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 하위 섹션 세그먼트 (관리 / 시험 배포 탭) */}
          {subSections.length > 1 && (
            <div className="sticky top-[57px] z-20 flex gap-1 overflow-x-auto border-b border-line bg-surface px-4 md:px-8">
              {subSections.map((id) => {
                const item = menuItems.find((m) => m.id === id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    aria-current={activeSection === id ? 'page' : undefined}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors duration-150 ease-out ${
                      activeSection === id
                        ? 'border-action font-semibold text-ink'
                        : 'border-transparent text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 모바일: 학생 패널 열기 */}
          {topTab === 'grades' && (
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="flex h-11 items-center gap-2 rounded-sm border border-line px-3 text-sm text-ink-secondary"
              >
                <Menu className="h-4 w-4" strokeWidth={1.5} />
                학생 목록
              </button>
              <span className="min-w-0 truncate text-sm font-semibold text-ink">
                {selectedStudent ? selectedStudent.user?.name : '지점 요약'}
              </span>
            </div>
          )}

          <main className="min-w-0 flex-1 p-4 md:p-8">
            {topTab === 'grades' && renderStudentContext()}
            {topTab !== 'grades' && (
              <>
                {activeSection === 'students' && renderStudents()}
                {activeSection === 'classes' && renderClasses()}
                {activeSection === 'exams' && renderExams()}
                {activeSection === 'distributions' && renderDistributions()}
                {activeSection === 'reports' && renderReports()}
              </>
            )}
          </main>
        </div>
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
          <div
            ref={answerModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="답안 채점"
            className="fixed inset-0 bg-[var(--overlay)] flex items-center justify-center z-50 p-4"
          >
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
                    onClick={() => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        const totalQuestions = resolveTotalQuestions();
                        if (!totalQuestions) {
                          toast.error('시험의 문항 수를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
                          return;
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
                    onClick={() => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        const totalQuestions = resolveTotalQuestions();
                        if (!totalQuestions) {
                          toast.error('시험의 문항 수를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
                          return;
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
                    onClick={() => {
                      const form = document.getElementById('answer-form') as HTMLFormElement;
                      if (form) {
                        const totalQuestions = resolveTotalQuestions();
                        if (!totalQuestions) {
                          toast.error('시험의 문항 수를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
                          return;
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
                      const totalQuestions = resolveTotalQuestions();
                      if (!totalQuestions) {
                        return (
                          <div className="p-6 text-center text-sm text-ink-secondary">
                            시험의 문항 수를 확인할 수 없어 채점표를 표시할 수 없습니다.
                            <br />
                            페이지를 새로고침한 뒤 다시 시도해주세요.
                          </div>
                        );
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
                      onClick={closeAnswerModal}
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
