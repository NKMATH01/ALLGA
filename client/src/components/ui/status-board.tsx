/*
  상태 보드.

  칸반의 배치만 가져오고 끌어 옮기는 기능은 만들지 않는다. 여기서 칸을 가르는
  것은 사람의 판단이 아니라 응시 데이터(응시 여부 / 제출 여부 / 보고서 유무)이며,
  카드를 손으로 옮긴다는 것은 곧 성적 기록을 고친다는 뜻이 된다. 배치는
  레퍼런스에서 가져오되 조작 문법은 가져오지 않는다 (DESIGN.md 11.5, 11.9).

  색 규칙 (2.4):
    정상 귀결에는 색을 쓰지 않는다. 네 칸을 전부 물들이면 색이 상태를 알리는
    신호가 아니라 배경 장식이 된다. 손이 가야 하는 칸 하나만 warning 이고
    나머지는 무채색이다. 특히 미응시/미제출에 빨강을 쓰지 않는다 - 아직 안 친
    시험은 실패가 아니다.
*/
export type StatusTone = 'neutral' | 'warning';

const COLUMN_TONE: Record<StatusTone, string> = {
  neutral: 'border-line bg-surface-subtle',
  warning: 'border-fn-warning-border bg-fn-warning-surface',
};

/*
  카드 좌측 3px 바. 칸 색이 옅으므로 카드에서도 한 번 더 읽히게 한다.
  hover 쪽을 같은 값으로 한 번 더 적는 이유: 눌리는 카드의 hover 는
  테두리 전체 색을 바꾸므로, 그대로 두면 마우스를 올린 순간 좌측 바가
  사라진다. 상태 표시가 커서 위치에 따라 달라져서는 안 된다.
*/
const CARD_TONE: Record<StatusTone, string> = {
  neutral: 'border-l-line-strong hover:border-l-line-strong',
  warning: 'border-l-fn-warning hover:border-l-fn-warning',
};

export function StatusBoard({
  columns,
}: {
  columns: {
    key: string;
    label: string;
    tone: StatusTone;
    /** 이미 만들어진 카드 노드. 보드는 배치만 맡고 내용은 호출부가 정한다 */
    cards: React.ReactNode[];
    /** 카드가 없을 때 문구. 0 을 숫자로 그리지 말고 말로 적는다 */
    emptyText: string;
  }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => (
        <div key={column.key} className={`rounded-lg border p-3 ${COLUMN_TONE[column.tone]}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{column.label}</span>
            <span className="text-sm font-semibold text-ink-secondary">{column.cards.length}</span>
          </div>
          {column.cards.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-tertiary">{column.emptyText}</p>
          ) : (
            <div className="mt-3 space-y-2">{column.cards}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function StatusBoardCard({
  chip,
  tone,
  title,
  meta,
  footnote,
  onClick,
}: {
  /** 좌상단 작은 라벨. 예: 학년 */
  chip?: string;
  tone: StatusTone;
  /** 학생 이름 */
  title: string;
  /** 가운데 한 줄. 예: "61 / 100 · 4등급" */
  meta: string;
  /** 아래 보조 한 줄. 예: 제출일시 */
  footnote?: string;
  /** 있을 때만 카드가 눌린다 */
  onClick?: () => void;
}) {
  const body = (
    <>
      {chip && <p className="text-xs font-semibold tracking-[0.08em] text-ink-tertiary">{chip}</p>}
      <p className={`text-sm font-semibold text-ink ${chip ? 'mt-1' : ''}`}>{title}</p>
      <p className="mt-1 text-xs tabular-nums text-ink-secondary">{meta}</p>
      {footnote && <p className="mt-1 text-xs text-ink-tertiary">{footnote}</p>}
    </>
  );

  const shell = `rounded-md border border-line border-l-[3px] bg-surface p-3 ${CARD_TONE[tone]}`;

  // 눌리지 않는 카드에 버튼 시맨틱을 주지 않는다.
  if (!onClick) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left transition-colors duration-150 ease-out hover:border-line-strong ${shell}`}
    >
      {body}
    </button>
  );
}
