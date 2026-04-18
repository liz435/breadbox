// ── Path resolution ─────────────────────────────────────────────────────
//
// Single source of truth for where Dreamer stores persistent data.
//
// Precedence (highest first):
//   1. DATA_DIR env var — legacy, used by tests to isolate to tmpdirs.
//   2. DREAMER_HOME env var — canonical override for custom install locations.
//   3. If running from source (in-repo `packages/api/data/` directory exists
//      adjacent to this module), use that — preserves the dev workflow.
//   4. `~/.dreamer/` — default for installed binaries.

import { homedir } from "os";
import { existsSync } from "fs";
import { join, dirname } from "path";

const IN_REPO_DATA_DIR = join(import.meta.dir, "..", "data");
const isRunningFromSource = (() => {
  // import.meta.dir is packages/api/src when in source; packages/api/data
  // is its sibling. If that directory exists, we're in dev mode. In a
  // compiled binary the directory won't be present.
  try {
    return existsSync(IN_REPO_DATA_DIR);
  } catch {
    return false;
  }
})();

export function dreamerHome(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.DREAMER_HOME) return process.env.DREAMER_HOME;
  if (isRunningFromSource) return IN_REPO_DATA_DIR;
  return join(homedir(), ".dreamer");
}

export function projectsDir(): string {
  return join(dreamerHome(), "projects");
}

export function runsDir(): string {
  return join(dreamerHome(), "runs");
}

export function threadsDir(): string {
  return join(dreamerHome(), "threads");
}

export function testsDir(): string {
  return join(dreamerHome(), "tests");
}

export function logsDir(): string {
  return join(dreamerHome(), "logs");
}

export function cacheDir(): string {
  return join(dreamerHome(), "cache");
}

export function binDir(): string {
  return join(dreamerHome(), "bin");
}

export function crashesDir(): string {
  return join(dreamerHome(), "crashes");
}

export function configPath(): string {
  return join(dreamerHome(), "config.json");
}
