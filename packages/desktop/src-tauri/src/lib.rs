//! Dreamer desktop shell.
//!
//! On launch we spawn the bundled `dreamer` binary (a Tauri *sidecar*) in
//! `serve` mode. It starts the Elysia API and serves the embedded web UI on
//! loopback, preferring 3004/4112 but falling back to OS-assigned free ports
//! if those are taken — so the app never collides with another process. The
//! sidecar prints a `DREAMER_URL <url>` marker once it's ready; we read it
//! from the child's stdout and point the window there. While it boots the
//! window shows a bundled splash page. When the window closes we kill the
//! sidecar.
//!
//! A single-instance guard means a second launch just focuses the existing
//! window instead of starting a second server.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_FAILED_JS: &str = "document.body.innerHTML = '<p style=\"font-family:system-ui;color:#e5e7eb;padding:2rem\">Dreamer server did not start. Check the logs.</p>'";

/// Holds the running sidecar so we can kill it when the window closes.
struct Sidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered first: a second launch fires
        // this callback in the already-running process (focusing its window)
        // and exits, instead of starting a second server.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let navigated = Arc::new(AtomicBool::new(false));

            // Spawn `dreamer serve`. DREAMER_NO_OPEN keeps the binary from
            // opening a browser tab — we render the UI in this window.
            let mut command = app
                .shell()
                .sidecar("dreamer")
                .expect("`dreamer` sidecar missing — run `bun run prepare:sidecar`")
                .args(["serve"])
                .env("DREAMER_NO_OPEN", "1");

            // Point the server at the bundled arduino-cli sidecar so compile/
            // flash work with no manual install. resolveArduinoCli (packages/
            // api) checks DREAMER_ARDUINO_CLI first. If the binary is missing
            // (e.g. dev-from-source before prepare:sidecar runs) we leave it
            // unset and the resolver falls back to PATH / managed install.
            if let Some(arduino_cli) = bundled_arduino_cli() {
                command = command.env("DREAMER_ARDUINO_CLI", arduino_cli.to_string_lossy().to_string());
            }

            let (mut rx, child) = command
                .spawn()
                .expect("failed to spawn the dreamer sidecar");

            app.state::<Sidecar>().0.lock().unwrap().replace(child);

            // Read sidecar output: log it, and watch for the `DREAMER_URL`
            // marker carrying the (possibly OS-assigned) UI URL. When it
            // arrives, point the window there.
            let nav_stdout = navigated.clone();
            tauri::async_runtime::spawn(async move {
                let mut buf = String::new();
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let chunk = String::from_utf8_lossy(&bytes);
                            print!("[dreamer] {chunk}");
                            if !nav_stdout.load(Ordering::SeqCst) {
                                buf.push_str(&chunk);
                                if let Some(url) = extract_marker_url(&buf) {
                                    nav_stdout.store(true, Ordering::SeqCst);
                                    if let Some(window) = handle.get_webview_window("main") {
                                        if let Ok(parsed) = url.parse::<tauri::Url>() {
                                            let _ = window.navigate(parsed);
                                        }
                                    }
                                }
                            }
                        }
                        CommandEvent::Stderr(bytes) => {
                            eprint!("[dreamer] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Error(err) => eprintln!("[dreamer] error: {err}"),
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[dreamer] terminated: {payload:?}");
                            if !nav_stdout.load(Ordering::SeqCst) {
                                if let Some(window) = handle.get_webview_window("main") {
                                    let _ = window.eval(SERVER_FAILED_JS);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            });

            // Fallback: if no marker arrives in time, surface an error rather
            // than sitting on the splash forever.
            let nav_timeout = navigated.clone();
            let handle_timeout = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(90));
                if !nav_timeout.load(Ordering::SeqCst) {
                    if let Some(window) = handle_timeout.get_webview_window("main") {
                        let _ = window.eval(SERVER_FAILED_JS);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<Sidecar>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Dreamer desktop app");
}

/// Path to the bundled `arduino-cli` sidecar, if present. Tauri strips the
/// target-triple suffix from externalBin entries and places sidecars next to
/// the main executable, so arduino-cli is a sibling of our own binary.
fn bundled_arduino_cli() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(windows) { "arduino-cli.exe" } else { "arduino-cli" };
    let path = dir.join(name);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Pull the URL out of a `DREAMER_URL <url>\n` marker line, but only once the
/// full line (including its trailing newline) is present in the buffer, so we
/// never navigate to a truncated URL from a partial stdout chunk.
fn extract_marker_url(buf: &str) -> Option<String> {
    const MARKER: &str = "DREAMER_URL ";
    let start = buf.find(MARKER)? + MARKER.len();
    let rest = &buf[start..];
    let end = rest.find('\n')?;
    let url = rest[..end].trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}
