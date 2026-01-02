import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  Users,
  FileText,
  BarChart3,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  UserCircle,
  Home,
  TrendingUp,
  Award,
  Target,
  ExternalLink,
  Loader2,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  ChevronRight,
  GraduationCap,
  Trophy,
  Zap,
  Star,
  Eye,
  PlayCircle,
  ClipboardCheck,
  Settings,
  Lock,
  User,
  School,
  Phone,
  Mail,
  CalendarDays,
  TrendingDown,
  Minus,
  RefreshCw,
  FileCheck,
  PieChart,
} from 'lucide-react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface StudentInfo {
  id: string;
  userId: string;
  branchId: string;
  school: string;
  grade: string;
  parentPhone: string;
  enrollmentDate: string;
  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    phone: string;
  };
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string;
  };
}

interface ExamItem {
  distribution: {
    id: string;
    examId: string;
    branchId: string;
    classId: string | null;
    startDate: string;
    endDate: string;
  };
  exam: {
    id: string;
    title: string;
    subject: string;
    totalQuestions: number;
    totalScore: number;
  };
  attempt: {
    id: string;
    score: number;
    grade: number;
    correctCount: number;
    submittedAt: string;
  } | null;
  status: 'available' | 'in_progress' | 'completed' | 'upcoming' | 'expired';
  hasReport: boolean;
}

type MenuSection = 'dashboard' | 'exams' | 'results' | 'profile';
type ExamTab = 'available' | 'in_progress' | 'completed' | 'upcoming';

