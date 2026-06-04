# Breadbox — Shipping Blockers

Audit of what's blocking the Arduino simulator from being shipped as a usable product.

---

## Critical — Must Fix Before Any Release

### ~~1. Silent Auto-Save Failures~~ FIXED
- Added toast notification system (`components/ui/toast.tsx`) with `toast.error()` callable from anywhere.
- All save `.catch()` blocks now show red error toasts to the user.
- Graph persistence, board persistence, and `saveNow` (Cmd+S) all report failures.

### ~~2. No Error Boundaries~~ FIXED
- Created `ErrorBoundary` component (`components/error-boundary.tsx`) with fallback UI showing error message and "Try Again" button.
- All 10 Dockview panel wrappers wrapped individually — a crash in one panel doesn't affect others.
- Root `<App>` wrapped as last-resort catch.

### 3. Unsafe `new Function()` Execution — PARTIALLY FIXED
- 12 browser globals are shadowed as `undefined` parameters: `window`, `self`, `globalThis`, `document`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `importScripts`.
- `eval` and `Function` are NOT blocked — they can't be used as parameter names or variable names in strict mode, and removing strict mode was necessary for compatibility.
- **Remaining risk**: A crafted sketch could use `eval()` or `new Function()` to escape the parameter sandbox. Full mitigation requires running transpiled code in a Web Worker (async stdlib bridge).

### ~~4. Hardcoded Localhost — No Production Config~~ FIXED
- `APP_PORT`, `API_PORT`, `APP_ORIGIN`, and `API_ORIGIN` now read from environment variables with localhost as fallback.
- Set `APP_ORIGIN=https://yourdomain.com` and `API_ORIGIN=https://api.yourdomain.com` before starting servers.

### 5. No Docker / Deployment Setup
- No Dockerfile, no docker-compose, no deployment guide.
- `arduino-cli` must be manually installed for AVR compilation mode.
- **Fix**: Create a Dockerfile with Bun + optional arduino-cli, add docker-compose for dev/prod.

---

## High — Should Fix Before Beta

### ~~6. Auto-Save Race Conditions~~ FIXED
- Added `savingRef` flag to prevent overlapping save requests.
- Added `beforeunload` listener that uses `navigator.sendBeacon()` to flush unsaved changes on tab close/navigation — reliable even during page unload.
- `saveNow` (Cmd+S) uses `Promise.all` to save board + graph atomically.

### ~~7. No Confirmation on Destructive Actions~~ FIXED
- Deleting a component/wire now shows a toast: "Deleted {name} — press Cmd+Z to undo".
- Less intrusive than a confirmation dialog, preserves fast workflow, and makes undo discoverable.

### ~~8. Empty Catch Blocks Everywhere~~ FIXED
- All empty `.catch(() => {})` blocks replaced with `toast.error()` messages:
  - `project-selector.tsx`: "Failed to load project list", "Failed to delete project", "Failed to create project"
  - `project-files.tsx`: "Operation failed" on rename/delete/upload failures
  - `use-graph-persistence.ts`: "Failed to auto-save graph"
  - `use-board-persistence.ts`: "Failed to auto-save project", "Failed to save project"
- Remaining `.catch(() => {})` in video/audio playback are intentional (browser autoplay policy).

### 9. No Auth on API Endpoints
- All routes (create/delete project, upload files, compile) are open. Anyone on the allowed CORS origin can access any project.
- **Fix**: For local-only use, acceptable. For hosted deployment, add session tokens.

### 10. Asset Upload Without Validation
- **File**: `routes/projects.ts`
- File extension comes from user-controlled filename. MIME type is trusted. No file size limit.
- **Fix**: Validate file type server-side, enforce size limits.

### ~~11. CORS Locked to Localhost~~ FIXED
- CORS origin now reads from `APP_ORIGIN` env var (via `@dreamer/config`), which itself falls back to `localhost:3002`.
- Set `APP_ORIGIN=https://yourdomain.com` to allow production traffic.

---

## Medium — Fix Before Public Launch

### ~~12. No Toast/Notification System~~ FIXED
- `components/ui/toast.tsx` provides a toast system with `toast.error()`, `toast.success()`, etc.
- Used throughout: save failures, auto-save errors, destructive action confirmations, project CRUD failures.

### 13. No Mobile / Responsive Layout
- Dockview multi-panel UI doesn't work on mobile or tablet. Touch interactions not implemented.
- **Fix**: Responsive breakpoint that switches to tabbed view on small screens.

