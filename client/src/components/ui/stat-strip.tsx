/*
  KPI 스트립.

  통계 4개를 카드 4장으로 흩어 놓으면 각 숫자가 독립된 대상처럼 보인다.
  실제로는 한 화면의 상태를 함께 읽어야 하는 한 벌이므로, 카드를 나누지 않고
  하나의 컨테이너 안에서 1px 구분선으로만 가른다 (DESIGN.md 11.9).

  구분선 처리:
    그리드에서 divide-* 는 1열 -> 2열 -> 4열로 접힐 때 선이 어긋난다.
    (divide-x 는 열이 몇 개든 마지막 자식만 빼고 전부 왼쪽 선을 그린다)
    그래서 셀이 스스로 위/왼쪽 선을 갖게 하고, 브레이크포인트마다
    "그 줄의 첫 칸"에 해당하는 선만 지운다.

      기본(1열)  세로로 쌓임        -> 첫 칸 빼고 전부 위 선
      md(2열)    2 x 2             -> 2번 칸의 위 선을 지우고, 짝수 칸에 왼쪽 선
      lg(4열)    1 x 4             -> 2번 칸부터 위 선을 지우고 왼쪽 선

  이 조합은 칸이 4개일 때를 전제로 한다. 대시보드 KPI 는 4개가 상한이며
  (DESIGN.md 5.2), 5개가 필요하다고 느껴지면 화면의 초점이 흐린 것이다.
*/
const CELL_DIVIDER =
  'border-t border-line first:border-t-0 ' +
  'md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(even)]:border-l ' +
  'lg:[&:nth-child(n+2)]:border-t-0 lg:[&:nth-child(n+2)]:border-l';

export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

export function StatStripItem({
  label,
  footnote,
  onClick,
  isActive,
  children,
}: {
  /** 상단 라벨. 예: "총 학생 수" */
  label: string;
  /** 하단 각주 한 줄. 없으면 자리를 만들지 않는다 */
  footnote?: string;
  /** 있을 때만 셀이 눌린다 */
  onClick?: () => void;
  /** 눌린 상태. 색이 아니라 면으로 표시한다 (DESIGN.md 8.2 확대 금지) */
  isActive?: boolean;
  /** 숫자 자리. 호출부에서 <StatValue/> 를 넣는다 */
  children: React.ReactNode;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">{label}</p>
      <div className="mt-3">{children}</div>
      {footnote && <p className="mt-3 text-xs text-ink-secondary">{footnote}</p>}
    </>
  );

  // 눌리지 않는 것에 버튼 시맨틱을 주지 않는다. 스크린리더가 "버튼"이라고
  // 읽어 놓고 아무 일도 일어나지 않는 것이 가장 나쁘다.
  if (!onClick) {
    return <div className={`p-5 ${CELL_DIVIDER}`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!isActive}
      className={`w-full cursor-pointer p-5 text-left transition-colors duration-150 ease-out hover:bg-surface-subtle ${
        isActive ? 'bg-surface-subtle' : ''
      } ${CELL_DIVIDER}`}
    >
      {body}
    </button>
  );
}
