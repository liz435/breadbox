// ── Connect Claude (MCP) Dialog ──────────────────────────────────────────
//
// Lets the user point their own Claude (Claude Desktop / Claude Code) at this
// project's MCP server. Once registered, Claude can build the circuit and write
// the sketch via the `breadbox mcp` tools, and — thanks to the live board-stream
// bridge (useLiveBoardSync) — the edits appear on this canvas in real time.
//
// "Connect automatically" calls the local API (POST /api/mcp/connect), which
// writes the Claude Desktop config and best-effort runs `claude mcp add` for
// Claude Code. Manual commands stay available as a fallback.
//
// Opened via the command palette ("Connect Claude (MCP)"), which dispatches a
// `breadbox:open-connect-claude` window event that app.tsx listens for.

import React from "react"
import { API_ORIGIN } from "@dreamer/config"

export const OPEN_CONNECT_CLAUDE_EVENT = "breadbox:open-connect-claude"

type ConnectClaudeDialogProps = {
  open: boolean
  onClose: () => void
  projectId: string
}

type DesktopResult =
  | { status: "written"; path: string; backedUp: boolean }
  | { status: "not_installed"; path: string }
  | { status: "error"; path: string; error: string }

type CodeResult =
  | { status: "added" }
  | { status: "exists" }
  | { status: "unavailable" }
  | { status: "error"; error: string }

type ConnectResponse = {
  ok: boolean
  error?: string
  claudeDesktop?: DesktopResult
  claudeCode?: CodeResult
  needsRestart?: boolean
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(() => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1_500)
    })
  }, [value])

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function CommandRow({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-emerald-300">
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  )
}

function StatusLine({ tone, text }: { tone: "ok" | "warn" | "bad"; text: string }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-neutral-400" : "text-red-400"
  const mark = tone === "ok" ? "✓" : tone === "warn" ? "•" : "✕"
  return (
    <p className={`text-xs ${color}`}>
      {mark} {text}
    </p>
  )
}

function desktopLine(r: DesktopResult | undefined): React.ReactNode {
  if (!r) return null
  switch (r.status) {
    case "written":
      return <StatusLine tone="ok" text="Added to Claude Desktop." />
    case "not_installed":
      return <StatusLine tone="warn" text="Claude Desktop not found — skipped." />
    case "error":
      return <StatusLine tone="bad" text={`Claude Desktop: ${r.error}`} />
  }
}

function codeLine(r: CodeResult | undefined): React.ReactNode {
  if (!r) return null
  switch (r.status) {
    case "added":
      return <StatusLine tone="ok" text="Added to Claude Code." />
    case "exists":
      return <StatusLine tone="warn" text="Already configured in Claude Code." />
    case "unavailable":
      return <StatusLine tone="warn" text="Claude Code CLI not found — skipped." />
    case "error":
      return <StatusLine tone="bad" text={`Claude Code: ${r.error}`} />
  }
}

function ConnectClaudeDialogInner({ open, onClose, projectId }: ConnectClaudeDialogProps) {
  const [phase, setPhase] = React.useState<"idle" | "working" | "done" | "error">("idle")
  const [result, setResult] = React.useState<ConnectResponse | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // Reset transient state each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setPhase("idle")
      setResult(null)
      setErrorMsg(null)
    }
  }, [open])

  // Close on Escape.
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

  const connect = React.useCallback(async () => {
    setPhase("working")
    setErrorMsg(null)
    try {
      const res = await fetch(`${API_ORIGIN}/api/mcp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
      // Parse defensively — a stale server (started before this route existed)
      // returns a non-JSON 404 body, which would otherwise throw an opaque
      // "string did not match the expected pattern" from res.json().
      let data: ConnectResponse | null = null
      try {
        data = (await res.json()) as ConnectResponse
      } catch {
        data = null
      }
      if (!res.ok || !data?.ok) {
        const msg =
          data?.error ??
          (res.status === 404
            ? "Connect endpoint not found — restart your local Breadbox server (or the desktop app) so it picks up this feature."
            : `Request failed (HTTP ${res.status}).`)
        setErrorMsg(msg)
        setPhase("error")
        return
      }
      setResult(data)
      setPhase("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error")
      setPhase("error")
    }
  }, [projectId])

  if (!open) return null

  const claudeCodeCmd = `claude mcp add breadbox -- breadbox --project ${projectId} mcp`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-200">Connect Claude (MCP)</h2>
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
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-neutral-400">
            Point your own Claude at this project and it can place components, wire
            them up, and write the sketch — the changes appear on this canvas live.
          </p>

          {/* Auto-connect */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={connect}
              disabled={phase === "working"}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {phase === "working" ? "Connecting…" : "Connect automatically"}
            </button>

            {phase === "error" && errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

            {phase === "done" && result && (
              <div className="space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2">
                {desktopLine(result.claudeDesktop)}
                {codeLine(result.claudeCode)}
                {result.needsRestart && (
                  <p className="pt-1 text-[11px] text-amber-400">
                    Restart Claude Desktop to load the new server.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Manual fallback */}
          <details className="group">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-400">
              Or set it up manually
            </summary>

            <div className="mt-3 space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Claude Code (CLI)
                </h3>
                <CommandRow value={claudeCodeCmd} />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Claude Desktop
                </h3>
                <p className="text-xs text-neutral-400">
                  Add to{" "}
                  <code className="text-neutral-300">
                    ~/Library/Application Support/Claude/claude_desktop_config.json
                  </code>
                  , then restart:
                </p>
                <CommandRow
                  value={`"breadbox": { "command": "breadbox", "args": ["--project", "${projectId}", "mcp"] }`}
                />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Active project
                </h3>
                <CommandRow value={projectId} />
              </div>
            </div>
          </details>

          <p className="text-[11px] leading-relaxed text-neutral-500">
            Then just chat with Claude — e.g. “add an LED on pin 13 and blink it.”
            Keep this tab open to watch the board build itself.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-700 px-5 py-2 text-[10px] text-neutral-600">
          Local only. Requires the <span className="text-neutral-400">breadbox</span> CLI (bundled with the desktop app).
        </div>
      </div>
    </div>
  )
}

export const ConnectClaudeDialog = React.memo(ConnectClaudeDialogInner)
