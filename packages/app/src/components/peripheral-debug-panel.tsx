// ── Peripheral Debug Panel ─────────────────────────────────────────────────
//
// Surfaces the peripheral bus' trace ring and current state snapshot for
// debugging. Mount anywhere in the app — it polls the VM reference passed
// in and renders a compact live view.

import { useEffect, useState } from "react"
import type { SketchRunner } from "@/simulator/runners/sketch-runner"
import type { PeripheralState, PeripheralTrace } from "@/simulator/peripherals/types"
import { cn } from "@/lib/utils"

type PeripheralDebugPanelProps = {
  runner: SketchRunner | null
  /** Poll interval in ms. Defaults to 200. */
  pollMs?: number
  /** Compact mode trims trace rows shown. */
  compact?: boolean
  className?: string
}

type Snapshot = {
  states: Record<string, PeripheralState>
  traces: ReadonlyArray<PeripheralTrace>
}

function emptySnapshot(): Snapshot {
  return { states: {}, traces: [] }
}

export function PeripheralDebugPanel({
  runner,
  pollMs = 200,
  compact = false,
  className,
}: PeripheralDebugPanelProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)

  useEffect(() => {
    if (!runner) {
      setSnapshot(emptySnapshot())
      return
    }
    const tick = () => {
      const bus = runner.getPeripheralBus()
      setSnapshot({
        states: bus.snapshot(),
        traces: bus.getAllTraces(),
      })
    }
    tick()
    const id = setInterval(tick, pollMs)
    return () => clearInterval(id)
  }, [runner, pollMs])

  const peripheralEntries = Object.entries(snapshot.states)
  const traceRows = compact ? snapshot.traces.slice(-12) : snapshot.traces.slice(-32)

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col gap-2 overflow-hidden rounded-md border border-border bg-card p-2 text-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Peripheral Bus</span>
        <span className="text-muted-foreground">
          {peripheralEntries.length} device{peripheralEntries.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className="flex flex-col gap-1 overflow-auto">
        {peripheralEntries.length === 0 ? (
          <div className="px-2 py-3 text-center text-muted-foreground">No peripherals attached</div>
        ) : (
          peripheralEntries.map(([id, state]) => (
            <div key={id} className="rounded border border-border/70 bg-background/40 px-2 py-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-foreground">{id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {state.kind}
                </span>
              </div>
              <PeripheralStateSummary state={state} />
            </div>
          ))
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Trace</span>
          <span className="text-muted-foreground">{snapshot.traces.length}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto font-mono text-[10px] leading-tight">
          {traceRows.length === 0 ? (
            <div className="px-2 py-3 text-center text-muted-foreground">No traces yet</div>
          ) : (
            traceRows.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-baseline gap-2 rounded px-1.5 py-0.5",
                  traceKindColor(t.kind),
                )}
              >
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                  {t.simMs.toFixed(1)}ms
                </span>
                <span className="w-10 shrink-0 uppercase text-muted-foreground">{t.kind}</span>
                <span className="truncate text-foreground">{t.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function traceKindColor(kind: PeripheralTrace["kind"]): string {
  switch (kind) {
    case "edge":
      return "bg-background/40"
    case "write":
      return "bg-blue-500/10"
    case "derive":
      return "bg-emerald-500/10"
    case "warn":
      return "bg-amber-500/15"
  }
}

function PeripheralStateSummary({ state }: { state: PeripheralState }) {
  switch (state.kind) {
    case "servo":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>pin D{state.pin}</span>
          <span>•</span>
          <span>{state.angle}°</span>
          <span>•</span>
          <span>{state.attached ? "attached" : "detached"}</span>
        </div>
      )
    case "buzzer":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>pin D{state.pin}</span>
          <span>•</span>
          <span>{state.playing ? "playing" : "silent"}</span>
          {state.frequencyHz !== null && (
            <>
              <span>•</span>
              <span>{Math.round(state.frequencyHz)} Hz</span>
            </>
          )}
        </div>
      )
    case "lcd":
      return (
        <div className="mt-0.5 space-y-0.5 font-mono text-[10px] text-muted-foreground">
          <div>{state.cols}×{state.rows}</div>
          {state.textBuffer.map((row, i) => (
            <div key={i} className="truncate text-foreground">
              {row}
            </div>
          ))}
        </div>
      )
    case "led":
      return (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          pin D{state.pin} • brightness {state.brightness}
        </div>
      )
    case "rgb_led":
      return (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          R{state.pins.r}:{state.brightness.r} G{state.pins.g}:{state.brightness.g} B{state.pins.b}:{state.brightness.b}
        </div>
      )
    case "neopixel":
      return (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          pin D{state.pin} • {state.pixels.length} px
        </div>
      )
    case "ultrasonic":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>trig D{state.trigPin ?? "?"}</span>
          <span>echo D{state.echoPin ?? "?"}</span>
          <span>•</span>
          <span>{state.distanceCm !== null ? `${state.distanceCm} cm` : "out of range"}</span>
          {state.lastPulseUs > 0 && (
            <>
              <span>•</span>
              <span>{state.lastPulseUs}µs</span>
            </>
          )}
        </div>
      )
    case "dht":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>pin D{state.signalPin ?? "?"}</span>
          <span>•</span>
          <span>{state.temperatureC}°C</span>
          <span>•</span>
          <span>{state.humidity}%</span>
        </div>
      )
    case "ir_receiver":
      return (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>pin D{state.signalPin ?? "?"}</span>
          <span>•</span>
          <span>{state.transmitting ? "sending" : "idle"}</span>
          {state.lastCode !== null && (
            <>
              <span>•</span>
              <span className="font-mono">0x{state.lastCode.toString(16).toUpperCase()}</span>
            </>
          )}
        </div>
      )
    case "raw":
      return null
  }
}
