// ── Keyboard Shortcuts Help Dialog ───────────────────────────────────────
//
// Shows all keyboard shortcuts. Opens with `?` key or via Cmd+K → "Shortcuts".

import React from "react"

type ShortcutsDialogProps = {
  open: boolean
  onClose: () => void
}

const SHORTCUT_GROUPS = [
  {
    title: "General",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Open command palette" },
      { keys: ["⌘", "S"], description: "Save project" },
      { keys: ["⌘", "Z"], description: "Undo" },
      { keys: ["⌘", "⇧", "Z"], description: "Redo" },
      { keys: ["?"], description: "Show this dialog" },
    ],
  },
  {
    title: "Breadboard",
    shortcuts: [
      { keys: ["R"], description: "Rotate component (while placing or selected)" },
      { keys: ["Delete"], description: "Remove selected component or wire" },
      { keys: ["Escape"], description: "Cancel placement / deselect" },
      { keys: ["Space", "Drag"], description: "Pan the canvas" },
      { keys: ["Scroll"], description: "Zoom in / out" },
      { keys: ["Middle Click", "Drag"], description: "Pan the canvas" },
    ],
  },
  {
    title: "Sketch Editor",
    shortcuts: [
      { keys: ["⌘", "F"], description: "Find in editor" },
      { keys: ["⌘", "H"], description: "Find and replace" },
      { keys: ["Tab"], description: "Accept autocomplete / indent" },
      { keys: ["⇧", "Tab"], description: "Dedent selected lines" },
      { keys: ["⌘", "⌥", "["], description: "Fold code block" },
      { keys: ["⌘", "⌥", "]"], description: "Unfold code block" },
    ],
  },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-[11px] font-medium text-neutral-300">
      {children}
    </kbd>
  )
}

function ShortcutsDialogInner({ open, onClose }: ShortcutsDialogProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-200">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <svg viewBox="0 0 16 16" width={14} height={14}>
              <line x1={4} y1={4} x2={12} y2={12} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              <line x1={12} y1={4} x2={4} y2={12} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-neutral-400">{shortcut.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-[10px] text-neutral-600">+</span>}
                          <Kbd>{key}</Kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-700 px-5 py-2 text-[10px] text-neutral-600">
          Press <Kbd>?</Kbd> anytime to show this dialog
        </div>
      </div>
    </div>
  )
}

export const ShortcutsDialog = React.memo(ShortcutsDialogInner)
