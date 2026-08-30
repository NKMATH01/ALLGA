/*
  숫자 페이저 (DESIGN.md 11.2).

  50행을 넘길 수 있는 목록에 붙인다. 기본은 클라이언트 페이지네이션 20행/쪽이고,
  목록 하단 중앙에 놓는다. 서버 호출을 늘리지 않고 이미 받아 놓은 배열만 자른다.

  한 쪽뿐이면 아무것도 그리지 않는다. 누를 곳이 없는 컨트롤은 정보가 아니라
  지면 소음이고, 목록이 짧을 때마다 빈 페이저가 따라 붙으면 화면이 시끄러워진다.

  쪽이 많아도 숫자를 전부 늘어놓지 않는다. 첫 쪽, 마지막 쪽, 현재 쪽과 그 앞뒤
  한 쪽만 남기고 사이는 줄임표로 접는다. 40쪽짜리 목록에서 40개의 버튼은
  이동 수단이 아니라 또 하나의 읽을거리가 된다.

  이전/다음은 끝에 닿아도 숨기지 않고 비활성으로 둔다. 사라지면 남은 버튼들이
  그 자리를 메우며 밀려서, 연속으로 누르던 손이 매번 다른 곳을 찍게 된다.

  상태를 색만으로 알리지 않는다 (DESIGN.md 12.2). 현재 쪽은 면이 반전되어
  대비로 읽히고 동시에 aria-current="page" 로도 읽힌다.
*/
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** 11.2 가 정한 기본 쪽 크기 */
export const PAGE_SIZE = 20;

/**
 * 목록을 쪽 단위로 자른다. 훅이 아니라 순수 함수다.
 *
 * 페이지 상태는 목록마다 독립이어야 하므로 쪽 번호는 호출하는 화면이 각자
 * useState 로 들고, 이 함수는 자르기만 한다. 조건부로 호출되는 렌더 헬퍼
 * 안에서도 안전하게 쓰려면 훅이 아니어야 한다.
 *
 * 넘겨받는 `items` 는 **정렬·필터를 이미 전부 적용한 배열**이어야 한다.
 * 잘라낸 뒤 정렬하면 지금 쪽 안에서만 순서가 맞고 목록 전체는 어긋난다.
 *
 * 마지막 쪽을 보던 중에 항목이 줄어 그 쪽이 사라지면 존재하는 마지막 쪽으로
 * 끌어내린다. 그대로 두면 빈 목록이 그려진다.
 */
export function paginate<T>(items: T[], page: number, pageSize: number = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return {
    page: current,
    totalPages,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize),
  };
}

/**
 * 그릴 쪽 번호 목록. 'gap' 은 줄임표 자리다.
 * 7쪽 이하면 접지 않는다. 접어서 아끼는 자리보다 줄임표가 만드는 혼란이 크다.
 */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const shown = new Set<number>([1, totalPages]);
  for (let n = page - 1; n <= page + 1; n += 1) {
    if (n >= 1 && n <= totalPages) shown.add(n);
  }
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of [...shown].sort((a, b) => a - b)) {
    if (prev && n - prev > 1) out.push('gap');
    out.push(n);
    prev = n;
  }
  return out;
}

const STEP_BASE =
  'flex h-8 w-8 items-center justify-center rounded-sm border border-line transition-colors duration-150 ease-out';

export function Pagination({
  page,
  totalItems,
  pageSize = PAGE_SIZE,
  onPageChange,
}: {
  /** 1부터 세는 현재 쪽 */
  page: number;
  /** 필터를 적용한 뒤의 전체 항목 수. 지금 쪽의 항목 수가 아니다. */
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // 한 쪽뿐이면 페이저 자체를 그리지 않는다.
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const atFirst = current === 1;
  const atLast = current === totalPages;

  return (
    <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(current - 1)}
        disabled={atFirst}
        aria-disabled={atFirst}
        aria-label="이전 쪽"
        className={`${STEP_BASE} ${
          atFirst
            ? 'cursor-not-allowed text-ink-tertiary'
            : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
        }`}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {pageWindow(current, totalPages).map((slot, i) =>
        slot === 'gap' ? (
          // 줄임표는 누를 수 없는 표시이므로 스크린리더에서 숨긴다.
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="flex h-8 w-6 items-center justify-center text-sm text-ink-tertiary"
          >
            ...
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            onClick={() => onPageChange(slot)}
            aria-current={slot === current ? 'page' : undefined}
            aria-label={`${slot}쪽`}
            className={`h-8 min-w-8 rounded-sm px-2 text-sm tabular-nums transition-colors duration-150 ease-out ${
              slot === current
                ? 'bg-surface-inverse font-semibold text-ink-inverse'
                : 'border border-line text-ink-secondary hover:bg-surface-subtle hover:text-ink'
            }`}
          >
            {slot}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(current + 1)}
        disabled={atLast}
        aria-disabled={atLast}
        aria-label="다음 쪽"
        className={`${STEP_BASE} ${
          atLast
            ? 'cursor-not-allowed text-ink-tertiary'
            : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
        }`}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </nav>
  );
}
