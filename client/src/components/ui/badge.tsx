import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/*
 * DESIGN.md 5.3 뱃지 문법
 *   구조는 항상 면(-surface) + 1px 테두리(-border) + 글자(기본색) 3종 세트.
 *   원색 배경에 흰 글자를 쓰지 않는다. 반경은 pill 이 아니라 --radius-sm.
 *   등급 뱃지는 기능 계층만 사용한다 (DESIGN.md 2.4).
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold transition-colors duration-150 ease-out",
  {
    variants: {
      variant: {
        default:
          "border-line bg-surface-subtle text-ink",
        secondary:
          "border-line-subtle bg-surface-subtle text-ink-secondary",
        destructive:
          "border-fn-error-border bg-fn-error-surface text-fn-error",
        outline: "border-line bg-transparent text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
