// ── Lightweight Trace Spans ──────────────────────────────────────────────
//
// Simple run-level observability. Each request gets a trace with nested
// spans for major pipeline stages. No external dependencies — traces are
// logged and optionally persisted on the run file.

import { createLogger } from "../logger";

const log = createLogger("trace");

export type TraceSpan = {
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  children: TraceSpan[];
};

export type Trace = {
  traceId: string;
  runId: string;
  rootSpan: TraceSpan;
  /** Quick accessor for all completed spans flattened. */
  allSpans: () => TraceSpan[];
};

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function flattenSpans(span: TraceSpan): TraceSpan[] {
  return [span, ...span.children.flatMap(flattenSpans)];
}

export function createTrace(runId: string): Trace {
  const traceId = generateTraceId();
  const rootSpan: TraceSpan = {
    name: "request",
    startMs: performance.now(),
    children: [],
  };

  log.debug(`trace started: ${traceId} (run: ${runId})`);

  return {
    traceId,
    runId,
    rootSpan,
    allSpans: () => flattenSpans(rootSpan),
  };
}

/**
 * Start a child span under the given parent span.
 * Returns a `finish` function that closes the span and records duration.
 */
export function startSpan(
  parent: TraceSpan,
  name: string,
  metadata?: Record<string, unknown>,
): { span: TraceSpan; finish: (extra?: Record<string, unknown>) => void } {
  const span: TraceSpan = {
    name,
    startMs: performance.now(),
    metadata,
    children: [],
  };
  parent.children.push(span);

  return {
    span,
    finish(extra?: Record<string, unknown>) {
      span.endMs = performance.now();
      span.durationMs = span.endMs - span.startMs;
      if (extra) {
        span.metadata = { ...span.metadata, ...extra };
      }
    },
  };
}

/**
 * Close the root span of a trace and log a summary.
 */
export function closeTrace(trace: Trace): void {
  const root = trace.rootSpan;
  root.endMs = performance.now();
  root.durationMs = root.endMs - root.startMs;

  const spans = trace.allSpans();
  const summary = spans
    .filter((s) => s.durationMs != null)
    .map((s) => `${s.name}: ${s.durationMs!.toFixed(1)}ms`)
    .join(", ");

  log.info(`trace ${trace.traceId} closed — ${root.durationMs.toFixed(1)}ms total [${summary}]`);
}

/**
 * Serialize a trace to a JSON-safe object for persistence or streaming.
 */
export function serializeTrace(trace: Trace): {
  traceId: string;
  runId: string;
  totalMs: number;
  spans: Array<{ name: string; durationMs: number; metadata?: Record<string, unknown> }>;
} {
  const spans = trace.allSpans()
    .filter((s) => s.durationMs != null)
    .map((s) => ({
      name: s.name,
      durationMs: Math.round(s.durationMs!),
      ...(s.metadata ? { metadata: s.metadata } : {}),
    }));

  return {
    traceId: trace.traceId,
    runId: trace.runId,
    totalMs: Math.round(trace.rootSpan.durationMs ?? 0),
    spans,
  };
}
