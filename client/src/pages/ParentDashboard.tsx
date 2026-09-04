import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { toast } from '../components/ui/toast';
import { ensureReport, openFullReport, openReportWindowSync, prefersSummaryView } from '../lib/reportClient';
import { ReportSummaryModal } from '../components/ReportSummaryModal';
import { RestoreIdentityButton } from '../components/RestoreIdentityButton';
import { useModalA11y, isMobileViewport } from '../lib/useModalA11y';
import {
  LayoutDashboard,
  BarChart3,
  GraduationCap,
  LogOut,
  Menu,
  X,
  FileText,
  Loader2,
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  /** impersonation 중일 때만 채워진다(전환 전 지점장/관리자 신원). */
  originalUser?: { id: string; name: string; role: string } | null;
}

interface Child {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  attemptCount: number;
}

interface ChildAttempt {
  attemptId: string;
  examTitle: string;
  examSubject: string;
  score: number | null;
  maxScore: number | null;
  grade: number | null;
  submittedAt: string | null;
}

type MenuSection = 'dashboard' | 'results';

// 등급 뱃지는 기능 계층만 사용한다 (DESIGN.md 2.4 / 5.3)
const gradeBadgeClass = (grade?: number | null): string => {
  if (!grade) return 'border-line bg-surface-subtle text-ink-secondary';
  if (grade <= 2) return 'border-fn-success-border bg-fn-success-surface text-fn-success';
  if (grade <= 4) return 'border-fn-info-border bg-fn-info-surface text-fn-info';
  if (grade <= 6) return 'border-line bg-surface-subtle text-ink-secondary';
  return 'border-fn-warning-border bg-fn-warning-surface text-fn-warning';
};

