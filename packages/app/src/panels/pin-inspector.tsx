import { usePinStates } from "@/simulator/use-pin-state"
import { cn } from "@/utils/classnames"

function pinName(pin: number): string {
  if (pin >= 0 && pin <= 13) return `D${pin}`
  if (pin >= 14 && pin <= 19) return `A${pin - 14}`
  return `P${pin}`
}

export function PinInspector() {
  const pinStates = usePinStates()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      <div className="border-b border-zinc-700 px-3 py-1.5">
        <span className="text-xs font-semibold text-zinc-300">
          Pin Inspector
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="px-2 py-1 text-left font-medium">Pin</th>
              <th className="px-2 py-1 text-left font-medium">Mode</th>
              <th className="px-2 py-1 text-center font-medium">Digital</th>
              <th className="px-2 py-1 text-center font-medium">Analog/PWM</th>
            </tr>
          </thead>
          <tbody>
            {pinStates.map((ps) => {
              const isHigh = ps.digitalValue === 1
              const isPwmActive = ps.isPwm && ps.pwmValue > 0
              const isAnalogPin = ps.pin >= 14

              return (
                <tr
                  key={ps.pin}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <td className="px-2 py-0.5 font-mono text-zinc-300">
                    {pinName(ps.pin)}
                  </td>
                  <td className="px-2 py-0.5 text-zinc-500">
                    {ps.mode === "UNSET" ? "-" : ps.mode}
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    <span
                      className={cn(
                        "font-mono",
                        isHigh ? "text-green-400" : "text-zinc-600"
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
                      <span className="font-mono text-zinc-500">
                        {ps.analogValue}
                      </span>
                    ) : (
                      <span className="text-zinc-700">-</span>
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
