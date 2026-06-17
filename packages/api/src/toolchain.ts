// ── Toolchain resolver ───────────────────────────────────────────────────
//
// Resolves external binaries (arduino-cli today; could grow later). Callers
// get an absolute path. First-run in a fresh install triggers a managed
// download to `~/.dreamer/bin/`.
//
// Resolution order for arduino-cli:
//   1. $BREADBOX_ARDUINO_CLI env var (explicit override) — used as-is.
//   2. $BREADBOX_HOME/bin/arduino-cli if it exists — managed install.
//   3. `which arduino-cli` on PATH — system install (Homebrew, apt, etc.).
//   4. If opts.install !== false: prompt + run arduino-cli's official
//      installer into $BREADBOX_HOME/bin, then return that path.
//   5. Throw ArduinoCliMissingError.

import { existsSync } from "fs";
import { mkdir, chmod } from "fs/promises";
import { binDir, cacheDir } from "./paths";
import { join } from "path";
import { createLogger } from "./logger";

const log = createLogger("toolchain");

/** Caps on long-running toolchain spawns. Installer can legitimately
 *  take several minutes on a cold path, so the ceiling is generous. */
const WHICH_TIMEOUT_MS = 5_000
const INSTALLER_TIMEOUT_MS = 10 * 60_000
const CORE_UPDATE_INDEX_TIMEOUT_MS = 60_000
const CORE_INSTALL_TIMEOUT_MS = 15 * 60_000

function installKillTimer(proc: { kill: () => void }, timeoutMs: number): () => void {
  const t = setTimeout(() => {
    try { proc.kill() } catch { /* already dead */ }
  }, timeoutMs)
  return () => clearTimeout(t)
}

export class ArduinoCliMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArduinoCliMissingError";
  }
}

async function runCapture(cmd: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const cancelTimer = installKillTimer(proc, timeoutMs)
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited
  cancelTimer()
  return { stdout, stderr, code };
}

async function whichArduinoCli(): Promise<string | null> {
  const result = await runCapture(["which", "arduino-cli"], WHICH_TIMEOUT_MS);
  if (result.code === 0) {
    const path = result.stdout.trim();
    if (path) return path;
  }
  return null;
}

function managedArduinoCliPath(): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(binDir(), `arduino-cli${ext}`);
}

