import { describe, test, expect } from "bun:test";
import { ALL_NODE_TYPES, filterNodeTypes, fuzzyMatch } from "@/graph/node-search";

describe("node search fuzzy matching", () => {
  test("matches exact and case-insensitive terms", () => {
    expect(fuzzyMatch("setup", "Setup")).toBe(true);
    expect(fuzzyMatch("SETUP", "setup")).toBe(true);
  });

  test("matches substrings and fuzzy character sequences", () => {
    expect(fuzzyMatch("etu", "Setup")).toBe(true);
    expect(fuzzyMatch("stp", "Setup")).toBe(true);
  });

  test("returns false when characters are missing or out of order", () => {
    expect(fuzzyMatch("xyz", "Setup")).toBe(false);
    expect(fuzzyMatch("spt", "Setup")).toBe(false);
  });
});

describe("node search filtering", () => {
  test("blank and whitespace queries return all node types", () => {
    expect(filterNodeTypes("")).toHaveLength(ALL_NODE_TYPES.length);
    expect(filterNodeTypes("   ")).toHaveLength(ALL_NODE_TYPES.length);
  });

  test("filters by human label", () => {
    const results = filterNodeTypes("digital write");
    expect(results.some((n) => n.type === "digital_write")).toBe(true);
  });

  test("filters by node type id", () => {
    const results = filterNodeTypes("serial_print");
    expect(results.some((n) => n.type === "serial_print")).toBe(true);
  });

  test("filters by keyword metadata", () => {
    const results = filterNodeTypes("buzzer");
    expect(results.some((n) => n.type === "tone")).toBe(true);
  });

  test("returns an empty list for unmatched queries", () => {
    expect(filterNodeTypes("this-does-not-exist")).toEqual([]);
  });
});
