// ── AI Hub modal ─────────────────────────────────────────────────────────
//
// A docs-styled hub for every way to bring AI into Breadbox, opened from the
// bottom-toolbar ✦ button. Mirrors the in-app Docs layout: a left sidebar
// "menu" of sections + a right content pane that explains the selected path and
// lets the user act on it inline.
//
//   Overview            → the three ways, at a glance
//   Built-in agent      → BYOK Anthropic key (reuses ApiKeyForm)
//   Connect Claude (MCP)→ what MCP is + connect (reuses ConnectClaudeContent)
//   Copy & paste        → external-chat round-trip (reuses useAiEdit/AiEditView)
//   Instant templates   → keyword builders, 0 tokens
//
// Mounted once in app.tsx (it needs the active projectId + board context) and
// toggled via the `breadbox:open-ai-hub` window event from AiHubButton.

import { useEffect, useState } from "react"
import { Sparkles, KeyRound, Plug, ClipboardPaste, Zap, BookOpen, X, ArrowRight } from "lucide-react"
import { cn } from "@/utils/classnames"
import { Badge, Note, Table, Warn } from "@/docs/docs-layout"
import { useCurrentUser } from "@/auth/use-current-user"
import { ApiKeyForm } from "@/auth/api-key-dialog"
import { ConnectClaudeContent } from "@/components/connect-claude-dialog"
import { AiEditView, useAiEdit } from "@/ai/diagram-edit"

export const OPEN_AI_HUB_EVENT = "breadbox:open-ai-hub"

type SectionId = "overview" | "built-in" | "mcp" | "copy-paste" | "templates"

const NAV: { id: SectionId; label: string; icon: typeof Sparkles }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "built-in", label: "Built-in agent", icon: KeyRound },
  { id: "mcp", label: "Connect Claude (MCP)", icon: Plug },
  { id: "copy-paste", label: "Copy & paste", icon: ClipboardPaste },
  { id: "templates", label: "Instant templates", icon: Zap },
]

type AiHubModalProps = {
  open: boolean
  onClose: () => void
  projectId: string
}

