import { useEffect, useRef } from 'react';

/*
  커스텀 모달·드로어용 접근성 훅.

  Radix Dialog 는 이 동작을 이미 제공하므로 Radix 기반 모달에는 쓰지 않는다.
  프로젝트에는 `fixed inset-0` 로 직접 만든 모달이 여럿 있어, 그쪽만 보완한다.

  하는 일
    ① body 스크롤 잠금 (배경이 따라 스크롤되지 않게)
    ② 열릴 때 모달 안 첫 포커서블로 포커스 이동
    ③ Tab / Shift+Tab 을 모달 안에 가둠
    ④ Esc → onClose 호출
    ⑤ 닫힐 때 열기 직전에 포커스가 있던 요소로 복원

  주의: onClose 는 "그 모달의 기존 닫기 핸들러"를 그대로 넘겨야 한다.
  닫기 전에 저장하는 흐름(응시 모달의 handleCloseLater 등)을 우회하면
  Esc 로 닫을 때 답안이 저장되지 않는다.
*/

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  active,
  onClose,
}: {
  /** 모달이 열려 있고 트랩을 걸어야 하는 상태인지 */
  active: boolean;
  /** Esc 로 닫을 때 호출. 저장 흐름이 있으면 그 핸들러를 넘긴다. */
  onClose?: () => void;
}) {
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<Element | null>(null);
  // onClose 가 매 렌더 새로 만들어져도 리스너를 다시 붙이지 않도록 ref 로 보관
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    // ⑤ 복원 대상 저장
    triggerRef.current = document.activeElement;

    // ① 배경 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // ② 첫 포커서블로 이동 (없으면 컨테이너 자체)
    const focusFirst = () => {
      const el = containerRef.current;
      if (!el) return;
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      if (first) {
        first.focus();
      } else {
        el.setAttribute('tabindex', '-1');
        el.focus();
      }
    };
    // 렌더 직후 DOM 이 붙은 뒤 실행
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el) return;

      // ④ Esc
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      // ③ Tab 트랩
      if (e.key !== 'Tab') return;

      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (!current || !el.contains(current)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;

      const trigger = triggerRef.current as HTMLElement | null;
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [active]);

  return containerRef;
}

/** 드로어는 모바일에서만 트랩을 건다. 데스크톱에서는 사이드바가 본문과 나란히 있다. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}
