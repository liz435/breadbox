// ── Logger ───────────────────────────────────────────────────────────────
//
// Two sinks:
//   - stderr, human-readable with ANSI colors (always)
//   - JSONL file at `~/.dreamer/logs/dreamer.log` (if enabled)
//
// Enable file sink by setting DREAMER_LOG_FILE=1 (default: off in dev,
// on in compiled binaries via a build-time define).
//
// Level filtering via DREAMER_LOG_LEVEL (debug|info|warn|error),
// default "info".
//
// Rotation: file is rotated when it exceeds ~10MB. The previous file is
// renamed to dreamer.log.1, older rotations .2, .3 up to .7. Oldest is
// discarded. Rotation is best-effort — errors are swallowed so logging
// never crashes the app.

import { existsSync, statSync, renameSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { logsDir } from "./paths";

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
} as const;

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const levelConfig: Record<LogLevel, { color: string; label: string }> = {
  debug: { color: colors.dim, label: "debug" },
  info: { color: colors.cyan, label: "info" },
  warn: { color: colors.yellow, label: "warn" },
  error: { color: colors.red, label: "error" },
};

function timestamp(): string {
  const now = new Date();
  return now.toISOString().slice(11, 23); // HH:mm:ss.SSS
}

function currentMinLevel(): number {
  const env = (process.env.DREAMER_LOG_LEVEL ?? "info") as LogLevel;
  return LEVEL_ORDER[env] ?? LEVEL_ORDER.info;
}

function fileSinkEnabled(): boolean {
  if (process.env.DREAMER_LOG_FILE === "0") return false;
  if (process.env.DREAMER_LOG_FILE === "1") return true;
  // Default: enable in compiled binaries, disable in dev.
  // Bun sets `Bun.embeddedFiles` on compiled binaries; check that.
  try {
    return typeof Bun !== "undefined" && Array.isArray((Bun as unknown as { embeddedFiles?: unknown[] }).embeddedFiles) &&
      ((Bun as unknown as { embeddedFiles: unknown[] }).embeddedFiles.length > 0);
  } catch {
    return false;
  }
}

const LOG_FILE_NAME = "dreamer.log";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ROTATIONS = 7;

let rotationChecked = false;

function rotateIfNeeded(filePath: string): void {
  if (rotationChecked) return;
  rotationChecked = true;
  try {
    if (!existsSync(filePath)) return;
    const stat = statSync(filePath);
    if (stat.size < MAX_SIZE_BYTES) return;
    for (let i = ROTATIONS - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`;
      const to = `${filePath}.${i + 1}`;
      if (existsSync(from)) {
        try { renameSync(from, to); } catch { /* best-effort */ }
      }
    }
    try { renameSync(filePath, `${filePath}.1`); } catch { /* best-effort */ }
  } catch {
    // swallow — logging must never throw
  }
}

let fileInitialized = false;

function ensureFileReady(): string | null {
  if (!fileSinkEnabled()) return null;
  try {
    const dir = logsDir();
    if (!fileInitialized) {
      mkdirSync(dir, { recursive: true });
      fileInitialized = true;
    }
    const file = join(dir, LOG_FILE_NAME);
    rotateIfNeeded(file);
    return file;
  } catch {
    return null;
  }
}

function writeJsonl(file: string, level: LogLevel, tag: string, message: string, data?: unknown): void {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      tag,
      message,
      ...(data !== undefined ? { data } : {}),
    });
    appendFileSync(file, entry + "\n");
  } catch {
    // swallow
  }
}

function formatMessage(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
): string {
  const { color, label } = levelConfig[level];
  const ts = `${colors.dim}${timestamp()}${colors.reset}`;
  const lvl = `${color}${label}${colors.reset}`;
  const t = `${colors.bold}[${tag}]${colors.reset}`;
  const base = `${ts} ${lvl} ${t} ${message}`;
  if (data === undefined) return base;
  const serialized =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return `${base}\n${colors.dim}${serialized}${colors.reset}`;
}

function createLogger(tag: string) {
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    if (LEVEL_ORDER[level] < currentMinLevel()) return;
    const line = formatMessage(level, tag, message, data);
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
    const file = ensureFileReady();
    if (file) writeJsonl(file, level, tag, message, data);
  };
  return {
    debug(message: string, data?: unknown) { emit("debug", message, data); },
    info(message: string, data?: unknown) { emit("info", message, data); },
    warn(message: string, data?: unknown) { emit("warn", message, data); },
    error(message: string, data?: unknown) { emit("error", message, data); },
    child(childTag: string) {
      return createLogger(`${tag}:${childTag}`);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

export { createLogger };
