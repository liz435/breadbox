// ── Custom Part facet rows ───────────────────────────────────────────────────
//
// A DSL custom part is one JSON document; this file projects it into a set of
// editable "source rows" — one per facet (Look, Info, Pins, Properties,
// Behavior, Firmware). The parsed document is the single source of truth: each
// row reads its slice and, on edit, hands a patch back up (custom-parts-panel
// re-serializes the whole document). Each row also exports an AI prompt scoped
// to just that facet.

import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, ReactNode } from "react"
import { Box, ChevronRight, ClipboardPaste, Download, Sparkles, Upload } from "lucide-react"
import type { CustomPartFacet } from "@dreamer/schemas"
import { toast } from "@/components/ui/toast"
import { cn } from "@/utils/classnames"
import { downloadTextFile } from "@/utils/download-file"
import { svgToDataUrl } from "@/utils/svg-data-url"
import { SvgImportRemap } from "./svg-import-remap"
import { useSvgImport } from "./use-svg-import"

/** A parsed DSL document, read defensively — the source may be mid-edit. */
export type DslDoc = Record<string, unknown>

const CATEGORIES = ["input", "output", "passive", "display", "other"] as const

// ── small readers over the untyped document ──────────────────────────────────

function strField(doc: DslDoc, key: string): string {
  const value = doc[key]
  return typeof value === "string" ? value : ""
}

function arrLen(doc: DslDoc, key: string): number {
  const value = doc[key]
  return Array.isArray(value) ? value.length : 0
}

function objLen(doc: DslDoc, key: string): number {
  const value = doc[key]
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0
}

function elementCount(doc: DslDoc): number {
  const electrical = doc.electrical
  if (electrical && typeof electrical === "object" && "elements" in electrical) {
    const elements = (electrical as { elements?: unknown }).elements
    return Array.isArray(elements) ? elements.length : 0
  }
  return 0
}

function nestedArrLen(doc: DslDoc, key: string, arrayKey: string): number {
  const value = doc[key]
  if (value && typeof value === "object" && arrayKey in value) {
    const arr = (value as Record<string, unknown>)[arrayKey]
    return Array.isArray(arr) ? arr.length : 0
  }
  return 0
}

/** The visual.bindings target ids, read defensively from a mid-edit document. */
function bindingTargets(doc: DslDoc): string[] {
  const visual = doc.visual
  if (!visual || typeof visual !== "object" || !("bindings" in visual)) return []
  const bindings = (visual as { bindings?: unknown }).bindings
  if (!Array.isArray(bindings)) return []
  const targets: string[] = []
  for (const binding of bindings) {
    if (binding && typeof binding === "object" && "target" in binding) {
      const target = (binding as { target?: unknown }).target
      if (typeof target === "string" && target.length > 0) targets.push(target)
    }
  }
  return targets
}

// ── row shell ────────────────────────────────────────────────────────────────

