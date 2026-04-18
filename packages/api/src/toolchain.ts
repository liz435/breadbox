// ── Toolchain resolver ───────────────────────────────────────────────────
//
// Resolves external binaries (arduino-cli today; could grow later). Callers
// get an absolute path. First-run in a fresh install triggers a managed
// download to `~/.dreamer/bin/`.
//
// Resolution order for arduino-cli:
//   1. $DREAMER_ARDUINO_CLI env var (explicit override) — used as-is.
//   2. $DREAMER_HOME/bin/arduino-cli if it exists — managed install.
//   3. `which arduino-cli` on PATH — system install (Homebrew, apt, etc.).
//   4. If opts.install !== false: prompt + run arduino-cli's official
//      installer into $DREAMER_HOME/bin, then return that path.
//   5. Throw ArduinoCliMissingError.

import { existsSync } from "fs";
import { mkdir, chmod } from "fs/promises";
import { binDir, cacheDir } from "./paths";
import { join } from "path";
import { createLogger } from "./logger";

const log = createLogger("toolchain");

export class ArduinoCliMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArduinoCliMissingError";
  }
}

async function runCapture(cmd: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, code: await proc.exited };
}

async function whichArduinoCli(): Promise<string | null> {
  const result = await runCapture(["which", "arduino-cli"]);
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
  const code = await proc.exited;
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
      resolve(process.env.DREAMER_AUTO_INSTALL === "1");
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
  const override = process.env.DREAMER_ARDUINO_CLI;
  if (override) {
    if (!existsSync(override)) {
      throw new ArduinoCliMissingError(
        `DREAMER_ARDUINO_CLI set to ${override} but no file found there`,
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
      `arduino-cli not found (checked $DREAMER_ARDUINO_CLI, ${managed}, and PATH)`,
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

// ── AVR core (first flash fetches ~200MB of toolchain) ──────────────────

const AVR_CORE_STAMP = () => join(cacheDir(), "arduino-avr-core.stamp");

export async function ensureArduinoCliCore(
  family: "arduino:avr",
): Promise<void> {
  if (existsSync(AVR_CORE_STAMP())) return;

  const arduinoCli = await resolveArduinoCli();
  await mkdir(cacheDir(), { recursive: true });

  log.info(`installing arduino-cli core ${family} (first run, ~200MB)`);
  const proc = Bun.spawn([arduinoCli, "core", "install", family], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`arduino-cli core install ${family} failed with code ${code}`);
  }

  await Bun.write(AVR_CORE_STAMP(), new Date().toISOString());
}
