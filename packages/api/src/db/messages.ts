import type { ModelMessage } from "ai";
import type { AgentRunFile } from "./schemas";

/**
 * Builds a ModelMessage[] conversation history from completed agent runs.
 * Each run contributes a user message (from run.prompt) and the stored
 * model messages from the agent's conversation (run.messages).
 *
 * Only includes runs with agent === "core" (top-level runs),
 * so child specialist runs don't pollute the history.
 */
export function buildModelMessagesFromRuns(runs: AgentRunFile[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const run of runs) {
    if (run.run.status !== "completed") continue;
    // Only include top-level core runs in the thread history
    if (run.run.agent !== "core") continue;

    // Add the user prompt
    result.push({ role: "user", content: run.prompt });

    // Add stored model messages from the agent conversation
    for (const msg of run.messages) {
      if (msg && typeof msg === "object" && "role" in msg) {
        result.push(msg as ModelMessage);
      }
    }
  }

  return result;
}
