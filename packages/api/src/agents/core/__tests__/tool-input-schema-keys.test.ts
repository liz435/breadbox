import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createDefaultBoardState, type BoardOp, type BoardState } from "@dreamer/schemas";
import type { ProjectFile } from "../../../db/schemas";
import { createCoreTools } from "../tools";

// ── Anthropic tool-input schema-key regression ─────────────────────────────
//
// Anthropic's tool-input JSON Schema validator rejects any property key that
// doesn't match `^[a-zA-Z0-9_.-]{1,64}$`. A request with even a single
// disallowed key fails with HTTP 400 BEFORE the model is invoked:
//
//   AI_APICallError: tools.N.custom.input_schema.properties:
//     Property keys should match pattern '^[a-zA-Z0-9_.-]{1,64}$'
//
// That's how a stray `$schema` in `diagramSchema` broke every chat request.
// This test walks the JSON Schema emitted by `z.toJSONSchema()` for every
// registered core tool and asserts every property key is Anthropic-safe
// and length-bounded, so the class of bug can't sneak back in via any new
// tool or any nested field in a shared schema.

const ANTHROPIC_TOOL_KEY_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

function makeProject(boardState: BoardState): ProjectFile {
  const now = new Date().toISOString();
  return {
    project: {
      id: "project-1",
      name: "Test Project",
      ownerId: "test",
      version: 1,
      createdAt: now,
      updatedAt: now,
      threadId: "thread-1",
      activeSceneId: "scene-1",
    },
    scenes: {
      "scene-1": {
        id: "scene-1",
        name: "Scene 1",
        version: 1,
        settings: { background: "#000000", gravity: { x: 0, y: 0 } },
      },
    },
    entities: {},
    sceneEntityIds: { "scene-1": [] },
    components: {
      transform: {},
      sprite: {},
      tilemap: {},
      physicsBody: {},
      script: {},
      camera: {},
    },
    assets: {},
    boardState,
  };
}

/**
 * Walk a JSON Schema tree and collect every `properties`-key at every depth.
 * Returns `{ key, path }` so a failure points directly at the offending node.
 */
function collectPropertyKeys(
  schema: unknown,
  path = "$",
  found: Array<{ key: string; path: string }> = [],
): Array<{ key: string; path: string }> {
  if (!schema || typeof schema !== "object") return found;
  const node = schema as Record<string, unknown>;

  const props = node.properties;
  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      found.push({ key, path: `${path}.properties.${key}` });
    }
  }

  // Recurse through every value that could contain more schema nodes.
  // This covers `properties`, `items`, `anyOf`/`oneOf`/`allOf`, `$defs`,
  // `patternProperties`, `additionalProperties`, etc. — the full JSON
  // Schema tree.
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          collectPropertyKeys(value[i], `${path}.${key}[${i}]`, found);
        }
      } else {
        collectPropertyKeys(value, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

describe("core tool input schemas — Anthropic property-key compatibility", () => {
  const board = createDefaultBoardState();
  const project = makeProject(board);
  const ops: BoardOp[] = [];
  const { tools } = createCoreTools({
    project,
    sceneId: "scene-1",
    ops,
    mode: "all",
    workingBoard: board,
  });

  // AI SDK's `tool()` accepts `FlexibleSchema<INPUT>` (zod | standard-schema |
  // LazySchema | raw JSON Schema). In this codebase every core tool defines
  // its input with a zod schema, so we narrow via `unknown` rather than
  // pattern-matching every FlexibleSchema variant — if anyone switches to
  // a non-zod shape, the `z.toJSONSchema` call will throw and this test
  // will flag it immediately.
  const toolEntries = Object.entries(tools).map(
    ([name, t]) =>
      [name, (t as unknown as { inputSchema: z.ZodType }).inputSchema] as const,
  );

  test("every registered tool has a zod inputSchema", () => {
    expect(toolEntries.length).toBeGreaterThan(0);
    for (const [name, schema] of toolEntries) {
      expect(schema, `tool ${name} missing inputSchema`).toBeDefined();
    }
  });

  test.each(toolEntries)(
    "%s inputSchema: all property keys match Anthropic pattern ^[a-zA-Z0-9_.-]{1,64}$",
    (name, schema) => {
      const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
      const keys = collectPropertyKeys(jsonSchema);
      const bad = keys.filter(({ key }) => !ANTHROPIC_TOOL_KEY_PATTERN.test(key));
      if (bad.length > 0) {
        const details = bad
          .map(({ key, path }) => `  - "${key}" at ${path}`)
          .join("\n");
        throw new Error(
          `Tool "${name}" has property keys that Anthropic will reject (pattern ^[a-zA-Z0-9_.-]{1,64}$):\n${details}\n\nFix: rename the field, or expose a separate tool-facing schema that omits it (see diagramToolInputSchema in packages/schemas/src/design.ts).`,
        );
      }
      expect(bad).toEqual([]);
    },
  );
});
