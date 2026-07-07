// ── SVG import flow state ────────────────────────────────────────────────────
//
// Drives the Look facet's import path: normalize external SVG, apply it
// directly when every visual.bindings target id survived, or enter a "remap"
// phase where the user assigns missing ids by picking elements in a preview.
// Picks are kept as a target→element-index map over the annotated base markup
// and re-stamped from scratch on every change, so any pick can be revised.

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import {
  annotateSvgForPicking,
  normalizeImportedSvg,
  stampIdAtIndex,
  stripPickingAnnotations,
} from '@/utils/svg-import'

type RemapState = {
  phase: 'remap'
  /** Sanitized full <svg> element with data-import-index markers. */
  annotatedSvg: string
  viewBox: string
  /** Binding targets whose ids already exist in the imported markup. */
  presentTargets: string[]
  /** User picks: binding target → annotated element index. */
  choices: Record<string, number>
  active: string | null
  warnings: string[]
}

type ImportState = { phase: 'idle' } | RemapState

export type SvgImportView =
  | { phase: 'idle' }
  | {
      phase: 'remap'
      annotatedSvg: string
      viewBox: string
      missing: string[]
      found: string[]
      active: string | null
      warnings: string[]
    }

function stampChoices(base: string, choices: Record<string, number>): string | null {
  let svg = base
  for (const [target, index] of Object.entries(choices)) {
    const stamped = stampIdAtIndex(svg, index, target)
    if (stamped === null) return null
    svg = stamped
  }
  return svg
}

export function useSvgImport(options: {
  bindingTargets: string[]
  onApply: (svg: string) => void
}) {
  const { bindingTargets, onApply } = options
  const [state, setState] = useState<ImportState>({ phase: 'idle' })

  const missingOf = (remap: RemapState): string[] =>
    bindingTargets.filter((t) => !remap.presentTargets.includes(t) && !(t in remap.choices))

  const importRaw = (raw: string) => {
    const result = normalizeImportedSvg(raw)
    if (!result.ok) {
      toast.error(`Couldn't import SVG — ${result.error}`)
      return
    }
    const missing = bindingTargets.filter((t) => !result.ids.includes(t))
    if (missing.length === 0) {
      onApply(result.svg)
      toast.success('SVG imported')
      for (const warning of result.warnings) toast.warning(warning)
      setState({ phase: 'idle' })
      return
    }
    const annotated = annotateSvgForPicking(result.svg)
    if (!annotated) {
      toast.error("Couldn't import SVG — failed to prepare it for id assignment")
      return
    }
    setState({
      phase: 'remap',
      annotatedSvg: annotated.svg,
      viewBox: result.viewBox,
      presentTargets: bindingTargets.filter((t) => result.ids.includes(t)),
      choices: {},
      active: missing[0] ?? null,
      warnings: result.warnings,
    })
  }

  const setActiveTarget = (target: string) => {
    setState((s) => (s.phase === 'remap' ? { ...s, active: target } : s))
  }

  /** Assign (or reassign) a binding target to an annotated element. */
  const pick = (target: string, index: number): boolean => {
    if (state.phase !== 'remap') return false
    const taken = Object.entries(state.choices).find(([t, i]) => i === index && t !== target)
    if (taken) {
      toast.error(`That element is already assigned to "${taken[0]}"`)
      return false
    }
    const next = { ...state.choices, [target]: index }
    if (stampChoices(state.annotatedSvg, next) === null) {
      toast.error('That element\'s id is used by the artwork (gradient/clip references) — pick another element')
      return false
    }
    const updated: RemapState = { ...state, choices: next }
    setState({ ...updated, active: missingOf(updated)[0] ?? null })
    return true
  }

  const apply = () => {
    if (state.phase !== 'remap') return
    const stamped = stampChoices(state.annotatedSvg, state.choices)
    const stripped = stamped === null ? null : stripPickingAnnotations(stamped)
    if (stripped === null) {
      toast.error("Couldn't finalize the imported SVG")
      return
    }
    onApply(stripped)
    const missing = missingOf(state)
    if (missing.length > 0) {
      toast.warning(`SVG applied with unresolved binding targets: ${missing.join(', ')}`)
    } else {
      toast.success('SVG imported')
    }
    setState({ phase: 'idle' })
  }

  const cancel = () => setState({ phase: 'idle' })

  const view: SvgImportView =
    state.phase === 'idle'
      ? { phase: 'idle' }
      : {
          phase: 'remap',
          annotatedSvg: state.annotatedSvg,
          viewBox: state.viewBox,
          missing: missingOf(state),
          found: bindingTargets.filter(
            (t) => state.presentTargets.includes(t) || t in state.choices,
          ),
          active: state.active,
          warnings: state.warnings,
        }

  return { state: view, importRaw, setActiveTarget, pick, apply, cancel }
}