// ===============================
// Wrong Questions Analysis Modal
// ===============================
function WrongQuestionsModal({ attemptId, examTitle }: { attemptId: string; examTitle: string }) {
  const [loading, setLoading] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const fetchWrongQuestions = async () => {
    setLoading(true);
    try {
      const attemptRes = await api.get(`/exam-attempts/${attemptId}`);
      const attempt = attemptRes.data.data;

      const examRes = await api.get(`/exams/${attempt.examId}`);
      const exam = examRes.data.data;

      const answers = attempt.answers || {};
      const questionsData = exam.questionsData || [];

      // studentAnswer가 1이 아닌 것 = 틀린 것
      const wrong = questionsData
        .filter((q: any) => {
          const qNum = q.number || q.questionNumber;
          const studentAns = answers[qNum];
          return studentAns !== 1;
        })
        .map((q: any) => ({
          ...q,
          questionNumber: q.number || q.questionNumber,
          studentAnswer: answers[q.number || q.questionNumber] || 0,
        }));

      setWrongQuestions(wrong);
    } catch (error) {
      console.error('Error fetching wrong questions:', error);
      alert('틀린 문항 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    fetchWrongQuestions();
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case '상': return 'bg-red-100 text-red-700 border-red-200';
      case '중': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case '하': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          onClick={handleOpen}
          variant="outline"
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-all"
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          틀린 문항 분석
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-white" />
            </div>
            틀린 문항 분석
          </DialogTitle>
          <p className="text-gray-500 mt-1">{examTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600 mb-4" />
            <p className="text-gray-600 font-medium">분석 중입니다...</p>
          </div>
        ) : wrongQuestions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">완벽합니다!</h3>
            <p className="text-gray-600">틀린 문항이 없습니다. 훌륭해요!</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Summary Banner */}
            <div className="bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{wrongQuestions.length}개 문항</p>
                  <p className="text-red-100">오답을 분석하고 복습하세요!</p>
                </div>
              </div>
            </div>

            {/* Wrong Questions List */}
            {wrongQuestions.map((question, idx) => (
              <div
                key={idx}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-xl flex items-center justify-center font-bold text-xl shadow-md flex-shrink-0">
                    {question.questionNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getDifficultyColor(question.difficulty)}`}>
                        난이도: {question.difficulty || '중'}
                      </span>
                      {question.category && (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full border border-purple-200">
                          {question.category}
                        </span>
                      )}
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full border border-blue-200">
                        {question.points || 1}점
                      </span>
                    </div>

                    {/* Categories */}
                    {(question.category || question.subcategory) && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                        {question.category && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold text-gray-700 min-w-[50px]">대분류:</span>
                            <span className="text-gray-600">{question.category}</span>
                          </div>
                        )}
                        {question.subcategory && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            <span className="font-semibold text-gray-700 min-w-[50px]">소분류:</span>
                            <span className="text-gray-600">{question.subcategory}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Commentary */}
                    {question.commentary ? (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 mb-4 border border-purple-100">
                        <div className="flex items-center gap-2 mb-3">
                          <BookOpen className="w-5 h-5 text-purple-600" />
                          <h4 className="font-bold text-gray-800">문항 해설</h4>
                        </div>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {question.commentary}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                        <p className="text-gray-500 italic text-center">해설이 제공되지 않았습니다.</p>
                      </div>
                    )}

                    {/* Answer Comparison */}
                    <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-700">정답:</span>
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                            O
                          </span>
                          <span className="text-xs text-green-600 font-semibold">정답</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-700">내 답안:</span>
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                            {question.studentAnswer === 0 ? '?' : question.studentAnswer}
                          </span>
                          <span className="text-xs text-red-600 font-semibold">오답</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===============================
// AI Report Button Component
// ===============================
function AIReportButton({ attemptId }: { attemptId: string }) {
  const [loading, setLoading] = useState(false);
  const [reportStatus, setReportStatus] = useState<'checking' | 'completed' | 'none'>('checking');

  useEffect(() => {
    const checkReportStatus = async () => {
      try {
        const response = await api.get(`/reports/attempt/${attemptId}`);
        const reportData = response.data.data;
        if (reportData && reportData.htmlContent) {
          setReportStatus('completed');
        } else {
          setReportStatus('none');
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          setReportStatus('none');
        }
      }
    };
    checkReportStatus();
  }, [attemptId]);

  const handleViewReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/attempt/${attemptId}`);
      const reportData = response.data.data;

      if (reportData && reportData.htmlContent) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(reportData.htmlContent);
          newWindow.document.close();
        }
      } else {
        alert('AI 보고서가 아직 생성되지 않았습니다.');
      }
    } catch (error: any) {
      console.error('Error fetching report:', error);
      if (error.response?.status === 404) {
        alert('AI 보고서가 아직 생성되지 않았습니다. 잠시 후 다시 시도해주세요.');
      } else {
        alert(error.response?.data?.message || 'AI 보고서를 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (reportStatus === 'checking') {
    return (
      <Button disabled variant="outline" className="opacity-50">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        확인 중...
      </Button>
    );
  }

  if (reportStatus === 'completed') {
    return (
      <Button
        onClick={handleViewReport}
        disabled={loading}
        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            로딩 중...
          </>
        ) : (
          <>
            <ExternalLink className="w-4 h-4 mr-2" />
            AI 분석 보고서
          </>
        )}
      </Button>
    );
  }

  return (
    <Button disabled variant="outline" className="opacity-50">
      <Clock className="w-4 h-4 mr-2" />
      보고서 대기 중
    </Button>
  );
}

// ===============================
// Exam Taking Modal Component
// ===============================
function ExamTakingModal({
  exam,
  distribution,
  attemptId,
  onClose,
  onSubmit,
}: {
  exam: any;
  distribution: any;
  attemptId: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const questionsData = exam?.questionsData || [];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questionsData.length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const handleAnswerChange = (questionNumber: number, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionNumber]: choiceIndex }));
  };

  const handleSubmit = async () => {
    if (answeredCount < totalQuestions) {
      if (!confirm(`아직 ${totalQuestions - answeredCount}개 문항이 미응답 상태입니다. 제출하시겠습니까?`)) {
        return;
      }
    } else {
      if (!confirm('시험을 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.')) {
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.post(`/exam-attempts/${attemptId}/submit`, { answers });
      alert('시험이 제출되었습니다!');
      onSubmit();
    } catch (error: any) {
      alert(error.response?.data?.message || '시험 제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 rounded-t-2xl text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{exam?.title}</h2>
              <p className="text-purple-200 mt-1">{exam?.subject}</p>
            </div>
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span>진행률</span>
              <span>{answeredCount}/{totalQuestions} 문항 완료</span>
            </div>
            <div className="w-full bg-white/30 rounded-full h-3">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {questionsData.length > 0 ? (
            questionsData.map((question: any, idx: number) => {
              const qNum = question.questionNumber || question.number || idx + 1;
              return (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl shadow-md border-2 transition-all ${
                    answers[qNum] !== undefined ? 'border-purple-300 bg-purple-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="p-6">
                    {/* Question Header */}
                    <div className="flex items-start gap-4 mb-6">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md flex-shrink-0 ${
                        answers[qNum] !== undefined
                          ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {qNum}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {question.difficulty && (
                            <Badge variant="outline" className="text-xs">
                              난이도: {question.difficulty}
                            </Badge>
                          )}
                          {question.points && (
                            <Badge variant="outline" className="text-xs">
                              {question.points}점
                            </Badge>
                          )}
                          {question.category && (
                            <Badge variant="outline" className="text-xs bg-purple-50">
                              {question.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Answer Options */}
                    <div className="flex flex-wrap gap-4 items-center justify-center">
                      {[1, 2, 3, 4, 5].map((choice) => (
                        <button
                          key={choice}
                          onClick={() => handleAnswerChange(qNum, choice)}
                          className={`w-16 h-16 rounded-full border-3 font-bold text-xl transition-all duration-200 transform hover:scale-110 ${
                            answers[qNum] === choice
                              ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white border-purple-500 shadow-lg scale-110'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                          }`}
                        >
                          {choice}
                        </button>
                      ))}
                      <button
                        onClick={() => handleAnswerChange(qNum, 0)}
                        className={`px-4 h-16 rounded-full border-3 font-semibold transition-all duration-200 ${
                          answers[qNum] === 0
                            ? 'bg-gray-700 text-white border-gray-700 shadow-lg'
                            : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        모름
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-purple-500" />
              <p>문제 정보를 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 p-6 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-purple-600">{answeredCount}</span>/{totalQuestions} 문항 답변 완료
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                나중에 계속하기
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    제출 중...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4 mr-2" />
                    시험 제출
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===============================
// Main StudentDashboard Component
// ===============================
export default function StudentDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<MenuSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeExamTab, setActiveExamTab] = useState<ExamTab>('available');
  const [examModal, setExamModal] = useState<{
    exam: any;
    distribution: any;
    attemptId: string;
  } | null>(null);

  // Fetch student info
  const { data: studentData } = useQuery({
    queryKey: ['student', 'me'],
    queryFn: async () => {
      const res = await api.get('/students/me');
      return res.data.data as StudentInfo;
    },
  });

  // Fetch distributed exams
  const { data: examsData, refetch: refetchExams } = useQuery({
    queryKey: ['student', 'exams'],
    queryFn: async () => {
      const res = await api.get('/my-exams');
      return res.data.data as ExamItem[];
    },
  });

  const exams = examsData || [];

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  // Start exam mutation
  const startExamMutation = useMutation({
    mutationFn: async (distributionId: string) => {
      const attemptRes = await api.post('/exam-attempts', { distributionId });
      const examRes = await api.get(`/my-exams/${distributionId}`);
      return {
        attempt: attemptRes.data.data,
        examData: examRes.data.data,
      };
    },
    onSuccess: (data) => {
      setExamModal({
        exam: data.examData.exam,
        distribution: data.examData.distribution,
        attemptId: data.attempt.id,
      });
      queryClient.invalidateQueries({ queryKey: ['student', 'exams'] });
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '시험 시작에 실패했습니다.');
    },
  });

  // Continue exam
  const continueExam = async (item: ExamItem) => {
    try {
      const examRes = await api.get(`/my-exams/${item.distribution.id}`);
      setExamModal({
        exam: examRes.data.data.exam,
        distribution: item.distribution,
        attemptId: item.attempt!.id,
      });
    } catch (error: any) {
      alert(error.response?.data?.message || '시험 정보를 불러오는데 실패했습니다.');
    }
  };

  // Calculate statistics
  const completedExams = useMemo(() =>
    exams.filter((e) => e.status === 'completed' && e.attempt?.score !== undefined),
    [exams]
  );

  const scores = useMemo(() => completedExams.map((e) => e.attempt!.score), [completedExams]);
  const averageScore = useMemo(() =>
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    [scores]
  );
  const highestScore = useMemo(() => scores.length > 0 ? Math.max(...scores) : 0, [scores]);
  const lowestScore = useMemo(() => scores.length > 0 ? Math.min(...scores) : 0, [scores]);

  // Grade distribution
  const gradeDistribution = useMemo(() => {
    const dist: Record<number, number> = {};
    completedExams.forEach((e) => {
      const grade = e.attempt?.grade || 5;
      dist[grade] = (dist[grade] || 0) + 1;
    });
    return dist;
  }, [completedExams]);

  // Chart data - Score trend
  const chartData = useMemo(() => ({
    labels: completedExams.map((e) =>
      e.exam.title.length > 12 ? e.exam.title.substring(0, 12) + '...' : e.exam.title
    ),
    datasets: [
      {
        label: '점수',
        data: scores,
        fill: true,
        borderColor: 'rgb(147, 51, 234)',
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        tension: 0.4,
        pointBackgroundColor: 'rgb(147, 51, 234)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  }), [completedExams, scores]);

  // Chart data - Grade distribution doughnut
  const gradeChartData = useMemo(() => ({
    labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
    datasets: [
      {
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => gradeDistribution[g] || 0),
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',   // 1등급 - 에메랄드
          'rgba(34, 197, 94, 0.8)',    // 2등급 - 그린
          'rgba(132, 204, 22, 0.8)',   // 3등급 - 라임
          'rgba(234, 179, 8, 0.8)',    // 4등급 - 옐로우
          'rgba(249, 115, 22, 0.8)',   // 5등급 - 오렌지
          'rgba(239, 68, 68, 0.8)',    // 6등급 - 레드
          'rgba(236, 72, 153, 0.8)',   // 7등급 - 핑크
          'rgba(168, 85, 247, 0.8)',   // 8등급 - 퍼플
          'rgba(99, 102, 241, 0.8)',   // 9등급 - 인디고
        ],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  }), [gradeDistribution]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgb(147, 51, 234)',
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { callback: (value: any) => value + '점' },
      },
      x: { grid: { display: false } },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { padding: 20 } },
    },
    cutout: '60%',
  };

  // Get exams by status
  const availableExams = exams.filter((e) => e.status === 'available');
  const inProgressExams = exams.filter((e) => e.status === 'in_progress');
  const upcomingExams = exams.filter((e) => e.status === 'upcoming');

  const menuItems = [
    { id: 'dashboard' as MenuSection, label: '대시보드', icon: LayoutDashboard },
    { id: 'exams' as MenuSection, label: '시험 응시', icon: FileText },
    { id: 'results' as MenuSection, label: '성적 조회', icon: BarChart3 },
    { id: 'profile' as MenuSection, label: '내 정보', icon: UserCircle },
  ];

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Exam Taking Modal */}
      {examModal && (
        <ExamTakingModal
          exam={examModal.exam}
          distribution={examModal.distribution}
          attemptId={examModal.attemptId}
          onClose={() => setExamModal(null)}
          onSubmit={() => {
            setExamModal(null);
            refetchExams();
            setActiveSection('results');
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white transition-all duration-300 overflow-hidden shadow-2xl flex flex-col`}
      >
        <div className="p-6 flex-1">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">ALLGA</h1>
              <p className="text-xs text-purple-200">학습 관리 시스템</p>
            </div>
          </div>

          {/* User Card */}
          <div className="mb-8 p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                <User className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg truncate">{user.name}</p>
                <p className="text-sm text-purple-200 truncate">
                  {studentData?.branch?.name || '학생'}
                </p>
              </div>
            </div>
            {studentData && (
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-purple-200">
                  <School className="w-3.5 h-3.5" />
                  <span className="truncate">{studentData.school || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-purple-200">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{studentData.grade || '-'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                    activeSection === item.id
                      ? 'bg-white text-purple-700 font-bold shadow-lg'
                      : 'hover:bg-white/10 text-white/90'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {activeSection === item.id && (
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Stats */}
          {completedExams.length > 0 && (
            <div className="mt-8 p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
              <h3 className="text-sm font-semibold text-purple-200 mb-3">나의 성적 요약</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold">{averageScore}</p>
                  <p className="text-xs text-purple-200">평균 점수</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{completedExams.length}</p>
                  <p className="text-xs text-purple-200">응시 횟수</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <div className="p-6 border-t border-white/10">
          <Button
            onClick={() => logoutMutation.mutate()}
            variant="ghost"
            className="w-full text-white/80 hover:text-white hover:bg-white/10 justify-start"
          >
            <LogOut className="w-4 h-4 mr-3" />
            로그아웃
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-purple-100 z-10">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-600 hover:text-purple-600"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {activeSection === 'dashboard' && '대시보드'}
                  {activeSection === 'exams' && '시험 응시'}
                  {activeSection === 'results' && '성적 조회'}
                  {activeSection === 'profile' && '내 정보'}
                </h2>
                <p className="text-sm text-gray-500">
                  {new Date().toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  })}
                </p>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-4">
              {(availableExams.length > 0 || inProgressExams.length > 0) && (
                <div className="flex items-center gap-2">
                  {inProgressExams.length > 0 && (
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                      <Clock className="w-3 h-3 mr-1" />
                      진행 중 {inProgressExams.length}
                    </Badge>
                  )}
                  {availableExams.length > 0 && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <PlayCircle className="w-3 h-3 mr-1" />
                      응시 가능 {availableExams.length}
                    </Badge>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchExams()}
                className="text-gray-500 hover:text-purple-600"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* ============ DASHBOARD SECTION ============ */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Welcome Banner */}
              <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold mb-2">
                      안녕하세요, {user.name}님!
                    </h1>
                    <p className="text-purple-200 text-lg">
                      오늘도 열심히 공부해봐요!
                    </p>
                  </div>
                  <div className="hidden md:block">
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                      <Star className="w-12 h-12 text-yellow-300" />
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="mt-6 flex flex-wrap gap-3">
                  {availableExams.length > 0 && (
                    <Button
                      onClick={() => {
                        setActiveSection('exams');
                        setActiveExamTab('available');
                      }}
                      className="bg-white text-purple-700 hover:bg-purple-50"
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      시험 응시하기 ({availableExams.length})
                    </Button>
                  )}
                  {inProgressExams.length > 0 && (
                    <Button
                      onClick={() => {
                        setActiveSection('exams');
                        setActiveExamTab('in_progress');
                      }}
                      variant="outline"
                      className="border-white/50 text-white hover:bg-white/10"
                    >
                      <Clock className="w-4 h-4 mr-2" />
                      진행 중인 시험 ({inProgressExams.length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-200 font-medium">평균 점수</p>
                        <p className="text-4xl font-bold mt-2">{averageScore}<span className="text-xl">점</span></p>
                      </div>
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <Target className="w-7 h-7" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-emerald-200 font-medium">최고 점수</p>
                        <p className="text-4xl font-bold mt-2">{highestScore}<span className="text-xl">점</span></p>
                      </div>
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <Trophy className="w-7 h-7" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-200 font-medium">응시 횟수</p>
                        <p className="text-4xl font-bold mt-2">{completedExams.length}<span className="text-xl">회</span></p>
                      </div>
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <FileCheck className="w-7 h-7" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-orange-700 text-white overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-orange-200 font-medium">대기 시험</p>
                        <p className="text-4xl font-bold mt-2">{availableExams.length + inProgressExams.length}<span className="text-xl">개</span></p>
                      </div>
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                        <Clock className="w-7 h-7" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Score Trend Chart */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-indigo-50">
                    <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      성적 추이
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {completedExams.length > 0 ? (
                      <div className="h-72">
                        <Line data={chartData} options={chartOptions} />
                      </div>
                    ) : (
                      <div className="h-72 flex flex-col items-center justify-center text-gray-400">
                        <BarChart3 className="w-16 h-16 mb-4" />
                        <p>아직 응시한 시험이 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Grade Distribution Chart */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-teal-50">
                    <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white">
                        <PieChart className="w-5 h-5" />
                      </div>
                      등급 분포
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {completedExams.length > 0 ? (
                      <div className="h-72">
                        <Doughnut data={gradeChartData} options={doughnutOptions} />
                      </div>
                    ) : (
                      <div className="h-72 flex flex-col items-center justify-center text-gray-400">
                        <PieChart className="w-16 h-16 mb-4" />
                        <p>아직 등급 데이터가 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Results & Upcoming Exams */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Exam Results */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white">
                        <FileText className="w-5 h-5" />
                      </div>
                      최근 시험 결과
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {completedExams.length > 0 ? (
                      <div className="space-y-3">
                        {completedExams.slice(0, 4).map((item, idx) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-purple-50/30 rounded-xl hover:shadow-md transition-all cursor-pointer"
                            onClick={() => setActiveSection('results')}
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-lg flex items-center justify-center font-bold">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-800 truncate">{item.exam.title}</h4>
                              <p className="text-sm text-gray-500">{item.exam.subject}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-purple-600">{item.attempt?.score}점</p>
                              <Badge variant="outline" className="text-xs">
                                {item.attempt?.grade}등급
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-3" />
                        <p>아직 완료된 시험이 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Available & Upcoming Exams */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-red-50">
                    <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-white">
                        <Calendar className="w-5 h-5" />
                      </div>
                      응시 대기 시험
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {availableExams.length > 0 || inProgressExams.length > 0 ? (
                      <div className="space-y-3">
                        {/* In Progress */}
                        {inProgressExams.map((item) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border-l-4 border-orange-400"
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 text-white rounded-lg flex items-center justify-center">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-800 truncate">{item.exam.title}</h4>
                                <Badge className="bg-orange-100 text-orange-700 text-xs">진행 중</Badge>
                              </div>
                              <p className="text-sm text-gray-500">{item.exam.subject}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => continueExam(item)}
                              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                            >
                              계속하기
                            </Button>
                          </div>
                        ))}

                        {/* Available */}
                        {availableExams.slice(0, 3).map((item) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-l-4 border-green-400"
                          >
                            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 text-white rounded-lg flex items-center justify-center">
                              <PlayCircle className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-800 truncate">{item.exam.title}</h4>
                              <p className="text-sm text-gray-500">
                                ~{formatDate(item.distribution.endDate)}까지
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => startExamMutation.mutate(item.distribution.id)}
                              disabled={startExamMutation.isPending}
                              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white"
                            >
                              시작
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-gray-400">
                        <Calendar className="w-12 h-12 mx-auto mb-3" />
                        <p>현재 응시 가능한 시험이 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ============ EXAMS SECTION ============ */}
          {activeSection === 'exams' && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Tabs */}
              <div className="bg-white rounded-2xl shadow-lg p-2 flex gap-2">
                {[
                  { id: 'available' as ExamTab, label: '응시 가능', icon: PlayCircle, count: availableExams.length },
                  { id: 'in_progress' as ExamTab, label: '진행 중', icon: Clock, count: inProgressExams.length },
                  { id: 'completed' as ExamTab, label: '완료', icon: CheckCircle2, count: completedExams.length },
                  { id: 'upcoming' as ExamTab, label: '예정', icon: Calendar, count: upcomingExams.length },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveExamTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                        activeExamTab === tab.id
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          activeExamTab === tab.id ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Available Exams */}
              {activeExamTab === 'available' && (
                <div className="space-y-4">
                  {availableExams.length > 0 ? (
                    availableExams.map((item) => (
                      <Card key={item.distribution.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                              <PlayCircle className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-800">{item.exam.title}</h3>
                                  <p className="text-purple-600 font-medium mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="bg-green-100 text-green-700">응시 가능</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Target className="w-4 h-4" />
                                  {item.exam.totalScore}점 만점
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" />
                                  ~{formatDate(item.distribution.endDate)}
                                </span>
                              </div>
                            </div>
                            <Button
                              onClick={() => startExamMutation.mutate(item.distribution.id)}
                              disabled={startExamMutation.isPending}
                              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-8 py-6 text-lg"
                            >
                              {startExamMutation.isPending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <>
                                  시험 시작
                                  <ChevronRight className="w-5 h-5 ml-2" />
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-16 text-center">
                        <PlayCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">응시 가능한 시험이 없습니다</h3>
                        <p className="text-gray-400">새로운 시험이 배포되면 여기에 표시됩니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* In Progress Exams */}
              {activeExamTab === 'in_progress' && (
                <div className="space-y-4">
                  {inProgressExams.length > 0 ? (
                    inProgressExams.map((item) => (
                      <Card key={item.distribution.id} className="border-0 shadow-lg border-l-4 border-orange-400">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg animate-pulse">
                              <Clock className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-800">{item.exam.title}</h3>
                                  <p className="text-purple-600 font-medium mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="bg-orange-100 text-orange-700 animate-pulse">진행 중</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" />
                                  ~{formatDate(item.distribution.endDate)}
                                </span>
                              </div>
                            </div>
                            <Button
                              onClick={() => continueExam(item)}
                              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-6 text-lg"
                            >
                              계속하기
                              <ChevronRight className="w-5 h-5 ml-2" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-16 text-center">
                        <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">진행 중인 시험이 없습니다</h3>
                        <p className="text-gray-400">시험을 시작하면 여기서 계속할 수 있습니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Completed Exams */}
              {activeExamTab === 'completed' && (
                <div className="space-y-4">
                  {completedExams.length > 0 ? (
                    completedExams.map((item) => (
                      <Card key={item.distribution.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                              <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-800">{item.exam.title}</h3>
                                  <p className="text-purple-600 font-medium mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="bg-emerald-100 text-emerald-700">완료</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1.5">
                                  <Target className="w-4 h-4" />
                                  {item.attempt?.score}/{item.exam.totalScore}점
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Award className="w-4 h-4" />
                                  {item.attempt?.grade}등급
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4" />
                                  {item.attempt?.correctCount}/{item.exam.totalQuestions}문항 정답
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" />
                                  {item.attempt?.submittedAt && formatDate(item.attempt.submittedAt)}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold text-purple-600 mb-2">
                                {item.attempt?.score}점
                              </div>
                              <Badge variant="outline" className="text-lg px-3 py-1">
                                {item.attempt?.grade}등급
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-16 text-center">
                        <CheckCircle2 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">완료된 시험이 없습니다</h3>
                        <p className="text-gray-400">시험을 완료하면 여기서 결과를 확인할 수 있습니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Upcoming Exams */}
              {activeExamTab === 'upcoming' && (
                <div className="space-y-4">
                  {upcomingExams.length > 0 ? (
                    upcomingExams.map((item) => (
                      <Card key={item.distribution.id} className="border-0 shadow-lg opacity-75">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-gray-400 to-slate-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                              <Calendar className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="text-xl font-bold text-gray-800">{item.exam.title}</h3>
                                  <p className="text-purple-600 font-medium mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="bg-gray-100 text-gray-600">예정</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" />
                                  {formatDate(item.distribution.startDate)} 시작
                                </span>
                              </div>
                            </div>
                            <Button disabled variant="outline" className="px-8 py-6 text-lg">
                              대기 중
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-16 text-center">
                        <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">예정된 시험이 없습니다</h3>
                        <p className="text-gray-400">새로운 시험이 예정되면 여기에 표시됩니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============ RESULTS SECTION ============ */}
          {activeSection === 'results' && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Summary Cards */}
              {completedExams.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-700 text-white">
                    <CardContent className="p-5 text-center">
                      <Target className="w-8 h-8 mx-auto mb-2 opacity-80" />
                      <p className="text-3xl font-bold">{averageScore}</p>
                      <p className="text-sm text-purple-200">평균 점수</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
                    <CardContent className="p-5 text-center">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-80" />
                      <p className="text-3xl font-bold">{highestScore}</p>
                      <p className="text-sm text-emerald-200">최고 점수</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
                    <CardContent className="p-5 text-center">
                      <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-80" />
                      <p className="text-3xl font-bold">{lowestScore}</p>
                      <p className="text-sm text-blue-200">최저 점수</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-orange-700 text-white">
                    <CardContent className="p-5 text-center">
                      <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-80" />
                      <p className="text-3xl font-bold">{completedExams.length}</p>
                      <p className="text-sm text-orange-200">총 응시 횟수</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Results List */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-teal-50">
                  <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    상세 성적 조회
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {completedExams.length > 0 ? (
                    <div className="space-y-4">
                      {completedExams.map((item) => {
                        const percentage = Math.round(
                          ((item.attempt?.correctCount || 0) / item.exam.totalQuestions) * 100
                        );
                        return (
                          <div
                            key={item.distribution.id}
                            className="bg-gradient-to-r from-gray-50 to-purple-50/30 rounded-2xl p-6 hover:shadow-lg transition-all"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                              {/* Exam Info */}
                              <div className="flex-1">
                                <h3 className="text-xl font-bold text-gray-800">{item.exam.title}</h3>
                                <p className="text-purple-600 font-medium">{item.exam.subject}</p>
                                <p className="text-sm text-gray-500 mt-2">
                                  제출일: {item.attempt?.submittedAt && new Date(item.attempt.submittedAt).toLocaleString('ko-KR')}
                                </p>
                              </div>

                              {/* Score Cards */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="bg-gradient-to-br from-purple-500 to-purple-700 text-white rounded-xl p-4 text-center">
                                  <p className="text-xs text-purple-200 mb-1">점수</p>
                                  <p className="text-2xl font-bold">{item.attempt?.score}</p>
                                </div>
                                <div className="bg-gradient-to-br from-indigo-500 to-blue-700 text-white rounded-xl p-4 text-center">
                                  <p className="text-xs text-indigo-200 mb-1">등급</p>
                                  <p className="text-2xl font-bold">{item.attempt?.grade}등급</p>
                                </div>
                                <div className="bg-gradient-to-br from-cyan-500 to-teal-700 text-white rounded-xl p-4 text-center">
                                  <p className="text-xs text-cyan-200 mb-1">정답 수</p>
                                  <p className="text-2xl font-bold">{item.attempt?.correctCount}/{item.exam.totalQuestions}</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-500 to-emerald-700 text-white rounded-xl p-4 text-center">
                                  <p className="text-xs text-green-200 mb-1">정답률</p>
                                  <p className="text-2xl font-bold">{percentage}%</p>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex flex-col gap-2 lg:ml-4">
                                {item.attempt?.id && (
                                  <>
                                    <WrongQuestionsModal
                                      attemptId={item.attempt.id}
                                      examTitle={item.exam.title}
                                    />
                                    <AIReportButton attemptId={item.attempt.id} />
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 text-center">
                      <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                      <h3 className="text-xl font-semibold text-gray-600 mb-2">아직 성적이 없습니다</h3>
                      <p className="text-gray-400 mb-6">시험을 완료하면 여기서 상세 성적을 확인할 수 있습니다.</p>
                      <Button
                        onClick={() => setActiveSection('exams')}
                        className="bg-gradient-to-r from-purple-500 to-indigo-600"
                      >
                        시험 응시하러 가기
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============ PROFILE SECTION ============ */}
          {activeSection === 'profile' && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Profile Card */}
              <Card className="border-0 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 p-8 text-white">
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center">
                      <User className="w-12 h-12" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold">{user.name}</h2>
                      <p className="text-purple-200 mt-1">{studentData?.branch?.name || '학생'}</p>
                      <Badge className="mt-2 bg-white/20 text-white border-0">
                        {studentData?.grade || '학년 미설정'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <CardContent className="p-8">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-600" />
                    내 정보
                  </h3>

                  <div className="grid gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <User className="w-4 h-4" />
                          <span className="text-sm">이름</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{user.name}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">연락처 (아이디)</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{studentData?.user?.phone || user.username}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <School className="w-4 h-4" />
                          <span className="text-sm">학교</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{studentData?.school || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <GraduationCap className="w-4 h-4" />
                          <span className="text-sm">학년</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{studentData?.grade || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <Home className="w-4 h-4" />
                          <span className="text-sm">소속 지점</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{studentData?.branch?.name || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">학부모 연락처</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">{studentData?.parentPhone || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-xl md:col-span-2">
                        <div className="flex items-center gap-3 text-gray-500 mb-1">
                          <CalendarDays className="w-4 h-4" />
                          <span className="text-sm">등록일</span>
                        </div>
                        <p className="font-semibold text-gray-800 ml-7">
                          {studentData?.enrollmentDate
                            ? new Date(studentData.enrollmentDate).toLocaleDateString('ko-KR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })
                            : '정보 없음'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Card */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-indigo-50">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-purple-600" />
                    나의 학습 현황
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-purple-50 rounded-xl">
                      <p className="text-3xl font-bold text-purple-600">{completedExams.length}</p>
                      <p className="text-sm text-gray-600 mt-1">총 응시 횟수</p>
                    </div>
                    <div className="text-center p-4 bg-emerald-50 rounded-xl">
                      <p className="text-3xl font-bold text-emerald-600">{averageScore}</p>
                      <p className="text-sm text-gray-600 mt-1">평균 점수</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl">
                      <p className="text-3xl font-bold text-blue-600">{highestScore}</p>
                      <p className="text-sm text-gray-600 mt-1">최고 점수</p>
                    </div>
                    <div className="text-center p-4 bg-orange-50 rounded-xl">
                      <p className="text-3xl font-bold text-orange-600">
                        {availableExams.length + inProgressExams.length}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">대기 중 시험</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Info Note */}
              <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-1">안내사항</h4>
                      <p className="text-sm text-gray-600">
                        개인정보 수정이 필요하시면 담당 선생님께 문의해주세요.
                        비밀번호 변경도 선생님을 통해 가능합니다.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
