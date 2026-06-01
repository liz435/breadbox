# @dreamer/desktop

A native desktop wrapper for Dreamer, built with [Tauri 2](https://tauri.app).
It opens a real OS window (its own icon, Dock/Start-menu entry) and renders the
existing Dreamer web UI inside it — no browser tab.

## How it works

The desktop app is a thin native shell around the work that already happens in
the [`dreamer` CLI binary](../cli):

```
┌──────────────────────── Dreamer.app (Tauri) ────────────────────────┐
│  native window (OS webview)                                          │
│      │                                                               │
│      │ 1. on launch, spawn the bundled `dreamer` binary as a sidecar │
│      ▼                                                               │
│   dreamer serve   ──►  Elysia API   on 127.0.0.1 (prefers :4112)     │
│   (no REPL,            embedded web UI on 127.0.0.1 (prefers :3004)   │
│    no browser)         → prints `DREAMER_URL <url>` when ready        │
│      │                                                               │
│      │ 2. read the marker from stdout, navigate the window to <url>  │
│      ▼                                                               │
│   window shows the Dreamer UI (served by the sidecar)                │
│                                                                      │
│  3. on window close → kill the sidecar                               │
└──────────────────────────────────────────────────────────────────────┘
```

- The sidecar is the same single-file binary `packages/cli` produces with
  `bun build --compile`. It embeds the Bun runtime, the API, and the production
  web UI bundle.
- It runs in `serve` mode (added for the desktop shell): API + web UI only, **no
  REPL** (a REPL on the sidecar's non-TTY stdin would exit and kill the server)
  and **no auto-opened browser** (`DREAMER_NO_OPEN=1`).
- Ports aren't fixed: the sidecar prefers `3004` (UI) and `4112` (API) but
  falls back to OS-assigned free ports if those are taken, so it never
  collides with another process (a running `dreamer headed`, `bun run dev`,
  etc.). It then prints `DREAMER_URL <url>` on stdout.
- While the server boots, the window shows `splash/index.html`. The Rust shell
  reads the `DREAMER_URL` marker from the sidecar's stdout and navigates the
  window to it (`src-tauri/src/lib.rs`).
- A single-instance guard (`tauri-plugin-single-instance`) means launching a
  second copy just focuses the existing window instead of starting a second
  server.
- It's single-tenant CLI mode — no sign-in. Your Anthropic API key comes from
  `~/.dreamer/config.json` (run `dreamer setup` or `dreamer config set
  anthropic-key sk-ant-...`), shared with the CLI.

## Prerequisites

1. **Rust toolchain** (Tauri compiles a Rust binary):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Platform dependencies** — see Tauri's prerequisites guide:
   <https://tauri.app/start/prerequisites/>
   - macOS: Xcode Command Line Tools (`xcode-select --install`).
   - Linux: `webkit2gtk`, `libappindicator`, etc. (per the guide).
   - Windows: WebView2 (preinstalled on Win11) + MSVC build tools.
3. **bun** and a workspace install from the repo root:
   ```bash
   bun install        # pulls @tauri-apps/cli into this workspace
   ```

## Develop

```bash
bun run desktop:dev          # from the repo root
# └─ builds the sidecar if missing, compiles the Rust shell, opens the window
```

`tauri dev`'s `beforeDevCommand` runs `prepare:sidecar`, which (re)builds the
web UI bundle and the host `dreamer` binary and copies it to
`src-tauri/binaries/dreamer-<target-triple>`. The first run is slow (it compiles
the binary and the Rust shell); later runs reuse the existing sidecar — pass
`--force` (or run `bun run --cwd packages/desktop prepare:sidecar --force`) after
changing the app/api/cli to refresh it.

## Build installers

```bash
bun run desktop:build        # from the repo root
```

`beforeBuildCommand` force-rebuilds the sidecar, then Tauri bundles for the host
OS. Output lands in `packages/desktop/src-tauri/target/release/bundle/`:

| Platform | Artifacts |
|---|---|
| macOS | `Dreamer.app`, `Dreamer_0.1.0_aarch64.dmg` |
| Windows | `Dreamer_0.1.0_x64-setup.exe` (NSIS), `.msi` |
| Linux | `.AppImage`, `.deb` |

Each installer is for the host architecture only. Cross-compiling Tauri apps is
possible but involved — build mac on mac, Windows on Windows, etc. (or use CI
like `tauri-action`).

## Icons

The icon set under `src-tauri/icons/` is generated from `src-tauri/icons/icon.svg`.

```bash
bun run desktop:icons        # qlmanage + sips + iconutil (+ a tiny ico helper)
# or, cross-platform / higher quality:
cd packages/desktop && bunx @tauri-apps/cli icon src-tauri/icons/icon.svg
```

Edit `icon.svg` and regenerate to rebrand.

## Code signing & distribution

Unsigned apps trigger Gatekeeper (macOS) and SmartScreen (Windows) warnings.
For public distribution, configure signing/notarization — see Tauri's guides:

- macOS: <https://tauri.app/distribute/sign/macos/>
- Windows: <https://tauri.app/distribute/sign/windows/>
- Auto-update: <https://tauri.app/plugin/updater/>

## Caveats

- **Ports prefer 3004/4112 but aren't fixed.** If those are taken the sidecar
  falls back to OS-assigned free ports and reports the actual URL via the
  `DREAMER_URL` marker, so there's no collision to manage. Set `APP_PORT` /
  `API_PORT` to change the preferences.
- The Rust shell in `src-tauri/` was scaffolded without a local Rust toolchain
  to compile-check it. If `cargo`/`tauri` reports an error on first build, it's
  most likely a minor API/version detail in `lib.rs` or `capabilities/default.json`
  — fix in place; the architecture above is the contract.
