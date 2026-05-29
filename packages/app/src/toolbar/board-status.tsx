// ── Board Status Icon Button + Port Picker ───────────────────────────────
//
// Compact icon button in the bottom toolbar that opens a popover listing
// available USB serial ports. Used to connect to a real Arduino for the
// upload workflow. The icon tints green when a port is connected so the
// state is glanceable without a permanent text pill.
//
// Two modes:
//   - Local: the server enumerates USB ports via arduino-cli; the popover
//     shows that list, user picks one, and uploads/Serial Monitor route
//     through the server.
//   - Hosted: the server has no USB, so the browser owns the port via
//     WebSerial. The popover shows a "Pair a board" button that calls
//     `navigator.serial.requestPort()`. Same paired port is reused for
//     both flashing and Serial Monitor; see web-serial-port-store.ts.

import { Popover } from "@base-ui/react/popover"
import { Usb, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { useCapabilities } from "@/project/use-capabilities"
import { isWebSerialSupported } from "@/simulator/web-serial-types"
import {
  pairPort,
  unpairPort,
  usePairedPort,
} from "@/simulator/web-serial-port-store"
import { cn } from "@/utils/classnames"

export function BoardStatus() {
  const { capabilities } = useCapabilities()
  const { ports, cliAvailable, selectedPort, setSelectedPort, loading, refresh } =
    useBoardConnection()
  const { port: pairedPort, info: pairedInfo } = usePairedPort()

  const localConnected = selectedPort !== null && ports.some((p) => p.path === selectedPort)
  const hostedConnected = !!pairedPort
  const connected = capabilities.hosted ? hostedConnected : localConnected

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            // Hosted has no port polling, so refresh is a no-op there.
            onClick={capabilities.hosted ? undefined : refresh}
            // Auto-width chip (not a bare icon) so users see it as a
            // clickable popover trigger. The trailing ChevronDown is the
            // affordance — inside a shared bordered shell a lone Usb
            // icon reads as decorative.
            className="relative flex h-6 items-center gap-0.5 rounded px-1 hover:bg-accent"
            aria-label={
              connected
                ? capabilities.hosted
                  ? "Paired board"
                  : `Connected to ${selectedPort}`
                : "Connect to Arduino"
            }
          />
        }
      >
        <Usb
          className={cn(
            "size-3.5",
            connected ? "text-emerald-400" : "text-muted-foreground",
          )}
        />
        <ChevronDown className="size-3 text-muted-foreground/70" />
        {connected && (
          <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-emerald-400" />
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 min-w-[280px] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <p className="mb-2 font-medium text-foreground">Arduino Boards</p>

            {capabilities.hosted ? (
              <HostedPairingBody pairedPort={pairedPort} pairedInfo={pairedInfo} />
            ) : (
              <LocalPortListBody
                cliAvailable={cliAvailable}
                loading={loading}
                ports={ports}
                selectedPort={selectedPort}
                setSelectedPort={setSelectedPort}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── Local-mode body ──────────────────────────────────────────────────────

type LocalBodyProps = {
  cliAvailable: boolean
  loading: boolean
  ports: { path: string; manufacturer?: string }[]
  selectedPort: string | null
  setSelectedPort: (path: string | null) => void
}

function LocalPortListBody({
  cliAvailable,
  loading,
  ports,
  selectedPort,
  setSelectedPort,
}: LocalBodyProps) {
  return (
    <>
      {!cliAvailable && (
        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
          <span className="font-medium">arduino-cli not found.</span>{" "}
          <a
            href="https://arduino.github.io/arduino-cli/installation/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-amber-200"
          >
            Install it
          </a>{" "}
          to compile and flash sketches.
        </div>
      )}

      {loading && ports.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Scanning ports…</p>
      )}

      {!loading && ports.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No boards detected. Plug in an Arduino.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {ports.map((port) => {
          const isSelected = port.path === selectedPort
          return (
            <div
              key={port.path}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors",
                isSelected
                  ? "border border-emerald-500/30 bg-emerald-500/10"
                  : "border border-transparent hover:bg-accent",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] text-foreground">
                  {port.path}
                </p>
                {port.manufacturer && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {port.manufacturer}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPort(isSelected ? null : port.path)}
                className={cn(
                  "shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] transition-colors",
                  isSelected
                    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
                    : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
                )}
              >
                {isSelected ? "Disconnect" : "Connect"}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Hosted-mode body ─────────────────────────────────────────────────────

type HostedBodyProps = {
  pairedPort: unknown // SerialPort, but typed as unknown to keep the type out of this layer
  pairedInfo: { vendorId?: number; productId?: number } | null
}

function HostedPairingBody({ pairedPort, pairedInfo }: HostedBodyProps) {
  if (!isWebSerialSupported()) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
        <span className="font-medium">WebSerial requires Chrome or Edge.</span>{" "}
        Open this app in a Chromium-based browser to flash a board, or
        install the Dreamer CLI to use Safari/Firefox.
      </div>
    )
  }

  if (!pairedPort) {
    return (
      <>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Pair a USB Arduino once — the browser remembers it for this site.
        </p>
        <button
          type="button"
          onClick={() => { void pairPort() }}
          className="w-full cursor-pointer rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-[11px] text-emerald-300 transition-colors hover:bg-emerald-500/25"
        >
          Pair a board
        </button>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Arduino Uno only for now. Nano and Pico support coming soon.
        </p>
      </>
    )
  }

  const vidPid =
    pairedInfo?.vendorId !== undefined && pairedInfo?.productId !== undefined
      ? `${pairedInfo.vendorId.toString(16).padStart(4, "0")}:${pairedInfo.productId.toString(16).padStart(4, "0")}`
      : "USB device"

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-foreground">Paired</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{vidPid}</p>
        </div>
        <button
          type="button"
          onClick={() => { void unpairPort() }}
          className="shrink-0 cursor-pointer rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300 transition-colors hover:bg-red-500/25"
        >
          Forget
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        The browser will use this port for both Upload and Serial Monitor.
      </p>
    </>
  )
}
