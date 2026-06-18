// ── set-release-version ──────────────────────────────────────────────────
//
// Writes a release version into the Tauri bundle config (and the desktop
// package.json) so the built installers + GitHub Release tag agree. Called
// by the release workflow with the pushed tag, e.g.:
//
//   bun run scripts/set-release-version.ts v0.2.0
//
// A leading "v" is stripped. Run locally too when cutting a release by hand.

import { resolve } from "node:path"

const raw = process.argv[2]
if (!raw) {
  console.error("usage: bun run scripts/set-release-version.ts <version>  (e.g. v0.2.0)")
  process.exit(1)
}

const version = raw.replace(/^v/, "")
if (!/^\d+\.\d+\.\d+([-+].+)?$/.test(version)) {
  console.error(`invalid semver: "${raw}" (expected x.y.z, optional -pre/+build)`)
  process.exit(1)
}

const repoRoot = resolve(import.meta.dir, "..")

async function patchJsonVersion(relPath: string): Promise<void> {
  const path = resolve(repoRoot, relPath)
  const json = await Bun.file(path).json()
  json.version = version
  await Bun.write(path, JSON.stringify(json, null, 2) + "\n")
  console.log(`${relPath} → ${version}`)
}

await patchJsonVersion("packages/desktop/src-tauri/tauri.conf.json")
await patchJsonVersion("packages/desktop/package.json")
