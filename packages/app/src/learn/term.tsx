// ── <Term> ─────────────────────────────────────────────────────────────
//
// Inline glossary link. Renders the term's label (or custom children)
// as an underlined trigger; hovering/clicking shows a Base UI popover
// with the blurb + an optional "Open reference" link to the canonical
// encyclopedia page.
//
// Usage:
//
//   import { Term } from "@/learn/term"
//
//   <p>
//     The <Term k="led" /> lights up when you write{" "}
//     <Term k="digital-write">digitalWrite(pin, HIGH)</Term>.
//   </p>
//
// The `k` prop is typed against GlossaryKey — unknown keys are compile
// errors, and renaming a key surfaces every broken call site.

import type { ReactNode } from "react"
import { Popover } from "@base-ui/react/popover"
import { useRouter } from "@/router"
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from "./glossary"

type TermProps = {
  /** Glossary key. Auto-completed from the full union of entries. */
  k: GlossaryKey
  /** Override the visible text. Defaults to the glossary entry's label. */
  children?: ReactNode
}

export function Term({ k, children }: TermProps) {
  const entry: GlossaryEntry = GLOSSARY[k]
  const { navigate } = useRouter()

  const openReference = () => {
    if (entry.href) navigate(entry.href)
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            className="inline cursor-help border-b border-dotted border-emerald-500/60 text-emerald-300 hover:text-emerald-200 hover:border-emerald-400 focus:outline-none focus:text-emerald-200"
          >
            {children ?? entry.label}
          </button>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="z-50 max-w-xs rounded-md border border-neutral-700 bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-200 shadow-xl outline-none">
            <p className="mb-1 font-semibold text-neutral-100">{entry.label}</p>
            <p className="text-neutral-300">{entry.blurb}</p>
            {entry.href && (
              <button
                type="button"
                onClick={openReference}
                className="mt-2 inline-flex items-center text-[11px] text-emerald-400 hover:text-emerald-300"
              >
                Open reference →
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
