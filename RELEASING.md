# Releasing the Breadbox desktop app

Releases are produced by the **Release (desktop)** GitHub Actions workflow
(`.github/workflows/release.yml`). Pushing a version tag builds the Tauri
desktop app on macOS (Apple Silicon + Intel) and Windows, signs +
notarizes the macOS bundles, signs the auto-update artifacts, and uploads
everything to a **draft** GitHub Release. You review the draft, then publish it.

> **No Linux build.** The AppImage bundler (`linuxdeploy`) can't run on GitHub's
> Linux runners, and this is a macOS-first app, so the release matrix builds
> macOS + Windows only. Re-add an `ubuntu-*` matrix entry with deb/rpm targets
> if Linux distribution is wanted later.

> **One-time setup required.** In-app auto-update is wired in, which means the
> build now **signs update artifacts and will fail without the updater signing
> key**. Before your first release, do the [one-time updater key setup](#one-time-updater-signing-key)
> below. It's a two-command step.

## Cutting a release

```bash
# 1. Make sure main is green and you're on the commit you want to ship.
git checkout main && git pull

# 2. Pick the next version and push the tag. The workflow syncs this version
#    into tauri.conf.json / desktop package.json automatically at build time,
#    so you don't have to bump them by hand first.
git tag v0.2.0
git push origin v0.2.0
```

Then watch the run under the repo's **Actions** tab. When all matrix jobs
finish, a draft release `Breadbox v0.2.0` will exist under **Releases** with:

- macOS: `.dmg` + `.app.tar.gz` (Apple Silicon and Intel)
- Windows: `.msi` and/or NSIS `.exe`

Review the artifacts, edit the notes, and click **Publish release**.

> You can also trigger a build manually from **Actions → Release (desktop) →
> Run workflow** and pass a tag — useful for dry runs.

## Required GitHub secrets

Add these under **Settings → Secrets and variables → Actions**.

### Auto-updater signing — required (the build fails without it)

| Secret | What it is |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the updater private key generated below |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key's password — **leave unset**; our key has none |

The matching **public** key is committed in `tauri.conf.json`
(`plugins.updater.pubkey`); installed apps use it to verify that an update was
signed by the holder of this private key. See the one-time setup below.

#### One-time updater signing key

The updater keypair is the trust root for auto-update: anything signed with the
private key is downloaded and executed by every installed app, so the private
key must never be committed or shared. Generate it once and push it straight to
GitHub secrets:

```bash
# 1. Generate the keypair (no password). Writes the private key OUTSIDE the repo.
cd packages/desktop
bunx tauri signer generate -w ~/.tauri/breadbox-updater.key -p '' --ci

# 2. Push the PRIVATE key content to GitHub secrets without printing it.
#    (Requires the `gh` CLI, authenticated for liz435/breadbox.)
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/breadbox-updater.key
```

The **public** key (`~/.tauri/breadbox-updater.key.pub`) is already baked into
`tauri.conf.json`. If you ever rotate the keypair, replace `plugins.updater.pubkey`
with the new `.pub` contents and re-run step 2 — but note that apps signed with
the old key can't verify updates signed by the new one, so ship one release that
still trusts the old key before cutting over. Keep a backup of the private key;
losing it means no installed app can ever be auto-updated again.

### macOS (signing + notarization) — required for warning-free Mac installs

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64 of your **Developer ID Application** certificate exported as `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Your Apple Developer account email |
| `APPLE_PASSWORD` | An **app-specific password** (not your Apple ID password) |
| `APPLE_TEAM_ID` | Your 10-character Apple Developer Team ID |

How to get them:

1. **Certificate** — In the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list)
   create a *Developer ID Application* certificate (requires a paid Apple
   Developer account). Install it into Keychain Access, then export it as a
   `.p12` with a password. Base64-encode it for the secret:
   ```bash
   base64 -i DeveloperID.p12 | pbcopy   # paste into APPLE_CERTIFICATE
   ```
2. **Signing identity** — `security find-identity -v -p codesigning` lists it;
   copy the full `Developer ID Application: …` string.
3. **App-specific password** — Create at <https://account.apple.com> →
   Sign-In & Security → App-Specific Passwords. Used for notarization.
4. **Team ID** — Shown in the Apple Developer portal membership page.

With these set, the macOS jobs sign and notarize automatically — no extra
config. Without them, the Mac build still runs but is unsigned (users see a
Gatekeeper warning).

### Windows — unsigned (intentional)

We don't have a Windows code-signing certificate, so the Windows build is
**unsigned**: the `.msi` / `.exe` install fine but show a one-time SmartScreen
"unknown publisher" warning (users click *More info → Run anyway*). No secrets
are needed for it.

If a Windows certificate is acquired later, signing can be added — modern CA
rules (since 2023) require either **Azure Trusted Signing** (sign via a
`signCommand` in `tauri.conf.json` using `trusted-signing-cli`, no exportable
key) or a legacy exportable `.pfx` (import in a PowerShell CI step + set
`bundle.windows.certificateThumbprint`). Until then the matrix stays as-is.

## How auto-update works

- **Feed.** `tauri-action` generates a `latest.json` manifest (version + a
  signed download URL per platform) and uploads it to each release. The app's
  update endpoint is `tauri.conf.json` →
  `https://github.com/liz435/breadbox/releases/latest/download/latest.json`,
  which GitHub resolves to whichever release is marked **Latest**.
- **Only published, non-prerelease releases update users.** Draft releases and
  pre-releases aren't "Latest", so `releases/latest/download/…` 404s for them —
  the app just stays put. Updates go live the moment you **Publish** a release
  (and untick *Set as a pre-release*). This is why the workflow uploads drafts.
- **Client behavior.** On launch (≈5s in) the app silently checks the feed; if a
  newer version exists it prompts *Install / Later*, then downloads, verifies the
  signature against the baked-in pubkey, installs, and relaunches. The
  **Breadbox → Check for Updates…** menu item runs the same flow on demand and
  also reports "up to date". macOS swaps the app bundle in place; Windows runs
  the new installer in `passive` mode.
- **Bundle-granular.** The updater replaces the whole app, so the bundled
  `breadbox` + `arduino-cli` sidecars update together with the shell — there's no
  per-file patching to reason about.
- **Version compare.** The updater installs when `latest.json`'s version is newer
  than the running app's (semver). Since the tag drives the bundle version
  (below), pushing a higher `vX.Y.Z` is all it takes.

## Notes & caveats

- **Per-OS builds.** Each installer is built on its own runner; you can't
  produce a Mac `.dmg` from a Windows runner. The matrix handles this.
- **Both Mac arches.** `macos-14` builds Apple Silicon, `macos-13` builds
  Intel. The CLI/arduino-cli sidecars are auto-built per runner by
  `prepare:sidecar` (`beforeBuildCommand`).
- **Auto-updater.** Installed apps check the release feed on launch (and via
  **Breadbox → Check for Updates…**) and offer to self-update. See
  [How auto-update works](#how-auto-update-works) below.
- **Version source of truth.** `scripts/set-release-version.ts` writes the tag
  version into `tauri.conf.json` at build time, so the tag drives the bundle
  version. Keep tags `vX.Y.Z`.
- **Lockfile.** Like `ci.yml`, the release run does not use `--frozen-lockfile`
  (the binary `bun.lockb` drifts in this repo).