export function FacetRow({
  title,
  badge,
  summary,
  onCopyPrompt,
  promptTitle,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: string
  summary?: string
  onCopyPrompt?: () => void
  promptTitle?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="shrink-0 text-xs font-medium text-foreground">{title}</span>
          {badge && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {badge}
            </span>
          )}
          {summary && !open && (
            <span className="ml-auto min-w-0 truncate text-[10px] text-muted-foreground">{summary}</span>
          )}
        </button>
        {onCopyPrompt && (
          <button
            type="button"
            onClick={onCopyPrompt}
            title={promptTitle ?? `Copy an AI prompt scoped to ${title}`}
            className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:outline-none"
          >
            <Sparkles className="size-3.5" />
          </button>
        )}
      </div>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

// ── JSON slice editor (pins / properties / behavior / firmware) ───────────────

function JsonSliceEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const canonical = useMemo(() => JSON.stringify(value, null, 2), [value])
  const [draft, setDraft] = useState(canonical)
  const [error, setError] = useState<string | null>(null)
  // Tracks the last text this editor emitted, so an external change to `value`
  // (a Raw edit, a paste) resyncs the draft, but our own edits don't clobber it.
  const lastPushed = useRef(canonical)

  useEffect(() => {
    if (canonical !== lastPushed.current) {
      lastPushed.current = canonical
      setDraft(canonical)
      setError(null)
    }
  }, [canonical])

  const handleChange = (text: string) => {
    setDraft(text)
    try {
      const parsed: unknown = JSON.parse(text)
      setError(null)
      lastPushed.current = JSON.stringify(parsed, null, 2)
      onChange(parsed)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const rows = Math.min(14, Math.max(3, draft.split("\n").length))
  return (
    <div className="px-3 pb-2">
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        rows={rows}
        className={cn(
          "w-full resize-y rounded-sm border bg-transparent px-2 py-1 font-mono text-[11px] leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          error ? "border-destructive" : "border-border",
        )}
      />
      {error && <p className="mt-1 text-[10px] text-destructive">Invalid JSON — {error}</p>}
    </div>
  )
}

// ── Look (svg) editor with a live preview ─────────────────────────────────────

const TOOL_BUTTON_CLASS =
  "flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

function SvgFacetEditor({
  value,
  onChange,
  partId,
  bindingTargets,
}: {
  value: string
  onChange: (v: string) => void
  partId: string
  bindingTargets: string[]
}) {
  const trimmed = value.trim()
  // Reset the broken-SVG flag whenever the markup changes so a fix re-renders.
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [trimmed])
  const showPreview = trimmed.length > 0 && !broken

  const fileInputRef = useRef<HTMLInputElement>(null)
  const importer = useSvgImport({ bindingTargets, onApply: onChange })

  const exportSvg = () => {
    downloadTextFile(`${partId}.svg`, trimmed, "image/svg+xml")
    const idNote =
      bindingTargets.length > 0
        ? `Keep these ids as named layers/groups: ${bindingTargets.join(", ")}. `
        : ""
    toast.info(
      `Exported ${partId}.svg. ${idNote}When re-exporting from Figma, enable "Include id attribute" in the SVG export settings.`,
      { duration: 10000 },
    )
  }

  const handleFileImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") importer.importRaw(reader.result)
    }
    reader.readAsText(file)
  }

  const pasteImport = () => {
    void navigator.clipboard.readText().then(
      (text) => importer.importRaw(text),
      () => toast.error("Couldn't read the clipboard"),
    )
  }

  return (
    <div className="space-y-2 px-3 pb-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={exportSvg}
          disabled={trimmed.length === 0}
          title="Download the SVG to edit in Figma or another vector tool"
          className={TOOL_BUTTON_CLASS}
        >
          <Download className="size-3" /> Export
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Import an SVG file (it will be sanitized and normalized)"
          className={TOOL_BUTTON_CLASS}
        >
          <Upload className="size-3" /> Import
        </button>
        <button
          type="button"
          onClick={pasteImport}
          title="Import SVG markup from the clipboard"
          className={TOOL_BUTTON_CLASS}
        >
          <ClipboardPaste className="size-3" /> Paste
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>
      <div className="flex h-24 items-center justify-center rounded-sm border border-border bg-muted/40">
        {showPreview ? (
          <img
            src={svgToDataUrl(trimmed)}
            alt="Part preview"
            onError={() => setBroken(true)}
            className="max-h-20 max-w-full object-contain"
          />
        ) : (
          <Box className="size-8 text-muted-foreground" aria-label="Default part look" />
        )}
      </div>
      {importer.state.phase === "remap" && (
        <SvgImportRemap
          view={importer.state}
          onSetActive={importer.setActiveTarget}
          onPick={importer.pick}
          onApply={importer.apply}
          onCancel={importer.cancel}
        />
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="<svg viewBox='0 0 12 36'>…</svg>"
        spellCheck={false}
        rows={4}
        className="w-full resize-y rounded-sm border border-border bg-transparent px-2 py-1 font-mono text-[11px] leading-snug text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}

// ── Info editor (scalars) ─────────────────────────────────────────────────────

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const INPUT_CLASS =
  "w-full rounded-sm border border-border bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function InfoFacetEditor({ doc, onPatch }: { doc: DslDoc; onPatch: (patch: Record<string, unknown>) => void }) {
  const category = strField(doc, "category") || "other"
  return (
    <div className="space-y-2 px-3 pb-2">
      <InfoField label="Label">
        <input
          type="text"
          value={strField(doc, "label")}
          onChange={(e) => onPatch({ label: e.target.value })}
          className={INPUT_CLASS}
        />
      </InfoField>
      <InfoField label="Category">
        <select
          value={category}
          onChange={(e) => onPatch({ category: e.target.value })}
          className={INPUT_CLASS}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </InfoField>
      <InfoField label="Description">
        <input
          type="text"
          value={strField(doc, "description")}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="One-line description"
          className={INPUT_CLASS}
        />
      </InfoField>
      <p className="text-[10px] text-muted-foreground">
        Type: <code className="text-foreground">{strField(doc, "type") || "custom:…"}</code> — edit in Raw to rename.
      </p>
    </div>
  )
}

// ── composed facet editor ─────────────────────────────────────────────────────

export function FacetEditor({
  doc,
  onPatch,
  onCopyFacetPrompt,
}: {
  doc: DslDoc
  onPatch: (patch: Record<string, unknown>) => void
  onCopyFacetPrompt: (facet: CustomPartFacet) => void
}) {
  const svg = strField(doc, "svg")
  const partId = strField(doc, "type").replace(/^custom:/, "") || "part"
  return (
    <>
      <FacetRow
        title="Look"
        summary={svg.trim() ? "custom SVG" : "auto box"}
        onCopyPrompt={() => onCopyFacetPrompt("look")}
        defaultOpen
      >
        <SvgFacetEditor
          value={svg}
          onChange={(next) => onPatch({ svg: next })}
          partId={partId}
          bindingTargets={bindingTargets(doc)}
        />
      </FacetRow>

      <FacetRow
        title="Info"
        summary={strField(doc, "label") || strField(doc, "type")}
        onCopyPrompt={() => onCopyFacetPrompt("info")}
      >
        <InfoFacetEditor doc={doc} onPatch={onPatch} />
      </FacetRow>

      <FacetRow title="Pins" summary={`${arrLen(doc, "pins")} pins`} onCopyPrompt={() => onCopyFacetPrompt("pins")}>
        <JsonSliceEditor value={doc.pins ?? []} onChange={(pins) => onPatch({ pins })} />
      </FacetRow>

      <FacetRow
        title="Properties"
        summary={`${objLen(doc, "properties")} props`}
        onCopyPrompt={() => onCopyFacetPrompt("properties")}
      >
        <JsonSliceEditor value={doc.properties ?? {}} onChange={(properties) => onPatch({ properties })} />
      </FacetRow>

      <FacetRow
        title="Electrical"
        summary={`${elementCount(doc)} elements`}
        onCopyPrompt={() => onCopyFacetPrompt("behavior")}
      >
        <JsonSliceEditor
          value={doc.electrical ?? { elements: [] }}
          onChange={(electrical) => onPatch({ electrical })}
        />
      </FacetRow>

      <FacetRow
        title="Signals"
        summary={`${nestedArrLen(doc, "behavior", "signals")} signals`}
        onCopyPrompt={() => onCopyFacetPrompt("behavior")}
      >
        <JsonSliceEditor
          value={doc.behavior ?? { signals: [] }}
          onChange={(behavior) => onPatch({ behavior })}
        />
      </FacetRow>

      <FacetRow
        title="Motion"
        summary={`${nestedArrLen(doc, "visual", "bindings")} bindings`}
        onCopyPrompt={() => onCopyFacetPrompt("look")}
      >
        <JsonSliceEditor
          value={doc.visual ?? { bindings: [] }}
          onChange={(visual) => onPatch({ visual })}
        />
      </FacetRow>

      <FacetRow
        title="Firmware"
        summary={objLen(doc, "sketch") > 0 ? "sketch" : "none"}
        onCopyPrompt={() => onCopyFacetPrompt("firmware")}
      >
        <JsonSliceEditor value={doc.sketch ?? {}} onChange={(sketch) => onPatch({ sketch })} />
      </FacetRow>
    </>
  )
}