### ~~14. Wire Editing Not Possible~~ FIXED
- Added `UPDATE_WIRE` event to board machine with auto-snapshot for undo support.
- Selected wires show blue drag handles on both endpoints.
- Drag a handle to snap the endpoint to a new breadboard hole.
- Arduino-pin wire "from" endpoints are locked (can't drag off the pin).

### ~~15. Component Property Editing Limited~~ FIXED
- Added 6 new type-specific inspectors: RGB LED (4 pin selectors), Temperature Sensor (temperature slider -40 to 125°C + signal pin), Photoresistor (light level slider 0-100% + pins), Ultrasonic Sensor (distance slider 2-400cm + trigger/echo pins), LCD 16x2 (RS/EN/D4-D7 pin selectors), 7-Segment Display (segments A-G pin selectors).
- All 14 component types now have dedicated inspectors. Only IC Chip falls through to the generic pin inspector.

### ~~16. Missing Loading / Error States in UI~~ FIXED
- Project loader now shows a spinner during loading instead of plain text.
- Error state detects network errors and shows actionable guidance: "Make sure the API server is running on port 4111. Run `bun run dev:api`."
- Added "Retry" and "New Project" buttons (New Project clears stale projectId from localStorage).
- Non-network errors show the error message with the same retry options.

### ~~17. Data Directory Not Configurable~~ FIXED
- All data paths (`projects/`, `assets/`, `threads/`, `runs/`) now read from `process.env.DATA_DIR` with fallback to the default `../../data` relative path.
- Set `DATA_DIR=/path/to/data` before starting the API server to use a custom location.
- Updated in both `project-repo.ts` and `agent-run-repo.ts`.

### 18. No Source Maps in Production Build
- Production errors won't have readable stack traces.
- **Fix**: Enable `sourcemap: true` in Vite config for production builds.

---

## Low — Nice to Have

### ~~19. Minimal Test Coverage~~ IMPROVED
- **Transpiler**: 121 tests (good)
- **Board machine**: ~10 tests → 28 tests (added full undo/redo suite + dirty-hash stability)
- **Circuit solver**: ~10 tests (basic)
- **API routes**: 0 → 16 tests (`/project` CRUD, `/state`, `/board`, `/graph` endpoints)
- **Project repo**: 0 → 18 tests (create/read/delete, atomic save, board ops, version conflict)
- **Auto-save dirty-hash logic**: 3 tests (hash stability, mutation detection, SELECT exclusion)
- **Undo/redo**: Full suite — wires, sketch, multi-step, new-mutation-clears-redo
- Run all tests: `bun test packages/`

### ~~20. No Keyboard Shortcuts Help Dialog~~ FIXED
- Press `?` anywhere (outside editors/inputs) to open a keyboard shortcuts dialog.
- Three groups: General (Cmd+K, Cmd+S, Cmd+Z, ?), Breadboard (R, Delete, Escape, Space+Drag, Scroll), Sketch Editor (Cmd+F, Tab, fold/unfold).
- Also accessible via Cmd+K command palette → "Keyboard Shortcuts".

### 21. No Export / Share
- No way to export a project as a .zip, share a link, or export the schematic as an image.
- **Fix**: Add export to .ino file, schematic PNG export, project ZIP download.

### 22. No Undo Across Panels
- Board and graph have separate undo stacks. Undoing in one doesn't affect the other.
- **Fix**: Unified undo stack, or at minimum clear visual indicators of which panel undo applies to.

### 23. Schematic Is Read-Only
- Users can't edit the schematic directly — it's auto-generated from the breadboard.
- This is fine for v1 but limits advanced users.

### ~~24. Memory Leak Potential in Audio~~ FIXED
- Added `closeAudioContext()` which stops all oscillators and calls `AudioContext.close()`.
- Called on unmount (replacing the previous `stopAllTones()`-only cleanup) and on `stop()`.
- Prevents `AudioContext` accumulation — browsers cap instances at ~6.

---

## Summary

| Severity | Total | Open | Fixed |
|----------|-------|------|-------|
| Critical | 5 | 3 | 2 (#4, #11) |
| High | 6 | 2 | 4 (#6, #7, #8 + #11 covers CORS) |
| Medium | 7 | 3 | 4 (#14, #15, #16, #17, #12) |
| Low | 6 | 4 | 2 (#20, #24) |

**Minimum viable ship**: Fix remaining criticals (#3, #5) + highs (#9, #10). That's ~1 week of focused work.

**Solid beta**: Add medium items (#13, #18, #22). Total ~2-3 weeks.

**Production-ready**: All items. Total ~8-10 weeks.
