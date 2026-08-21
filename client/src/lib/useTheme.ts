import { useEffect, useState } from 'react';

/*
  DESIGN.md 6.1 야간 모드 전략
  - documentElement 에 data-theme 을 붙여 토큰만 교체한다.
  - 사용자가 명시적으로 고른 모드가 유지되어야 하므로 선택값은 localStorage 에 저장한다.
  - prefers-color-scheme 은 "저장된 선택이 아직 없을 때의 최초 기본값"으로만 1회 읽는다.
    OS 설정이 바뀌어도 실행 중에 자동 전환하지 않는다(미디어쿼리 구독 없음).
*/

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'olga-theme';

function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // 프라이빗 모드 등에서 localStorage 접근이 막힐 수 있다
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // tailwind darkMode: ['class', '[data-theme="dark"]'] 와 index.css 의 .dark 선택자 호환
  root.classList.toggle('dark', theme === 'dark');
}

/** 초기 테마: 저장된 선택 > 시스템 선호 */
export function getInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

/**
 * 앱 전역에서 테마를 공유하기 위한 간단한 구독 스토어.
 * 여러 대시보드가 각자 useTheme() 을 불러도 상태가 어긋나지 않게 한다.
 */
let currentTheme: Theme = 'light';
let initialized = false;
let listeners: Array<(t: Theme) => void> = [];

function setThemeGlobal(theme: Theme) {
  currentTheme = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장 실패해도 현재 세션 동작에는 영향 없음
  }
  listeners.forEach((l) => l(theme));
}

/** main.tsx 등에서 1회 호출. 첫 페인트 전에 테마를 확정한다. */
export function initTheme() {
  if (initialized) return currentTheme;
  initialized = true;
  currentTheme = getInitialTheme();
  applyTheme(currentTheme);
  return currentTheme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (!initialized) initTheme();
    return currentTheme;
  });

  useEffect(() => {
    const listener = (t: Theme) => setTheme(t);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme: setThemeGlobal,
    toggleTheme: () => setThemeGlobal(currentTheme === 'dark' ? 'light' : 'dark'),
  };
}
