// ── prepare-sidecar ──────────────────────────────────────────────────────
//
// Builds the single-file `dreamer` binary for THIS host and copies it into
// the Tauri sidecar location, named with the Rust target triple Tauri
// expects (`binaries/dreamer-<triple>`). Tauri's `externalBin: ["binaries/
// dreamer"]` resolves that per-platform name at bundle time.
//
// Wired into tauri.conf.json:
//   beforeDevCommand   → `bun run prepare:sidecar`         (build if missing)
//   beforeBuildCommand → `bun run prepare:sidecar --force` (always rebuild)
//
// Steps: build the web UI bundle (so the binary serves the embedded UI →
// `dreamer serve` runs in static mode), cross-compile the host binary, copy;
// then fetch the matching `arduino-cli` binary and stage it as a second
// sidecar so the desktop app can compile/flash with no manual install
// (mirrors how the Arduino IDE bundles arduino-cli). Compiler cores still
// download on first compile.

import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const SCRIPT_DIR = import.meta.dir
const DESKTOP_DIR = resolve(SCRIPT_DIR, "..")
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..")

const force = Bun.argv.includes("--force")

// Pinned arduino-cli release. Bump deliberately so behavior is reproducible
// across machines (rather than tracking whatever `latest` happens to be).
const ARDUINO_CLI_VERSION = "1.5.0"
const ARDUINO_CLI_BASE = "https://downloads.arduino.cc/arduino-cli"

type Target = {
  cliScript: string // packages/cli script that emits the binary
  srcName: string // emitted file name under packages/cli/dist
  triple: string // Rust target triple Tauri keys the sidecar on
  ext: string // executable extension (".exe" on Windows)
  arduinoAsset: string // arduino-cli release archive for this host
}

const TARGETS: Record<string, Target> = {
  "darwin-arm64": { cliScript: "build:darwin-arm64", srcName: "dreamer-darwin-arm64", triple: "aarch64-apple-darwin", ext: "", arduinoAsset: `arduino-cli_${ARDUINO_CLI_VERSION}_macOS_ARM64.tar.gz` },
  "darwin-x64": { cliScript: "build:darwin-x64", srcName: "dreamer-darwin-x64", triple: "x86_64-apple-darwin", ext: "", arduinoAsset: `arduino-cli_${ARDUINO_CLI_VERSION}_macOS_64bit.tar.gz` },
  "linux-x64": { cliScript: "build:linux-x64", srcName: "dreamer-linux-x64", triple: "x86_64-unknown-linux-gnu", ext: "", arduinoAsset: `arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz` },
  "linux-arm64": { cliScript: "build:linux-arm64", srcName: "dreamer-linux-arm64", triple: "aarch64-unknown-linux-gnu", ext: "", arduinoAsset: `arduino-cli_${ARDUINO_CLI_VERSION}_Linux_ARM64.tar.gz` },
  "win32-x64": { cliScript: "build:windows-x64", srcName: "dreamer-windows-x64.exe", triple: "x86_64-pc-windows-msvc", ext: ".exe", arduinoAsset: `arduino-cli_${ARDUINO_CLI_VERSION}_Windows_64bit.zip` },
}

const host = `${process.platform}-${process.arch}`
const target = TARGETS[host]
if (!target) {
  console.error(`[prepare-sidecar] unsupported host platform: ${host}`)
  console.error(`[prepare-sidecar] supported: ${Object.keys(TARGETS).join(", ")}`)
  process.exit(1)
}

const binDir = resolve(DESKTOP_DIR, "src-tauri/binaries")
const destPath = resolve(binDir, `dreamer-${target.triple}${target.ext}`)
const srcPath = resolve(REPO_ROOT, "packages/cli/dist", target.srcName)

function run(cmd: string[], cwd: string): void {
  console.log(`[prepare-sidecar] $ ${cmd.join(" ")}`)
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" })
  if (proc.exitCode !== 0) {
    console.error(`[prepare-sidecar] command failed (exit ${proc.exitCode})`)
    process.exit(proc.exitCode ?? 1)
  }
}

mkdirSync(binDir, { recursive: true })

// ── 1. dreamer sidecar (web UI + API + Bun runtime, single file) ──────────
if (existsSync(destPath) && !force) {
  console.log(`[prepare-sidecar] reusing ${destPath}`)
  console.log(`[prepare-sidecar] (pass --force, or run \`bun run prepare:sidecar --force\`, to rebuild)`)
} else {
  // Production web UI + asset manifest → the binary serves the embedded UI.
  run(["bun", "run", "build:webui"], REPO_ROOT)
  // Cross-compile the single-file dreamer binary for this host, then copy it
  // into the Tauri sidecar slot, named with the Rust target triple.
  run(["bun", "run", "--cwd", "packages/cli", target.cliScript], REPO_ROOT)
  if (!existsSync(srcPath)) {
    console.error(`[prepare-sidecar] expected binary not found: ${srcPath}`)
    process.exit(1)
  }
  await Bun.write(destPath, Bun.file(srcPath))
  if (target.ext !== ".exe") chmodSync(destPath, 0o755)
  console.log(`[prepare-sidecar] sidecar ready: ${destPath}`)
}

// ── 2. arduino-cli sidecar (mirrors Arduino IDE; cores download on first
//      compile, via ensureArduinoCliCore) ─────────────────────────────────
const arduinoDest = resolve(binDir, `arduino-cli-${target.triple}${target.ext}`)
if (existsSync(arduinoDest) && !force) {
  console.log(`[prepare-sidecar] reusing ${arduinoDest}`)
} else {
  const url = `${ARDUINO_CLI_BASE}/${target.arduinoAsset}`
  const tmpDir = resolve(binDir, ".arduino-cli-tmp")
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const archive = resolve(tmpDir, target.arduinoAsset)
  console.log(`[prepare-sidecar] downloading ${url}`)
  run(["curl", "-fsSL", "-o", archive, url], REPO_ROOT)
  // `tar -xf` extracts both archive kinds per host: GNU tar handles the
  // .tar.gz (macOS/Linux) and bsdtar handles the .zip (Windows). The
  // archive contains `arduino-cli`(`.exe`) at its root alongside LICENSE.
  run(["tar", "-xf", archive, "-C", tmpDir], REPO_ROOT)
  const extracted = resolve(tmpDir, `arduino-cli${target.ext}`)
  if (!existsSync(extracted)) {
    console.error(`[prepare-sidecar] arduino-cli not found in extracted archive: ${extracted}`)
    process.exit(1)
  }
  await Bun.write(arduinoDest, Bun.file(extracted))
  if (target.ext !== ".exe") chmodSync(arduinoDest, 0o755)
  rmSync(tmpDir, { recursive: true, force: true })
  console.log(`[prepare-sidecar] arduino-cli ready: ${arduinoDest}`)
}
