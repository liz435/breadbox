//! Breadbox desktop shell.
//!
//! On launch we spawn the bundled `breadbox` binary (a Tauri *sidecar*) in
//! `serve` mode. It starts the Elysia API and serves the embedded web UI on
//! loopback, preferring 3004/4112 but falling back to OS-assigned free ports
//! if those are taken — so the app never collides with another process. The
//! sidecar prints a `BREADBOX_URL <url>` marker once it's ready; we read it
//! from the child's stdout and point the window there. While it boots the
//! window shows a bundled splash page. When the window closes we kill the
//! sidecar.
//!
//! A single-instance guard means a second launch just focuses the existing
//! window instead of starting a second server.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::menu::{
    CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Listener, Manager, WindowEvent, Wry};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const SERVER_FAILED_JS: &str = "document.body.innerHTML = '<p style=\"font-family:system-ui;color:#e5e7eb;padding:2rem\">Breadbox server did not start. Check the logs.</p>'";

/// Tauri event the web UI emits with the JSON array of currently-open view
/// panel ids, so the View menu's checkmarks can track which panels are open.
const VIEW_STATE_EVENT: &str = "dreamer-view-state";

/// Holds the running sidecar so we can kill it when the window closes.
struct Sidecar(Mutex<Option<CommandChild>>);

/// The View-menu check items, keyed by panel id (e.g. "breadboard"). Lets the
/// VIEW_STATE_EVENT listener tick/untick each item as panels open and close.
struct ViewMenuItems(Mutex<HashMap<String, CheckMenuItem<Wry>>>);

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
            // Native menu bar. Preserves the standard macOS app/Edit/Window
            // items and adds a custom "View" submenu whose items switch the
            // web UI's Dockview view panels (see install_menu). The returned
            // map of CheckMenuItems is kept in state so we can sync checkmarks.
            let view_items = install_menu(app.handle())?;
            app.manage(ViewMenuItems(Mutex::new(view_items)));

            // The web UI emits VIEW_STATE_EVENT with the open panel ids whenever
            // its layout changes; mirror that onto the menu's checkmarks.
            let menu_handle = app.handle().clone();
            app.listen(VIEW_STATE_EVENT, move |event| {
                let open: Vec<String> = serde_json::from_str(event.payload()).unwrap_or_default();
                if let Some(state) = menu_handle.try_state::<ViewMenuItems>() {
                    if let Ok(items) = state.0.lock() {
                        for (panel_id, item) in items.iter() {
                            let _ = item.set_checked(open.iter().any(|id| id == panel_id));
                        }
                    }
                }
            });

            let handle = app.handle().clone();
            let navigated = Arc::new(AtomicBool::new(false));

            // Spawn `breadbox serve`. BREADBOX_NO_OPEN keeps the binary from
            // opening a browser tab — we render the UI in this window.
            let mut command = app
                .shell()
                .sidecar("breadbox")
                .expect("`breadbox` sidecar missing — run `bun run prepare:sidecar`")
                .args(["serve"])
                .env("BREADBOX_NO_OPEN", "1");

            // Point the server at the bundled arduino-cli sidecar so compile/
            // flash work with no manual install. resolveArduinoCli (packages/
            // api) checks BREADBOX_ARDUINO_CLI first. If the binary is missing
            // (e.g. dev-from-source before prepare:sidecar runs) we leave it
            // unset and the resolver falls back to PATH / managed install.
            if let Some(arduino_cli) = bundled_arduino_cli() {
                command = command.env("BREADBOX_ARDUINO_CLI", arduino_cli.to_string_lossy().to_string());
            }

            let (mut rx, child) = command
                .spawn()
                .expect("failed to spawn the breadbox sidecar");

            app.state::<Sidecar>().0.lock().unwrap().replace(child);

            // Read sidecar output: log it, and watch for the `BREADBOX_URL`
            // marker carrying the (possibly OS-assigned) UI URL. When it
            // arrives, point the window there.
            let nav_stdout = navigated.clone();
            tauri::async_runtime::spawn(async move {
                let mut buf = String::new();
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let chunk = String::from_utf8_lossy(&bytes);
                            print!("[breadbox] {chunk}");
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
                            eprint!("[breadbox] {}", String::from_utf8_lossy(&bytes))
                        }
                        CommandEvent::Error(err) => eprintln!("[breadbox] error: {err}"),
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[breadbox] terminated: {payload:?}");
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
        // View-menu clicks (and Cmd+1..9 / Next-Prev accelerators) arrive here.
        // The web UI is a remote http URL with no Tauri IPC, so we bridge to it
        // by evaluating JS that dispatches a `dreamer:menu-command` CustomEvent;
        // the frontend's useViewMenuCommands hook listens for it. In a plain
        // browser this menu doesn't exist, so the event simply never fires.
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            let action: Option<String> = if id == "view:next" {
                Some("next-tab".to_string())
            } else if id == "view:prev" {
                Some("prev-tab".to_string())
            } else if let Some(panel) = id.strip_prefix("view:") {
                Some(format!("show:{panel}"))
            } else {
                None
            };
            if let Some(action) = action {
                if let Some(window) = app.get_webview_window("main") {
                    // `{action:?}` emits a quoted, escaped JS string literal.
                    let js = format!(
                        "window.dispatchEvent(new CustomEvent('dreamer:menu-command',{{detail:{{action:{action:?}}}}}))"
                    );
                    let _ = window.eval(&js);
                }
                // A `show:` always leaves the panel open. macOS toggles a check
                // item on click, so assert it checked now rather than waiting
                // for the frontend's VIEW_STATE_EVENT to correct the toggle.
                if let Some(panel) = action.strip_prefix("show:") {
                    if let Some(state) = app.try_state::<ViewMenuItems>() {
                        if let Ok(items) = state.0.lock() {
                            if let Some(item) = items.get(panel) {
                                let _ = item.set_checked(true);
                            }
                        }
                    }
                }
            }
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
        .expect("error while running the Breadbox desktop app");
}

