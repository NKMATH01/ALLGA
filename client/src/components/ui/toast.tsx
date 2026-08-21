import { useEffect, useState } from 'react';

/*
  DESIGN.md 5.7 토스트
  - 우측 하단, 폭 360px, --surface-raised, 1px --border, --shadow-md
  - 상태는 왼쪽 3px 세로 규칙선으로만 표현한다. 패널 전체를 상태색으로 칠하지 않는다.
  - 성공 3초 자동 소멸, 오류는 자동으로 사라지지 않고 닫기 버튼을 둔다.

  훅이 아니라 모듈 수준 스토어로 둔 이유: alert() 호출부가 중첩 컴포넌트
  (ExamTakingModal, WrongQuestionsModal 등) 안에 흩어져 있어, 훅 방식이면
  컴포넌트마다 useToast() 배선을 새로 넣어야 한다. import 한 줄로 끝나도록 한다.
*/

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  description?: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 1;

const AUTO_DISMISS_MS = 3000;

function emit() {
  // 새 배열로 통지해야 구독자가 변경을 감지한다
  const snapshot = [...toasts];
  listeners.forEach((l) => l(snapshot));
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(variant: ToastVariant, message: string, description?: string) {
  const id = nextId++;
  toasts = [...toasts, { id, message, description, variant }];
  emit();

  // 오류는 사용자가 직접 닫을 때까지 남긴다 (DESIGN.md 5.7)
  if (variant !== 'error') {
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }

  return id;
}

/** 기존 호출 형태(useToast().toast({title, ...}))와 신규 toast.success(...) 양쪽을 지원한다. */
type LegacyArgs = { title: string; description?: string; variant?: 'default' | 'destructive' };

function toastFn(input: string | LegacyArgs, description?: string) {
  if (typeof input === 'string') {
    return push('info', input, description);
  }
  const variant: ToastVariant = input.variant === 'destructive' ? 'error' : 'info';
  return push(variant, input.title, input.description);
}

export const toast = Object.assign(toastFn, {
  success: (message: string, description?: string) => push('success', message, description),
  error: (message: string, description?: string) => push('error', message, description),
  info: (message: string, description?: string) => push('info', message, description),
  dismiss: dismissToast,
});

/** 기존 export 시그니처 유지 */
export const useToast = () => ({ toast });

const RULE_COLOR: Record<ToastVariant, string> = {
  success: 'bg-fn-success',
  error: 'bg-fn-error',
  info: 'bg-fn-info',
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-fn-success',
  error: 'text-fn-error',
  info: 'text-fn-info',
};

const ROLE_LABEL: Record<ToastVariant, string> = {
  success: '성공',
  error: '오류',
  info: '알림',
};

export const Toaster = () => {
  const [items, setItems] = useState<ToastItem[]>(toasts);

  useEffect(() => {
    const listener: Listener = (next) => setItems(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      // 오류는 assertive 가 맞지만 영역 하나로 합쳐야 순서가 보존되므로 polite 로 통일한다
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex overflow-hidden rounded-md border border-line bg-surface-raised shadow-md"
        >
          {/* 상태는 왼쪽 3px 규칙선으로만 (DESIGN.md 5.7) */}
          <div className={`w-[3px] flex-shrink-0 ${RULE_COLOR[item.variant]}`} aria-hidden="true" />

          <div className="flex flex-1 items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                <span className="sr-only">{ROLE_LABEL[item.variant]}: </span>
                {item.message}
              </p>
              {item.description && (
                <p className="mt-1 text-xs text-ink-secondary">{item.description}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="알림 닫기"
              className={`-m-1 flex-shrink-0 rounded-sm p-1 text-ink-tertiary transition-colors duration-150 ease-out hover:bg-surface-subtle hover:${ICON_COLOR[item.variant]}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
