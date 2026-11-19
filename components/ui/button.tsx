import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "default" | "outline" | "inverse" | "inverseOutline"
type Size = "default" | "sm" | "icon"

const variants: Record<Variant, string> = {
  default: "bg-foreground text-background border-foreground hover:bg-[#2a2a2a]",
  outline: "bg-background text-foreground border-foreground hover:bg-[#f0f0f0]",
  inverse: "bg-white text-[#0a0a0a] border-white hover:bg-[#d9d9d9]",
  inverseOutline: "bg-[#0a0a0a] text-white border-white hover:bg-[#1f1f1f]",
}
const sizes: Record<Size, string> = {
  default: "min-h-12 px-5 text-[13px]",
  sm: "min-h-11 px-3.5 text-xs",
  icon: "size-11 p-0",
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function buttonClasses(variant: Variant = "default", size: Size = "default", className?: string) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border font-bold uppercase tracking-[.08em] no-underline transition-colors disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  )
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "default", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />
})
