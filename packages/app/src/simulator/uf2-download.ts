// ── UF2 download ─────────────────────────────────────────────────────────
//
// Flash-to-hardware path for the Raspberry Pi Pico (and other RP2040 boards).
// Unlike AVR boards — which flash over a serial bootloader (STK500v1) — the
// Pico's standard flashing method is BOOTSEL mass storage: hold BOOTSEL while
// plugging in, the board mounts as the "RPI-RP2" drive, and dropping a `.uf2`
// onto it writes flash and reboots. So "upload" here just hands the user the
// exact `.uf2` arduino-cli produced. (A WebUSB PICOBOOT uploader could later
// remove the manual drag-drop, but BOOTSEL works on every browser/OS today.)

/** Trigger a browser download of a base64-encoded `.uf2` file. */
export function downloadUf2(uf2Base64: string, filename: string): void {
  const bin = atob(uf2Base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const blob = new Blob([bytes], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.endsWith(".uf2") ? filename : `${filename}.uf2`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
