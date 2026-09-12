import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"

const SIZES = {
  sm: "text-sm",
  md: "text-[15px]",
  lg: "text-2xl",
  xl: "text-[34px] leading-tight",
} as const

const COLORS = {
  positive: "text-brand-500",
  neutral: "text-text-900",
  muted: "text-text-500",
} as const

interface MoneyValueProps {
  value: number
  size?: keyof typeof SIZES
  /** `positive` = brand-500, `neutral`, `muted` */
  color?: keyof typeof COLORS
  /** Animate a count-up transition when the value changes (KPIs). */
  animate?: boolean
  className?: string
}

/** JetBrains Mono tabular monetary value, pt-BR format (R$ 1.234,56). */
export default function MoneyValue({ value, size = "md", color = "neutral", animate = false, className }: MoneyValueProps) {
  const [display, setDisplay] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const [anim, setAnim] = useState<{ from: number; to: number } | null>(null)

  // Adjust during render when the value prop changes (React-sanctioned pattern).
  if (prevValue !== value) {
    setPrevValue(value)
    if (animate) {
      setAnim({ from: display, to: value })
    } else {
      setAnim(null)
      setDisplay(value)
    }
  }

  useEffect(() => {
    if (!anim) return
    const { from, to } = anim
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setAnim(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anim])

  return (
    <span className={cn("font-mono font-medium tabular", SIZES[size], COLORS[color], className)}>
      {formatBRL(display)}
    </span>
  )
}
