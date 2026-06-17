// ── Debugger Panel ──────────────────────────────────────────────────────────
//
// Source-level debugger UI. Shows the current halt state (PC, line, SP,
// cycles) with Continue / Step controls, plus — for AVR — the 32 general-
// purpose registers and a scrollable SRAM hex view. RP2040 supports
// breakpoints + stepping too, but its Cortex-M0 register/SRAM state doesn't
// fit the AVR-shaped inspector, so those sections hide for it. Reads reactive
// state from `debugStateStore` (via useDebugState) and drives execution
// through `simulationRef`. Disabled with a hint when the active runner has no
// debug surface (e.g. compile-only boards).

import { useMemo } from "react"
import { Play, StepForward, CornerDownRight, Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useDebugState } from "@/simulator/use-debug-state"
import { simulationRef } from "@/simulator/simulation-ref"
import type { DebugSnapshot } from "@/simulator/runners/sketch-runner"

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0")
}

function RegisterGrid({ registers }: { registers: Uint8Array }) {
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-0.5 font-mono text-xs">
      {Array.from(registers, (value, i) => (
        <div key={i} className="flex justify-between tabular-nums">
          <span className="text-muted-foreground">R{i}</span>
          <span className={value === 0 ? "text-muted-foreground" : "text-foreground"}>
            {hex(value, 2)}
          </span>
        </div>
      ))}
    </div>
  )
}

const SRAM_BYTES_PER_ROW = 16
const SRAM_MAX_ROWS = 128 // cap the rendered window (2KB) for responsiveness

function SramView({ sram }: { sram: Uint8Array }) {
  const rows = useMemo(() => {
    const out: { offset: number; bytes: number[] }[] = []
    const limit = Math.min(sram.length, SRAM_MAX_ROWS * SRAM_BYTES_PER_ROW)
    for (let i = 0; i < limit; i += SRAM_BYTES_PER_ROW) {
      out.push({
        offset: i,
        bytes: Array.from(sram.subarray(i, i + SRAM_BYTES_PER_ROW)),
      })
    }
    return out
  }, [sram])

  return (
    <div className="overflow-auto rounded border border-border bg-background/50 p-2 font-mono text-[11px] leading-tight">
      {rows.map((row) => (
        <div key={row.offset} className="flex gap-3 tabular-nums">
          {/* SRAM starts at data-space 0x100 on the ATmega328P. */}
          <span className="text-muted-foreground">{hex(0x100 + row.offset, 4)}</span>
          <span className="text-foreground">
            {row.bytes.map((b) => hex(b, 2)).join(" ")}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function HaltSummary({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatField label="Line" value={snapshot.line === null ? "—" : String(snapshot.line)} />
      <StatField label="PC" value={`0x${hex(snapshot.pc, 4)}`} />
      <StatField label="SP" value={`0x${hex(snapshot.sp, 4)}`} />
      <StatField label="Cycles" value={snapshot.cycles.toLocaleString()} />
    </div>
  )
}

export function DebuggerPanel() {
  const debug = useDebugState()
  const paused = debug.status === "paused"
  const canStep = paused && debug.canDebug

  if (!debug.canDebug) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Bug className="h-6 w-6 opacity-50" />
        <p>The debugger isn't available for the current board.</p>
        <p className="text-xs">
          Source-level stepping is supported on AVR boards (Uno / Nano / Mega).
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-3 text-foreground">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={!canStep}
                onClick={() => simulationRef.current?.continueRun()}
              />
            }
          >
            <Play className="h-3.5 w-3.5" /> Continue
          </TooltipTrigger>
          <TooltipContent>Resume free-run</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={!canStep}
                onClick={() => simulationRef.current?.stepOver()}
              />
            }
          >
            <StepForward className="h-3.5 w-3.5" /> Step
          </TooltipTrigger>
          <TooltipContent>Step to the next source line</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                disabled={!canStep}
                onClick={() => simulationRef.current?.stepInto()}
              />
            }
          >
            <CornerDownRight className="h-3.5 w-3.5" /> Instr
          </TooltipTrigger>
          <TooltipContent>Step a single instruction</TooltipContent>
        </Tooltip>

        <span className="ml-auto text-xs text-muted-foreground">
          {debug.status === "running"
            ? "running"
            : paused
              ? "paused"
              : "stopped"}
        </span>
      </div>

      {!debug.hasLineTable && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
          No source-line map for this build — breakpoints fall back to addresses.
        </p>
      )}

      {debug.current ? (
        <>
          <HaltSummary snapshot={debug.current} />

          {/* Register/SRAM inspector is AVR-shaped (32 8-bit regs, SRAM from
              0x100). Runners that can't supply it (RP2040 — Cortex-M0 register
              file + 264 KB SRAM don't fit) return empty arrays; hide the
              sections rather than render a misleading dump. */}
          {debug.current.registers.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Registers
              </span>
              <RegisterGrid registers={debug.current.registers} />
            </div>
          )}

          {debug.current.sram.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                SRAM
              </span>
              <SramView sram={debug.current.sram} />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <Bug className="h-6 w-6 opacity-50" />
          <p>
            {debug.breakpoints.size > 0
              ? "Running — execution will pause at your breakpoints."
              : "Click the editor gutter to set a breakpoint, then Run."}
          </p>
        </div>
      )}
    </div>
  )
}