export function AiHubModal({ open, onClose, projectId }: AiHubModalProps) {
  const [section, setSection] = useState<SectionId>("overview")
  // Hooks run unconditionally (Rules of Hooks) — the copy-paste draft survives
  // open/close because the modal stays mounted.
  const ai = useAiEdit()

  // Land on the overview each time the hub opens.
  useEffect(() => {
    if (open) setSection("overview")
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative flex h-[clamp(420px,88vh,680px)] w-[900px] max-w-[94vw] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="AI features"
      >
        {/* Sidebar — the menu */}
        <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="size-4 flex-shrink-0 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI</span>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-primary font-medium text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 flex-shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content pane */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6">
            <SectionBody
              section={section}
              projectId={projectId}
              ai={ai}
              onNavigate={setSection}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

function SectionBody({
  section,
  projectId,
  ai,
  onNavigate,
}: {
  section: SectionId
  projectId: string
  ai: ReturnType<typeof useAiEdit>
  onNavigate: (s: SectionId) => void
}) {
  switch (section) {
    case "overview":
      return <OverviewSection onNavigate={onNavigate} />
    case "built-in":
      return <BuiltInSection />
    case "mcp":
      return <McpSection projectId={projectId} />
    case "copy-paste":
      return <CopyPasteSection ai={ai} />
    case "templates":
      return <TemplatesSection />
  }
}

function HubHeader({
  title,
  subtitle,
  badge,
}: {
  title: string
  subtitle?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function OverviewSection({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  return (
    <div>
      <HubHeader
        title="Bring AI into Breadbox"
        subtitle="Three ways to use AI — each drives the same circuit model, so you can mix them freely."
      />
      <div className="space-y-3">
        <Table
          headers={["Way", "What it is", "Model & cost"]}
          rows={[
            ["Built-in agent", "In-app chat that places parts, wires them, writes the sketch", "Your Anthropic key (BYOK)"],
            ["Your Claude over MCP", "Connect Claude Code / Desktop / Cursor; edits stream onto the canvas live", "Your AI client's plan"],
            ["Copy & paste", "Copy a baked prompt into any chatbot, paste the reply back", "Any chatbot — no key needed"],
          ]}
        />
        <Note>
          Start from an instant template, refine with the built-in agent, then hand the project to
          your own Claude over MCP — the same project file flows through all of them.
        </Note>
        <div className="flex flex-wrap gap-2 pt-1">
          {NAV.filter((n) => n.id !== "overview").map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onNavigate(n.id)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="size-3.5" />
                {n.label}
                <ArrowRight className="size-3 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BuiltInSection() {
  const { hasApiKey } = useCurrentUser()
  return (
    <div>
      <HubHeader
        title="Built-in agent"
        subtitle="Describe a circuit in the ✦ chat and the agent builds it — on your own Anthropic API key."
        badge={
          hasApiKey ? (
            <Badge variant="implemented">Key set</Badge>
          ) : (
            <Badge variant="partial">No key yet</Badge>
          )
        }
      />
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-foreground">
          Switch the bottom toolbar to AI mode (the ✦ tab), type a request in plain language, and
          press Enter. The agent reads your board, places components, draws wires, and updates the
          sketch in a single turn.
        </p>
        <ApiKeyForm autoFocus={false} />
        <Warn>
          You pay Anthropic directly at their per-token rates. The other two paths don&apos;t touch
          your key — templates run no model, and MCP bills against your own AI client&apos;s plan.
        </Warn>
      </div>
    </div>
  )
}

function McpSection({ projectId }: { projectId: string }) {
  return (
    <div>
      <HubHeader
        title="Connect Claude (MCP)"
        subtitle="Drive this board from the Claude you already use."
      />
      <div className="space-y-4">
        <Note>
          <strong className="font-semibold">What is MCP?</strong> The{" "}
          <a
            href="https://modelcontextprotocol.io/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Model Context Protocol
          </a>{" "}
          is an open standard that lets an AI client call external tools. Breadbox ships an MCP
          server exposing its circuit tools, so Claude Code, Claude Desktop, or Cursor can build
          and edit this board — using <em>your</em> model and subscription, with edits appearing
          on the canvas live.
        </Note>
        <ConnectClaudeContent projectId={projectId} />
      </div>
    </div>
  )
}

function CopyPasteSection({ ai }: { ai: ReturnType<typeof useAiEdit> }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HubHeader
        title="Copy & paste with any chatbot"
        subtitle="No API key, no MCP — works with any chatbot, even the free tiers."
      />
      <p className="mb-3 text-sm leading-relaxed text-foreground">
        Describe a change, copy the generated prompt into ChatGPT, Claude, or any chatbot, then
        paste its reply back and Apply. The board&apos;s diagram rides along inside the prompt, so
        the chat has everything it needs.
      </p>
      <div className="flex min-h-[22rem] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
        <AiEditView ai={ai} />
      </div>
    </div>
  )
}

function TemplatesSection() {
  return (
    <div>
      <HubHeader
        title="Instant templates"
        subtitle="Common circuits, built by deterministic code — 0 tokens, no key, under 100ms."
        badge={<Badge variant="implemented">7 templates</Badge>}
      />
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-foreground">
          Type one of these in the ✦ chat and it&apos;s matched by keyword before any model runs,
          then built with correct wiring and a working sketch.
        </p>
        <Table
          headers={["Template", "Try typing"]}
          rows={[
            ["Blink", '"blink LED"'],
            ["Button + LED", '"button-controlled LED"'],
            ["Servo sweep", '"servo sweep"'],
            ["Traffic light", '"traffic light"'],
            ["Pot + LED brightness", '"potentiometer LED"'],
            ["Temperature reading", '"temperature sensor"'],
            ["Buzzer tone", '"buzzer melody"'],
          ]}
        />
        <Note>
          Templates clear the board by default. Words like &quot;add&quot;, &quot;also&quot;, or
          &quot;another&quot; keep what&apos;s there — &quot;also add a buzzer&quot; preserves the board.
        </Note>
      </div>
    </div>
  )
}
