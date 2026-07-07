// ── SVG import remap panel ───────────────────────────────────────────────────
//
// Shown inside the Look facet when an imported SVG is missing ids that
// visual.bindings target (external editors mangle ids). The user activates a
// missing target, then clicks the element in the preview that should carry it.
// Clicks land on the deepest element; an ancestor-crumb row lets the user move
// the assignment up to an enclosing group. Every pick is revisable — clicking
// again reassigns.

import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { cn } from '@/utils/classnames'
import { sanitizeSvg } from '@/utils/sanitize-svg'
import { PICK_ATTR } from '@/utils/svg-import'
import type { SvgImportView } from './use-svg-import'

type RemapView = Extract<SvgImportView, { phase: 'remap' }>

type Crumb = { index: number; tag: string }

/** The clicked element and its pickable ancestors, deepest first. */
function crumbChain(start: Element): Crumb[] {
  const chain: Crumb[] = []
  let el: Element | null = start
  while (el) {
    const raw = el.getAttribute(PICK_ATTR)
    if (raw !== null) {
      const index = Number.parseInt(raw, 10)
      if (Number.isFinite(index)) chain.push({ index, tag: el.tagName.toLowerCase() })
    }
    el = el.parentElement
  }
  return chain
}

export function SvgImportRemap({
  view,
  onSetActive,
  onPick,
  onApply,
  onCancel,
}: {
  view: RemapView
  onSetActive: (target: string) => void
  onPick: (target: string, index: number) => boolean
  onApply: () => void
  onCancel: () => void
}) {
  const parsed = useMemo(() => sanitizeSvg(view.annotatedSvg), [view.annotatedSvg])
  // The last pick's target + ancestor chain, so the user can promote the
  // assignment from the clicked element to an enclosing group.
  const [lastPick, setLastPick] = useState<{ target: string; chain: Crumb[]; chosen: number } | null>(null)

  const handlePreviewClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!view.active) return
    if (!(event.target instanceof Element)) return
    const hit = event.target.closest(`[${PICK_ATTR}]`)
    if (!hit) return
    const chain = crumbChain(hit)
    const deepest = chain[0]
    if (!deepest) return
    const target = view.active
    if (onPick(target, deepest.index)) {
      setLastPick({ target, chain, chosen: deepest.index })
    }
  }

  const promoteTo = (crumb: Crumb) => {
    if (!lastPick) return
    if (onPick(lastPick.target, crumb.index)) {
      setLastPick({ ...lastPick, chosen: crumb.index })
    }
  }

  const done = view.missing.length === 0

  return (
    <div className="space-y-2 rounded-sm border border-border bg-muted/30 p-2">
      <p className="text-[10px] font-medium text-foreground">
        {done
          ? 'All binding targets assigned — apply to finish the import.'
          : `${view.missing.length} binding target${view.missing.length > 1 ? 's are' : ' is'} missing from the imported SVG. Click the element that should be each one.`}
      </p>

      {view.warnings.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-muted-foreground">
          {view.warnings.map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        {view.missing.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onSetActive(target)}
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              target === view.active
                ? 'border-ring bg-accent text-foreground'
                : 'border-destructive/50 text-destructive hover:bg-accent',
            )}
          >
            {target}
          </button>
        ))}
        {view.found.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onSetActive(target)}
            title="Assigned — click an element in the preview to reassign"
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              target === view.active
                ? 'border-ring bg-accent text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            ✓ {target}
          </button>
        ))}
      </div>

      {view.active && !done && (
        <p className="text-[10px] text-muted-foreground">
          Click the element that should be <code className="text-foreground">{view.active}</code>
        </p>
      )}

      <div className="flex h-48 items-center justify-center rounded-sm border border-border bg-muted/40">
        {parsed ? (
          <svg
            viewBox={parsed.viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Imported SVG — click an element to assign the active binding id"
            onClick={handlePreviewClick}
            className={cn(
              'max-h-44 max-w-full',
              // Literal selectors (not interpolated from PICK_ATTR): Tailwind's
              // scanner only picks up statically visible class strings.
              view.active &&
                '[&_[data-import-index]]:cursor-pointer [&_[data-import-index]:hover]:opacity-70',
            )}
            dangerouslySetInnerHTML={{ __html: parsed.content }}
          />
        ) : (
          <p className="text-[10px] text-muted-foreground">Preview unavailable</p>
        )}
      </div>

      {lastPick && lastPick.chain.length > 1 && (
        <p className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <span>
            <code className="text-foreground">{lastPick.target}</code> assigned — or move it to:
          </span>
          {lastPick.chain.map((crumb) => (
            <button
              key={crumb.index}
              type="button"
              onClick={() => promoteTo(crumb)}
              className={cn(
                'rounded border px-1 py-0.5 font-mono transition-colors hover:bg-accent',
                crumb.index === lastPick.chosen
                  ? 'border-ring text-foreground'
                  : 'border-border',
              )}
            >
              {crumb.tag}
            </button>
          ))}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-sm border border-border bg-accent px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-accent/70"
        >
          {done ? 'Apply' : 'Apply anyway'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
