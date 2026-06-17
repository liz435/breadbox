// ── Custom Parts storage ───────────────────────────────────────────────────
//
// User-authored custom components, stored as TypeScript source files under the
// data home ($BREADBOX_HOME/custom-parts/<id>.ts) and served to the frontend
// as transpiled ES modules it dynamically imports. Authors write against the
// in-app plugin host SDK (no imports, no JSX — use host.h for elements), so a
// part is just `export default (host) => host.defineComponent({...})`.
//
// Transpilation is Bun's built-in TS transpiler (type-stripping only); it also
// doubles as save-time validation — a syntax error throws before we persist.

import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { customPartsDir } from "./paths";

const ID_RE = /^[a-z0-9-]+$/;

export type CustomPartMeta = { id: string };

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

export async function listCustomParts(): Promise<CustomPartMeta[]> {
  const dir = await ensureDir();
  const entries = await readdir(dir).catch(() => [] as string[]);
  return entries
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ id: f.slice(0, -3) }));
}

export async function getCustomPartSource(id: string): Promise<string | null> {
  if (!isValidPartId(id)) return null;
  const dir = await ensureDir();
  try {
    return await readFile(join(dir, `${id}.ts`), "utf8");
  } catch {
    return null;
  }
}

/** Transpiled ES module for an id, or null if it doesn't exist. May throw on a transpile error. */
export async function getCustomPartModule(id: string): Promise<string | null> {
  const source = await getCustomPartSource(id);
  if (source == null) return null;
  return transpile(source);
}

export async function saveCustomPart(id: string, source: string): Promise<void> {
  if (!isValidPartId(id)) throw new Error(`Invalid part id "${id}" — use kebab-case (a-z, 0-9, -)`);
  // Validate it compiles before persisting so a broken part never lands on disk.
  transpile(source);
  const dir = await ensureDir();
  await writeFile(join(dir, `${id}.ts`), source, "utf8");
}

export async function deleteCustomPart(id: string): Promise<boolean> {
  if (!isValidPartId(id)) return false;
  const dir = await ensureDir();
  try {
    await unlink(join(dir, `${id}.ts`));
    return true;
  } catch {
    return false;
  }
}
