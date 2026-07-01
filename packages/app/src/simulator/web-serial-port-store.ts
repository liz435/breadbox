// ── WebSerial Port Store ──────────────────────────────────────────────────
//
// Module-level store for the **paired** WebSerial `SerialPort` and the
// **single open session** on it.
//
// Why a store with explicit session lifecycle (instead of letting each
// consumer call `port.open()` directly): the WebSerial API allows only one
// open connection per port at a time. On hosted Breadbox both the Serial
// Monitor (long-lived read at the user's baud) and the STK500 uploader
// (short-lived session at 115200) need that single port. Routing both
// through `openMonitorSession` / `openFlashSession` here keeps the
// one-open-per-port invariant from leaking into every caller, and lets the
// upload path cleanly take over: opening a flash session closes any
// monitor session first, and the stored `monitorBaud` lets the
// `web-serial-board.ts` subscriber reopen the monitor at the right baud
// after the flash returns.
//
// Pattern mirrors `upload-status-store.ts` + `use-board-connection.ts` —
// module-level state, `useSyncExternalStore` for React readers, no
// context plumbing.

import { useSyncExternalStore } from "react"
import "./web-serial-types"
import type { SerialPort, SerialPortInfo } from "./web-serial-types"

// ── Display label for a paired SerialPort ─────────────────────────────────
//
// Chromium's `port.getInfo()` returns the device's USB VID/PID *when known*
// — but for plenty of USB-CDC devices (CH340 clones, generic Arduino-
// compatible boards, anything talking over a USB hub that elides the
// descriptors) both fields come back undefined. Showing "usb:????:????"
// to users was confusing; this helper picks the right label for what we
// actually know:
//
//   - both VID and PID known  →  "USB 2341:0043"   (lowercase hex, padded)
//   - either missing          →  "USB serial device"
//
// Known vendor hints could be folded in later (e.g. Arduino LLC 0x2341,
// CH340 0x1a86, FTDI 0x0403) to print "Arduino Uno" / "CH340 clone". Out
// of scope here — the immediate goal is to stop showing `????` to users.
export function formatPortLabel(info: SerialPortInfo | null | undefined): string {
  if (!info) return "No board paired"
  const { vendorId, productId } = info
  if (vendorId !== undefined && productId !== undefined) {
    const hex = (n: number) => n.toString(16).padStart(4, "0")
    return `USB ${hex(vendorId)}:${hex(productId)}`
  }
  return "USB serial device"
}

type SessionKind = "monitor" | "flash" | null

export type PairedPortState = {
  port: SerialPort | null
  info: SerialPortInfo | null
  session: SessionKind
  /**
   * Last baud the monitor was opened at. Remembered so a flash session can
   * close the monitor, do its thing, and the monitor can reopen at the
   * same baud automatically (the existing post-flash reconnect UX).
   */
  monitorBaud: number | null
}

const initial: PairedPortState = {
  port: null,
  info: null,
  session: null,
  monitorBaud: null,
}

let _state: PairedPortState = initial
const _listeners = new Set<() => void>()

function setState(next: Partial<PairedPortState>): void {
  _state = { ..._state, ...next }
  for (const fn of _listeners) fn()
}

export function getPairedPortState(): PairedPortState {
  return _state
}

export function usePairedPort(): PairedPortState {
  return useSyncExternalStore(
    (cb) => {
      _listeners.add(cb)
      return () => {
        _listeners.delete(cb)
      }
    },
    () => _state,
    () => _state,
  )
}

// ── Pairing ────────────────────────────────────────────────────────────────

function attachDisconnectHandler(port: SerialPort): void {
  const handler = () => {
    // If the user unplugs the board, the port becomes unusable. Clear it
    // so the UI moves back to "Pair a board." Any open session reader will
    // also error out and unwind through its own cleanup.
    if (_state.port === port) {
      setState({ port: null, info: null, session: null, monitorBaud: null })
    }
  }
  port.addEventListener("disconnect", handler)
}

/**
 * Prompts the user with the browser's native USB port picker. Returns once
 * the user has either picked a port or dismissed the prompt; in the
 * dismiss case no state change happens.
 */
export async function pairPort(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serial) {
    throw new Error("WebSerial is not supported in this browser")
  }
  try {
    // No filters: users with CH340/clone Arduinos or unusual USB-CDC
    // vendor IDs would otherwise see "no devices found." We let them
    // pick anything that exposes a serial endpoint and validate at
    // upload time.
    const port = await navigator.serial.requestPort()
    attachDisconnectHandler(port)
    setState({ port, info: port.getInfo(), session: null, monitorBaud: null })
  } catch (err) {
    // User cancelled the picker — not an error.
    if (err instanceof DOMException && err.name === "NotFoundError") return
    throw err
  }
}

