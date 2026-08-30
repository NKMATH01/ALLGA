/*
  세그먼트 토글 (알약).

  화면이 지금 어떤 보기 상태인지를 늘 드러내 놓는 컨트롤이다. 드롭다운과 달리
  선택지가 전부 보이므로, 두세 개짜리 보기 전환에는 이쪽이 맞다.

  상태를 색만으로 알리지 않는다 (DESIGN.md 12.2).
  선택된 칸은 면이 반전되어(surface-inverse) 대비로 읽히고, 동시에
  aria-pressed 로도 읽힌다. 둘 중 하나만 있으면 색각 이상이나 스크린리더에서
  어느 쪽이 켜져 있는지 알 수 없다.
*/
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ease-out ${
              selected
                ? 'bg-surface-inverse text-ink-inverse'
                : 'border border-line text-ink-secondary hover:border-line-strong'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
