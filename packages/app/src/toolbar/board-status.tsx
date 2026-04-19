// ── Board Status Icon Button + Port Picker ───────────────────────────────
//
// Compact icon button in the bottom toolbar that opens a popover listing
// available USB serial ports. Used to connect to a real Arduino for the
// upload workflow. The icon tints green when a port is connected so the
// state is glanceable without a permanent text pill.

import { Popover } from "@base-ui/react/popover"
import { Usb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { cn } from "@/utils/classnames"

export function BoardStatus() {
  const { ports, cliAvailable, selectedPort, setSelectedPort, loading, refresh } =
    useBoardConnection()

  const connected = selectedPort !== null && ports.some((p) => p.path === selectedPort)

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            className="relative"
            aria-label={connected ? `Connected to ${selectedPort}` : "Connect to Arduino"}
          />
        }
      >
        <Usb
          className={cn(
            "size-3.5",
            connected ? "text-emerald-400" : "text-muted-foreground",
          )}
        />
        {connected && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-emerald-400" />
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 min-w-[280px] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <p className="mb-2 font-medium text-foreground">Arduino Boards</p>

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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
