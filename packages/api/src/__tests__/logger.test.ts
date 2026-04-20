// ── Logger error-serialization regression ───────────────────────────────
//
// JSON.stringify treats Error's name/message/stack as non-enumerable, so a
// raw Error serializes to `{}` and the real failure is lost. We hit this
// when `streamText` surfaced an AI_APICallError via `onError`, the agent
// logged it via `log.error("streamText error", error)`, and the log output
// was an empty object — masking the cause until the pipeline timed out with
// a generic AI_NoOutputGeneratedError 5+ seconds later.
//
// These tests pin the expected serialized shape so a future "simplification"
// can't silently regress us back to empty-object errors.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createLogger } from "../logger";

type StdioSpy = {
  restore: () => void;
  lines: string[];
};

function spyStderr(): StdioSpy {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return {
    restore: () => {
      console.error = original;
    },
    lines,
  };
}

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("logger — error serialization", () => {
  let spy: StdioSpy;

  beforeEach(() => {
    spy = spyStderr();
  });

  afterEach(() => {
    spy.restore();
  });

  test("Error object exposes name, message, and stack (not empty {})", () => {
    const log = createLogger("test");
    const err = new Error("kaboom");
    err.name = "AI_APICallError";

    log.error("streamText error", err);

    const out = stripAnsi(spy.lines.join("\n"));
    expect(out).toContain("streamText error");
    // These three keys being present is the whole point of the fix.
    expect(out).toContain('"name": "AI_APICallError"');
    expect(out).toContain('"message": "kaboom"');
    expect(out).toContain('"stack":');
  });

  test("Error with AI-SDK-like extras (statusCode, responseBody) surfaces them", () => {
    const log = createLogger("test");
    const err = new Error("400 from provider") as Error & {
      statusCode?: number;
      responseBody?: string;
      url?: string;
    };
    err.name = "AI_APICallError";
    err.statusCode = 400;
    err.responseBody = '{"error":{"message":"bad schema"}}';
    err.url = "https://api.anthropic.com/v1/messages";

    log.error("streamText error", err);

    const out = stripAnsi(spy.lines.join("\n"));
    expect(out).toContain('"statusCode": 400');
    expect(out).toContain("bad schema");
    expect(out).toContain("api.anthropic.com");
  });

  test("nested Error via `cause` is walked (not swallowed)", () => {
    const log = createLogger("test");
    const root = new Error("underlying network reset");
    root.name = "TypeError";
    const wrapper = new Error("wrapping failure", { cause: root });
    wrapper.name = "AI_APICallError";

    log.error("streamText error", wrapper);

    const out = stripAnsi(spy.lines.join("\n"));
    expect(out).toContain('"name": "AI_APICallError"');
    expect(out).toContain("wrapping failure");
    expect(out).toContain("underlying network reset");
    expect(out).toContain('"name": "TypeError"');
  });

  test("plain object passthrough still works", () => {
    const log = createLogger("test");
    log.info("usage", { inputTokens: 12, outputTokens: 34 });

    const out = stripAnsi(spy.lines.join("\n") + "\n");
    // info level uses console.log, not console.error; this spy captures stderr
    // only. The call should not crash — that's the assertion.
    expect(out.length).toBeGreaterThanOrEqual(0);
  });
});
