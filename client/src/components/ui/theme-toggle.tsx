import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/useTheme';

/*
  DESIGN.md 6장 야간 모드 토글.
  사용자가 명시적으로 고르는 유일한 진입점이며, 색은 토큰만 참조한다.
  `tone="inverse"` 는 네이비 사이드바/헤더 위에 얹힐 때 사용한다.
*/
export function ThemeToggle({ tone = 'default' }: { tone?: 'default' | 'inverse' }) {
  const { isDark, toggleTheme } = useTheme();

  const base =
    'inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors duration-150 ease-out active:scale-[0.98]';

  const toneClass =
    tone === 'inverse'
      ? 'border-line-inverse bg-transparent text-ink-inverse hover:bg-line-inverse'
      : 'border-line bg-surface text-ink-secondary hover:bg-surface-subtle hover:text-ink';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? '주간 모드로 전환' : '야간 모드로 전환'}
      aria-pressed={isDark}
      title={isDark ? '주간 모드로 전환' : '야간 모드로 전환'}
      className={`${base} ${toneClass}`}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
