import { useEffect, useState } from 'react';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import { fetchReportSummary, openFullReport, type ReportSummary } from '../lib/reportClient';
import { toast } from './ui/toast';
import { useModalA11y } from '../lib/useModalA11y';

/*
  모바일 보고서 요약 뷰.
  8쪽 A4 지면을 작은 화면에서 그대로 읽게 하는 대신, 건강검진 결과지의
  앞장(판정 → 이상 항목 → 소견 → 권고)만 추려 보여준다.
  전체 지면이 필요하면 "전체 보고서 열기"로 넘어간다.

  색은 DESIGN.md 기능 계층만 쓴다. 브라스는 판정 카드의 등급 1곳만 (1.3 규칙).
*/

export function ReportSummaryModal({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const dialogRef = useModalA11y<HTMLDivElement>({ active: true, onClose });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchReportSummary(reportId);
        if (!cancelled) setSummary(s);
      } catch (error: any) {
        if (!cancelled) toast.error(error.response?.data?.message || '요약을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const handleOpenFull = async () => {
    setOpening(true);
    try {
      await openFullReport({ reportId });
    } catch (error: any) {
      toast.error(error.message || '보고서를 열지 못했습니다.');
    } finally {
      setOpening(false);
    }
  };

  const v = summary?.verdict;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="검사 결과 요약"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-lg border border-line bg-surface sm:rounded-lg"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">검사 결과 요약</h2>
            {v?.examDate && <p className="truncate text-xs text-ink-tertiary">{v.examDate}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 rounded-md p-2 text-ink-secondary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-ink"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-ink-secondary">불러오는 중입니다.</p>
          ) : !summary ? (
            <p className="py-10 text-center text-sm text-ink-secondary">요약을 표시할 수 없습니다.</p>
          ) : (
            <div className="space-y-5">
              {/* ① 판정 */}
              <section className="rounded-md border border-line bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary">판정</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-accent-strong">
                    {v?.grade ? `${v.grade}등급` : '-'}
                  </span>
                  <span className="text-sm text-ink-secondary">
                    {v?.rawScore ?? '-'} / {v?.rawScoreMax ?? '-'}점
                  </span>
                </div>
                {v?.overallReference?.available && (
                  <p className="mt-2 text-xs text-ink-tertiary">
                    전체 정답률 참고치 {v.overallReference.low}~{v.overallReference.high}%
                    {typeof v.percentile === 'number' && ` · 백분위 ${v.percentile}`}
                  </p>
                )}
              </section>

              {/* ② 이상 항목 */}
              <section>
                <p className="mb-2 text-xs font-semibold text-ink-secondary">
                  참고치를 벗어난 항목 {summary.abnormal.length > 0 && `(${summary.abnormal.length})`}
                </p>
                {summary.abnormal.length === 0 ? (
                  <p className="rounded-md border border-line bg-surface p-3 text-sm text-ink-secondary">
                    참고치를 벗어난 항목이 없습니다.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.abnormal.map((item) => (
                      <span
                        key={`${item.kind}-${item.name}`}
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-semibold ${
                          item.direction === 'below'
                            ? 'border-fn-warning-border bg-fn-warning-surface text-fn-warning'
                            : 'border-fn-success-border bg-fn-success-surface text-fn-success'
                        }`}
                      >
                        {item.name}
                        <span className="font-normal">
                          {item.studentRate}% ({item.direction === 'below' ? '미달' : '상회'} · 참고치{' '}
                          {item.low}~{item.high}%)
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* ③ 핵심 소견 */}
              {summary.keyFinding && (
                <section>
                  <p className="mb-2 text-xs font-semibold text-ink-secondary">핵심 소견</p>
                  <p className="whitespace-pre-line rounded-md border border-line bg-surface p-3 text-sm leading-relaxed text-ink">
                    {summary.keyFinding}
                  </p>
                </section>
              )}

              {/* ④ 권고 */}
              {summary.recommendations.length > 0 && (
                <section>
                  <p className="mb-2 text-xs font-semibold text-ink-secondary">권고</p>
                  <ol className="space-y-2">
                    {summary.recommendations.map((r, i) => (
                      <li key={i} className="rounded-md border border-line bg-surface p-3">
                        <p className="text-sm font-semibold text-ink">
                          {i + 1}. {r.title}
                        </p>
                        {r.detail && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-secondary">
                            {r.detail}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-line p-4">
          <button
            type="button"
            onClick={handleOpenFull}
            disabled={opening}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-action text-sm font-semibold text-action-text transition-colors duration-150 ease-out hover:bg-action-hover active:scale-[0.99] disabled:opacity-60"
          >
            {opening ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
            )}
            전체 보고서 열기
          </button>
        </div>
      </div>
    </div>
  );
}
