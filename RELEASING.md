# Releasing the Breadbox desktop app

Releases are produced by the **Release (desktop)** GitHub Actions workflow
(`.github/workflows/release.yml`). Pushing a version tag builds the Tauri
desktop app on macOS (Apple Silicon + Intel), Windows, and Linux, signs +
notarizes the macOS bundles, and uploads everything to a **draft** GitHub
Release. You review the draft, then publish it.

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
- Linux: `.AppImage` and `.deb`

Review the artifacts, edit the notes, and click **Publish release**.

> You can also trigger a build manually from **Actions → Release (desktop) →
> Run workflow** and pass a tag — useful for dry runs.

## Required GitHub secrets

Add these under **Settings → Secrets and variables → Actions**.

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

### Windows & Linux — unsigned (intentional)

We don't have a Windows code-signing certificate, so the Windows build is
**unsigned**: the `.msi` / `.exe` install fine but show a one-time SmartScreen
"unknown publisher" warning (users click *More info → Run anyway*). Linux
`.AppImage` / `.deb` are likewise unsigned. No secrets are needed for either.

If a Windows certificate is acquired later, signing can be added — modern CA
rules (since 2023) require either **Azure Trusted Signing** (sign via a
`signCommand` in `tauri.conf.json` using `trusted-signing-cli`, no exportable
key) or a legacy exportable `.pfx` (import in a PowerShell CI step + set
`bundle.windows.certificateThumbprint`). Until then the matrix stays as-is.

## Notes & caveats

- **Per-OS builds.** Each installer is built on its own runner; you can't
  produce a Mac `.dmg` from Linux. The matrix handles this.
- **Both Mac arches.** `macos-14` builds Apple Silicon, `macos-13` builds
  Intel. The CLI/arduino-cli sidecars are auto-built per runner by
  `prepare:sidecar` (`beforeBuildCommand`).
- **No auto-updater.** This setup publishes installers but does not configure
  Tauri's updater (which needs its own signing keypair + a release manifest
  endpoint). Ask if you want in-app auto-update added.
- **Version source of truth.** `scripts/set-release-version.ts` writes the tag
  version into `tauri.conf.json` at build time, so the tag drives the bundle
  version. Keep tags `vX.Y.Z`.
- **Lockfile.** Like `ci.yml`, the release run does not use `--frozen-lockfile`
  (the binary `bun.lockb` drifts in this repo).
