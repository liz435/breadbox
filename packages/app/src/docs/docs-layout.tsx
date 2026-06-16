import { type ReactNode } from "react"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import { highlight } from "@/utils/syntax-highlight"
import { BookOpen, ChevronLeft } from "lucide-react"

// ── Shared primitives ──────────────────────────────────────────────────────

export function Badge({
  variant,
  children,
}: {
  variant: "implemented" | "partial" | "not-implemented"
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "implemented" && "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
        variant === "partial" && "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30",
        variant === "not-implemented" && "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
      )}
    >
      {children}
    </span>
  )
}

export function CodeBlock({ code, lang = "cpp" }: { code: string; lang?: string }) {
  return (
    <pre className="rounded-md bg-card border border-border p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap leading-relaxed">
      <code className={`language-${lang}`}>{highlight(code, lang)}</code>
    </pre>
  )
}

export function Table({
  headers,
  rows,
}: {
  headers: string[]
  rows: (string | ReactNode)[][]
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn("border-b border-border", i % 2 === 0 ? "bg-card" : "bg-card")}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-foreground align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-3 pb-2 border-b border-border">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
      {children}
    </div>
  )
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300">
      {children}
    </div>
  )
}

// ── Sidebar nav ────────────────────────────────────────────────────────────

type NavItem = {
  label: string
  path: string
}

type NavGroup = {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { label: "Overview", path: "/documentation" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "Board Targets", path: "/documentation/arduino-uno" },
      { label: "Circuit Simulator", path: "/documentation/simulator" },
      { label: "Sketch Editor", path: "/documentation/sketch" },
      { label: "Visual Programming", path: "/documentation/graph" },
      { label: "AI Agent", path: "/documentation/ai-agent" },
      { label: "Agent Eval", path: "/documentation/agent-eval" },
      { label: "Adding Components", path: "/documentation/extending" },
    ],
  },
  {
    title: "Components",
    items: [
      { label: "LED", path: "/documentation/components/led" },
      { label: "RGB LED", path: "/documentation/components/rgb-led" },
      { label: "Resistor", path: "/documentation/components/resistor" },
      { label: "Capacitor", path: "/documentation/components/capacitor" },
      { label: "Button", path: "/documentation/components/button" },
      { label: "Buzzer", path: "/documentation/components/buzzer" },
      { label: "Servo Motor", path: "/documentation/components/servo" },
      { label: "Potentiometer", path: "/documentation/components/potentiometer" },
      { label: "Photoresistor", path: "/documentation/components/photoresistor" },
      { label: "Temperature Sensor", path: "/documentation/components/temperature-sensor" },
      { label: "Ultrasonic Sensor", path: "/documentation/components/ultrasonic-sensor" },
      { label: "LCD 16×2", path: "/documentation/components/lcd-16x2" },
      { label: "7-Segment Display", path: "/documentation/components/seven-segment" },
      { label: "NeoPixel Strip", path: "/documentation/components/neopixel" },
      { label: "PIR Sensor", path: "/documentation/components/pir-sensor" },
      { label: "Relay", path: "/documentation/components/relay" },
      { label: "DC Motor", path: "/documentation/components/dc-motor" },
      { label: "DHT Sensor", path: "/documentation/components/dht-sensor" },
      { label: "IR Receiver", path: "/documentation/components/ir-receiver" },
      { label: "Shift Register", path: "/documentation/components/shift-register" },
      { label: "OLED Display", path: "/documentation/components/oled-display" },
    ],
  },
]

function NavLink({ item }: { item: NavItem }) {
  const { path, navigate } = useRouter()
  const isActive = path === item.path

  return (
    <button
      onClick={() => navigate(item.path)}
      className={cn(
        "w-full text-left px-2 py-1 rounded text-sm transition-colors",
        isActive
          ? "text-blue-400 bg-blue-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      {item.label}
    </button>
  )
}

function Sidebar() {
  const { navigate } = useRouter()

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <BookOpen className="size-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">Docs</span>
        <button
          onClick={() => navigate("/editor")}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          title="Back to editor"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.title}>
            <p className="px-2 mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// ── Main layout ────────────────────────────────────────────────────────────

export function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full bg-card text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8 max-w-3xl">
        {children}
      </main>
    </div>
  )
}

export function PageTitle({
  title,
  subtitle,
  badge,
}: {
  title: string
  subtitle?: string
  badge?: ReactNode
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
    </div>
  )
}
