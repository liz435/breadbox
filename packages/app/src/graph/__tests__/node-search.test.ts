import { describe, test, expect } from "bun:test";

// Test the fuzzy matching logic directly
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

describe("NodeSearch fuzzyMatch", () => {
  test("exact match", () => {
    expect(fuzzyMatch("setup", "Setup")).toBe(true);
  });

  test("substring match", () => {
    expect(fuzzyMatch("etu", "Setup")).toBe(true);
  });

  test("fuzzy character match", () => {
    expect(fuzzyMatch("stp", "Setup")).toBe(true);
  });

  test("no match", () => {
    expect(fuzzyMatch("xyz", "Setup")).toBe(false);
  });

  test("empty query matches anything", () => {
    expect(fuzzyMatch("", "Setup")).toBe(true);
  });

  test("case insensitive", () => {
    expect(fuzzyMatch("SETUP", "setup")).toBe(true);
  });

  test("keyword match", () => {
    expect(fuzzyMatch("pwm", "pwm led fade output")).toBe(true);
  });

  test("partial keyword match", () => {
    expect(fuzzyMatch("buz", "buzzer sound frequency speaker")).toBe(true);
  });
});