/** Best-effort unpair: close any session, then `port.forget()` if supported. */
export async function unpairPort(): Promise<void> {
  const { port } = _state
  if (!port) return
  try {
    // Closing here would race with whichever session owns the port; let
    // the session's own close path run first by clearing state and letting
    // any in-flight reader unwind naturally.
    if (typeof port.forget === "function") {
      await port.forget()
    } else {
      // Older Chromium: best we can do is drop our reference. The port
      // permission still exists for the origin; `getPorts()` will pick
      // it up on next reload until the browser is restarted.
      await port.close().catch(() => {})
    }
  } finally {
    setState({ port: null, info: null, session: null, monitorBaud: null })
  }
}

/**
 * On app boot: if the user previously paired a port, re-acquire the
 * `SerialPort` reference via `getPorts()` so they don't have to re-pair
 * every reload. The browser remembers the permission grant per origin.
 */
export async function restorePairedPort(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serial) return
  try {
    const ports = await navigator.serial.getPorts()
    const port = ports[0]
    if (!port) return
    attachDisconnectHandler(port)
    setState({ port, info: port.getInfo() })
  } catch {
    // Permissions Policy / iframe / non-secure context — silent, the UI
    // will simply show "Pair a board" as if we'd never been here.
  }
}

// ── Session lifecycle ──────────────────────────────────────────────────────

export type MonitorSession = {
  reader: ReadableStreamDefaultReader<Uint8Array>
  writer: WritableStreamDefaultWriter<Uint8Array>
  close: () => Promise<void>
}

export type FlashSession = {
  reader: ReadableStreamDefaultReader<Uint8Array>
  writer: WritableStreamDefaultWriter<Uint8Array>
  setSignals: (signals: { dataTerminalReady?: boolean; requestToSend?: boolean }) => Promise<void>
  close: () => Promise<void>
}

/**
 * Close whatever session currently owns the port. Safe to call when no
 * session is open. Used internally by `openFlashSession` to pre-empt an
 * active monitor.
 */
async function closeActiveSession(): Promise<void> {
  const { port, session } = _state
  if (!port || !session) return
  try {
    await port.close()
  } catch {
    // ignore — the port may have been physically disconnected
  }
  setState({ session: null })
}

async function openSession(baud: number, kind: SessionKind): Promise<{
  port: SerialPort
  reader: ReadableStreamDefaultReader<Uint8Array>
  writer: WritableStreamDefaultWriter<Uint8Array>
}> {
  const { port } = _state
  if (!port) throw new Error("No paired port — call pairPort() first")
  // Pre-empt any other session. The caller is asserting it wants the port.
  if (_state.session && _state.session !== kind) {
    await closeActiveSession()
  }
  await port.open({ baudRate: baud })
  if (!port.readable || !port.writable) {
    await port.close().catch(() => {})
    throw new Error("Port opened without readable/writable streams")
  }
  const reader = port.readable.getReader()
  const writer = port.writable.getWriter()
  setState({ session: kind })
  return { port, reader, writer }
}

export async function openMonitorSession(baud: number): Promise<MonitorSession> {
  const { port, reader, writer } = await openSession(baud, "monitor")
  setState({ monitorBaud: baud })
  const close = async (): Promise<void> => {
    try { reader.cancel().catch(() => {}) } catch { /* ignore */ }
    try { reader.releaseLock() } catch { /* ignore */ }
    try { writer.releaseLock() } catch { /* ignore */ }
    try { await port.close() } catch { /* ignore */ }
    if (_state.session === "monitor") setState({ session: null })
  }
  return { reader, writer, close }
}

export async function openFlashSession(baud: number): Promise<FlashSession> {
  const { port, reader, writer } = await openSession(baud, "flash")
  const close = async (): Promise<void> => {
    try { reader.cancel().catch(() => {}) } catch { /* ignore */ }
    try { reader.releaseLock() } catch { /* ignore */ }
    try { writer.releaseLock() } catch { /* ignore */ }
    try { await port.close() } catch { /* ignore */ }
    if (_state.session === "flash") setState({ session: null })
  }
  return {
    reader,
    writer,
    setSignals: (signals) => port.setSignals(signals),
    close,
  }
}
