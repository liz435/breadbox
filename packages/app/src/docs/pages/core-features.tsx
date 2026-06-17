import { type ReactNode } from "react"
import {
  CircuitBoard,
  Zap,
  Code2,
  Workflow,
  Terminal,
  ArrowRight,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "@/router"
import { cn } from "@/utils/classnames"
import { DocsLayout, PageTitle, Section, Table, Badge } from "@/docs/docs-layout"

// The six core functions that make up Breadbox. Each card links to its
// detailed reference page when one exists. Facts here are kept in sync with
// the dedicated pages (simulator, sketch, graph).
type Feature = {
  icon: LucideIcon
  title: string
  description: string
  badge: ReactNode
  to?: string
}

const FEATURES: Feature[] = [
  {
    icon: CircuitBoard,
    title: "Breadboard & Wiring",
    description:
      "Place components from a searchable palette onto a virtual breadboard wired to an Arduino Uno. Rotate with R, drag wire endpoints to reposition, and the layout auto-saves.",
    badge: <Badge variant="implemented">Implemented</Badge>,
  },
  {
    icon: Zap,
    title: "Circuit Simulation",
    description:
      "Real SPICE DC analysis (via the spicey library) runs automatically 250ms after any change, solving voltage, current, and power for every component. LEDs glow and current paths animate.",
    badge: <Badge variant="partial">DC only</Badge>,
    to: "/documentation/simulator",
  },
  {
    icon: Code2,
    title: "Sketch Run & Compile",
    description:
      "Write Arduino C++ and Compile & Run in the browser. A transpiler converts it to JavaScript, running setup() once then loop() at ~60fps with full pin I/O, Serial, timing, tone, and interrupts.",
    badge: <Badge variant="implemented">Implemented</Badge>,
    to: "/documentation/sketch",
  },
  {
    icon: Workflow,
    title: "Visual Programming",
    description:
      "Build Arduino logic by connecting nodes in a graph instead of typing code. The editor generates the equivalent sketch from the node layout.",
    badge: <Badge variant="partial">Partial</Badge>,
    to: "/documentation/graph",
  },
  {
    icon: Terminal,
    title: "Serial Monitor & Web Serial",
    description:
      "Bidirectional serial — Serial.print output and Serial.read input — works with both the in-browser simulation and a real Arduino over USB via the Web Serial API (Chrome/Edge).",
    badge: <Badge variant="implemented">Implemented</Badge>,
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  const { navigate } = useRouter()
  const { icon: Icon, title, description, badge, to } = feature

  const body = (
    <>
      <div className="flex items-center gap-3">
        {/* Solid amber chip mirrors the editor's active toolbar button. */}
        <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto">{badge}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
      {to && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
          Learn more <ArrowRight className="size-3" />
        </span>
      )}
    </>
  )

  const base = "rounded-md border border-border bg-card p-4 text-left"

  if (!to) {
    return <div className={base}>{body}</div>
  }

  return (
    <button
      onClick={() => navigate(to)}
      className={cn(base, "transition-colors hover:border-primary/50 hover:bg-accent")}
    >
      {body}
    </button>
  )
}

export function CoreFeaturesPage() {
  return (
    <DocsLayout>
      <PageTitle
        title="Core Features"
        subtitle="The building blocks of Breadbox — from breadboard to simulation to AI."
      />

      <Section title="At a glance">
        <p className="text-sm text-foreground leading-relaxed">
          Breadbox combines five core functions into a single browser-based workflow. Drop in
          components, wire them up, watch a live circuit simulation, run your sketch, and read serial
          output — all in the browser.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </Section>

      <Section title="Status">
        <Table
          headers={["Feature", "Status", "Notes"]}
          rows={[
            ["Breadboard & wiring", <Badge variant="implemented">Implemented</Badge>, "Searchable palette, auto-save"],
            ["Circuit simulation", <Badge variant="partial">Partial</Badge>, "SPICE DC steady-state only — no AC or capacitor dynamics"],
            ["Sketch run & compile", <Badge variant="implemented">Implemented</Badge>, "C++ → JS transpile, ~60fps loop"],
            ["Visual programming", <Badge variant="partial">Partial</Badge>, "Node UI works; codegen from graph"],
            ["Serial monitor / Web Serial", <Badge variant="implemented">Implemented</Badge>, "Simulated + real Arduino (Chrome/Edge)"],
          ]}
        />
      </Section>
    </DocsLayout>
  )
}
