// ── Custom Part Editor ──────────────────────────────────────────────────────
//
// Inline authoring surface, rendered inside the component panel (project-panel).
// Edits a part in either format: a declarative DSL (JSON — portable, MCP/chat
// friendly) or a host-SDK code module (.ts — full power). Save validates,
// persists, and registers it live.
//
// A DSL part is one JSON document, split here into editable facet rows (Look,
// Info, Pins, Properties, Behavior, Firmware) plus a Raw row for the whole doc;
// code parts use a single raw editor. Each row exports an AI prompt (whole-part
// from the toolbar/Raw, or scoped to one facet from that row's ✦ button) to
// paste into any chat; "Paste" loads the reply back (code fences stripped, and
// it warns if you paste the prompt by mistake).

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ClipboardPaste, Save, Trash2 } from "lucide-react"
import { buildCustomPartPrompt, type CustomPartFacet } from "@dreamer/schemas"
import { Button } from "@/components/ui/button"
import { CodeEditor } from "@/components/ui/code-editor"
import { cn } from "@/utils/classnames"
import { FacetEditor, FacetRow, type DslDoc } from "./custom-part-facets"
import {
  CUSTOM_PART_DSL_TEMPLATE,
  CUSTOM_PART_TEMPLATE,
} from "@/components/catalog/custom-part-template"
import {
  detectFormat,
  extractPartId,
  fetchCustomPart,
  removeCustomPart,
  saveAndReload,
  type CustomPartFormat,
} from "@/components/catalog/custom-parts-api"
import type { CustomPartEditTarget } from "@/components/catalog/custom-parts-editor-store"

type Status = { kind: "idle" | "saving" | "error" | "saved"; message?: string }

