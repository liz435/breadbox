// ── NeoPixelPeripheral ────────────────────────────────────────────────────
//
// Decodes the WS2812/NeoPixel one-wire waveform emitted by the real
// Adafruit_NeoPixel library in AVR mode. Each falling edge classifies the
// preceding HIGH pulse as a 0 or 1 bit; a >50µs low gap latches GRB bytes
// into the rendered pixel buffer.

import type { BoardComponent, ComponentType } from "@dreamer/schemas"
import type {
  Peripheral,
  PeripheralCapability,
  PeripheralContext,
  PeripheralState,
  PeripheralTrace,
  PinEdge,
} from "./types"
import { findArduinoPinForComponentPin } from "@/breadboard/component-pin-resolver"

const RESET_GAP_MS = 0.05
const ONE_HIGH_THRESHOLD_US = 0.55
const MIN_HIGH_US = 0.12
const MAX_HIGH_US = 1.15
const TRACE_RING_SIZE = 32

type Rgb = { r: number; g: number; b: number }
type NeoPixelStateShape = Extract<PeripheralState, { kind: "neopixel" }>

function blankPixels(count: number): Rgb[] {
  return Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0 }))
}

export class NeoPixelPeripheral implements Peripheral<NeoPixelStateShape> {
  readonly id: string
  readonly componentType: ComponentType = "neopixel"
  readonly capabilities: ReadonlySet<PeripheralCapability> = new Set([
    "lightEmitter",
    "requiresExternalPower",
  ])

  private _watchedPins = new Set<number>()
  private ctx: PeripheralContext | null = null
  private readonly component: BoardComponent
  private readonly pixelCount: number
  private boundPin: number | null = null
  private pixels: Rgb[]
  private pendingBits: number[] = []
  private highStartSimMs: number | null = null
  private lastFallingSimMs: number | null = null
  private active = false
  private traces: PeripheralTrace[] = []

  constructor(component: BoardComponent) {
    this.id = component.id
    this.component = component
    this.pixelCount = Math.max(1, Math.min(256, (component.properties.numLeds as number) ?? 8))
    this.pixels = blankPixels(this.pixelCount)
    const din = component.pins?.din
    if (typeof din === "number" && din >= 0) {
      this.boundPin = din
      this._watchedPins.add(din)
    }
  }

  get watchedPins(): ReadonlySet<number> {
    return this._watchedPins
  }

  attach(ctx: PeripheralContext): void {
    this.ctx = ctx
    if (this.boundPin === null) {
      const resolved = findArduinoPinForComponentPin(this.component, ["din", "signal"], ctx.wires)
      if (resolved !== null) {
        this.boundPin = resolved
        this._watchedPins.add(resolved)
      }
    }
  }

  onPinEdge(edge: PinEdge): void {
    if (edge.pin !== this.boundPin && !this._watchedPins.has(edge.pin)) return
    if (this.boundPin === null) this.boundPin = edge.pin

    if (edge.value === 1) {
      this.latchIfResetGap(edge.simMs)
      this.highStartSimMs = edge.simMs
      return
    }

    if (this.highStartSimMs === null) return
    const highUs = (edge.simMs - this.highStartSimMs) * 1000
    this.highStartSimMs = null
    this.lastFallingSimMs = edge.simMs

    if (highUs < MIN_HIGH_US || highUs > MAX_HIGH_US) {
      this.pendingBits = []
      return
    }

    this.pendingBits.push(highUs >= ONE_HIGH_THRESHOLD_US ? 1 : 0)
    const maxBits = this.pixelCount * 24
    if (this.pendingBits.length > maxBits) {
      this.pendingBits = this.pendingBits.slice(-maxBits)
    }
  }

  onTick(simMs: number): void {
    this.latchIfResetGap(simMs)
  }

  getState(): Readonly<NeoPixelStateShape> | null {
    if (this.boundPin === null) return null
    return {
      kind: "neopixel",
      pin: this.boundPin,
      pixels: this.pixels,
    }
  }

  reset(): void {
    this.pixels = blankPixels(this.pixelCount)
    this.pendingBits = []
    this.highStartSimMs = null
    this.lastFallingSimMs = null
    this.active = false
    this.traces = []
  }

  getTrace(): ReadonlyArray<PeripheralTrace> {
    return this.traces
  }

  private latchIfResetGap(simMs: number): void {
    if (this.lastFallingSimMs === null) return
    if (simMs - this.lastFallingSimMs < RESET_GAP_MS) return
    if (this.pendingBits.length >= 24) {
      this.latchBits(simMs)
    }
    this.pendingBits = []
    this.lastFallingSimMs = null
  }

  private latchBits(simMs: number): void {
    const next = blankPixels(this.pixelCount)
    const usableBits = Math.min(this.pendingBits.length, this.pixelCount * 24)
    const pixelsToRead = Math.floor(usableBits / 24)

    for (let i = 0; i < pixelsToRead; i++) {
      const base = i * 24
      const g = this.byteFromBits(base)
      const r = this.byteFromBits(base + 8)
      const b = this.byteFromBits(base + 16)
      next[i] = { r, g, b }
    }

    this.pixels = next
    this.active = next.some((p) => p.r > 0 || p.g > 0 || p.b > 0)
    this.trace({
      simMs,
      kind: "derive",
      message: `latched ${pixelsToRead} NeoPixel${pixelsToRead === 1 ? "" : "s"}`,
      detail: { pin: this.boundPin, pixels: pixelsToRead, active: this.active },
    })
  }

  private byteFromBits(offset: number): number {
    let value = 0
    for (let i = 0; i < 8; i++) {
      value = (value << 1) | (this.pendingBits[offset + i] ?? 0)
    }
    return value
  }

  private trace(entry: Omit<PeripheralTrace, "ts">): void {
    this.traces.push({ ...entry, ts: Date.now() })
    if (this.traces.length > TRACE_RING_SIZE) {
      this.traces = this.traces.slice(-TRACE_RING_SIZE)
    }
    this.ctx?.trace(entry)
  }
}

export function createNeoPixelPeripheral(component: BoardComponent): NeoPixelPeripheral {
  return new NeoPixelPeripheral(component)
}
