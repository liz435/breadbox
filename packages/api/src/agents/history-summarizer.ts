import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import type { AgentRunFile, CachedSummary } from "../db/schemas";
import { buildModelMessagesFromRuns } from "../db/messages";
import { createLogger } from "../logger";

const log = createLogger("history-summarizer");

/** Maximum number of recent runs to keep as full messages. */
const RECENT_RUNS_TO_KEEP = 2;

/** Minimum number of completed core runs before we bother summarizing. */
const MIN_RUNS_FOR_SUMMARY = 4;

/**
 * Filters to completed core runs only.
 */
function getCoreRuns(runs: AgentRunFile[]): AgentRunFile[] {
  return runs.filter(
    (r) => r.run.status === "completed" && r.run.agent === "core"
  );
}

/**
 * Calls haiku to summarize a list of older runs into a compact text block.
 */
async function summarizeRuns(runs: AgentRunFile[]): Promise<string> {
  const transcript = runs
    .map((run, i) => {
      const userText = run.prompt;
      const assistantText = run.assistantText ?? "(no response)";
      return `Turn ${i + 1}:\nUser: ${userText}\nAssistant: ${assistantText}`;
    })
    .join("\n\n");

  const result = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    messages: [
      {
        role: "user",
        content: `Summarize this Arduino project conversation history into a brief context block. Focus on:
- What components were placed on the breadboard and how they're wired
- What the current sketch code does (key logic, not full code)
- Any problems encountered or design decisions made
- The user's overall goal

Be concise — this will be injected as context for a follow-up turn. Keep it under 300 words.

Conversation:
${transcript}`,
      },
    ],
  });
  return result.text;
}

/**
 * Builds conversation history using a cached summary when available.
 * If no cache exists or it's stale, falls back to a live haiku call.
 */
export async function buildSummarizedHistory(
  completedRuns: AgentRunFile[],
  cachedSummary?: CachedSummary
): Promise<ModelMessage[]> {
  const coreRuns = getCoreRuns(completedRuns);

  if (coreRuns.length < MIN_RUNS_FOR_SUMMARY) {
    return buildModelMessagesFromRuns(completedRuns);
  }

  const oldRuns = coreRuns.slice(0, -RECENT_RUNS_TO_KEEP);
  const recentRuns = coreRuns.slice(-RECENT_RUNS_TO_KEEP);

  let summary: string;

  // Use cached summary if it covers the right number of old runs
  if (cachedSummary && cachedSummary.runCount === oldRuns.length) {
    log.info(`using cached summary (covers ${cachedSummary.runCount} runs)`);
    summary = cachedSummary.text;
  } else {
    // Cache miss or stale — call haiku (blocking, but only on cache miss)
    log.info(
      `cache ${cachedSummary ? "stale" : "miss"} — summarizing ${oldRuns.length} runs live`
    );
    const start = performance.now();
    try {
      summary = await summarizeRuns(oldRuns);
      const elapsed = (performance.now() - start).toFixed(0);
      log.info(`live summary in ${elapsed}ms (${summary.length} chars)`);
    } catch (err) {
      log.warn(`summarization failed, falling back to compact transcript: ${err}`);
      summary = oldRuns
        .map((r, i) => `Turn ${i + 1}: ${r.prompt} → ${r.assistantText ?? "(no response)"}`)
        .join("\n");
    }
  }

  const recentMessages = buildModelMessagesFromRuns(recentRuns);

  return [
    {
      role: "user" as const,
      content: `[Earlier conversation summary]\n${summary}`,
    },
    {
      role: "assistant" as const,
      content:
        "Got it — I have the context from our earlier conversation. How can I help?",
    },
    ...recentMessages,
  ];
}

/**
 * Generates a fresh summary for a thread's history and returns it.
 * Intended to be called in the background after a run completes,
 * so the summary is pre-cached for the next request.
 */
export async function generateThreadSummary(
  completedRuns: AgentRunFile[]
): Promise<CachedSummary | null> {
  const coreRuns = getCoreRuns(completedRuns);

  // After this run, the next request will have coreRuns.length runs.
  // It will keep the last 2 as full messages and summarize the rest.
  // So we need to summarize all but the last 2.
  if (coreRuns.length < MIN_RUNS_FOR_SUMMARY) {
    return null; // Not enough runs to need a summary yet
  }

  const oldRuns = coreRuns.slice(0, -RECENT_RUNS_TO_KEEP);

  const start = performance.now();
  try {
    const text = await summarizeRuns(oldRuns);
    const elapsed = (performance.now() - start).toFixed(0);
    log.info(
      `background summary: ${oldRuns.length} runs in ${elapsed}ms (${text.length} chars)`
    );
    return { text, runCount: oldRuns.length };
  } catch (err) {
    log.warn(`background summarization failed: ${err}`);
    return null;
  }
}
