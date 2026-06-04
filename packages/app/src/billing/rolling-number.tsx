// ── RollingNumber ────────────────────────────────────────────────────────
//
// An odometer-style number. Each digit is a vertical reel of 0–9; when the
// value changes the reels slide to their new digit. Because credits only
// ever go down after a run, the dominant motion is a downward scroll — the
// new (smaller) digit rolls in from above.
//
// Reels are keyed by place value (ones, tens, …) so the ones digit always
// animates as the ones digit even when the magnitude changes (1,000 → 999).
// The visible glyph stack is aria-hidden; callers carry the accessible
// label (see CreditChip).

import { cn } from "@/utils/classnames"

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

type DigitPart = { kind: "digit"; value: number; place: number }
type SepPart = { kind: "sep"; place: number }
type Part = DigitPart | SepPart

// Break an integer into placed digits with thousands separators, most
// significant first. Place 0 = ones, 1 = tens, … so reels stay stable as
// the number grows or shrinks.
function toParts(value: number): Part[] {
  const str = String(value)
  const n = str.length
  const parts: Part[] = []
  for (let i = 0; i < n; i++) {
    const place = n - 1 - i
    parts.push({ kind: "digit", value: Number(str[i]), place })
    if (place > 0 && place % 3 === 0) parts.push({ kind: "sep", place })
  }
  return parts
}

function DigitReel({ value }: { value: number }) {
  return (
    <span
      className="block h-[1em] w-[1ch] overflow-hidden"
      aria-hidden="true"
    >
      <span
        className="flex flex-col transition-transform duration-700 ease-out will-change-transform motion-reduce:transition-none"
        style={{ transform: `translateY(${-value}em)` }}
      >
        {DIGITS.map((d) => (
          <span
            key={d}
            className="flex h-[1em] items-center justify-center leading-none"
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

export function RollingNumber({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const negative = value < 0
  const parts = toParts(Math.abs(Math.trunc(value)))

  return (
    <span className={cn("inline-flex items-center tabular-nums", className)}>
      {negative && <span className="mr-px">−</span>}
      {parts.map((part) =>
        part.kind === "digit" ? (
          <DigitReel key={`d${part.place}`} value={part.value} />
        ) : (
          <span
            key={`s${part.place}`}
            className="self-end leading-none text-muted-foreground"
          >
            ,
          </span>
        ),
      )}
    </span>
  )
}
