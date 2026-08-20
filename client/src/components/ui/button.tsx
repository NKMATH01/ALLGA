import * as React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

/*
 * DESIGN.md 5.1 버튼 문법
 *   default     주 버튼   네이비 면 + 흰 글자. 화면당 1개 원칙
 *   destructive 위험 버튼 빨간 배경이 아니라 테두리로 경고 (실수 유발 방지)
 *   outline     보조 버튼
 *   secondary   보조 면 버튼
 *   ghost       조용한 버튼. 표 안 인라인 동작
 * 크기는 40 / 32 / 48px 세 가지만. 포커스 링은 index.css 의 전역 :focus-visible 이 담당한다.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold transition-colors duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-action text-action-text hover:bg-action-hover': variant === 'default',
            'border border-fn-error-border bg-surface text-fn-error hover:bg-fn-error-surface':
              variant === 'destructive',
            'border border-line-strong bg-surface text-ink hover:bg-surface-subtle':
              variant === 'outline',
            'bg-action-subtle text-ink hover:bg-action-subtle-hover': variant === 'secondary',
            'text-ink-secondary hover:bg-surface-subtle hover:text-ink': variant === 'ghost',
            'h-10 px-4': size === 'default',
            'h-8 px-3 text-[13px]': size === 'sm',
            'h-12 px-6': size === 'lg',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
