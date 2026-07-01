// ── Board Manager ─────────────────────────────────────────────────────────
//
// Module-level singleton that manages open serial connections and their
// subscribers. Multiple WebSocket clients can subscribe to the same port;
// the port is opened once and closed when the last subscriber leaves.
//
// Also parses telemetry frames (D|ms|digital|analog) and stores a rolling
// 5-second buffer per port.

import { listPorts, openPort, writePort, closePort } from "./serialport-bridge"
import type { SerialPortInfo } from "./serialport-bridge"

export { listPorts }

// ── Telemetry ───────────────────────────────────────────────────────────

export type TelemetrySnapshot = {
  ts: number          // millis() from the board
  wallTime: number    // Date.now() when frame arrived
  digital: number[]   // D0-D13 HIGH/LOW
  analog: number[]    // A0-A5 ADC 0-1023
}

const TELEMETRY_RE = /^D\|(\d+)\|([01]+)\|([\d,]+)$/

function parseTelemetryFrame(line: string): TelemetrySnapshot | null {
  const m = TELEMETRY_RE.exec(line.trim())
  if (!m) return null
  const ts = parseInt(m[1], 10)
  const digital = m[2].split("").map(Number)
  const analog = m[3].split(",").filter(Boolean).map(Number)
  return { ts, wallTime: Date.now(), digital, analog }
}

// ── Subscriber ──────────────────────────────────────────────────────────

export type Subscriber = {
  id: string
  send: (data: string) => void
}

// ── Session ─────────────────────────────────────────────────────────────

type Session = {
  baudRate: number
  subscribers: Map<string, Subscriber>
  telemetry: TelemetrySnapshot[]
  latest: TelemetrySnapshot | null
  // Set while the port is deliberately released for a flash. Keeps
  // onPortClosed from tearing the session down so it can be reopened
  // after avrdude finishes (see releaseForFlash / reconnectAfter).
  suspended?: boolean
}

const sessions = new Map<string, Session>()

const TELEMETRY_WINDOW_MS = 5_000

// ── Public API ──────────────────────────────────────────────────────────

export async function getAvailablePorts(): Promise<SerialPortInfo[]> {
  return listPorts()
}

export async function subscribe(
  portPath: string,
  baudRate: number,
  subscriber: Subscriber,
): Promise<void> {
  let session = sessions.get(portPath)

  if (!session) {
    session = {
      baudRate,
      subscribers: new Map(),
      telemetry: [],
      latest: null,
    }
    sessions.set(portPath, session)

    await openPort(
      portPath,
      baudRate,
      (text) => onData(portPath, text),
      () => onPortClosed(portPath),
    )
  }

  session.subscribers.set(subscriber.id, subscriber)
}

export function unsubscribe(portPath: string, subscriberId: string): void {
  const session = sessions.get(portPath)
  if (!session) return

  session.subscribers.delete(subscriberId)

  if (session.subscribers.size === 0) {
    sessions.delete(portPath)
    closePort(portPath).catch(() => {})
  }
}

export function write(portPath: string, data: string): void {
  writePort(portPath, data)
}

export function getLatestSnapshot(portPath: string): TelemetrySnapshot | null {
  return sessions.get(portPath)?.latest ?? null
}

export function getTelemetryWindow(
  portPath: string,
  windowMs = TELEMETRY_WINDOW_MS,
): TelemetrySnapshot[] {
  const session = sessions.get(portPath)
  if (!session) return []
  const cutoff = Date.now() - windowMs
  return session.telemetry.filter((f) => f.wallTime >= cutoff)
}

/**
 * Release a port ahead of a flash so avrdude can open it, keeping the
 * session alive so it can be reopened afterward (via reconnectAfter).
 *
 * On Windows a COM port can only be owned by one process at a time, so
 * avrdude fails with `ser_open(): Access is denied` while our arduino-cli
 * monitor still holds the port. We must close the monitor first.
 *
 * Returns true if a live session was released (caller should reopen it
 * later), false if nothing was connected — in which case avrdude opens the
 * port directly and there is nothing to restore.
 */
export async function releaseForFlash(portPath: string): Promise<boolean> {
  const session = sessions.get(portPath)
  if (!session) return false

  // Let subscribers know the monitor is dropping out for the upload.
  broadcast(portPath, JSON.stringify({ type: "reconnecting" }))

  // Suppress the onClose → onPortClosed teardown so the session survives
  // the close and reconnectAfter() can bring it back.
  session.suspended = true
  await closePort(portPath)
  return true
}

/**
 * Close and reopen a port after a delay (used after flashing, when the board
 * resets and the bootloader holds the port for ~2s).
 */
export function reconnectAfter(portPath: string, delayMs: number): void {
  const session = sessions.get(portPath)
  if (!session) return

  // Notify subscribers
  broadcast(portPath, JSON.stringify({ type: "reconnecting" }))

  closePort(portPath).catch(() => {})

  setTimeout(async () => {
    if (!sessions.has(portPath)) return // all subscribers left during delay
    try {
      await openPort(
        portPath,
        session.baudRate,
        (text) => onData(portPath, text),
        () => onPortClosed(portPath),
      )
      session.suspended = false
      broadcast(portPath, JSON.stringify({ type: "connected" }))
    } catch (err) {
      broadcast(portPath, JSON.stringify({
        type: "error",
        error: `Reconnect failed: ${err instanceof Error ? err.message : err}`,
      }))
    }
  }, delayMs)
}

// ── Internal ─────────────────────────────────────────────────────────────

function onData(portPath: string, text: string): void {
  const session = sessions.get(portPath)
  if (!session) return

  // Split into lines and route: telemetry frames vs user output
  const lines = text.split("\n")
  const userLines: string[] = []

  for (const line of lines) {
    const frame = parseTelemetryFrame(line)
    if (frame) {
      session.latest = frame
      session.telemetry.push(frame)
      // Prune buffer
      const cutoff = Date.now() - TELEMETRY_WINDOW_MS
      while (session.telemetry.length > 0 && session.telemetry[0].wallTime < cutoff) {
        session.telemetry.shift()
      }
      // Send telemetry as a separate typed message
      broadcast(portPath, JSON.stringify({ type: "telemetry", frame }))
    } else {
      userLines.push(line)
    }
  }

  const userText = userLines.join("\n")
  if (userText) {
    broadcast(portPath, JSON.stringify({ type: "data", text: userText }))
  }
}

function onPortClosed(portPath: string): void {
  const session = sessions.get(portPath)
  // A deliberate release for flashing — keep the session so reconnectAfter
  // can reopen it, and don't tell subscribers the board went away.
  if (session?.suspended) return
  broadcast(portPath, JSON.stringify({ type: "disconnected" }))
  sessions.delete(portPath)
}

function broadcast(portPath: string, msg: string): void {
  const session = sessions.get(portPath)
  if (!session) return
  for (const sub of session.subscribers.values()) {
    try {
      sub.send(msg)
    } catch { /* subscriber gone */ }
  }
}
