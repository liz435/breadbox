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
    expect(fuzzyMatch("sprite", "Sprite")).toBe(true);
  });

  test("substring match", () => {
    expect(fuzzyMatch("rit", "Sprite")).toBe(true);
  });

  test("fuzzy character match", () => {
    expect(fuzzyMatch("spt", "Sprite")).toBe(true);
  });

  test("no match", () => {
    expect(fuzzyMatch("xyz", "Sprite")).toBe(false);
  });

  test("empty query matches anything", () => {
    expect(fuzzyMatch("", "Sprite")).toBe(true);
  });

  test("case insensitive", () => {
    expect(fuzzyMatch("SPRITE", "sprite")).toBe(true);
  });

  test("keyword match", () => {
    expect(fuzzyMatch("glsl", "glsl wgsl filter effect")).toBe(true);
  });

  test("partial keyword match", () => {
    expect(fuzzyMatch("filt", "glsl wgsl filter effect")).toBe(true);
  });
});
