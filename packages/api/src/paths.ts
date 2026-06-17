// ── Path resolution ─────────────────────────────────────────────────────
//
// Two layers:
//
// 1. Data home (`dreamerHome()`) — per-project state: projects, runs,
//    threads, tests, logs, crashes, config. Follows DATA_DIR / BREADBOX_HOME
//    / dev-mode fallback to in-repo `packages/api/data/`. Dev and prod
//    differ here so working from source doesn't pollute `~/.breadbox/`.
//
// 2. Machine home (`dreamerMachineHome()`) — machine-scoped caches that
//    should be shared across dev and prod runs: the managed arduino-cli
//    binary, AVR core stamp, other downloaded tooling. Always defaults to
//    `~/.breadbox/` so a single install services every repo checkout.
//
// Precedence for data home (highest first):
//   1. DATA_DIR env var — legacy, used by tests to isolate to tmpdirs.
//   2. BREADBOX_HOME env var — canonical override.
//   3. In-repo `packages/api/data/` if running from source.
//   4. `~/.breadbox/` — default for installed binaries (falls back to a
//      pre-rebrand `~/.dreamer/` when it already exists).
//
// Precedence for machine home (highest first):
//   1. BREADBOX_MACHINE_HOME env var.
//   2. `~/.breadbox/` — always (with the same `~/.dreamer/` fallback).

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

// Default per-user home directory. Prefers `~/.breadbox`, but falls back to a
// pre-rebrand `~/.dreamer` when it already exists so an existing install's
// projects/config aren't orphaned by the rename. New installs use `~/.breadbox`.
function defaultUserHome(): string {
  const current = join(homedir(), ".breadbox");
  if (existsSync(current)) return current;
  const legacy = join(homedir(), ".dreamer");
  if (existsSync(legacy)) return legacy;
  return current;
}

export function dreamerHome(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.BREADBOX_HOME) return process.env.BREADBOX_HOME;
  if (isRunningFromSource) return IN_REPO_DATA_DIR;
  return defaultUserHome();
}

export function dreamerMachineHome(): string {
  if (process.env.BREADBOX_MACHINE_HOME) return process.env.BREADBOX_MACHINE_HOME;
  return defaultUserHome();
}

// ── Data-home paths (per-project state) ──────────────────────────────────
export function projectsDir(): string { return join(dreamerHome(), "projects"); }
export function legacyProjectsDir(): string { return join(projectsDir(), "_legacy"); }
export function runsDir(): string     { return join(dreamerHome(), "runs"); }
export function threadsDir(): string  { return join(dreamerHome(), "threads"); }
export function testsDir(): string    { return join(dreamerHome(), "tests"); }
export function logsDir(): string     { return join(dreamerHome(), "logs"); }
export function crashesDir(): string  { return join(dreamerHome(), "crashes"); }
export function sessionsDir(): string { return join(dreamerHome(), "sessions"); }
export function configPath(): string  { return join(dreamerHome(), "config.json"); }
export function motionProjectsDir(): string { return join(dreamerHome(), "motion-projects"); }
export function motionArtifactsDir(): string { return join(dreamerHome(), "motion-artifacts"); }
export function motionJobsDir(): string { return join(dreamerHome(), "motion-jobs"); }
export function customPartsDir(): string { return join(dreamerHome(), "custom-parts"); }

// ── Machine-home paths (shared caches/binaries) ──────────────────────────
export function binDir(): string   { return join(dreamerMachineHome(), "bin"); }
export function cacheDir(): string { return join(dreamerMachineHome(), "cache"); }
