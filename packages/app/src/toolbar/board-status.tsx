// ── Board Status Pill + Port Picker ───────────────────────────────────────
//
// Small pill in the bottom toolbar showing whether a real Arduino is connected.
// Clicking it opens a popover listing available ports.

import { Popover } from "@base-ui/react/popover"
import { useBoardConnection } from "@/simulator/use-board-connection"
import { cn } from "@/utils/classnames"

export function BoardStatus() {
  const { ports, cliAvailable, selectedPort, setSelectedPort, loading, refresh } =
    useBoardConnection()

  const connected = selectedPort !== null && ports.some((p) => p.path === selectedPort)

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors cursor-pointer select-none",
          connected
            ? "text-emerald-400 hover:bg-emerald-400/10"
            : "text-zinc-500 hover:bg-zinc-700/50",
        )}
        onClick={refresh}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            connected ? "bg-emerald-400" : "bg-zinc-600",
          )}
        />
        {connected ? selectedPort : "No board"}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={8}>
          <Popover.Popup className="z-50 min-w-[260px] rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl text-xs text-zinc-300">
            <p className="mb-2 font-semibold text-zinc-200">Arduino Boards</p>

            {!cliAvailable && (
              <div className="mb-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[10px] text-amber-400">
                <span className="font-semibold">arduino-cli not found.</span>{" "}
                <a
                  href="https://arduino.github.io/arduino-cli/installation/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-amber-300"
                >
                  Install it
                </a>{" "}
                to compile and flash sketches.
              </div>
            )}

            {loading && ports.length === 0 && (
              <p className="text-zinc-500 text-[10px]">Scanning ports…</p>
            )}

            {!loading && ports.length === 0 && (
              <p className="text-zinc-500 text-[10px]">No boards detected. Plug in an Arduino.</p>
            )}

            <div className="flex flex-col gap-1">
              {ports.map((port) => {
                const isSelected = port.path === selectedPort
                return (
                  <div
                    key={port.path}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors",
                      isSelected ? "bg-emerald-500/10 border border-emerald-500/30" : "hover:bg-zinc-800",
                    )}
                  >
                    <div>
                      <p className="font-mono text-[10px] text-zinc-200">{port.path}</p>
                      {port.manufacturer && (
                        <p className="text-[9px] text-zinc-500">{port.manufacturer}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPort(isSelected ? null : port.path)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] transition-colors",
                        isSelected
                          ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                          : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30",
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
