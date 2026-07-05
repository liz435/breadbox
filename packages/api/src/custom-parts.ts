// ── Custom Parts storage ───────────────────────────────────────────────────
//
// User-authored custom components, stored under the data home in one of two
// formats:
//   - code: `<id>.ts`  — a host-SDK module, transpiled and dynamically imported
//   - dsl:  `<id>.json` — a declarative DreamerCustomComponent spec, interpreted
//
// Code parts are validated by transpiling; DSL parts by parsing against
// customComponentDslSchema. Either way validation runs before the file lands.

import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { customComponentDslSchema, lintCustomComponentDsl } from "@dreamer/schemas";
import { customPartsDir } from "./paths";

const ID_RE = /^[a-z0-9-]+$/;

export type CustomPartFormat = "code" | "dsl";
export type CustomPartMeta = { id: string; format: CustomPartFormat };

const EXT: Record<CustomPartFormat, string> = { code: ".ts", dsl: ".json" };

export function isValidPartId(id: string): boolean {
  return ID_RE.test(id);
}

async function ensureDir(): Promise<string> {
  const dir = customPartsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Strip TypeScript types to a plain ES module. Throws on syntax errors. */
export function transpile(source: string): string {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  return transpiler.transformSync(source);
}

function formatOfFile(file: string): CustomPartFormat | null {
  if (file.endsWith(".ts")) return "code";
  if (file.endsWith(".json")) return "dsl";
  return null;
}

export async function listCustomParts(): Promise<CustomPartMeta[]> {
  const dir = await ensureDir();
  const entries = await readdir(dir).catch(() => [] as string[]);
  const parts: CustomPartMeta[] = [];
  for (const file of entries) {
    const format = formatOfFile(file);
    if (format) parts.push({ id: file.slice(0, file.lastIndexOf(".")), format });
  }
  return parts;
}

/** Read a part's source and format, or null if it doesn't exist. */
export async function getCustomPart(
  id: string,
): Promise<{ source: string; format: CustomPartFormat } | null> {
  if (!isValidPartId(id)) return null;
  const dir = await ensureDir();
  for (const format of ["code", "dsl"] as const) {
    try {
      const source = await readFile(join(dir, id + EXT[format]), "utf8");
      return { source, format };
    } catch {
      // try the next format
    }
  }
  return null;
}

/** Transpiled ES module for a CODE part; null if missing or a DSL part. */
export async function getCustomPartModule(id: string): Promise<string | null> {
  const part = await getCustomPart(id);
  if (!part || part.format !== "code") return null;
  return transpile(part.source);
}

export async function saveCustomPart(
  id: string,
  format: CustomPartFormat,
  source: string,
): Promise<void> {
  if (!isValidPartId(id)) throw new Error(`Invalid part id "${id}" — use kebab-case (a-z, 0-9, -)`);

  // Validate before persisting so a broken part never lands on disk.
  if (format === "code") {
    transpile(source);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("DSL part must be valid JSON");
    }
    const result = customComponentDslSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    // Semantic lint, same as the MCP save path — lint errors (unknown pin
    // refs, bad bindings) would produce a silently dead part at runtime.
    const lintErrors = lintCustomComponentDsl(result.data).filter((i) => i.severity === "error");
    if (lintErrors.length > 0) {
      throw new Error(lintErrors.map((i) => `${i.path}: ${i.message}`).join("; "));
    }
  }

  const dir = await ensureDir();
  await writeFile(join(dir, id + EXT[format]), source, "utf8");
  // A part has a single canonical format — drop the other extension if present.
  const other = format === "code" ? "dsl" : "code";
  await unlink(join(dir, id + EXT[other])).catch(() => {});
}

export async function deleteCustomPart(id: string): Promise<boolean> {
  if (!isValidPartId(id)) return false;
  const dir = await ensureDir();
  let removed = false;
  for (const format of ["code", "dsl"] as const) {
    try {
      await unlink(join(dir, id + EXT[format]));
      removed = true;
    } catch {
      // not present in this format
    }
  }
  return removed;
}
