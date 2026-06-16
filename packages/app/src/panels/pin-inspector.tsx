import { usePinStates } from "@/simulator/use-pin-state"
import { useBoardSelector } from "@/store/board-context"
import { cn } from "@/utils/classnames"
import { getBoardPinLayout } from "@/breadboard/breadboard-grid"
import { DEFAULT_BOARD_TARGET } from "@dreamer/schemas"

export function PinInspector() {
  const pinStates = usePinStates()
  const boardTarget = useBoardSelector((s) => s.boardTarget ?? DEFAULT_BOARD_TARGET)
  const pinLayout = getBoardPinLayout(boardTarget)
  const displayPins = Array.from(
    new Map(
      pinLayout.allPins
        .filter((p) => p.pin >= 0)
        .map((p) => [p.pin, p.label] as const),
    ),
  ).map(([pin, label]) => ({ pin, label }))

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      <div className="border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold text-foreground">
          Pin Inspector
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">Pin</th>
              <th className="px-2 py-1 text-left font-medium">Mode</th>
              <th className="px-2 py-1 text-center font-medium">Digital</th>
              <th className="px-2 py-1 text-center font-medium">Analog/PWM</th>
            </tr>
          </thead>
          <tbody>
            {displayPins.map(({ pin, label }) => {
              const ps = pinStates[pin]
              if (!ps) return null
              const isHigh = ps.digitalValue === 1
              const isPwmActive = ps.isPwm && ps.pwmValue > 0
              const isAnalogPin = label.startsWith("A")

              return (
                <tr
                  key={pin}
                  className="border-b border-border/50 hover:bg-secondary/30"
                >
                  <td className="px-2 py-0.5 font-mono text-foreground">
                    {label}
                  </td>
                  <td className="px-2 py-0.5 text-muted-foreground">
                    {ps.mode === "UNSET" ? "-" : ps.mode}
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <span
                      className={cn(
                        "font-mono",
                        isHigh ? "text-green-400" : "text-muted-foreground"
                      )}
                    >
                      {isHigh ? "HIGH" : "LOW"}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    {isPwmActive ? (
                      <span className="font-mono text-blue-400">
                        PWM {ps.pwmValue}
                      </span>
                    ) : isAnalogPin ? (
                      <span className="font-mono text-muted-foreground">
                        {ps.analogValue}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
