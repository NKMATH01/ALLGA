import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../components/ui/toast';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { useTheme } from '../lib/useTheme';
import { StatValue } from '../components/ui/stat-value';
import { ensureReport, openFullReport, prefersSummaryView } from '../lib/reportClient';
import { ReportSummaryModal } from '../components/ReportSummaryModal';
import { useModalA11y, isMobileViewport } from '../lib/useModalA11y';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
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
  Star,
  PlayCircle,
  ClipboardCheck,
  Settings,
  User,
  School,
  Phone,
  CalendarDays,
  RefreshCw,
  PieChart,
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
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
// Chart.js 색상: DESIGN.md 토큰만 사용
// Chart.js 는 캔버스에 그리므로 CSS 클래스를 적용할 수 없다. 새 hex 를 만들지 않고
// index.css 에 정의된 CSS 변수의 계산값을 읽어서 넘긴다.
// ===============================
const readToken = (name: string): string =>
  typeof document === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 토큰 hex 를 Chart.js 의 반투명 영역/그리드용 rgba 문자열로 변환한다.
const tokenAlpha = (name: string, alpha: number): string => {
  const raw = readToken(name).replace('#', '');
  if (raw.length !== 3 && raw.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// DESIGN.md 2.4 등급 매핑. 1-2 우수 / 3-4 양호 / 5-6 보통 / 7-9 보완 필요.
// 학생에게 보이는 화면이므로 낮은 등급에도 --fn-error 를 쓰지 않는다.
const gradeToken = (grade: number): string => {
  if (grade <= 2) return '--fn-success';
  if (grade <= 4) return '--fn-info';
  if (grade <= 6) return '--text-tertiary';
  return '--fn-warning';
};

// 같은 매핑의 클래스 버전. 뱃지는 면 + 1px 테두리 + 글자 3종 세트 (DESIGN.md 5.3).
const gradeBadgeClass = (grade?: number | null): string => {
  if (!grade) return 'border-line bg-surface-subtle text-ink-secondary';
  if (grade <= 2) return 'border-fn-success-border bg-fn-success-surface text-fn-success';
  if (grade <= 4) return 'border-fn-info-border bg-fn-info-surface text-fn-info';
  if (grade <= 6) return 'border-line bg-surface-subtle text-ink-secondary';
  return 'border-fn-warning-border bg-fn-warning-surface text-fn-warning';
};

// ===============================
// Wrong Questions Analysis Modal
// ===============================
function WrongQuestionsModal({ attemptId, examTitle }: { attemptId: string; examTitle: string }) {
  const [loading, setLoading] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<any[]>([]);
  const [oxGraded, setOxGraded] = useState(false);
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

      // 지점 수동 채점(O/X)은 answers 에 _gradingMode: 'ox' 메타키가 있다.
      // 이 경우 답안 값은 정답 번호가 아니라 O=1 / X=0 이므로 판정·표기 방식이 다르다.
      const isOxGraded = answers._gradingMode === 'ox';
      setOxGraded(isOxGraded);

      const wrong = questionsData
        .filter((q: any) => {
          const qNum = q.number || q.questionNumber;
          const studentAns = answers[qNum];
          return isOxGraded ? Number(studentAns) !== 1 : studentAns !== q.correctAnswer;
        })
        .map((q: any) => {
          const qNum = q.number || q.questionNumber;
          return {
            ...q,
            questionNumber: qNum,
            studentAnswer: answers[qNum] ?? null,
          };
        });

      setWrongQuestions(wrong);
    } catch (error) {
      console.error('Error fetching wrong questions:', error);
      toast.error('틀린 문항 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    fetchWrongQuestions();
  };

  // DESIGN.md 2.4: 난이도는 시스템 오류가 아니므로 --fn-error 를 쓰지 않는다.
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case '상': return 'bg-fn-warning-surface text-fn-warning border-fn-warning-border';
      case '중': return 'bg-fn-info-surface text-fn-info border-fn-info-border';
      case '하': return 'bg-fn-success-surface text-fn-success border-fn-success-border';
      default: return 'bg-surface-subtle text-ink-secondary border-line';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button onClick={handleOpen} variant="outline">
          <AlertCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
          틀린 문항 분석
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-line pb-4">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-9 h-9 bg-surface-inverse rounded-sm flex items-center justify-center flex-shrink-0">
              <XCircle className="w-5 h-5 text-ink-inverse" strokeWidth={1.5} />
            </div>
            틀린 문항 분석
          </DialogTitle>
          <p className="text-sm text-ink-secondary mt-1">{examTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-ink-tertiary mb-4" strokeWidth={1.5} />
            <p className="text-ink-secondary">분석 중입니다...</p>
          </div>
        ) : wrongQuestions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-fn-success-surface border border-fn-success-border rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-fn-success" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-ink mb-2">틀린 문항이 없습니다</h3>
            <p className="text-ink-secondary">이번 시험은 전 문항을 맞혔습니다.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Summary Banner */}
            <div className="bg-surface-subtle border border-line rounded-md p-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-surface border border-line rounded-sm flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-ink-secondary" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-ink">{wrongQuestions.length}개 문항</p>
                  <p className="text-sm text-ink-secondary">오답을 분석하고 복습하세요.</p>
                </div>
              </div>
            </div>

            {/* Wrong Questions List */}
            {wrongQuestions.map((question, idx) => (
              <div
                key={idx}
                className="bg-surface border border-line rounded-md p-6 transition-colors duration-150 ease-out hover:border-line-strong"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-surface-inverse text-ink-inverse rounded-sm flex items-center justify-center font-bold text-lg flex-shrink-0">
                    {question.questionNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-sm border ${getDifficultyColor(question.difficulty)}`}>
                        난이도: {question.difficulty || '중'}
                      </span>
                      {question.category && (
                        <span className="px-2 py-0.5 bg-surface-subtle text-ink text-xs font-semibold rounded-sm border border-line">
                          {question.category}
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-surface-subtle text-ink-secondary text-xs font-semibold rounded-sm border border-line">
                        {question.points || 1}점
                      </span>
                    </div>

                    {/* Categories */}
                    {(question.category || question.subcategory) && (
                      <div className="mb-4 p-3 bg-surface-subtle rounded-sm">
                        {question.category && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold text-ink min-w-[50px]">대분류:</span>
                            <span className="text-ink-secondary">{question.category}</span>
                          </div>
                        )}
                        {question.subcategory && (
                          <div className="flex items-center gap-2 text-sm mt-1">
                            <span className="font-semibold text-ink min-w-[50px]">소분류:</span>
                            <span className="text-ink-secondary">{question.subcategory}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Commentary */}
                    {question.commentary ? (
                      <div className="bg-surface-subtle rounded-sm p-4 mb-4 border border-line">
                        <div className="flex items-center gap-2 mb-3">
                          <BookOpen className="w-4 h-4 text-ink-secondary" strokeWidth={1.5} />
                          <h4 className="font-semibold text-ink">문항 해설</h4>
                        </div>
                        <p className="text-ink-secondary leading-relaxed whitespace-pre-wrap">
                          {question.commentary}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-surface-subtle rounded-sm p-4 mb-4 border border-line">
                        <p className="text-ink-tertiary text-center">해설이 제공되지 않았습니다.</p>
                      </div>
                    )}

                    {/* Answer Comparison */}
                    <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-line-subtle">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-ink">정답:</span>
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 bg-fn-success-surface border border-fn-success-border text-fn-success rounded-sm flex items-center justify-center font-bold">
                            {oxGraded ? 'O' : question.correctAnswer ?? '-'}
                          </span>
                          <span className="text-xs text-fn-success font-semibold">정답</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-ink">내 답안:</span>
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 bg-fn-warning-surface border border-fn-warning-border text-fn-warning rounded-sm flex items-center justify-center font-bold">
                            {oxGraded
                              ? 'X'
                              : question.studentAnswer === null || question.studentAnswer === 0
                              ? '?'
                              : question.studentAnswer}
                          </span>
                          <span className="text-xs text-fn-warning font-semibold">
                            {oxGraded ? '오답' : question.studentAnswer === null ? '무응답' : '오답'}
                          </span>
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
  const [summaryReportId, setSummaryReportId] = useState<string | null>(null);

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

  // 생성 전이면 큐에 적재하고 완료까지 폴링한다. 모바일은 요약 뷰 우선.
  const handleViewReport = async () => {
    setLoading(true);
    try {
      const ref = await ensureReport(attemptId, (stage) => {
        if (stage === 'generating') {
          toast.info('AI 보고서를 생성하는 중입니다...', '분석에 시간이 걸릴 수 있습니다.');
        }
      });

      setReportStatus('completed');

      if (prefersSummaryView()) {
        setSummaryReportId(ref.reportId);
      } else {
        await openFullReport(ref);
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || error.message || 'AI 보고서를 불러오는데 실패했습니다.'
      );
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
      <Button onClick={handleViewReport} disabled={loading}>
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
    <>

    <Button disabled variant="outline" className="opacity-50">
      <Clock className="w-4 h-4 mr-2" />
      보고서 대기 중
    </Button>
      {summaryReportId && (
        <ReportSummaryModal reportId={summaryReportId} onClose={() => setSummaryReportId(null)} />
      )}
    </>
  );
}

// ===============================
// Exam Taking Modal Component
// ===============================
function ExamTakingModal({
  exam,
  attempt,
  attemptId,
  onClose,
  onSubmit,
}: {
  exam: any;
  // 호출부가 계속 전달하므로 타입에는 남겨두고 본문에서만 쓰지 않는다
  distribution?: any;
  attempt: any;
  attemptId: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnswersRef = useRef<Record<number, number> | null>(null);

  const questionsData = exam?.questionsData || [];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questionsData.length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // 저장된 답안을 서버에서 복원 (새로고침·재개 시 답안 유실 방지)
  useEffect(() => {
    let cancelled = false;

    const normalize = (raw: any): Record<number, number> => {
      const restored: Record<number, number> = {};
      if (!raw || typeof raw !== 'object') return restored;
      for (const [key, value] of Object.entries(raw)) {
        // '_gradingMode' 같은 메타키는 문항이 아니므로 제외
        const qNum = Number(key);
        if (!Number.isInteger(qNum)) continue;
        const answer = Number(value);
        if (!Number.isFinite(answer)) continue;
        restored[qNum] = answer;
      }
      return restored;
    };

    const loadAnswers = async () => {
      try {
        if (attempt?.answers) {
          if (!cancelled) setAnswers(normalize(attempt.answers));
          return;
        }
        const res = await api.get(`/exam-attempts/${attemptId}`);
        if (!cancelled) setAnswers(normalize(res.data.data?.answers));
      } catch (error) {
        console.error('Failed to load saved answers:', error);
      } finally {
        if (!cancelled) setLoadingAnswers(false);
      }
    };

    loadAnswers();

    return () => {
      cancelled = true;
    };
  }, [attemptId, attempt]);

  // 언마운트 시 대기 중인 debounce 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const saveAnswers = async (toSave: Record<number, number>) => {
    setSaveState('saving');
    try {
      await api.put(`/exam-attempts/${attemptId}`, { answers: toSave });
      pendingAnswersRef.current = null;
      setSaveState('saved');
      return true;
    } catch (error) {
      console.error('Failed to save answers:', error);
      setSaveState('error');
      return false;
    }
  };

  // 대기 중인 저장을 즉시 실행 (닫기·제출 전 호출)
  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingAnswersRef.current;
    if (!pending) return true;
    return await saveAnswers(pending);
  };

  const handleAnswerChange = (questionNumber: number, choiceIndex: number) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionNumber]: choiceIndex };

      // 800ms debounce 자동 임시저장
      pendingAnswersRef.current = next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        saveAnswers(next);
      }, 800);

      return next;
    });
  };

  // "나중에 계속하기": 저장이 끝난 뒤 닫는다
  const handleCloseLater = async () => {
    const ok = await flushPendingSave();
    if (!ok) {
      if (!confirm('답안 저장에 실패했습니다. 그래도 닫으시겠습니까? 저장되지 않은 답안은 사라집니다.')) {
        return;
      }
    }
    onClose();
  };

  // Esc 는 저장 흐름을 그대로 타야 한다. onClose 를 직접 부르면 답안이 저장되지 않는다.
  const examModalRef = useModalA11y<HTMLDivElement>({
    active: true,
    onClose: () => {
      void handleCloseLater();
    },
  });

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

    // 제출 후 debounce 타이머가 뒤늦게 PUT 을 보내지 않도록 정리
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingAnswersRef.current = null;

    setSubmitting(true);
    try {
      await api.post(`/exam-attempts/${attemptId}/submit`, { answers });
      toast.success('시험이 제출되었습니다!');
      onSubmit();
    } catch (error: any) {
      toast.error(error.response?.data?.message || '시험 제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={examModalRef}
      role="dialog"
      aria-modal="true"
      aria-label="시험 응시"
      className="fixed inset-0 bg-[var(--overlay)] z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface-raised rounded-lg shadow-lg w-full max-w-4xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="bg-surface-inverse text-ink-inverse p-6 rounded-t-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-[-0.01em] truncate">{exam?.title}</h2>
              <p className="text-sm text-ink-inverse-muted mt-1">{exam?.subject}</p>
            </div>
            <Button
              variant="ghost"
              onClick={handleCloseLater}
              disabled={submitting}
              className="text-ink-inverse-muted hover:bg-line-inverse hover:text-ink-inverse flex-shrink-0"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-ink-inverse-muted">진행률</span>
              <span>{answeredCount}/{totalQuestions} 문항 완료</span>
            </div>
            <div className="w-full bg-line-inverse rounded-sm h-2">
              <div
                className="bg-ink-inverse rounded-sm h-2 transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {questionsData.length > 0 && !loadingAnswers ? (
            questionsData.map((question: any, idx: number) => {
              const qNum = question.questionNumber || question.number || idx + 1;
              return (
                <div
                  key={idx}
                  className={`bg-surface rounded-md border transition-colors duration-150 ease-out ${
                    answers[qNum] !== undefined ? 'border-line-strong bg-surface-subtle' : 'border-line'
                  }`}
                >
                  <div className="p-6">
                    {/* Question Header */}
                    <div className="flex items-start gap-4 mb-6">
                      <div className={`w-11 h-11 rounded-sm flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                        answers[qNum] !== undefined
                          ? 'bg-surface-inverse text-ink-inverse'
                          : 'bg-surface-subtle text-ink-tertiary border border-line'
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
                            <Badge variant="secondary" className="text-xs">
                              {question.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Answer Options */}
                    <div className="flex flex-wrap gap-3 items-center justify-center">
                      {[1, 2, 3, 4, 5].map((choice) => (
                        <button
                          key={choice}
                          onClick={() => handleAnswerChange(qNum, choice)}
                          className={`w-14 h-14 rounded-full border font-bold text-lg transition-colors duration-150 ease-out active:scale-[0.98] ${
                            answers[qNum] === choice
                              ? 'bg-action text-action-text border-action'
                              : 'bg-surface text-ink border-line-strong hover:bg-surface-subtle'
                          }`}
                        >
                          {choice}
                        </button>
                      ))}
                      <button
                        onClick={() => handleAnswerChange(qNum, 0)}
                        className={`px-4 h-14 rounded-full border font-semibold transition-colors duration-150 ease-out active:scale-[0.98] ${
                          answers[qNum] === 0
                            ? 'bg-action text-action-text border-action'
                            : 'bg-surface text-ink-secondary border-line-strong hover:bg-surface-subtle'
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
            <div className="text-center py-12 text-ink-secondary">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-ink-tertiary" strokeWidth={1.5} />
              <p>{loadingAnswers ? '저장된 답안을 불러오는 중...' : '문제 정보를 불러오는 중...'}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line bg-surface-subtle p-6 rounded-b-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-ink-secondary">
              <span className="font-semibold text-ink">{answeredCount}</span>/{totalQuestions} 문항 답변 완료
              {saveState === 'saving' && <span className="ml-3 text-xs text-ink-tertiary">저장 중...</span>}
              {saveState === 'saved' && <span className="ml-3 text-xs text-fn-success">답안 자동 저장됨</span>}
              {saveState === 'error' && <span className="ml-3 text-xs text-fn-error">자동 저장 실패</span>}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleCloseLater} disabled={submitting}>
                나중에 계속하기
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="px-8">
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
  // 데스크톱은 열림, 모바일은 닫힘으로 시작한다.
  // true 로 고정하면 390px 진입 시 드로어가 첫 화면을 덮는다.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
  );
  const [activeExamTab, setActiveExamTab] = useState<ExamTab>('available');
  const drawerRef = useModalA11y<HTMLElement>({
    active: sidebarOpen && isMobileViewport(),
    onClose: () => setSidebarOpen(false),
  });
  // 차트 색은 readToken() 으로 CSS 변수를 읽으므로, 테마가 바뀌면 다시 계산해야 한다.
  const { theme } = useTheme();
  const [examModal, setExamModal] = useState<{
    exam: any;
    distribution: any;
    attempt: any;
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
  const {
    data: examsData,
    refetch: refetchExams,
    isLoading: examsLoading,
    isError: examsError,
  } = useQuery({
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
        attempt: data.attempt,
        attemptId: data.attempt.id,
      });
      queryClient.invalidateQueries({ queryKey: ['student', 'exams'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '시험 시작에 실패했습니다.');
    },
  });

  // Continue exam
  const continueExam = async (item: ExamItem) => {
    try {
      const examRes = await api.get(`/my-exams/${item.distribution.id}`);
      setExamModal({
        exam: examRes.data.data.exam,
        distribution: item.distribution,
        // 서버가 내려주는 저장된 답안(없으면 모달이 GET /exam-attempts/:id 로 조회)
        attempt: examRes.data.data.attempt,
        attemptId: item.attempt!.id,
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || '시험 정보를 불러오는데 실패했습니다.');
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
        borderColor: readToken('--action'),
        backgroundColor: tokenAlpha('--action', 0.08),
        tension: 0.4,
        // 브라스 2곳 중 1곳: 최고 점수에 도달한 지점만 강조한다 (DESIGN.md 1.2 성취)
        pointBackgroundColor: scores.map((s) =>
          s === highestScore && scores.length > 0 ? readToken('--accent') : readToken('--action')
        ),
        pointBorderColor: readToken('--surface'),
        pointBorderWidth: 2,
        pointRadius: scores.map((s) => (s === highestScore && scores.length > 0 ? 7 : 5)),
        pointHoverRadius: 8,
      },
    ],
  }), [completedExams, scores, highestScore, theme]);

  // Chart data - Grade distribution doughnut
  const gradeChartData = useMemo(() => ({
    labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
    datasets: [
      {
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => gradeDistribution[g] || 0),
        // DESIGN.md 2.4 등급 매핑을 그대로 따른다 (기능 계층만 사용)
        backgroundColor: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => readToken(gradeToken(g))),
        borderWidth: 2,
        borderColor: readToken('--surface'),
      },
    ],
  }), [gradeDistribution, theme]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: readToken('--surface-inverse'),
        padding: 12,
        titleColor: readToken('--text-on-inverse'),
        bodyColor: readToken('--text-on-inverse'),
        borderColor: readToken('--border-inverse'),
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: tokenAlpha('--border', 0.9) },
        ticks: { color: readToken('--text-tertiary'), callback: (value: any) => value + '점' },
      },
      x: {
        grid: { display: false },
        ticks: { color: readToken('--text-tertiary') },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { padding: 20, color: readToken('--text-secondary') },
      },
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
    <div className="flex h-[100dvh] bg-surface-sunken">
      {/* Exam Taking Modal */}
      {examModal && (
        <ExamTakingModal
          exam={examModal.exam}
          distribution={examModal.distribution}
          attempt={examModal.attempt}
          attemptId={examModal.attemptId}
          onClose={() => setExamModal(null)}
          onSubmit={() => {
            setExamModal(null);
            refetchExams();
            setActiveSection('results');
          }}
        />
      )}

      {/*
        DESIGN.md 7.2 사이드바
          >= 768px : 문서 흐름 안 고정 기둥 (펼침 264px / 접힘 0)
          <  768px : 흐름에서 제거하고 오버레이 드로어. 본문은 항상 100% 폭.
        기존 sidebarOpen 상태를 그대로 재사용하고 표현만 바꾼다. 폭이 아니라 transform 으로
        움직이므로 레이아웃 재계산이 없다.
      */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 z-40 w-[264px] flex flex-col border-r border-line bg-surface text-ink transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:static md:z-auto md:translate-x-0 md:overflow-hidden md:transition-[width] ${
          sidebarOpen ? 'md:w-[264px]' : 'md:w-0'
        }`}
      >
        <div className="p-6 flex-1 overflow-y-auto">
          {/*
            Logo. 이 화면의 그린 1곳째. 아이콘 색은 --accent 와 함께 뒤집히는
            action-text 를 쓴다 (라이트 흰 글자 3.30:1 / 다크 slate-900 10.3:1).
          */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-accent rounded-md flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-action-text" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-[-0.01em]">ALLGA</h1>
              <p className="text-xs text-ink-secondary">학습 관리 시스템</p>
            </div>
          </div>

          {/* User Card */}
          <div className="mb-8 p-4 rounded-md border border-line">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 border border-line rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{user.name}</p>
                <p className="text-sm text-ink-secondary truncate">
                  {studentData?.branch?.name || '학생'}
                </p>
              </div>
            </div>
            {studentData && (
              <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-ink-secondary">
                  <School className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="truncate">{studentData.school || '-'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-ink-secondary">
                  <GraduationCap className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>{studentData.grade || '-'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  /*
                    그린 2곳째: 활성 메뉴의 좌측 강조 바 (세로 내비에서 밑줄의 대응물).
                    색 단독이 아니다 - 굵기·면·우측 ChevronRight 가 함께 바뀐다 (12.2).
                  */
                  className={`w-full flex items-center gap-3 border-l-2 px-4 py-3 rounded-md text-sm transition-colors duration-150 ease-out ${
                    activeSection === item.id
                      ? 'border-accent bg-action-subtle text-ink font-semibold'
                      : 'border-transparent text-ink-secondary hover:bg-surface-subtle hover:text-ink'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {activeSection === item.id && (
                    <ChevronRight className="w-4 h-4 ml-auto" strokeWidth={1.5} />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Stats */}
          {completedExams.length > 0 && (
            <div className="mt-8 p-4 rounded-md border border-line">
              <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-secondary mb-3">
                나의 성적 요약
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-bold leading-none">{averageScore}</p>
                  <p className="text-xs text-ink-secondary mt-1.5">평균 점수</p>
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{completedExams.length}</p>
                  <p className="text-xs text-ink-secondary mt-1.5">응시 횟수</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <div className="p-6 border-t border-line">
          <Button
            onClick={() => logoutMutation.mutate()}
            variant="ghost"
            className="w-full justify-start text-ink-secondary hover:bg-surface-subtle hover:text-ink"
          >
            <LogOut className="w-4 h-4 mr-3" strokeWidth={1.5} />
            로그아웃
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-surface border-b border-line z-10">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="h-11 w-11 p-0 flex-shrink-0"
                aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
              >
                {sidebarOpen ? (
                  <X className="w-5 h-5" strokeWidth={1.5} />
                ) : (
                  <Menu className="w-5 h-5" strokeWidth={1.5} />
                )}
              </Button>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-[-0.015em] text-ink truncate">
                  {activeSection === 'dashboard' && '대시보드'}
                  {activeSection === 'exams' && '시험 응시'}
                  {activeSection === 'results' && '성적 조회'}
                  {activeSection === 'profile' && '내 정보'}
                </h2>
                <p className="text-xs text-ink-tertiary truncate">
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
            <div className="flex items-center gap-2 flex-shrink-0">
              {(availableExams.length > 0 || inProgressExams.length > 0) && (
                <div className="hidden sm:flex items-center gap-2">
                  {inProgressExams.length > 0 && (
                    <Badge className="border-fn-warning-border bg-fn-warning-surface text-fn-warning">
                      <Clock className="w-3 h-3 mr-1" strokeWidth={1.5} />
                      진행 중 {inProgressExams.length}
                    </Badge>
                  )}
                  {availableExams.length > 0 && (
                    <Badge className="border-fn-info-border bg-fn-info-surface text-fn-info">
                      <PlayCircle className="w-3 h-3 mr-1" strokeWidth={1.5} />
                      응시 가능 {availableExams.length}
                    </Badge>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() => refetchExams()}
                className="h-11 w-11 p-0"
                aria-label="새로고침"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
              </Button>
              {/* 야간 모드 토글 (DESIGN.md 6장) */}
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* ============ DASHBOARD SECTION ============ */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Welcome Banner */}
              <div className="bg-surface-inverse text-ink-inverse rounded-md p-6 md:p-8">
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-[-0.02em] mb-2">
                      안녕하세요, {user.name}님
                    </h1>
                    <p className="text-ink-inverse-muted">
                      오늘 응시할 시험과 지난 성적을 여기서 확인합니다.
                    </p>
                  </div>
                  <div className="hidden md:block flex-shrink-0">
                    <div className="w-16 h-16 border border-line-inverse rounded-full flex items-center justify-center">
                      <Star className="w-7 h-7 text-ink-inverse-muted" strokeWidth={1.5} />
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
                      className="bg-surface text-ink hover:bg-surface-subtle"
                    >
                      <PlayCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
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
                      className="border-line-inverse bg-transparent text-ink-inverse hover:bg-line-inverse"
                    >
                      <Clock className="w-4 h-4 mr-2" strokeWidth={1.5} />
                      진행 중인 시험 ({inProgressExams.length})
                    </Button>
                  )}
                </div>
              </div>

              {/*
                통계 카드: DESIGN.md 5.2. 아이콘 타일을 넣지 않는다 (4개가 나란히 놓일 때
                아이콘이 수치 스캔을 방해한다). 라벨 / 수치+단위 / 각주 3단 구조.
                브라스 1곳 / 2: 최고 점수. 배경을 칠하지 않고 상단 규칙선과 수치 색만 쓴다.
              */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-5 pt-5">
                    <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">평균 점수</p>
                    <StatValue
                      value={averageScore}
                      suffix="점"
                      isLoading={examsLoading}
                      isError={examsError}
                      onRetry={() => refetchExams()}
                      valueClassName="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
                    />
                    <p className="mt-3 text-xs text-ink-secondary">{completedExams.length}회 응시 기준</p>
                  </CardContent>
                </Card>

                <Card className="border-t-[3px] border-t-accent">
                  <CardContent className="p-5 pt-5">
                    <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">최고 점수</p>
                    <StatValue
                      value={highestScore}
                      suffix="점"
                      isLoading={examsLoading}
                      isError={examsError}
                      onRetry={() => refetchExams()}
                      valueClassName="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-accent-strong"
                    />
                    <p className="mt-3 text-xs text-ink-secondary">지금까지의 최고 기록</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5 pt-5">
                    <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">응시 횟수</p>
                    <StatValue
                      value={completedExams.length}
                      suffix="회"
                      isLoading={examsLoading}
                      isError={examsError}
                      onRetry={() => refetchExams()}
                      valueClassName="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink"
                    />
                    <p className="mt-3 text-xs text-ink-secondary">완료한 시험</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5 pt-5">
                    <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">대기 시험</p>
                    {availableExams.length + inProgressExams.length > 0 ? (
                      <p className="mt-3 text-4xl font-bold leading-none tracking-[-0.03em] text-ink">
                        {availableExams.length + inProgressExams.length}<span className="ml-1 text-xs font-medium tracking-normal text-ink-tertiary">개</span>
                      </p>
                    ) : (
                      <p className="mt-3 py-2 text-base font-semibold text-ink-tertiary">배정 없음</p>
                    )}
                    <p className="mt-3 text-xs text-ink-secondary">응시 가능과 진행 중 합계</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Score Trend Chart */}
                <Card>
                  <CardHeader className="border-b border-line bg-surface-subtle">
                    <CardTitle className="flex items-center gap-2.5">
                      <TrendingUp className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
                      성적 추이
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {completedExams.length > 0 ? (
                      <div className="h-72">
                        {/* key 에 테마를 넣어 Chart.js 인스턴스를 새로 만든다.
                            옵션 객체만 바꾸면 축·툴팁 색이 갱신되지 않는다 */}
                        <Line key={`line-${theme}`} data={chartData} options={chartOptions} />
                      </div>
                    ) : (
                      <div className="h-72 flex flex-col items-center justify-center text-ink-tertiary">
                        <BarChart3 className="w-10 h-10 mb-4" strokeWidth={1.5} />
                        <p className="text-sm">아직 응시한 시험이 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Grade Distribution Chart */}
                <Card>
                  <CardHeader className="border-b border-line bg-surface-subtle">
                    <CardTitle className="flex items-center gap-2.5">
                      <PieChart className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
                      등급 분포
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {completedExams.length > 0 ? (
                      <div className="h-72">
                        <Doughnut key={`doughnut-${theme}`} data={gradeChartData} options={doughnutOptions} />
                      </div>
                    ) : (
                      <div className="h-72 flex flex-col items-center justify-center text-ink-tertiary">
                        <PieChart className="w-10 h-10 mb-4" strokeWidth={1.5} />
                        <p className="text-sm">아직 등급 데이터가 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Results & Upcoming Exams */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Exam Results */}
                <Card>
                  <CardHeader className="border-b border-line bg-surface-subtle">
                    <CardTitle className="flex items-center gap-2.5">
                      <FileText className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
                      최근 시험 결과
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {completedExams.length > 0 ? (
                      <div>
                        {completedExams.slice(0, 4).map((item, idx) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 rounded-md border-b border-line-subtle last:border-b-0 transition-colors duration-150 ease-out hover:bg-surface-subtle cursor-pointer"
                            onClick={() => setActiveSection('results')}
                          >
                            <div className="w-9 h-9 flex-shrink-0 bg-surface-subtle border border-line text-ink-secondary rounded-sm flex items-center justify-center text-sm font-semibold">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-ink truncate">{item.exam.title}</h4>
                              <p className="text-sm text-ink-tertiary">{item.exam.subject}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-lg font-bold text-ink">{item.attempt?.score}점</p>
                              <Badge className={`mt-1 text-xs ${gradeBadgeClass(item.attempt?.grade)}`}>
                                {item.attempt?.grade}등급
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-ink-tertiary">
                        <FileText className="w-10 h-10 mx-auto mb-3" strokeWidth={1.5} />
                        <p className="text-sm">아직 완료된 시험이 없습니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Available & Upcoming Exams */}
                <Card>
                  <CardHeader className="border-b border-line bg-surface-subtle">
                    <CardTitle className="flex items-center gap-2.5">
                      <Calendar className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
                      응시 대기 시험
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    {availableExams.length > 0 || inProgressExams.length > 0 ? (
                      <div>
                        {/* In Progress */}
                        {inProgressExams.map((item) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 rounded-md border-b border-line-subtle last:border-b-0"
                          >
                            <div className="w-9 h-9 flex-shrink-0 bg-fn-warning-surface border border-fn-warning-border text-fn-warning rounded-sm flex items-center justify-center">
                              <Clock className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-ink truncate">{item.exam.title}</h4>
                                <Badge className="flex-shrink-0 border-fn-warning-border bg-fn-warning-surface text-fn-warning">
                                  진행 중
                                </Badge>
                              </div>
                              <p className="text-sm text-ink-tertiary">{item.exam.subject}</p>
                            </div>
                            <Button size="sm" onClick={() => continueExam(item)} className="flex-shrink-0">
                              계속하기
                            </Button>
                          </div>
                        ))}

                        {/* Available */}
                        {availableExams.slice(0, 3).map((item) => (
                          <div
                            key={item.distribution.id}
                            className="flex items-center gap-4 p-4 rounded-md border-b border-line-subtle last:border-b-0"
                          >
                            <div className="w-9 h-9 flex-shrink-0 bg-fn-info-surface border border-fn-info-border text-fn-info rounded-sm flex items-center justify-center">
                              <PlayCircle className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-ink truncate">{item.exam.title}</h4>
                              <p className="text-sm text-ink-tertiary">
                                ~{formatDate(item.distribution.endDate)}까지
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => startExamMutation.mutate(item.distribution.id)}
                              disabled={startExamMutation.isPending}
                              className="flex-shrink-0"
                            >
                              시작
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-ink-tertiary">
                        <Calendar className="w-10 h-10 mx-auto mb-3" strokeWidth={1.5} />
                        <p className="text-sm">현재 응시 가능한 시험이 없습니다</p>
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
              <div className="bg-surface border border-line rounded-md p-1.5 flex gap-1.5 overflow-x-auto">
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
                      className={`flex-1 flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-sm text-sm font-semibold transition-colors duration-150 ease-out ${
                        activeExamTab === tab.id
                          ? 'bg-action text-action-text'
                          : 'text-ink-secondary hover:bg-surface-subtle'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-sm text-xs ${
                          activeExamTab === tab.id ? 'bg-line-inverse' : 'bg-surface-subtle text-ink-secondary'
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
                      <Card key={item.distribution.id} className="transition-colors duration-150 ease-out hover:border-line-strong">
                        <CardContent className="p-6 pt-6">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                            <div className="w-12 h-12 flex-shrink-0 bg-fn-info-surface border border-fn-info-border text-fn-info rounded-sm flex items-center justify-center">
                              <PlayCircle className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{item.exam.title}</h3>
                                  <p className="text-sm text-ink-secondary mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="flex-shrink-0 border-fn-info-border bg-fn-info-surface text-fn-info">
                                  응시 가능
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-ink-tertiary">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" strokeWidth={1.5} />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Target className="w-4 h-4" strokeWidth={1.5} />
                                  {item.exam.totalScore}점 만점
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                                  ~{formatDate(item.distribution.endDate)}
                                </span>
                              </div>
                            </div>
                            <Button
                              onClick={() => startExamMutation.mutate(item.distribution.id)}
                              disabled={startExamMutation.isPending}
                              className="h-12 px-6 flex-shrink-0"
                            >
                              {startExamMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                              ) : (
                                <>
                                  시험 시작
                                  <ChevronRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <PlayCircle className="w-10 h-10 mx-auto text-ink-tertiary mb-4" strokeWidth={1.5} />
                        <h3 className="text-base font-semibold text-ink mb-2">응시 가능한 시험이 없습니다</h3>
                        <p className="text-sm text-ink-secondary">새로운 시험이 배포되면 여기에 표시됩니다.</p>
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
                      <Card key={item.distribution.id} className="border-l-[3px] border-l-fn-warning-border">
                        <CardContent className="p-6 pt-6">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                            <div className="w-12 h-12 flex-shrink-0 bg-fn-warning-surface border border-fn-warning-border text-fn-warning rounded-sm flex items-center justify-center">
                              <Clock className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{item.exam.title}</h3>
                                  <p className="text-sm text-ink-secondary mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="flex-shrink-0 border-fn-warning-border bg-fn-warning-surface text-fn-warning">
                                  진행 중
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-ink-tertiary">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" strokeWidth={1.5} />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                                  ~{formatDate(item.distribution.endDate)}
                                </span>
                              </div>
                            </div>
                            <Button onClick={() => continueExam(item)} className="h-12 px-6 flex-shrink-0">
                              계속하기
                              <ChevronRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <Clock className="w-10 h-10 mx-auto text-ink-tertiary mb-4" strokeWidth={1.5} />
                        <h3 className="text-base font-semibold text-ink mb-2">진행 중인 시험이 없습니다</h3>
                        <p className="text-sm text-ink-secondary">시험을 시작하면 여기서 계속할 수 있습니다.</p>
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
                      <Card key={item.distribution.id} className="transition-colors duration-150 ease-out hover:border-line-strong">
                        <CardContent className="p-6 pt-6">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                            <div className="w-12 h-12 flex-shrink-0 bg-fn-success-surface border border-fn-success-border text-fn-success rounded-sm flex items-center justify-center">
                              <CheckCircle2 className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{item.exam.title}</h3>
                                  <p className="text-sm text-ink-secondary mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge className="flex-shrink-0 border-fn-success-border bg-fn-success-surface text-fn-success">
                                  완료
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-ink-tertiary">
                                <span className="flex items-center gap-1.5">
                                  <Target className="w-4 h-4" strokeWidth={1.5} />
                                  {item.attempt?.score}/{item.exam.totalScore}점
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Award className="w-4 h-4" strokeWidth={1.5} />
                                  {item.attempt?.grade}등급
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
                                  {item.attempt?.correctCount}/{item.exam.totalQuestions}문항 정답
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                                  {item.attempt?.submittedAt && formatDate(item.attempt.submittedAt)}
                                </span>
                              </div>
                            </div>
                            <div className="flex-shrink-0 lg:text-right">
                              <div className="text-3xl font-bold tracking-[-0.03em] text-ink mb-2">
                                {item.attempt?.score}점
                              </div>
                              <Badge className={gradeBadgeClass(item.attempt?.grade)}>
                                {item.attempt?.grade}등급
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <CheckCircle2 className="w-10 h-10 mx-auto text-ink-tertiary mb-4" strokeWidth={1.5} />
                        <h3 className="text-base font-semibold text-ink mb-2">완료된 시험이 없습니다</h3>
                        <p className="text-sm text-ink-secondary">시험을 완료하면 여기서 결과를 확인할 수 있습니다.</p>
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
                      <Card key={item.distribution.id}>
                        <CardContent className="p-6 pt-6">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                            <div className="w-12 h-12 flex-shrink-0 bg-surface-subtle border border-line text-ink-tertiary rounded-sm flex items-center justify-center">
                              <Calendar className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{item.exam.title}</h3>
                                  <p className="text-sm text-ink-secondary mt-1">{item.exam.subject}</p>
                                </div>
                                <Badge variant="secondary" className="flex-shrink-0">예정</Badge>
                              </div>
                              <div className="flex flex-wrap gap-4 mt-4 text-sm text-ink-tertiary">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4" strokeWidth={1.5} />
                                  {item.exam.totalQuestions}문항
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                                  {formatDate(item.distribution.startDate)} 시작
                                </span>
                              </div>
                            </div>
                            <Button disabled variant="outline" className="h-12 px-6 flex-shrink-0">
                              대기 중
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <Calendar className="w-10 h-10 mx-auto text-ink-tertiary mb-4" strokeWidth={1.5} />
                        <h3 className="text-base font-semibold text-ink mb-2">예정된 시험이 없습니다</h3>
                        <p className="text-sm text-ink-secondary">새로운 시험이 예정되면 여기에 표시됩니다.</p>
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
                  <Card>
                    <CardContent className="p-5 pt-5">
                      <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">평균 점수</p>
                      <p className="mt-3 text-3xl font-bold leading-none tracking-[-0.03em] text-ink">{averageScore}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5 pt-5">
                      <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">최고 점수</p>
                      <p className="mt-3 text-3xl font-bold leading-none tracking-[-0.03em] text-ink">{highestScore}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5 pt-5">
                      <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">최저 점수</p>
                      <p className="mt-3 text-3xl font-bold leading-none tracking-[-0.03em] text-ink">{lowestScore}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5 pt-5">
                      <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">총 응시 횟수</p>
                      <p className="mt-3 text-3xl font-bold leading-none tracking-[-0.03em] text-ink">{completedExams.length}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Results List */}
              <Card>
                <CardHeader className="border-b border-line bg-surface-subtle">
                  <CardTitle className="flex items-center gap-2.5">
                    <BarChart3 className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
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
                            className="bg-surface border border-line rounded-md p-6 transition-colors duration-150 ease-out hover:border-line-strong"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                              {/* Exam Info */}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{item.exam.title}</h3>
                                <p className="text-sm text-ink-secondary">{item.exam.subject}</p>
                                <p className="text-xs text-ink-tertiary mt-2">
                                  제출일: {item.attempt?.submittedAt && new Date(item.attempt.submittedAt).toLocaleString('ko-KR')}
                                </p>
                              </div>

                              {/* Score Cards */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="bg-surface-subtle border border-line rounded-sm p-4 text-center">
                                  <p className="text-xs text-ink-tertiary mb-1">점수</p>
                                  <p className="text-2xl font-bold tracking-[-0.025em] text-ink">{item.attempt?.score}</p>
                                </div>
                                {/* 등급만 기능 계층으로 표시한다 (DESIGN.md 2.4) */}
                                <div className={`border rounded-sm p-4 text-center ${gradeBadgeClass(item.attempt?.grade)}`}>
                                  <p className="text-xs mb-1 opacity-80">등급</p>
                                  <p className="text-2xl font-bold tracking-[-0.025em]">{item.attempt?.grade}등급</p>
                                </div>
                                <div className="bg-surface-subtle border border-line rounded-sm p-4 text-center">
                                  <p className="text-xs text-ink-tertiary mb-1">정답 수</p>
                                  <p className="text-2xl font-bold tracking-[-0.025em] text-ink">{item.attempt?.correctCount}/{item.exam.totalQuestions}</p>
                                </div>
                                <div className="bg-surface-subtle border border-line rounded-sm p-4 text-center">
                                  <p className="text-xs text-ink-tertiary mb-1">정답률</p>
                                  <p className="text-2xl font-bold tracking-[-0.025em] text-ink">{percentage}%</p>
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
                      <BarChart3 className="w-10 h-10 mx-auto text-ink-tertiary mb-4" strokeWidth={1.5} />
                      <h3 className="text-base font-semibold text-ink mb-2">아직 성적이 없습니다</h3>
                      <p className="text-sm text-ink-secondary mb-6">시험을 완료하면 여기서 상세 성적을 확인할 수 있습니다.</p>
                      <Button onClick={() => setActiveSection('exams')}>시험 응시하러 가기</Button>
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
              <Card className="overflow-hidden">
                <div className="bg-surface-inverse text-ink-inverse p-6 md:p-8">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 flex-shrink-0 border border-line-inverse rounded-full flex items-center justify-center">
                      <User className="w-7 h-7" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold tracking-[-0.02em] truncate">{user.name}</h2>
                      <p className="text-sm text-ink-inverse-muted mt-1 truncate">{studentData?.branch?.name || '학생'}</p>
                      <Badge className="mt-2 border-line-inverse bg-transparent text-ink-inverse">
                        {studentData?.grade || '학년 미설정'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <CardContent className="p-6 md:p-8">
                  <h3 className="text-base font-semibold text-ink mb-6 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-ink-secondary" strokeWidth={1.5} />
                    내 정보
                  </h3>

                  <div className="grid gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <User className="w-4 h-4" />
                          <span className="text-sm">이름</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{user.name}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">연락처 (아이디)</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{studentData?.user?.phone || user.username}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <School className="w-4 h-4" />
                          <span className="text-sm">학교</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{studentData?.school || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <GraduationCap className="w-4 h-4" />
                          <span className="text-sm">학년</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{studentData?.grade || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <Home className="w-4 h-4" />
                          <span className="text-sm">소속 지점</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{studentData?.branch?.name || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">학부모 연락처</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">{studentData?.parentPhone || '미설정'}</p>
                      </div>

                      <div className="p-4 bg-surface-subtle border border-line rounded-sm md:col-span-2">
                        <div className="flex items-center gap-3 text-ink-tertiary mb-1">
                          <CalendarDays className="w-4 h-4" strokeWidth={1.5} />
                          <span className="text-sm">등록일</span>
                        </div>
                        <p className="font-semibold text-ink ml-7">
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
              <Card>
                <CardHeader className="border-b border-line bg-surface-subtle">
                  <CardTitle className="flex items-center gap-2.5">
                    <Trophy className="w-5 h-5 flex-shrink-0 text-ink-secondary" strokeWidth={1.5} />
                    나의 학습 현황
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                      <p className="text-3xl font-bold tracking-[-0.03em] text-ink">{completedExams.length}</p>
                      <p className="text-xs text-ink-secondary mt-1.5">총 응시 횟수</p>
                    </div>
                    <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                      <p className="text-3xl font-bold tracking-[-0.03em] text-ink">{averageScore}</p>
                      <p className="text-xs text-ink-secondary mt-1.5">평균 점수</p>
                    </div>
                    <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                      <p className="text-3xl font-bold tracking-[-0.03em] text-ink">{highestScore}</p>
                      <p className="text-xs text-ink-secondary mt-1.5">최고 점수</p>
                    </div>
                    <div className="p-4 bg-surface-subtle border border-line rounded-sm">
                      <p className="text-3xl font-bold tracking-[-0.03em] text-ink">
                        {availableExams.length + inProgressExams.length}
                      </p>
                      <p className="text-xs text-ink-secondary mt-1.5">대기 중 시험</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Info Note */}
              <Card className="border-l-[3px] border-l-fn-info-border">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 flex-shrink-0 bg-fn-info-surface border border-fn-info-border rounded-full flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-fn-info" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-ink mb-1">안내사항</h4>
                      <p className="text-sm text-ink-secondary">
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
