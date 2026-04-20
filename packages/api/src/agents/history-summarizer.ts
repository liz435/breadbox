import { generateText } from "ai";
import { anthropicModel } from "./anthropic-provider";
import type { ModelMessage } from "ai";
import type { AgentRunFile, CachedSummary } from "../db/schemas";
import { buildModelMessagesFromRuns } from "../db/messages";
import { createLogger } from "../logger";

const log = createLogger("history-summarizer");

/** Model used for summarization — cheap, consistent. Tracked separately in eval. */
const SUMMARIZER_MODEL = "claude-haiku-4-5-20251001";

/** Maximum number of recent runs to keep as full messages. */
const RECENT_RUNS_TO_KEEP = 2;

/** Minimum number of completed core runs before we bother summarizing. */
const MIN_RUNS_FOR_SUMMARY = 4;

/**
 * Token usage of a single summarizer invocation. Chat.ts rolls these into
 * the parent run's tokenUsage as "overhead" so evals see the true per-turn
 * cost. The parent's own input/output tokens are not mutated — these surface
 * via a dedicated `overhead` breakdown on the token usage record.
 */
export type SummarizerUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  /** "live" on cache miss (blocks the request), "background" on post-turn cache refresh. */
  source: "live" | "background";
};

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
 * Returns both the summary text and the token usage so callers can account
 * for the overhead.
 */
async function summarizeRuns(
  runs: AgentRunFile[],
  source: "live" | "background",
): Promise<{ text: string; usage: SummarizerUsage }> {
  const transcript = runs
    .map((run, i) => {
      const userText = run.prompt;
      const assistantText = run.assistantText ?? "(no response)";
      return `Turn ${i + 1}:\nUser: ${userText}\nAssistant: ${assistantText}`;
    })
    .join("\n\n");

  const result = await generateText({
    model: anthropicModel(SUMMARIZER_MODEL),
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

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  return {
    text: result.text,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      model: SUMMARIZER_MODEL,
      source,
    },
  };
}

/**
 * Builds conversation history using a cached summary when available.
 * If no cache exists or it's stale, falls back to a live haiku call.
 *
 * Returns the history messages along with any summarizer token usage incurred
 * (null when we hit the cache or when there weren't enough runs to summarize).
 * Callers should add this usage to the parent run's overhead total.
 */
export async function buildSummarizedHistory(
  completedRuns: AgentRunFile[],
  cachedSummary?: CachedSummary
): Promise<{ messages: ModelMessage[]; usage: SummarizerUsage | null }> {
  const coreRuns = getCoreRuns(completedRuns);

  if (coreRuns.length < MIN_RUNS_FOR_SUMMARY) {
    return { messages: buildModelMessagesFromRuns(completedRuns), usage: null };
  }

  const oldRuns = coreRuns.slice(0, -RECENT_RUNS_TO_KEEP);
  const recentRuns = coreRuns.slice(-RECENT_RUNS_TO_KEEP);

  let summary: string;
  let usage: SummarizerUsage | null = null;

  // Use cached summary if it covers the right number of old runs
  if (cachedSummary && cachedSummary.runCount === oldRuns.length) {
    log.info(`using cached summary (covers ${cachedSummary.runCount} runs)`);
    summary = cachedSummary.text;
  } else if (cachedSummary && cachedSummary.runCount < oldRuns.length) {
    // Stale cache: serve the stale summary immediately but trigger a
    // background refresh. This avoids blocking the request on a live
    // summarizer call while still keeping the cache up to date.
    log.info(
      `cache stale (covers ${cachedSummary.runCount}/${oldRuns.length} runs) — using stale + background refresh`
    );
    summary = cachedSummary.text;
    // Signal to caller that a background refresh is needed
    usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: SUMMARIZER_MODEL,
      source: "background",
    };
  } else {
    // Cache miss — call haiku (blocking)
    log.info(
      `cache miss — summarizing ${oldRuns.length} runs live`
    );
    const start = performance.now();
    try {
      const result = await summarizeRuns(oldRuns, "live");
      summary = result.text;
      usage = result.usage;
      const elapsed = (performance.now() - start).toFixed(0);
      log.info(
        `live summary in ${elapsed}ms (${summary.length} chars, ${result.usage.totalTokens} tokens)`
      );
    } catch (err) {
      log.warn(`summarization failed, falling back to compact transcript: ${err}`);
      summary = oldRuns
        .map((r, i) => `Turn ${i + 1}: ${r.prompt} → ${r.assistantText ?? "(no response)"}`)
        .join("\n");
    }
  }

  const recentMessages = buildModelMessagesFromRuns(recentRuns);

  return {
    messages: [
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
    ],
    usage,
  };
}

/**
 * Generates a fresh summary for a thread's history and returns it.
 * Intended to be called in the background after a run completes,
 * so the summary is pre-cached for the next request.
 *
 * Returns both the cached summary envelope AND the token usage, so callers
 * (chat.ts) can attribute the background-refresh cost to the run that
 * triggered it — eliminating the "hidden" summarizer overhead.
 */
export async function generateThreadSummary(
  completedRuns: AgentRunFile[]
): Promise<{ summary: CachedSummary; usage: SummarizerUsage } | null> {
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
    const result = await summarizeRuns(oldRuns, "background");
    const elapsed = (performance.now() - start).toFixed(0);
    log.info(
      `background summary: ${oldRuns.length} runs in ${elapsed}ms (${result.text.length} chars, ${result.usage.totalTokens} tokens)`
    );
    return {
      summary: { text: result.text, runCount: oldRuns.length },
      usage: result.usage,
    };
  } catch (err) {
    log.warn(`background summarization failed: ${err}`);
    return null;
  }
}
