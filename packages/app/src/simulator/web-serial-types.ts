// Web Serial API types — augments the global Navigator interface with the
// subset of the spec we depend on. Kept in one place so the existing
// `web-serial.ts` wrapper (Serial Monitor) and the new hosted upload path
// (`web-serial-port-store.ts`, `stk500-uploader.ts`, `web-serial-board.ts`)
// share a single source of truth and TypeScript's interface merging never
// disagrees with itself.
//
// Imported for side effects: `import "./web-serial-types"`.

export type SerialPortInfo = {
  vendorId?: number
  productId?: number
}

export type SerialOptions = {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: "none" | "even" | "odd"
  bufferSize?: number
  flowControl?: "none" | "hardware"
}

export type SerialOutputSignals = {
  dataTerminalReady?: boolean
  requestToSend?: boolean
  break?: boolean
}

export type SerialPortFilter = {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  setSignals(signals: SerialOutputSignals): Promise<void>
  // `forget()` is in the spec but not all Chromium versions ship it. Callers
  // must feature-detect before invoking.
  forget?(): Promise<void>
  addEventListener(event: "disconnect" | "connect", handler: () => void): void
  removeEventListener(event: "disconnect" | "connect", handler: () => void): void
}

export interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
  addEventListener(event: "connect" | "disconnect", handler: (e: Event) => void): void
  removeEventListener(event: "connect" | "disconnect", handler: (e: Event) => void): void
}

declare global {
  interface Navigator {
    readonly serial?: Serial
  }
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator
}
