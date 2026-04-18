// ── RP2040 SketchRunner ───────────────────────────────────────────────────
//
// SketchRunner implementation backed by rp2040js (Cortex-M0+ emulation).
// Compiles via arduino-cli on the backend (fqbn "rp2040:rp2040:rpipico"),
// decodes the UF2 the backend returns, writes it into the emulator's flash,
// wires GPIO edges + UART0 TX into the shared pin store / serial pipe,
// and steps the CPU at ~125 MHz in 60 FPS chunks.
//
// **Lazy-loaded.** `rp2040js` is fetched via dynamic `import()` the first
// time `loadSketchAsync` runs — the ~150 KB emulator only reaches the
// bundle when a Pico sketch actually executes.
//
// ⚠️ Known caveat: the RP2040 bootrom is proprietary and not bundled with
// `rp2040js`. Without it the chip's `reset()` lands the PC inside zero-
// filled bootrom memory. Arduino-Pico firmware starts with a 256-byte
// "boot2" stage at flash+0x00, and the real vector table lives at
// flash+0x100 (FLASH_ORIGIN 0x10000000 + 0x100). As a best-effort we skip
// the bootrom entirely: after flash load we pull SP + reset-vector from
// 0x10000100 and write them directly into `mcu.core.SP` / `mcu.core.PC`.
// This works for sketches that only touch GPIO/SIO and rely on the
// linker-supplied clock defaults, but anything requiring the bootrom to
// init PLLs, XOSC, or flash XIP (e.g. reliable timing, Serial via USB CDC)
// will misbehave until someone drops a real bootrom.bin into place and
// calls `mcu.loadBootrom(...)`.
//
// Both serial surfaces are wired:
//
//   - `Serial` (USB CDC) — routed through rp2040js's `USBCDC` class, which
//     simulates the enumeration handshake against `mcu.usbCtrl`. Bytes
//     written by the sketch come out via `onSerialData`; bytes we want the
//     sketch to read go in via `sendSerialByte`.
//   - `Serial1` (UART0 TX on GP0, RX on GP1) — routed through `chip.uart[0]`.
//
// `sendSerialInput` pushes to both sinks — whichever the sketch is reading
// from wins. Output from either surface fans in to the same serial monitor.
// USB CDC still depends on the synthesised bootrom handoff above, so if the
// sketch relies on `Serial.begin()` doing real PLL setup it may time out
// before enumeration completes.

import { pinStateStore, type PinStateStore } from "../pin-state-store"
import { PeripheralBus, type PeripheralBoardInput } from "../peripherals/peripheral-bus"
import { type BoardTargetInfo } from "@dreamer/schemas"
import { compileSketch } from "../avr-compiler"
import { sketchSizeRef } from "../sketch-size-ref"
import type {
  CustomLibraryMap,
  PinSnapshot,
  RunnerKind,
  SketchRunner,
  SketchRunnerCallbacks,
  SketchRunnerLoadOptions,
} from "./sketch-runner"

// RP2040 runs at 125 MHz; step count per frame for 60 FPS real-time target.
const RP2040_CYCLES_PER_FRAME = Math.round(125_000_000 / 60)
// Setup budget — longer than AVR's 50ms because a Pico sketch typically
// spends more cycles in clock/GPIO init before the first loop().
const RP2040_SETUP_CYCLES = 125_000_000 / 10 // ~100ms simulated

const FLASH_ORIGIN = 0x10000000
const ARDUINO_PICO_VECTOR_TABLE_OFFSET = 0x100

// Lazy cache of the rp2040js module so the dynamic import only happens once
// per session (subsequent `loadSketchAsync` calls reuse it).
let rp2040jsModule: typeof import("rp2040js") | null = null
async function loadRp2040js(): Promise<typeof import("rp2040js")> {
  if (!rp2040jsModule) {
    rp2040jsModule = await import("rp2040js")
  }
  return rp2040jsModule
}

type Rp2040Module = typeof import("rp2040js")
type Rp2040Instance = InstanceType<Rp2040Module["RP2040"]>
type UsbCdcInstance = InstanceType<Rp2040Module["USBCDC"]>

