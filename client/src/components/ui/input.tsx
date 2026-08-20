import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/*
 * DESIGN.md 5.5 폼 입력
 *   높이 40px, 테두리 --border-strong, 반경 --radius-sm.
 *   placeholder 는 --text-tertiary 보다 옅게 두지 않는다.
 *   포커스 표시는 index.css 의 전역 :focus-visible 아웃라인이 담당한다.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink transition-colors duration-150 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-tertiary hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