/// Build and install the application menu.
///
/// Replaces the default auto-generated menu with: a standard macOS app menu
/// (about/services/hide/quit), an Edit menu with the native clipboard items
/// (cut/copy/paste/select-all — **undo/redo are intentionally omitted** so the
/// OS doesn't intercept Cmd+Z and fight the web UI's own board/scene undo), a
/// custom View menu mapping each view panel to "view:<id>" (Cmd+1..9 for the
/// first nine — keep this order in sync with VIEW_PANELS in packages/app/src/
/// store/view-panels.ts) plus Next/Previous Tab, and a standard Window menu.
///
/// The View items are CheckMenuItems; the returned map (keyed by panel id) lets
/// the caller keep their checkmarks in sync with the web UI's open panels.
fn install_menu(app: &AppHandle) -> tauri::Result<HashMap<String, CheckMenuItem<Wry>>> {
    let app_menu = SubmenuBuilder::new(app, "Breadbox")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // View items, in the same order as VIEW_PANELS (frontend). The first nine
    // get Cmd+1..9; oledDisplay has no accelerator. `checked` mirrors the
    // default layout so the menu is right before the first frontend sync.
    const DEFAULT_OPEN: &[&str] = &[
        "breadboard",
        "sketchEditor",
        "schematic",
        "libraryManager",
        "inspector",
        "diagram",
        "pinInspector",
        "serialMonitor",
        "projectFiles",
    ];
    let view_defs: [(&str, &str, Option<&str>); 12] = [
        ("breadboard", "Breadboard", Some("CmdOrCtrl+1")),
        ("sketchEditor", "Sketch", Some("CmdOrCtrl+2")),
        ("schematic", "Schematic", Some("CmdOrCtrl+3")),
        ("inspector", "Inspector", Some("CmdOrCtrl+4")),
        ("serialMonitor", "Serial Monitor", Some("CmdOrCtrl+5")),
        ("pinInspector", "Pin Inspector", Some("CmdOrCtrl+6")),
        ("projectFiles", "Project Files", Some("CmdOrCtrl+7")),
        ("libraryManager", "Libraries", Some("CmdOrCtrl+8")),
        ("diagram", "Diagram", Some("CmdOrCtrl+9")),
        ("oledDisplay", "OLED Display", None),
        ("debugger", "Debugger", None),
        ("customParts", "Custom Parts", None),
    ];

    let mut view_items: HashMap<String, CheckMenuItem<Wry>> = HashMap::new();
    let mut view_builder = SubmenuBuilder::new(app, "View");
    for (panel_id, label, accel) in view_defs {
        let mut builder = CheckMenuItemBuilder::with_id(format!("view:{panel_id}"), label)
            .checked(DEFAULT_OPEN.contains(&panel_id));
        if let Some(accel) = accel {
            builder = builder.accelerator(accel);
        }
        let item = builder.build(app)?;
        view_builder = view_builder.item(&item);
        view_items.insert(panel_id.to_string(), item);
    }
    let view_menu = view_builder
        .separator()
        .item(&MenuItemBuilder::with_id("view:next", "Next Tab").accelerator("Ctrl+Tab").build(app)?)
        .item(&MenuItemBuilder::with_id("view:prev", "Previous Tab").accelerator("Shift+Ctrl+Tab").build(app)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()?;

    app.set_menu(menu)?;
    Ok(view_items)
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

/// Pull the URL out of a `BREADBOX_URL <url>\n` marker line, but only once the
/// full line (including its trailing newline) is present in the buffer, so we
/// never navigate to a truncated URL from a partial stdout chunk.
fn extract_marker_url(buf: &str) -> Option<String> {
    const MARKER: &str = "BREADBOX_URL ";
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
