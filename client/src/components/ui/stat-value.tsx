import { RefreshCw } from 'lucide-react';

/*
  통계 카드의 숫자 자리.

  로딩 중에 0 을 그려 놓으면 "학생이 0명"과 구분되지 않는다. 실제로 값이
  없는 것과 아직 못 받아온 것은 다른 상태이므로 화면에서도 달라야 한다.
    로딩 → 스켈레톤 (DESIGN.md 8.3 예외: 로딩 표시는 허용)
    실패 → 사유 + 재시도
    성공 → 숫자
*/
const DEFAULT_VALUE_CLASS = 'text-4xl font-bold leading-none tracking-[-0.03em] text-ink';

export function StatValue({
  value,
  isLoading,
  isError,
  onRetry,
  suffix,
  /** 숫자에 적용할 타이포. 카드마다 크기가 다르므로 기본값을 덮어쓸 수 있게 둔다. */
  valueClassName = DEFAULT_VALUE_CLASS,
  /** 스켈레톤 크기. 자리 이동이 최소가 되도록 숫자 크기에 맞춘다. */
  skeletonClassName = 'h-10 w-20',
}: {
  value: number | string | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  suffix?: string;
  valueClassName?: string;
  skeletonClassName?: string;
}) {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="불러오는 중"
        className={`animate-pulse rounded-sm bg-surface-subtle ${skeletonClassName}`}
      />
    );
  }

  if (isError) {
    return (
      <div>
        <p className="text-sm font-semibold text-fn-error">불러오지 못했습니다</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
          >
            <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
            재시도
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={valueClassName}>
      {value ?? 0}
      {suffix && <span className="ml-0.5 text-base font-semibold text-ink-secondary">{suffix}</span>}
    </div>
  );
}
