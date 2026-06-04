// ── Command Palette (Cmd+K) ─────────────────────────────────────────────
//
// Global fuzzy-search overlay for placing components, toggling panels,
// running actions, and navigating the app. Opens with Cmd+K / Ctrl+K.

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react"
import type { ComponentType } from "@dreamer/schemas"
import { COMPONENT_REGISTRY } from "@/components/registry"
import { breadboardInteractionActor } from "@/breadboard/breadboard-interaction"
import { useDockviewApi } from "@/store/dockview-context"
import { simulationRef } from "@/simulator/simulation-ref"
import { saveRef } from "@/project/save-ref"
import { OPEN_CONNECT_CLAUDE_EVENT } from "@/components/connect-claude-dialog"
import { useCapabilities } from "@/project/use-capabilities"
import { VIEW_PANELS, showPanel } from "@/store/view-panels"

// ── Command types ───────────────────────────────────────────────────────

type Command = {
  id: string
  label: string
  description?: string
  category: string
  icon?: React.ReactNode
  action: () => void
  keywords?: string
}

// ── Icons ───────────────────────────────────────────────────────────────

const icons = {
  component: (
    <svg viewBox="0 0 16 16" width={14} height={14} className="text-blue-400">
      <rect x={2} y={2} width={12} height={12} rx={2} fill="currentColor" opacity={0.3} />
      <rect x={4} y={4} width={8} height={8} rx={1} fill="currentColor" />
    </svg>
  ),
  panel: (
    <svg viewBox="0 0 16 16" width={14} height={14} className="text-emerald-400">
      <rect x={1} y={2} width={14} height={12} rx={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1={6} y1={2} x2={6} y2={14} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  ),
  action: (
    <svg viewBox="0 0 16 16" width={14} height={14} className="text-amber-400">
      <polygon points="8,1 15,6 12,15 4,15 1,6" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  ),
  wire: (
    <svg viewBox="0 0 16 16" width={14} height={14} className="text-yellow-400">
      <line x1={2} y1={14} x2={14} y2={2} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx={2} cy={14} r={2} fill="currentColor" />
      <circle cx={14} cy={2} r={2} fill="currentColor" />
    </svg>
  ),
}

// ── Build command list ──────────────────────────────────────────────────

function buildCommands(
  dockviewApi: ReturnType<typeof useDockviewApi>,
  opts: { hosted: boolean },
): Command[] {
  const commands: Command[] = []

  // Component placement commands
  for (const def of COMPONENT_REGISTRY) {
    commands.push({
      id: `place:${def.type}`,
      label: `Place ${def.label}`,
      description: def.description,
      category: "Components",
      icon: icons.component,
      keywords: `add ${def.type} ${def.category ?? ""} component`,
      action: () => {
        breadboardInteractionActor.send({
          type: "START_PLACE",
          componentType: def.type as ComponentType,
        })
      },
    })
  }

  // Wire
  commands.push({
    id: "place:wire",
    label: "Place Jumper Wire",
    description: "Connect two points on the breadboard",
    category: "Components",
    icon: icons.wire,
    keywords: "add wire connect jumper",
    action: () => {
      breadboardInteractionActor.send({ type: "START_PLACE", componentType: "wire" })
    },
  })

  // Panel toggles — driven by the shared VIEW_PANELS registry so the palette,
  // the top tab strip, and the native macOS View menu stay in sync. showPanel
  // focuses the panel, or creates it from its default position if it isn't in
  // the current layout.
  for (const p of VIEW_PANELS) {
    commands.push({
      id: `panel:${p.id}`,
      label: `Show ${p.label}`,
      description: `Open or focus the ${p.label} panel`,
      category: "Panels",
      icon: icons.panel,
      keywords: `panel view open toggle ${p.id}`,
      action: () => showPanel(dockviewApi, p.id),
    })
  }

  // Actions
  commands.push({
    id: "action:save",
    label: "Save Project",
    description: "Save all changes now",
    category: "Actions",
    icon: icons.action,
    keywords: "save flush cmd+s",
    action: () => { saveRef.current?.() },
  })
  commands.push({
    id: "action:shortcuts",
    label: "Keyboard Shortcuts",
    description: "Show all keyboard shortcuts",
    category: "Actions",
    icon: icons.action,
    keywords: "help keys bindings hotkeys ?",
    action: () => {
      // Dispatch a synthetic ? keydown to trigger the shortcuts dialog
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))
    },
  })
  // The MCP server + live bridge are local-only (the bridge is disabled in
  // hosted mode, and the `dreamer mcp` CLI runs on the user's machine), so
  // only surface this where it can actually work.
  if (!opts.hosted) {
    commands.push({
      id: "action:connect-claude",
      label: "Connect Claude (MCP)",
      description: "Drive this project from your own Claude",
      category: "Actions",
      icon: icons.action,
      keywords: "claude mcp ai agent connect model context protocol assistant",
      action: () => {
        window.dispatchEvent(new CustomEvent(OPEN_CONNECT_CLAUDE_EVENT))
      },
    })
  }
  commands.push({
    id: "action:pause",
    label: "Pause Sketch",
    description: "Pause the running simulation",
    category: "Actions",
    icon: icons.action,
    keywords: "pause halt simulation",
    action: () => { simulationRef.current?.pause() },
  })
  commands.push({
    id: "action:resume",
    label: "Resume Sketch",
    description: "Resume the paused simulation",
    category: "Actions",
    icon: icons.action,
    keywords: "resume continue play simulation",
    action: () => { simulationRef.current?.resume() },
  })
  commands.push({
    id: "action:stop",
    label: "Stop Sketch",
    description: "Stop the running simulation",
    category: "Actions",
    icon: icons.action,
    keywords: "halt stop simulation",
    action: () => { simulationRef.current?.stop() },
  })

  return commands
}

