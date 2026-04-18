// ── Self-update ─────────────────────────────────────────────────────────
//
// `dreamer upgrade` checks GitHub releases and swaps the binary in place.
//
// Strategy:
//   1. Detect installed source: Homebrew / Scoop / raw binary.
//   2. For brew/scoop, refuse and tell user to use their package manager.
//   3. For raw: download matching prebuilt, verify SHA256, atomic rename.
//   4. Keep previous binary at <binary>.prev for rollback.
//
// --check: print upgrade availability but do not apply.

import { chmodSync, existsSync, renameSync, unlinkSync, writeFileSync } from "fs"
import { dirname, basename } from "path"
import { createHash } from "crypto"
import { CLI_VERSION, PLATFORM } from "./version"
import { loadConfig, saveConfig } from "./config"

const DEFAULT_REPO = "liz435/dreamer"

type ReleaseAsset = { name: string; browser_download_url: string; size: number }
type Release = { tag_name: string; assets: ReleaseAsset[]; html_url: string; body?: string }

export type UpgradeCheck =
  | { status: "current"; version: string }
  | { status: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes?: string }
  | { status: "blocked"; reason: string }

function installKind(binaryPath: string): "brew" | "scoop" | "raw" {
  if (binaryPath.includes("/Cellar/") || binaryPath.includes("/homebrew/")) return "brew"
  if (binaryPath.toLowerCase().includes("\\scoop\\")) return "scoop"
  return "raw"
}

function platformAssetName(): string {
  const [plat, arch] = PLATFORM.split("-")
  const osPart = plat === "win32" ? "windows" : plat === "darwin" ? "darwin" : "linux"
  const archPart = arch === "arm64" ? "arm64" : "x64"
  const ext = osPart === "windows" ? ".exe" : ""
  return `dreamer-${osPart}-${archPart}${ext}`
}

async function fetchLatestRelease(repo: string, channel: "stable" | "beta"): Promise<Release | null> {
  const url = channel === "beta"
    ? `https://api.github.com/repos/${repo}/releases`
    : `https://api.github.com/repos/${repo}/releases/latest`
  try {
    const res = await fetch(url, { headers: { "User-Agent": `dreamer/${CLI_VERSION}` } })
    if (!res.ok) return null
    const json = await res.json() as Release | Release[]
    if (channel === "beta") {
      const arr = json as Release[]
      return arr.find(() => true) ?? null
    }
    return json as Release
  } catch {
    return null
  }
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((x) => {
    const n = parseInt(x, 10)
    return Number.isNaN(n) ? x : n
  })
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

export async function checkForUpdate(): Promise<UpgradeCheck> {
  const config = await loadConfig()
  const repo = process.env.DREAMER_REPO ?? DEFAULT_REPO
  const channel = config.updates?.channel ?? "stable"

  const release = await fetchLatestRelease(repo, channel)
  if (!release) return { status: "current", version: CLI_VERSION }

  if (compareVersions(release.tag_name, CLI_VERSION) <= 0) {
    return { status: "current", version: CLI_VERSION }
  }

  const asset = release.assets.find((a) => a.name === platformAssetName() || a.name === `${platformAssetName()}.tar.gz` || a.name === `${platformAssetName()}.zip`)
  if (!asset) {
    return { status: "blocked", reason: `no asset for ${platformAssetName()} in ${release.tag_name}` }
  }

  return {
    status: "available",
    currentVersion: CLI_VERSION,
    latestVersion: release.tag_name,
    url: asset.browser_download_url,
    releaseNotes: release.body,
  }
}

export async function applyUpdate(downloadUrl: string): Promise<{ ok: boolean; message: string }> {
  const binaryPath = process.execPath
  const kind = installKind(binaryPath)

  if (kind === "brew") {
    return { ok: false, message: "Detected Homebrew install — run `brew upgrade dreamer` instead." }
  }
  if (kind === "scoop") {
    return { ok: false, message: "Detected Scoop install — run `scoop update dreamer` instead." }
  }

  try {
    // Download
    const res = await fetch(downloadUrl, { headers: { "User-Agent": `dreamer/${CLI_VERSION}` } })
    if (!res.ok) return { ok: false, message: `download failed (${res.status})` }
    const bytes = Buffer.from(await res.arrayBuffer())

    // Checksum — best-effort (look for sidecar .sha256)
    const shaUrl = `${downloadUrl}.sha256`
    try {
      const shaRes = await fetch(shaUrl)
      if (shaRes.ok) {
        const expected = (await shaRes.text()).trim().split(/\s+/)[0]
        const actual = createHash("sha256").update(bytes).digest("hex")
        if (expected && expected !== actual) {
          return { ok: false, message: `checksum mismatch (expected ${expected}, got ${actual})` }
        }
      }
    } catch { /* tolerate missing sidecar */ }

    const dir = dirname(binaryPath)
    const name = basename(binaryPath)
    const staged = `${binaryPath}.new-${process.pid}`
    const previous = `${binaryPath}.prev`

    writeFileSync(staged, bytes)
    try { chmodSync(staged, 0o755) } catch { /* Windows */ }

    // Back up previous
    if (existsSync(previous)) {
      try { unlinkSync(previous) } catch { /* best-effort */ }
    }
    try {
      renameSync(binaryPath, previous)
    } catch {
      // On Windows, you can't rename a running executable. Fallback:
      // leave .new- file; user must complete swap manually.
      return {
        ok: false,
        message: `couldn't replace ${binaryPath} while running. The new binary is at ${staged}. Move it into place manually, or re-run upgrade from a non-running shell.`,
      }
    }

    renameSync(staged, binaryPath)
    return { ok: true, message: `updated ${name}. Previous binary saved to ${previous}.` }
  } catch (err) {
    return { ok: false, message: `update failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function rollback(): Promise<{ ok: boolean; message: string }> {
  const binaryPath = process.execPath
  const previous = `${binaryPath}.prev`
  if (!existsSync(previous)) {
    return { ok: false, message: `no previous binary found at ${previous}` }
  }
  try {
    const spare = `${binaryPath}.rolling-back-${process.pid}`
    renameSync(binaryPath, spare)
    renameSync(previous, binaryPath)
    renameSync(spare, previous)
    return { ok: true, message: `rolled back to previous binary at ${previous}` }
  } catch (err) {
    return { ok: false, message: `rollback failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function setUpdateChannel(channel: "stable" | "beta"): Promise<void> {
  const config = await loadConfig()
  await saveConfig({ ...config, updates: { ...config.updates, channel } })
}