async function installArduinoCliManaged(): Promise<string> {
  const target = managedArduinoCliPath();
  const targetDir = binDir();
  await mkdir(targetDir, { recursive: true });

  log.info(`installing arduino-cli to ${targetDir}`);

  // Use arduino-cli's official install.sh which handles platform detection.
  // BINDIR env tells it where to drop the binary.
  const installer = "https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh";
  const script = `curl -fsSL ${installer} | BINDIR='${targetDir}' sh`;
  const proc = Bun.spawn(["sh", "-c", script], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const cancelTimer = installKillTimer(proc, INSTALLER_TIMEOUT_MS)
  const code = await proc.exited;
  cancelTimer()
  if (code !== 0) {
    throw new ArduinoCliMissingError(
      `arduino-cli installer exited with code ${code}. Install manually from https://arduino.github.io/arduino-cli/`,
    );
  }

  if (!existsSync(target)) {
    throw new ArduinoCliMissingError(
      `installer completed but ${target} not found. Install manually from https://arduino.github.io/arduino-cli/`,
    );
  }

  try {
    await chmod(target, 0o755);
  } catch {
    // best-effort
  }

  return target;
}

function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive shell — respect env override, else decline.
      resolve(process.env.BREADBOX_AUTO_INSTALL === "1");
      return;
    }
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    process.stdout.write(`${question} ${suffix} `);
    const onData = (chunk: Buffer) => {
      process.stdin.removeListener("data", onData);
      const answer = chunk.toString().trim().toLowerCase();
      if (answer === "") resolve(defaultYes);
      else resolve(answer === "y" || answer === "yes");
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

export type ResolveArduinoCliOpts = {
  /** If true (default), prompt the user to install when missing. */
  install?: boolean;
};

export async function resolveArduinoCli(
  opts: ResolveArduinoCliOpts = {},
): Promise<string> {
  const { install = true } = opts;

  // 1. Explicit override
  const override = process.env.BREADBOX_ARDUINO_CLI;
  if (override) {
    if (!existsSync(override)) {
      throw new ArduinoCliMissingError(
        `BREADBOX_ARDUINO_CLI set to ${override} but no file found there`,
      );
    }
    return override;
  }

  // 2. Managed install
  const managed = managedArduinoCliPath();
  if (existsSync(managed)) return managed;

  // 3. System PATH
  const system = await whichArduinoCli();
  if (system) return system;

  // 4. Prompt + install
  if (!install) {
    throw new ArduinoCliMissingError(
      `arduino-cli not found (checked $BREADBOX_ARDUINO_CLI, ${managed}, and PATH)`,
    );
  }

  const consent = await promptYesNo(
    "arduino-cli is required for compile/flash. Install it to ~/.dreamer/bin?",
    true,
  );
  if (!consent) {
    throw new ArduinoCliMissingError(
      "arduino-cli not installed. Run `dreamer setup` later or install manually from https://arduino.github.io/arduino-cli/",
    );
  }

  return await installArduinoCliManaged();
}

// ── Toolchain cores (each first-install fetches ~200–500 MB) ─────────────

type CoreFamily = "arduino:avr" | "rp2040:rp2040";

const CORE_STAMP = (family: CoreFamily): string =>
  join(cacheDir(), `arduino-cli-core-${family.replace(":", "-")}.stamp`);

const CORE_SIZES: Record<CoreFamily, string> = {
  "arduino:avr": "~200MB",
  "rp2040:rp2040": "~500MB",
};

// Cores that aren't in arduino-cli's default index need an extra package
// URL to be visible. `rp2040:rp2040` is the Earle Philhower community core
// used throughout the Arduino-Pico ecosystem; the official Arduino-maintained
// alternative is `arduino:mbed_rp2040` which lives in the default index but
// boots onto Mbed OS (more setup, fewer Pico-specific niceties).
const CORE_ADDITIONAL_URLS: Partial<Record<CoreFamily, string>> = {
  "rp2040:rp2040":
    "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
};

/**
 * Structural type of the NDJSON writer from `routes/_stream-lines.ts`.
 * Imported structurally to avoid pulling route internals into this
 * low-level module (toolchain has to stay importable from contexts that
 * don't wire up streaming).
 */
type ToolchainProgressWriter = {
  write(event: { kind: "log"; tag: "compiler" | "upload"; line: string; ts: number }): void
}

async function pumpChildOutput(
  readable: ReadableStream<Uint8Array>,
  writer: ToolchainProgressWriter,
): Promise<void> {
  const reader = readable.getReader()
  const decoder = new TextDecoder()
  let carry = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      carry += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = carry.indexOf("\n")) !== -1) {
        const line = carry.slice(0, idx).replace(/\r$/, "")
        carry = carry.slice(idx + 1)
        if (line.length === 0) continue
        writer.write({ kind: "log", tag: "compiler", line, ts: Date.now() })
      }
    }
    const tail = carry.trim()
    if (tail.length > 0) {
      writer.write({ kind: "log", tag: "compiler", line: tail, ts: Date.now() })
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Ensure the given arduino-cli core is installed. No-op on the warm path
 * (stamp file present). On the cold path, spawns `core install` and — if a
 * `progress` writer is supplied — pipes every stdout/stderr line through
 * so the caller's HTTP stream stays warm instead of going silent for the
 * 5+ minutes a full download can take.
 */
export async function ensureArduinoCliCore(
  family: CoreFamily,
  progress?: ToolchainProgressWriter,
): Promise<void> {
  if (existsSync(CORE_STAMP(family))) return;

  const arduinoCli = await resolveArduinoCli();
  await mkdir(cacheDir(), { recursive: true });

  const additionalUrl = CORE_ADDITIONAL_URLS[family];
  const commonArgs = additionalUrl
    ? ["--additional-urls", additionalUrl]
    : [];

  const emit = (line: string): void => {
    progress?.write({ kind: "log", tag: "compiler", line, ts: Date.now() });
    log.info(line);
  };

  // When the core needs an extra URL, arduino-cli has to know about it
  // before the install can find the package. `update-index` is cheap on
  // repeat runs (HEAD request per URL) and we only ever invoke this path
  // when the stamp is missing — so the cost lands exactly once per family.
  if (additionalUrl) {
    emit(`arduino-cli core update-index (preparing ${family})`);
    const updateProc = Bun.spawn(
      [arduinoCli, "core", "update-index", ...commonArgs],
      {
        stdout: progress ? "pipe" : "inherit",
        stderr: progress ? "pipe" : "inherit",
      },
    );
    const cancelUpdateTimer = installKillTimer(updateProc, CORE_UPDATE_INDEX_TIMEOUT_MS)
    if (progress && updateProc.stdout && updateProc.stderr) {
      await Promise.all([
        pumpChildOutput(updateProc.stdout, progress),
        pumpChildOutput(updateProc.stderr, progress),
      ]);
    }
    const updateCode = await updateProc.exited;
    cancelUpdateTimer()
    if (updateCode !== 0) {
      throw new Error(
        `arduino-cli core update-index failed with code ${updateCode} while preparing to install ${family}. ` +
          `Check network access to ${additionalUrl}.`,
      );
    }
  }

  emit(`installing arduino-cli core ${family} (first run, ${CORE_SIZES[family]} — several minutes)`);
  const proc = Bun.spawn(
    [arduinoCli, "core", "install", family, ...commonArgs],
    {
      stdout: progress ? "pipe" : "inherit",
      stderr: progress ? "pipe" : "inherit",
    },
  );
  const cancelInstallTimer = installKillTimer(proc, CORE_INSTALL_TIMEOUT_MS)
  if (progress && proc.stdout && proc.stderr) {
    await Promise.all([
      pumpChildOutput(proc.stdout, progress),
      pumpChildOutput(proc.stderr, progress),
    ]);
  }
  const code = await proc.exited;
  cancelInstallTimer()
  if (code !== 0) {
    const hint = additionalUrl
      ? ` (the "${family}" core requires --additional-urls ${additionalUrl}; check your network or install manually: arduino-cli core install ${family} --additional-urls ${additionalUrl})`
      : "";
    throw new Error(`arduino-cli core install ${family} failed with code ${code}${hint}`);
  }

  emit(`arduino-cli core ${family} installed`);
  await Bun.write(CORE_STAMP(family), new Date().toISOString());
}

/** Map an fqbn like "rp2040:rp2040:rpipico" back to the core family it needs. */
export function coreFamilyForFqbn(fqbn: string): CoreFamily {
  if (fqbn.startsWith("rp2040:")) return "rp2040:rp2040";
  return "arduino:avr";
}

// ── Debug toolchain (avr-objdump for DWARF line tables) ───────────────────

/** Ask arduino-cli where it keeps installed cores/tools. */
async function arduinoCliDataDir(arduinoCli: string): Promise<string | null> {
  const direct = await runCapture(
    [arduinoCli, "config", "get", "directories.data"],
    WHICH_TIMEOUT_MS,
  );
  if (direct.code === 0) {
    const p = direct.stdout.trim();
    if (p) return p;
  }
  const dump = await runCapture(
    [arduinoCli, "config", "dump", "--format", "json"],
    WHICH_TIMEOUT_MS,
  );
  if (dump.code === 0) {
    try {
      const cfg = JSON.parse(dump.stdout) as {
        directories?: { data?: string };
        config?: { directories?: { data?: string } };
      };
      return cfg.directories?.data ?? cfg.config?.directories?.data ?? null;
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Locate the `avr-objdump` that ships with the installed `arduino:avr` core
 * (used to read DWARF line info from the compiled ELF). Resolution order:
 *   1. $BREADBOX_AVR_OBJDUMP override.
 *   2. The avr-gcc toolchain bundled under arduino-cli's data dir.
 *   3. `which avr-objdump` on PATH.
 * Returns null when none is found — callers degrade to address-only debugging.
 */
export async function resolveAvrObjdump(arduinoCli: string): Promise<string | null> {
  const exe = process.platform === "win32" ? "avr-objdump.exe" : "avr-objdump";

  const override = process.env.BREADBOX_AVR_OBJDUMP;
  if (override) return existsSync(override) ? override : null;

  try {
    const dataDir = await arduinoCliDataDir(arduinoCli);
    if (dataDir) {
      const glob = new Bun.Glob(`packages/arduino/tools/avr-gcc/*/bin/${exe}`);
      const matches: string[] = [];
      for await (const m of glob.scan({ cwd: dataDir, absolute: true })) {
        matches.push(m);
      }
      if (matches.length > 0) {
        // Multiple toolchain versions is rare; pick the lexically-highest dir.
        matches.sort();
        return matches[matches.length - 1];
      }
    }
  } catch {
    /* fall through to PATH */
  }

  const onPath = await runCapture(["which", exe], WHICH_TIMEOUT_MS);
  if (onPath.code === 0) {
    const p = onPath.stdout.trim();
    if (p) return p;
  }
  return null;
}

/**
 * Locate the `arm-none-eabi-objdump` that ships with the installed
 * `rp2040:rp2040` (Earle Philhower) core — used to read DWARF line info from
 * the compiled RP2040 ELF for the Pico debugger. Resolution order:
 *   1. $BREADBOX_ARM_OBJDUMP override.
 *   2. The arm-gcc toolchain bundled under arduino-cli's data dir (the core
 *      ships it as `packages/rp2040/tools/pqt-gcc/<ver>/bin/...`; we glob
 *      loosely since the tool dir name has changed across core releases).
 *   3. `which arm-none-eabi-objdump` on PATH.
 * Returns null when none is found — callers degrade to address-only debugging.
 */
export async function resolveArmObjdump(arduinoCli: string): Promise<string | null> {
  const exe = process.platform === "win32" ? "arm-none-eabi-objdump.exe" : "arm-none-eabi-objdump";

  const override = process.env.BREADBOX_ARM_OBJDUMP;
  if (override) return existsSync(override) ? override : null;

  try {
    const dataDir = await arduinoCliDataDir(arduinoCli);
    if (dataDir) {
      // The bundled GCC tool dir has been named "pqt-gcc" / "arm-none-eabi-gcc"
      // across releases, so match any tool subdir that lands the binary in a
      // `bin/` folder under the rp2040 core's tools tree.
      const glob = new Bun.Glob(`packages/rp2040/tools/*/*/bin/${exe}`);
      const matches: string[] = [];
      for await (const m of glob.scan({ cwd: dataDir, absolute: true })) {
        matches.push(m);
      }
      if (matches.length > 0) {
        matches.sort();
        return matches[matches.length - 1];
      }
    }
  } catch {
    /* fall through to PATH */
  }

  const onPath = await runCapture(["which", exe], WHICH_TIMEOUT_MS);
  if (onPath.code === 0) {
    const p = onPath.stdout.trim();
    if (p) return p;
  }
  return null;
}
