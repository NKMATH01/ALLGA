import { RefreshCw } from 'lucide-react';

/*
  목록·표·차트의 3상태 표시 (로딩 / 실패 / 빈).

  아직 못 받아온 것과 실제로 0건인 것은 다른 상태다. 로딩 중에 "…없습니다"
  같은 확정 문구를 그려 놓으면 학생은 배정이 취소된 줄 알고 화면을 닫는다.
  실패도 마찬가지로 조용히 빈 상태로 떨어지면 안 된다.
    로딩 → 스켈레톤 (DESIGN.md 8.3 예외: 로딩 표시는 허용)
    실패 → 사유 + 재시도
    성공 → 값, 값이 없으면 그때 비로소 빈 문구

  BranchDashboard 의 renderAttemptBoard 가 먼저 쓰던 분기를 그대로 옮겨 왔다.
  StatValue(stat-value.tsx)는 같은 규칙의 "숫자 한 칸" 판이다.
*/

/** 표 밖에서 목록 자리를 대신하는 스켈레톤. 행 높이는 실제 표의 한 줄에 맞춘다. */
export function ListLoading({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className={`space-y-2 py-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-sm bg-surface-subtle" />
      ))}
    </div>
  );
}

/** tbody 안에 그대로 넣는 스켈레톤 행. cols 는 그 표의 열 수. */
export function LoadingRows({ rows = 3, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-b border-line-subtle">
          <td colSpan={cols} className="px-3 py-2">
            <div
              role="status"
              aria-label={i === 0 ? '불러오는 중' : undefined}
              className="h-5 animate-pulse rounded-sm bg-surface-subtle"
            />
          </td>
        </tr>
      ))}
    </>
  );
}

/** 차트·카드 자리를 채우는 스켈레톤 블록. 높이는 호출부가 실제 지면에 맞춰 넘긴다. */
export function LoadingBlock({ className = 'h-40' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className={`animate-pulse rounded-lg bg-surface-subtle ${className}`}
    />
  );
}

/** 실패 안내 + 재시도. 조용히 빈 상태로 떨어지지 않게 사유를 남긴다. */
export function ErrorState({
  message = '불러오지 못했습니다',
  detail,
  onRetry,
  className = 'py-12',
}: {
  message?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`text-center ${className}`}>
      <p className="text-sm font-semibold text-fn-error">{message}</p>
      {detail && <p className="mt-1 text-xs text-ink-secondary">{detail}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-secondary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          재시도
        </button>
      )}
    </div>
  );
}

/** tbody 안에 그대로 넣는 실패 행. */
export function ErrorRow({
  cols,
  message,
  detail,
  onRetry,
}: {
  cols: number;
  message?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <tr>
      <td colSpan={cols} className="px-3">
        <ErrorState message={message} detail={detail} onRetry={onRetry} className="py-10" />
      </td>
    </tr>
  );
}