export default function ParentDashboard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<MenuSection>('dashboard');
  // 데스크톱은 열림, 모바일은 닫힘으로 시작한다.
  // true 로 고정하면 390px 진입 시 드로어가 첫 화면을 덮는다.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches
  );
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [openingReportFor, setOpeningReportFor] = useState<string | null>(null);
  const [summaryReportId, setSummaryReportId] = useState<string | null>(null);

  const drawerRef = useModalA11y<HTMLElement>({
    active: sidebarOpen && isMobileViewport(),
    onClose: () => setSidebarOpen(false),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const {
    data: children,
    isLoading: childrenLoading,
    isError: childrenError,
    refetch: refetchChildren,
  } = useQuery({
    queryKey: ['parent', 'children'],
    queryFn: async () => {
      const res = await api.get('/parents/me/children');
      return res.data.data as Child[];
    },
  });

  const childList = children || [];
  // 자녀가 하나뿐이면 따로 고르게 하지 않는다
  const activeChildId = selectedChildId ?? (childList.length === 1 ? childList[0].id : null);
  const activeChild = childList.find((c) => c.id === activeChildId) || null;

  const { data: attempts, isLoading: attemptsLoading } = useQuery({
    queryKey: ['parent', 'attempts', activeChildId],
    queryFn: async () => {
      const res = await api.get(`/parents/me/children/${activeChildId}/attempts`);
      return res.data.data as ChildAttempt[];
    },
    enabled: !!activeChildId,
  });

  const attemptList = attempts || [];

  // 최고 등급(숫자가 작을수록 우수) 1건만 브라스로 강조한다 (DESIGN.md 1.3)
  const bestAttemptId = (() => {
    const graded = attemptList.filter((a) => typeof a.grade === 'number');
    if (graded.length === 0) return null;
    return graded.reduce((best, a) => (a.grade! < best.grade! ? a : best), graded[0]).attemptId;
  })();

  // 보고서 열람.
  // 생성 전이면 서버 큐에 적재하고 완료까지 폴링한다(reportClient).
  // 모바일에서는 8쪽 지면 대신 요약 뷰를 먼저 띄운다.
  const openReport = async (attemptId: string) => {
    setOpeningReportFor(attemptId);
    // await 이후의 window.open 은 사용자 제스처와 분리돼 차단된다. 창은 지금 잡아 둔다.
    const win = prefersSummaryView() ? null : openReportWindowSync();
    try {
      const ref = await ensureReport(attemptId, (stage) => {
        if (stage === 'generating') {
          toast.info('보고서를 생성하는 중입니다...', 'AI 분석에 시간이 걸릴 수 있습니다.');
        }
      });

      if (prefersSummaryView()) {
        setSummaryReportId(ref.reportId);
      } else {
        await openFullReport(ref, win);
      }
    } catch (error: any) {
      win?.close();
      toast.error(error.response?.data?.message || error.message || '보고서를 불러오지 못했습니다.');
    } finally {
      setOpeningReportFor(null);
    }
  };

  const menuItems = [
    { id: 'dashboard' as MenuSection, label: '대시보드', icon: LayoutDashboard },
    { id: 'results' as MenuSection, label: '자녀 성적', icon: BarChart3 },
  ];

  const selectChild = (childId: string) => {
    setSelectedChildId(childId);
    setActiveSection('results');
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-sunken">
      {/* 모바일에서는 오버레이 드로어 (DESIGN.md 7.2) */}
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
        {/*
          로고 칩. 이 화면의 그린 1곳째. 아이콘 색은 --accent 와 함께 뒤집히는
          action-text 를 쓴다 (라이트 흰 글자 3.30:1 / 다크 slate-900 10.3:1).
        */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent">
            <GraduationCap className="h-5 w-5 text-action-text" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">학부모</p>
            <p className="truncate text-xs text-ink-secondary">{user.name}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                aria-current={active ? 'page' : undefined}
                /*
                  그린 2곳째: 활성 메뉴의 좌측 강조 바 (세로 내비에서 밑줄의 대응물).
                  색 단독 표기가 아니다 - 굵기와 면이 함께 바뀌고 aria-current 가 남는다 (12.2).
                */
                className={`flex w-full items-center gap-3 border-l-2 rounded-md px-3 py-2.5 text-sm transition-colors duration-150 ease-out ${
                  active
                    ? 'border-accent bg-action-subtle font-semibold text-ink'
                    : 'border-transparent font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-line p-3">
          <RestoreIdentityButton
            originalUser={user.originalUser}
            className="w-full justify-start"
          />
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="z-10 border-b border-line bg-surface">
          <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="h-11 w-11 flex-shrink-0 p-0"
                aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
              >
                {sidebarOpen ? (
                  <X className="h-5 w-5" strokeWidth={1.5} />
                ) : (
                  <Menu className="h-5 w-5" strokeWidth={1.5} />
                )}
              </Button>
              <div className="min-w-0">
                {/* 이 화면의 유일한 h1. 상단 바 제목이 곧 페이지 제목이다. */}
                <h1 className="truncate text-xl font-semibold tracking-[-0.015em] text-ink">
                  {activeSection === 'dashboard' ? '대시보드' : '자녀 성적'}
                </h1>
                <p className="truncate text-xs text-ink-tertiary">{user.name}님 환영합니다</p>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {activeSection === 'dashboard' && (
            <Card>
              <CardHeader>
                <CardTitle>자녀 목록</CardTitle>
              </CardHeader>
              <CardContent>
                {childrenLoading ? (
                  <p className="py-8 text-center text-sm text-ink-secondary">불러오는 중입니다.</p>
                ) : childrenError ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-semibold text-fn-error">불러오지 못했습니다</p>
                    <button
                      type="button"
                      onClick={() => refetchChildren()}
                      className="mt-2 text-xs font-semibold text-ink-secondary underline underline-offset-2 hover:text-ink"
                    >
                      재시도
                    </button>
                  </div>
                ) : childList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-secondary">
                    연결된 자녀가 없습니다. 지점에 문의해주세요.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {childList.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => selectChild(child.id)}
                        className="rounded-md border border-line bg-surface p-4 text-left transition-colors duration-150 ease-out hover:border-line-strong hover:bg-surface-subtle active:scale-[0.99]"
                      >
                        <p className="text-base font-semibold text-ink">{child.name}</p>
                        <p className="mt-1 text-sm text-ink-secondary">
                          {child.school || '학교 미지정'} · {child.grade || '학년 미지정'}
                        </p>
                        <p className="mt-3 text-sm text-ink-tertiary">
                          응시 {child.attemptCount}회
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'results' && (
            <div className="space-y-4">
              {childList.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {childList.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChildId(child.id)}
                      aria-pressed={activeChildId === child.id}
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ease-out ${
                        activeChildId === child.id
                          ? 'border-line-strong bg-surface-subtle text-ink'
                          : 'border-line bg-surface text-ink-secondary hover:bg-surface-subtle'
                      }`}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>
                    {activeChild ? `${activeChild.name} 성적` : '자녀 성적'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!activeChildId ? (
                    <p className="py-8 text-center text-sm text-ink-secondary">
                      자녀를 선택하면 성적이 표시됩니다.
                    </p>
                  ) : attemptsLoading ? (
                    <p className="py-8 text-center text-sm text-ink-secondary">불러오는 중입니다.</p>
                  ) : attemptList.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-secondary">
                      아직 완료된 시험이 없습니다.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-ink-secondary">
                            <th className="px-4 py-3 font-semibold">시험명</th>
                            <th className="px-4 py-3 text-center font-semibold">점수</th>
                            <th className="px-4 py-3 text-center font-semibold">등급</th>
                            <th className="px-4 py-3 font-semibold">제출일</th>
                            <th className="px-4 py-3 text-center font-semibold">보고서</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-subtle">
                          {attemptList.map((a) => (
                            <tr key={a.attemptId} className="hover:bg-surface-subtle">
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    a.attemptId === bestAttemptId
                                      ? 'font-semibold text-accent-strong'
                                      : 'text-ink'
                                  }
                                >
                                  {a.examTitle}
                                </span>
                                <span className="block text-xs text-ink-tertiary">
                                  {a.examSubject}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-ink">
                                {a.score ?? '-'} / {a.maxScore ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block rounded-sm border px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(a.grade)}`}
                                >
                                  {a.grade ? `${a.grade}등급` : '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-ink-secondary">
                                {a.submittedAt
                                  ? new Date(a.submittedAt).toLocaleDateString('ko-KR')
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => openReport(a.attemptId)}
                                  disabled={openingReportFor === a.attemptId}
                                  className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-surface-subtle active:scale-[0.98] disabled:opacity-60"
                                >
                                  {openingReportFor === a.attemptId ? (
                                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                                  ) : (
                                    <FileText className="h-4 w-4" strokeWidth={1.5} />
                                  )}
                                  보고서 보기
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

      {summaryReportId && (
        <ReportSummaryModal reportId={summaryReportId} onClose={() => setSummaryReportId(null)} />
      )}
    </div>
  );
}