/** Strip a surrounding ```json … ``` fence a chat may have added around its reply. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  return fenced ? fenced[1]! : trimmed
}

export function CustomPartEditor({
  target,
  onClose,
}: {
  target: CustomPartEditTarget | null
  onClose: () => void
}) {
  const [source, setSource] = useState("")
  const [format, setFormat] = useState<CustomPartFormat>("dsl")
  // The id of a saved part (enables Delete); null for an unsaved new part.
  const [partId, setPartId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  // Free-text describing the change the user wants; baked into the copied AI
  // prompt's "## My change" section via buildCustomPartPrompt.
  const [changeText, setChangeText] = useState("")

  // Load source whenever the requested target changes.
  useEffect(() => {
    if (!target) return
    setChangeText("")
    if (target.kind === "new") {
      setSource(target.format === "dsl" ? CUSTOM_PART_DSL_TEMPLATE : CUSTOM_PART_TEMPLATE)
      setFormat(target.format)
      setPartId(null)
      setStatus({ kind: "idle" })
      return
    }
    const id = target.id
    void fetchCustomPart(id).then((part) => {
      if (part) {
        setSource(part.source)
        setFormat(part.format)
        setPartId(id)
        setStatus({ kind: "idle" })
      }
    })
  }, [target])

  const save = useCallback(async () => {
    const fmt = detectFormat(source)
    const id = extractPartId(source)
    if (!id) {
      setStatus({ kind: "error", message: 'Source must declare type: "custom:<name>"' })
      return
    }
    setStatus({ kind: "saving" })
    const res = await saveAndReload(id, fmt, source)
    if (res.ok) {
      setFormat(fmt)
      setPartId(id)
      setStatus({ kind: "saved", message: `Saved & loaded "${id}"` })
    } else {
      setStatus({ kind: "error", message: res.error })
    }
  }, [source])

  const remove = useCallback(async () => {
    if (!partId) return
    await removeCustomPart(partId)
    onClose()
  }, [partId, onClose])

  const copyPrompt = useCallback(() => {
    void navigator.clipboard.writeText(buildCustomPartPrompt(source, { change: changeText })).then(
      () => setStatus({ kind: "saved", message: "Copied AI prompt — paste it into a chat" }),
      () => setStatus({ kind: "error", message: "Copy failed" }),
    )
  }, [source, changeText])

  const paste = useCallback(() => {
    void navigator.clipboard.readText().then(
      (text) => {
        if (!text) return
        const cleaned = stripCodeFence(text)
        if (cleaned.startsWith("#")) {
          setStatus({
            kind: "error",
            message: "That's the prompt — paste the chat's JSON reply instead.",
          })
          return
        }
        setSource(cleaned)
        setFormat(detectFormat(cleaned))
        setStatus({ kind: "idle" })
      },
      () => setStatus({ kind: "error", message: "Paste failed" }),
    )
  }, [])

  // A DSL part is one JSON document; parse it so the facet rows can edit slices.
  // Code parts (and unparseable DSL) fall back to the single raw editor.
  const parsed = useMemo<{ doc: DslDoc | null; error: string | null }>(() => {
    if (format !== "dsl") return { doc: null, error: null }
    try {
      const value: unknown = JSON.parse(source)
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { doc: null, error: "The DSL must be a JSON object." }
      }
      return { doc: value as DslDoc, error: null }
    } catch (err) {
      return { doc: null, error: (err as Error).message }
    }
  }, [source, format])

  // Merge a facet's edit back into the whole document — re-parse `source` to
  // avoid a stale closure over `parsed`, then re-serialize as the canonical form.
  const patchFacet = useCallback((patch: Record<string, unknown>) => {
    setSource((prev) => {
      try {
        const doc: unknown = JSON.parse(prev)
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) return prev
        return JSON.stringify({ ...(doc as DslDoc), ...patch }, null, 2)
      } catch {
        return prev
      }
    })
  }, [])

  const copyFacetPrompt = useCallback(
    (facet: CustomPartFacet) => {
      void navigator.clipboard.writeText(buildCustomPartPrompt(source, { change: changeText, facet })).then(
        () => setStatus({ kind: "saved", message: `Copied ${facet} prompt — paste it into a chat` }),
        () => setStatus({ kind: "error", message: "Copy failed" }),
      )
    },
    [source, changeText],
  )

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Toolbar — back on the left; secondary actions + the primary Save on the right.
          Whole-part prompt lives on the Raw row, so it's not repeated here. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="size-8 shrink-0 px-0"
          onClick={onClose}
          title="Back to components"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="size-8 px-0"
            onClick={paste}
            title="Paste a chat's JSON reply"
          >
            <ClipboardPaste className="size-3.5" />
          </Button>
          {partId && (
            <Button
              size="sm"
              variant="ghost"
              className="size-8 px-0 text-muted-foreground hover:text-destructive"
              onClick={() => void remove()}
              title="Delete part"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            className="ml-1 shrink-0"
            onClick={() => void save()}
            disabled={status.kind === "saving"}
            title={partId ? "Save changes to this part" : "Add this part to the palette"}
          >
            <Save className="mr-1.5 size-3.5" />
            {status.kind === "saving" ? "Saving…" : partId ? "Save" : "Add"}
          </Button>
        </div>
      </div>

      {/* Describe-change input — baked into the copied AI prompt's "My change" */}
      <div className="border-b border-border px-3 py-1.5">
        <input
          type="text"
          value={changeText}
          onChange={(e) => setChangeText(e.target.value)}
          placeholder="Describe a change to include in the prompt…"
          aria-label="Describe a change for the AI prompt"
          className="w-full rounded-sm border border-border bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {status.message && (
        <div
          className={cn(
            "shrink-0 truncate border-b border-border px-2 py-1 text-xs",
            status.kind === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status.message}
        </div>
      )}

      {/* A DSL part edits by facet rows; code (or unparseable DSL) uses one raw editor. */}
      {format === "dsl" && parsed.doc ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <FacetEditor doc={parsed.doc} onPatch={patchFacet} onCopyFacetPrompt={copyFacetPrompt} />
          <FacetRow
            title="Raw"
            badge="DSL"
            summary="whole document"
            onCopyPrompt={copyPrompt}
            promptTitle="Copy a full-part AI prompt"
          >
            <div className="relative h-64 overflow-hidden">
              <CodeEditor value={source} onChange={setSource} foldOnMount />
            </div>
          </FacetRow>
        </div>
      ) : (
        <>
          {format === "dsl" && parsed.error && (
            <div className="shrink-0 border-b border-border px-3 py-1.5 text-[10px] text-destructive">
              Can&rsquo;t parse DSL — {parsed.error}. Fix it below to edit by facet.
            </div>
          )}
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <CodeEditor value={source} onChange={setSource} foldOnMount />
          </div>
        </>
      )}
    </div>
  )
}