export function createRp2040SketchRunner(
  target: BoardTargetInfo,
  callbacks: SketchRunnerCallbacks,
  store: PinStateStore = pinStateStore,
): SketchRunner {
  const kind: RunnerKind = "rp2040"
  const fqbn = target.fqbn

  const peripheralBus = new PeripheralBus()

  // Chip + reference to the loaded rp2040js module (needed for the
  // GPIOPinState enum inside listener callbacks). `cdc` is held separately
  // so `sendSerialInput` can feed bytes to the CDC RX path without having
  // to thread the instance through every call.
  let mcu: Rp2040Instance | null = null
  let mod: Rp2040Module | null = null
  let cdc: UsbCdcInstance | null = null
  // Decoder reused so multi-byte UTF-8 sequences flowing across callbacks
  // don't fragment mid-codepoint on the serial monitor.
  const cdcTextDecoder = new TextDecoder("utf-8", { fatal: false })

  function getMillis(): number {
    if (!mcu) return 0
    // mcu.clock.micros exists on the simulation clock; guard for older
    // rp2040js versions that might shape this differently.
    const micros = (mcu.clock as unknown as { micros?: number }).micros
    return typeof micros === "number" ? Math.floor(micros / 1000) : 0
  }

  function wireGpioListeners(chip: Rp2040Instance, Enum: Rp2040Module["GPIOPinState"]): void {
    const count = Math.min(chip.gpio.length, 30)
    for (let i = 0; i < count; i++) {
      const pin = chip.gpio[i]
      pin.addListener((state) => {
        if (state === Enum.High || state === Enum.Low) {
          const digital = state === Enum.High ? 1 : 0
          store.writeFromSketch(i, { digitalValue: digital, mode: "OUTPUT" })
          peripheralBus.dispatchEdge({
            pin: i,
            value: digital,
            simMs: getMillis(),
            source: "avr", // peripheral bus doesn't distinguish chip family today
          })
        } else if (state === Enum.InputPullUp) {
          store.writeFromSketch(i, { mode: "INPUT_PULLUP" })
        } else if (state === Enum.Input) {
          store.writeFromSketch(i, { mode: "INPUT" })
        }
      })
    }
  }

  function wireUart0(chip: Rp2040Instance): void {
    const uart0 = chip.uart[0]
    if (!uart0) return
    uart0.onByte = (byte: number) => {
      callbacks.onSerialPrint(String.fromCharCode(byte))
    }
  }

  function wireUsbCdc(chip: Rp2040Instance, Mod: Rp2040Module): UsbCdcInstance {
    const instance = new Mod.USBCDC(chip.usbCtrl)
    instance.onSerialData = (buf: Uint8Array) => {
      if (buf.byteLength === 0) return
      callbacks.onSerialPrint(cdcTextDecoder.decode(buf, { stream: true }))
    }
    return instance
  }

  function bootArduinoPicoFirmware(chip: Rp2040Instance, flashOffset: number): void {
    // Skip the missing bootrom: read SP + reset vector from the vector
    // table that Arduino-Pico lays down 0x100 bytes into flash (boot2
    // occupies the first 256 bytes).
    const view = new DataView(chip.flash.buffer, chip.flash.byteOffset, chip.flash.byteLength)
    const vtBase = flashOffset + ARDUINO_PICO_VECTOR_TABLE_OFFSET
    if (vtBase + 8 > chip.flash.byteLength) return
    const sp = view.getUint32(vtBase, true)
    const resetVector = view.getUint32(vtBase + 4, true)
    chip.core.SP = sp
    // Thumb mode: clear the low bit of the branch target before loading PC.
    chip.core.PC = resetVector & ~1
  }

  async function loadSketchAsync(
    code: string,
    customLibraries?: CustomLibraryMap,
    options?: SketchRunnerLoadOptions,
  ): Promise<{ success: boolean; error?: string }> {
    reset()

    const backendLibs: Record<string, { name: string; code: string; description: string }> = {}
    if (customLibraries) {
      for (const [name, codeBody] of Object.entries(customLibraries)) {
        backendLibs[name] = { name, code: codeBody, description: "" }
      }
    }

    const result = await compileSketch(code, {
      fqbn: options?.fqbn ?? fqbn,
      customLibraries: backendLibs,
      onLog: options?.onLog,
    })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    if (result.format !== "uf2") {
      return {
        success: false,
        error: `RP2040 runner received firmware in "${result.format}" format; expected "uf2". Check the fqbn (${options?.fqbn ?? fqbn}).`,
      }
    }

    if (result.sizeInfo) {
      sketchSizeRef.current = { ...result.sizeInfo, source: "actual", ts: Date.now() }
    }

    // Lazy-load rp2040js, construct the chip, wire listeners.
    mod = await loadRp2040js()
    const chip = new mod.RP2040()
    mcu = chip
    wireGpioListeners(chip, mod.GPIOPinState)
    wireUart0(chip)
    cdc = wireUsbCdc(chip, mod)

    // Write the UF2 image into flash and fake the bootrom handoff.
    if (result.flashOffset + result.flash.byteLength > chip.flash.byteLength) {
      return {
        success: false,
        error: `UF2 image overflows RP2040 flash (offset 0x${result.flashOffset.toString(16)}, size ${result.flash.byteLength}).`,
      }
    }
    chip.flash.set(result.flash, result.flashOffset)
    bootArduinoPicoFirmware(chip, result.flashOffset)

    return { success: true }
  }

  function runSetup(): void {
    if (!mcu) return
    try {
      for (let i = 0; i < RP2040_SETUP_CYCLES; i++) mcu.step()
    } catch (err) {
      callbacks.onError(
        err instanceof Error ? err.message : "Runtime error during RP2040 setup",
      )
    }
  }

  function runLoopIteration(): boolean {
    if (!mcu) return true
    try {
      for (let i = 0; i < RP2040_CYCLES_PER_FRAME; i++) mcu.step()
    } catch (err) {
      callbacks.onError(
        err instanceof Error ? err.message : "Runtime error in RP2040 execution",
      )
      return false
    }
    return true
  }

  function getPinState(pin: number): PinSnapshot {
    if (!mcu || pin < 0 || pin >= mcu.gpio.length) {
      return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    }
    if (!mod) return { digital: 0, analog: 0, pwm: 0, mode: 0 }
    const gp = mcu.gpio[pin]
    const isHigh = gp.value === mod.GPIOPinState.High
    const isOutput =
      gp.value === mod.GPIOPinState.High || gp.value === mod.GPIOPinState.Low
    return {
      digital: isHigh ? 1 : 0,
      analog: store.readAnalog(pin),
      pwm: 0,
      mode: isOutput ? 1 : 0,
    }
  }

  function sendSerialInput(text: string): void {
    if (!mcu || !text) return
    const uart0 = mcu.uart[0]
    for (let i = 0; i < text.length; i++) {
      const byte = text.charCodeAt(i) & 0xff
      uart0?.feedByte(byte)
      cdc?.sendSerialByte(byte)
    }
  }

  function reset(): void {
    if (mcu) {
      try {
        mcu.reset()
      } catch {
        // reset() on a chip with no bootrom can throw if internal state is
        // partially initialised — safe to swallow, the chip is about to be
        // dropped on the next load anyway.
      }
    }
    mcu = null
    cdc = null
    store.setExternalPinSink(null)
    store.reset()
    peripheralBus.detachBoard()
  }

  function isDelaying(): boolean {
    return false
  }

  function getMode(): RunnerKind {
    return kind
  }

  function getPinStore(): PinStateStore {
    return store
  }

  function getPeripheralBus(): PeripheralBus {
    return peripheralBus
  }

  function attachBoard(input: PeripheralBoardInput): void {
    peripheralBus.attachBoard(input)
  }

  return {
    kind,
    fqbn,
    loadSketchAsync,
    runSetup,
    runLoopIteration,
    sendSerialInput,
    getPinState,
    getMillis,
    reset,
    isDelaying,
    getMode,
    getPinStore,
    getPeripheralBus,
    attachBoard,
  }
}
