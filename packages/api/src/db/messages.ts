import type { ModelMessage } from "ai";
import type { AgentRunFile } from "./schemas";
import {
  EMPTY_REPORT,
  sanitizeModelMessages,
  type SanitizationReport,
} from "../agents/sanitize-messages";

export type BuiltMessages = {
  messages: ModelMessage[];
  /**
   * Sanitization report from the defensive layer. Currently always empty
   * because this function only emits stringly content (no tool-call
   * blocks), but the report is plumbed through so a future change that
   * replays raw tool blocks would surface counts to the user via the
   * existing data-history-sanitized SSE event.
   */
  report: SanitizationReport;
};

/**
 * Builds a ModelMessage[] conversation history from completed agent runs.
 * Each run contributes a compact user/assistant pair instead of replaying the
 * raw tool transcript. This keeps follow-up turns cheap and avoids feeding the
 * model its own earlier low-level tool chatter.
 *
 * Only includes runs with agent === "core" (top-level runs),
 * so child specialist runs don't pollute the history.
 */
export function buildModelMessagesFromRuns(runs: AgentRunFile[]): BuiltMessages {
  const result: ModelMessage[] = [];

  for (const run of runs) {
    if (run.run.status !== "completed") continue;
    // Only include top-level core runs in the thread history
    if (run.run.agent !== "core") continue;

    // Add the user prompt
    result.push({ role: "user", content: run.prompt });

    // Replay only the final assistant outcome, not the raw tool trace.
    const assistantText = run.assistantText?.trim();
    if (assistantText) {
      result.push({ role: "assistant", content: assistantText });
      continue;
    }

    // Fallback for older runs that may not have assistantText persisted.
    const lastAssistantText = [...run.messages]
      .reverse()
      .find((msg) => {
        if (!msg || typeof msg !== "object" || !("role" in msg) || msg.role !== "assistant") {
          return false;
        }
        const content = (msg as { content?: unknown }).content;
        if (typeof content === "string" && content.trim()) return true;
        if (Array.isArray(content)) {
          return content.some((part) => {
            return (
              part &&
              typeof part === "object" &&
              "type" in part &&
              part.type === "text" &&
              "text" in part &&
              typeof part.text === "string" &&
              part.text.trim().length > 0
            );
          });
        }
        return false;
      });

    if (!lastAssistantText) continue;

    const content = (lastAssistantText as { content?: unknown }).content;
    if (typeof content === "string" && content.trim()) {
      result.push({ role: "assistant", content });
      continue;
    }

    if (Array.isArray(content)) {
      const text = content
        .filter((part): part is { type: "text"; text: string } => {
          return (
            !!part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string"
          );
        })
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n");
      if (text) result.push({ role: "assistant", content: text });
    }
  }

  // Defensive sanitize: no-op today (we only push stringly content
  // above) but future-proofs against any change that replays raw
  // run.messages. Same sanitizer the mid-stream loop uses.
  const { sanitized, report } = sanitizeModelMessages(result);
  return {
    messages: sanitized,
    report: report.toolCalls + report.toolResults + report.messages > 0
      ? report
      : EMPTY_REPORT,
  };
}
