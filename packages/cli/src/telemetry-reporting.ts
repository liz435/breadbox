import type { Command } from "./cli-args"
import type * as telemetry from "./telemetry"

type TelemetryClient = Pick<typeof telemetry, "record" | "flush">

export async function recordCliErrorAndFlush(
  telemetryClient: TelemetryClient,
  subcommand: Command["kind"],
  err: unknown,
): Promise<void> {
  try {
    await telemetryClient.record({
      type: "cli.error",
      subcommand,
      errorName: err instanceof Error ? err.name : "non-error-throw",
    })
    await telemetryClient.flush()
  } catch {
    // Best-effort only. Never mask the main CLI error.
  }
}
