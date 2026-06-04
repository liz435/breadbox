// Prevents an extra console window from opening alongside the app on Windows
// release builds. No effect on macOS/Linux.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dreamer_desktop_lib::run()
}
