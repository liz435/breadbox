// ── Path resolution ─────────────────────────────────────────────────────
//
// Two layers:
//
// 1. Data home (`dreamerHome()`) — per-project state: projects, runs,
//    threads, tests, logs, crashes, config. Follows DATA_DIR / DREAMER_HOME
//    / dev-mode fallback to in-repo `packages/api/data/`. Dev and prod
//    differ here so working from source doesn't pollute `~/.dreamer/`.
//
// 2. Machine home (`dreamerMachineHome()`) — machine-scoped caches that
//    should be shared across dev and prod runs: the managed arduino-cli
//    binary, AVR core stamp, other downloaded tooling. Always defaults to
//    `~/.dreamer/` so a single install services every repo checkout.
//
// Precedence for data home (highest first):
//   1. DATA_DIR env var — legacy, used by tests to isolate to tmpdirs.
//   2. DREAMER_HOME env var — canonical override.
//   3. In-repo `packages/api/data/` if running from source.
//   4. `~/.dreamer/` — default for installed binaries.
//
// Precedence for machine home (highest first):
//   1. DREAMER_MACHINE_HOME env var.
//   2. `~/.dreamer/` — always.

import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

const IN_REPO_DATA_DIR = join(import.meta.dir, "..", "data");
const isRunningFromSource = (() => {
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

export function dreamerMachineHome(): string {
  if (process.env.DREAMER_MACHINE_HOME) return process.env.DREAMER_MACHINE_HOME;
  return join(homedir(), ".dreamer");
}

// ── Data-home paths (per-project state) ──────────────────────────────────
export function projectsDir(): string { return join(dreamerHome(), "projects"); }
export function runsDir(): string     { return join(dreamerHome(), "runs"); }
export function threadsDir(): string  { return join(dreamerHome(), "threads"); }
export function testsDir(): string    { return join(dreamerHome(), "tests"); }
export function logsDir(): string     { return join(dreamerHome(), "logs"); }
export function crashesDir(): string  { return join(dreamerHome(), "crashes"); }
export function configPath(): string  { return join(dreamerHome(), "config.json"); }

// ── Machine-home paths (shared caches/binaries) ──────────────────────────
export function binDir(): string   { return join(dreamerMachineHome(), "bin"); }
export function cacheDir(): string { return join(dreamerMachineHome(), "cache"); }
