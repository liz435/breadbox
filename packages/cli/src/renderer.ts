import type { BoardOp } from "@dreamer/schemas"

export type PlanPreview = {
  summary: string
  steps: Array<{ action: string; tool?: string; destructive: boolean }>
  isDestructive: boolean
  destructiveDetails?: string
}

export type RenderCallbacks = {
  onOps: (ops: BoardOp[]) => void
  onText: (text: string) => void
  onTextDelta: (delta: string) => void
  onStatus: (status: string) => void
  onError: (message: string) => void
  onPlanPreview: (plan: PlanPreview) => void
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
}

function formatOp(op: BoardOp): string {
  const p = op.payload as Record<string, unknown>
  switch (op.kind) {
    case "place_component": {
      const comp = p.component as { type: string; name: string; y: number; x: number }
      return `${C.green}+ ${comp.type}${C.reset} "${comp.name}" at row ${comp.y}, col ${comp.x}`
    }
    case "remove_component":
      return `${C.red}- component${C.reset} ${p.componentId}`
    case "connect_wire": {
      const w = p.wire as { fromCol: number; toRow: number; toCol: number }
      return `${C.cyan}~ wire${C.reset} from pin ${w.fromCol} to (row ${w.toRow}, col ${w.toCol})`
    }
    case "remove_wire":
      return `${C.red}- wire${C.reset} ${p.wireId}`
    case "update_sketch":
      return `${C.yellow}~ sketch updated${C.reset}`
    case "move_component":
      return `${C.yellow}~ moved${C.reset} ${p.componentId} to (${p.y}, ${p.x})`
    default:
      return `${C.dim}${op.kind}${C.reset}`
  }
}

export function createRenderer(): RenderCallbacks {
  return {
    onOps(ops) {
      for (const op of ops) {
        console.log(`  ${formatOp(op)}`)
      }
    },
    onText(text) {
      // Fallback for non-streaming: only used if no deltas were streamed
      if (!text) return
      console.log()
      console.log(`${C.bold}Assistant:${C.reset} ${text}`)
      console.log()
    },
    onTextDelta(delta) {
      process.stdout.write(delta)
    },
    onStatus(status) {
      if (status) {
        process.stdout.write(`\r${C.dim}${status}${C.reset}`)
      } else {
        process.stdout.write("\r\x1b[K")
      }
    },
    onError(message) {
      console.error(`${C.red}Error:${C.reset} ${message}`)
    },
    onPlanPreview(plan) {
      console.log()
      const marker = plan.isDestructive ? `${C.yellow}⚠ Destructive plan${C.reset}` : `${C.dim}Plan${C.reset}`
      console.log(`  ${marker}: ${plan.summary}`)
      for (const step of plan.steps) {
        const stepMarker = step.destructive ? `${C.red}-${C.reset}` : `${C.dim}·${C.reset}`
        console.log(`    ${stepMarker} ${step.action}`)
      }
      if (plan.destructiveDetails) {
        console.log(`  ${C.dim}${plan.destructiveDetails}${C.reset}`)
      }
      console.log()
    },
  }
}

export type TokenOverhead = {
  kind: string
  totalTokens: number
  model: string
}

export function printTokenUsage(
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  },
  overhead?: TokenOverhead[],
): void {
  const overheadTotal = overhead?.reduce((acc, o) => acc + o.totalTokens, 0) ?? 0
  const grandTotal = usage.totalTokens + overheadTotal
  console.log(
    `${C.dim}Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out / ${usage.totalTokens} agent${overheadTotal > 0 ? ` + ${overheadTotal} overhead = ${grandTotal} total` : ""}${C.reset}`,
  )
  if (overhead && overhead.length > 0) {
    for (const o of overhead) {
      console.log(`${C.dim}  ↳ ${o.kind}: ${o.totalTokens} tokens (${o.model})${C.reset}`)
    }
  }
}
