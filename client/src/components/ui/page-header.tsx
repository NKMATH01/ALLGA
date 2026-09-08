/* One clear page title; overline remains accepted for compatibility with callers. */
export function PageHeader({
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
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="page-heading">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}