// ── Fuzzy match ─────────────────────────────────────────────────────────

function matchScore(query: string, command: Command): number {
  const q = query.toLowerCase()
  const label = command.label.toLowerCase()
  const desc = (command.description ?? "").toLowerCase()
  const keys = (command.keywords ?? "").toLowerCase()

  // Exact label match is best
  if (label === q) return 100
  // Label starts with query
  if (label.startsWith(q)) return 80
  // Label contains query
  if (label.includes(q)) return 60
  // Description contains query
  if (desc.includes(q)) return 40
  // Keywords contain query
  if (keys.includes(q)) return 30
  // Word-start match across all text
  const all = `${label} ${desc} ${keys}`
  const words = q.split(/\s+/)
  if (words.every((w) => all.includes(w))) return 20

  return 0
}

// ── Component ───────────────────────────────────────────────────────────

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
}

function CommandPaletteInner({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dockviewApi = useDockviewApi()
  const { capabilities } = useCapabilities()

  const commands = useMemo(
    () => buildCommands(dockviewApi, { hosted: capabilities.hosted }),
    [dockviewApi, capabilities.hosted],
  )

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map((cmd) => ({ cmd, score: matchScore(query, cmd) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd)
  }, [query, commands])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      // Wait for render then focus
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const executeCommand = useCallback(
    (cmd: Command) => {
      onClose()
      // Delay action so the dialog closes first
      requestAnimationFrame(() => cmd.action())
    },
    [onClose],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (results[selectedIndex]) {
            executeCommand(results[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
      }
    },
    [results, selectedIndex, executeCommand, onClose],
  )

  // Clamp index when results change
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results])

  if (!open) return null

  // Group results by category for display
  const grouped: Array<{ category: string; items: Array<{ cmd: Command; index: number }> }> = []
  let flatIndex = 0
  const catMap = new Map<string, Array<{ cmd: Command; index: number }>>()
  for (const cmd of results) {
    if (!catMap.has(cmd.category)) catMap.set(cmd.category, [])
    catMap.get(cmd.category)!.push({ cmd, index: flatIndex })
    flatIndex++
  }
  for (const [category, items] of catMap) {
    grouped.push({ category, items })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-3">
          <svg viewBox="0 0 16 16" width={16} height={16} className="flex-shrink-0 text-neutral-500">
            <circle cx={7} cy={7} r={5} fill="none" stroke="currentColor" strokeWidth={1.5} />
            <line x1={11} y1={11} x2={14} y2={14} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-neutral-200 placeholder:text-neutral-500 outline-none"
          />
          <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              No results for "{query}"
            </p>
          )}
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {category}
              </div>
              {items.map(({ cmd, index }) => (
                <button
                  key={cmd.id}
                  type="button"
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    index === selectedIndex
                      ? "bg-blue-600/20 text-blue-300"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeCommand(cmd)}
                >
                  <span className="flex-shrink-0">{cmd.icon}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{cmd.label}</span>
                    {cmd.description && (
                      <span className="truncate text-xs text-neutral-500">{cmd.description}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-neutral-700 px-4 py-2 text-[10px] text-neutral-500">
          <span><kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">↵</kbd> select</span>
          <span><kbd className="rounded border border-neutral-600 bg-neutral-800 px-1 py-0.5">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

export const CommandPalette = React.memo(CommandPaletteInner)
