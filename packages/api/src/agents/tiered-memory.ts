// ── Tiered Memory Retrieval ──────────────────────────────────────────────
//
// Replaces the simple "last N runs as full messages + summarize older" approach
// with a three-tier system:
//
//   1. Recent messages    — last N turns kept in full
//   2. TF-IDF search     — find relevant older context by keyword similarity
//   3. Summary cache      — compressed summary of older conversation
//
// The merge step ranks and deduplicates results to fit the model's context.

import type { ModelMessage } from "ai";
import type { AgentRunFile, CachedSummary } from "../db/schemas/agent";
import { buildModelMessagesFromRuns } from "../db/messages";
import { buildSummarizedHistory, type SummarizerUsage } from "./history-summarizer";
import { createLogger } from "../logger";

const log = createLogger("tiered-memory");

/** Maximum number of recent runs to keep as full messages. */
const RECENT_RUNS_TO_KEEP = 2;

/** Maximum number of TF-IDF retrieved runs to include. */
const MAX_TFIDF_RESULTS = 2;

/** Minimum TF-IDF similarity score to include a run. */
const MIN_TFIDF_SCORE = 0.1;

// ── TF-IDF Implementation ───────────────────────────────────────────────

type TermFrequencyMap = Map<string, number>;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function computeTF(tokens: string[]): TermFrequencyMap {
  const tf: TermFrequencyMap = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  // Normalize by document length
  for (const [term, count] of tf) {
    tf.set(term, count / tokens.length);
  }
  return tf;
}

function computeIDF(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const n = documents.length;
  const allTerms = new Set(documents.flat());

  for (const term of allTerms) {
    const docsWithTerm = documents.filter((doc) => doc.includes(term)).length;
    idf.set(term, Math.log((n + 1) / (docsWithTerm + 1)) + 1);
  }

  return idf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weightA] of a) {
    const weightB = b.get(term) ?? 0;
    dotProduct += weightA * weightB;
    normA += weightA * weightA;
  }
  for (const [, weightB] of b) {
    normB += weightB * weightB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function tfidfSearch(
  query: string,
  runs: AgentRunFile[],
  maxResults: number,
): Array<{ run: AgentRunFile; score: number }> {
  if (runs.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Build document corpus from run prompts + assistant text
  const runTexts = runs.map((r) => {
    const parts = [r.prompt];
    if (r.assistantText) parts.push(r.assistantText);
    return parts.join(" ");
  });

  const documents = runTexts.map(tokenize);
  const allDocs = [...documents, queryTokens];
  const idf = computeIDF(allDocs);

  // Compute TF-IDF vectors
  function tfidfVector(tokens: string[]): Map<string, number> {
    const tf = computeTF(tokens);
    const tfidf = new Map<string, number>();
    for (const [term, tfValue] of tf) {
      tfidf.set(term, tfValue * (idf.get(term) ?? 0));
    }
    return tfidf;
  }

  const queryVector = tfidfVector(queryTokens);
  const scored = runs.map((run, i) => ({
    run,
    score: cosineSimilarity(queryVector, tfidfVector(documents[i]!)),
  }));

  return scored
    .filter((s) => s.score >= MIN_TFIDF_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Merge + Rank Context Window ─────────────────────────────────────────

export type TieredMemoryResult = {
  messages: ModelMessage[];
  usage: SummarizerUsage | null;
  /** Which runs were included via TF-IDF search (for observability). */
  tfidfRunIds: string[];
};

/**
 * Build conversation context using tiered retrieval:
 *   1. Recent runs → full messages
 *   2. TF-IDF search → relevant older runs as compact context
 *   3. Cached summary → compressed background
 *
 * Falls back to the existing `buildSummarizedHistory` when there aren't
 * enough runs for tiered retrieval.
 */
export async function buildTieredMemory(params: {
  prompt: string;
  completedRuns: AgentRunFile[];
  cachedSummary?: CachedSummary;
}): Promise<TieredMemoryResult> {
  const { prompt, completedRuns, cachedSummary } = params;

  const coreRuns = completedRuns.filter(
    (r) => r.run.status === "completed" && r.run.agent === "core",
  );

  // Not enough runs for tiered retrieval — fall back to existing logic
  if (coreRuns.length < 4) {
    const result = await buildSummarizedHistory(completedRuns, cachedSummary);
    return { ...result, tfidfRunIds: [] };
  }

  const recentRuns = coreRuns.slice(-RECENT_RUNS_TO_KEEP);
  const recentRunIds = new Set(recentRuns.map((r) => r.run.id));
  const olderRuns = coreRuns.filter((r) => !recentRunIds.has(r.run.id));

  // Tier 2: TF-IDF search over older runs
  const tfidfResults = tfidfSearch(prompt, olderRuns, MAX_TFIDF_RESULTS);
  const tfidfRunIds = tfidfResults.map((r) => r.run.run.id);

  log.info(
    `tiered memory — ${coreRuns.length} total, ${recentRuns.length} recent, ${tfidfResults.length} TF-IDF matches` +
      (tfidfResults.length > 0
        ? ` (scores: ${tfidfResults.map((r) => r.score.toFixed(2)).join(", ")})`
        : ""),
  );

  // Tier 3: Summary of remaining older runs (excluding TF-IDF hits to avoid duplication)
  const tfidfRunIdSet = new Set(tfidfRunIds);
  const runsForSummary = olderRuns.filter((r) => !tfidfRunIdSet.has(r.run.id));

  let summaryText: string | null = null;
  let usage: SummarizerUsage | null = null;

  if (runsForSummary.length >= 2) {
    // Try to use cached summary if it covers the right runs
    if (cachedSummary && cachedSummary.runCount === runsForSummary.length) {
      summaryText = cachedSummary.text;
    } else {
      // Fall back to existing summarization (which handles live/cached)
      const summaryResult = await buildSummarizedHistory(
        runsForSummary,
        // Pass cached summary — it may still be usable if runs overlap
        cachedSummary,
      );
      usage = summaryResult.usage;
      // Extract just the summary text from the messages
      const summaryMsg = summaryResult.messages.find(
        (m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[Earlier"),
      );
      if (summaryMsg && typeof summaryMsg.content === "string") {
        summaryText = summaryMsg.content.replace("[Earlier conversation summary]\n", "");
      }
    }
  }

  // Merge all tiers into messages
  const messages: ModelMessage[] = [];

  // Summary block (oldest context)
  if (summaryText) {
    messages.push({
      role: "user" as const,
      content: `[Earlier conversation summary]\n${summaryText}`,
    });
    messages.push({
      role: "assistant" as const,
      content: "Got it — I have the context from our earlier conversation.",
    });
  }

  // TF-IDF retrieved turns (relevant older context)
  if (tfidfResults.length > 0) {
    const retrievedMessages = buildModelMessagesFromRuns(
      tfidfResults.map((r) => r.run),
    );
    if (retrievedMessages.length > 0) {
      messages.push({
        role: "user" as const,
        content: "[Relevant earlier turns retrieved by similarity]",
      });
      messages.push({
        role: "assistant" as const,
        content: "I see the relevant context from those earlier turns.",
      });
      messages.push(...retrievedMessages);
    }
  }

  // Recent turns (full messages)
  const recentMessages = buildModelMessagesFromRuns(recentRuns);
  messages.push(...recentMessages);

  return { messages, usage, tfidfRunIds };
}
