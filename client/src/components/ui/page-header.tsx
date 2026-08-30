/*
  요약(대시보드) 화면의 제목 블록.

  관리 목록 화면은 11.2 대로 제목 없이 툴바로 시작한다. 좌측 내비가 이미
  어디인지 말하고 있기 때문이다. 반면 요약 화면은 한 화면 안에 성격이 다른
  덩어리(KPI / 보드 / 표)가 섞이므로, 그 묶음 전체가 무엇인지를 한 번 말해
  주어야 한다 (DESIGN.md 11.9).

  쓰면 안 되는 곳: 레이아웃이 이미 페이지 제목을 그리는 화면. 그 경우 11.9는
  이미 충족돼 있고, 여기에 하나를 더 얹으면 같은 자리를 두 번 말하는 지면
  낭비이자 한 페이지 <h1> 중복이 된다 (DESIGN.md 11.2).

  오버라인은 무채색이다. 관리 화면에 브라스는 0곳이며(1.2), 오버라인은
  성취가 아니라 위치 표시다.
*/
export function PageHeader({
  overline,
  title,
  description,
  actions,
}: {
  /** 작은 상단 라벨. 예: "지점 관리" */
  overline: string;
  title: string;
  /** 이 화면이 무엇인지 한 줄. 없으면 자리를 만들지 않는다 */
  description?: string;
  /** 우측 노드. 보기 전환 같은 화면 단위 컨트롤만 둔다 */
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-semibold tracking-[0.08em] text-ink-secondary">{overline}</p>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
