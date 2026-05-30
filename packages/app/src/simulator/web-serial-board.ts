// ── WebSerial-backed LocalBoardConnection ─────────────────────────────────
//
// Implements the same `LocalBoardConnection` shape that the Serial Monitor
// already consumes from `local-board.ts`, but reads/writes through the
// browser's WebSerial API via the paired-port store. Used on hosted
// Dreamer, where the server has no USB for `local-board.ts` to proxy.
//
// Coordination with the flash path:
//   - Both this board and the STK500 uploader share one `SerialPort` via
//     `web-serial-port-store.ts` (only one open session at a time).
//   - This board watches `upload-status-store`. When the upload
//     transitions out of idle, the read loop closes its monitor session
//     so the uploader can open a flash session at 115200. When the
//     status returns to idle/done/error, the monitor reopens at the same
//     baud it was on before — preserving the existing
//     reconnect-after-flash UX without the user having to touch anything.

import type { LocalBoardConnection, LocalBoardCallbacks } from "./local-board"
import {
  openMonitorSession,
  getPairedPortState,
  formatPortLabel,
  type MonitorSession,
} from "./web-serial-port-store"
import { getUploadState } from "@/toolbar/upload-status-store"

export function createWebSerialBoard(callbacks: LocalBoardCallbacks): LocalBoardConnection {
  let session: MonitorSession | null = null
  let connected = false
  let readLoopRunning = false
  let lastBaud: number | null = null
  // Suppresses the auto-reopen path on user-initiated disconnect, so
  // hitting Disconnect during a flash doesn't have us snap back open
  // immediately after.
  let userClosed = false

  async function startReadLoop(): Promise<void> {
    if (!session || readLoopRunning) return
    readLoopRunning = true
    const decoder = new TextDecoder()
    const localSession = session
    try {
      while (connected && session === localSession) {
        const { value, done } = await localSession.reader.read()
        if (done) break
        if (value) callbacks.onData(decoder.decode(value))
      }
    } catch (err) {
      if (connected) {
        callbacks.onError(err instanceof Error ? err.message : "Serial read error")
      }
    } finally {
      readLoopRunning = false
    }
  }

  async function openAt(baud: number): Promise<void> {
    if (!getPairedPortState().port) {
      callbacks.onError("No paired board — open the board popover and click Pair.")
      return
    }
    lastBaud = baud
    try {
      session = await openMonitorSession(baud)
      connected = true
      callbacks.onConnect()
      void startReadLoop()
    } catch (err) {
      session = null
      connected = false
      callbacks.onError(err instanceof Error ? err.message : "Failed to open port")
    }
  }

  async function closeSession(): Promise<void> {
    connected = false
    const current = session
    session = null
    if (current) {
      await current.close().catch(() => {})
    }
  }

  // ── Upload lifecycle watcher ─────────────────────────────────────────
  //
  // The store doesn't expose a non-React subscription, so we poll the
  // status at 250 ms. The flash flow opens with a ~250 ms DTR pulse,
  // which gives us a comfortable window to release the port before the
  // bootloader handshake starts. Cleared in `disconnect()` so we don't
  // leak an interval when the SerialMonitor unmounts.
  let lastStatus = getUploadState().status
  const pollIntervalId = setInterval(() => {
    const status = getUploadState().status
    if (status === lastStatus) return
    const prev = lastStatus
    lastStatus = status

    if (status === "compiling" && connected) {
      // Flash about to start: release the port and surface the same
      // "Reconnecting after flash" message the local path emits.
      void closeSession().then(() => {
        callbacks.onReconnecting?.()
      })
      return
    }

    const wasFlashing = prev === "compiling" || prev === "flashing" || prev === "reconnecting"
    const isDone = status === "idle" || status === "done" || status === "error"
    if (wasFlashing && isDone && !userClosed && !connected && lastBaud) {
      void openAt(lastBaud)
    }
  }, 250)

  async function connect(_portPath: string, baudRate: number): Promise<void> {
    // _portPath ignored — we use the paired port from the store. Keeping
    // the LocalBoardConnection signature lets SerialMonitor swap factories
    // without further branching.
    if (connected) await closeSession()
    userClosed = false
    await openAt(baudRate)
  }

  async function disconnect(): Promise<void> {
    userClosed = true
    clearInterval(pollIntervalId)
    await closeSession()
    callbacks.onDisconnect()
  }

  function write(data: string): void {
    const current = session
    if (!connected || !current) return
    const encoder = new TextEncoder()
    void current.writer.write(encoder.encode(data)).catch((err) => {
      callbacks.onError(err instanceof Error ? err.message : "Serial write error")
    })
  }

  function getPortPath(): string | null {
    const { info } = getPairedPortState()
    if (!info) return null
    // Synthetic "path" so the SerialMonitor's port-change effect (which
    // compares board.getPortPath() to the desired port string) can detect
    // a port swap. Re-uses the shared formatter so a `getInfo()` that
    // returns no VID/PID — common on CH340 clones and unbranded USB-CDC
    // devices — degrades to "USB serial device" instead of showing
    // `usb:????:????` in the UI.
    return formatPortLabel(info)
  }

  return {
    isConnected: () => connected,
    connect,
    disconnect,
    write,
    getPortPath,
  }
}
