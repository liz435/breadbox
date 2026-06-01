// Wrap a single 256x256 PNG into a (PNG-embedded) .ico container — valid on
// Windows Vista and later. macOS `sips` can't write .ico, so this fills the
// gap for `make-icons.sh`. For a full multi-resolution .ico, regenerate with
// `bunx @tauri-apps/cli icon` on any platform instead.
//
// Usage: bun run png-to-ico.ts <input.png> <output.ico>

export {} // make this a module so top-level await is allowed

const [, , inPath, outPath] = Bun.argv
if (!inPath || !outPath) {
  console.error("usage: bun run png-to-ico.ts <input.png> <output.ico>")
  process.exit(2)
}

const png = await Bun.file(inPath).bytes()

// ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes), then the PNG payload.
const header = new Uint8Array(6 + 16)
const view = new DataView(header.buffer)
view.setUint16(0, 0, true) // reserved, always 0
view.setUint16(2, 1, true) // image type: 1 = icon
view.setUint16(4, 1, true) // number of images
header[6] = 0 // width  — 0 encodes 256
header[7] = 0 // height — 0 encodes 256
header[8] = 0 // color palette size (0 = no palette)
header[9] = 0 // reserved
view.setUint16(10, 1, true) // color planes
view.setUint16(12, 32, true) // bits per pixel
view.setUint32(14, png.length, true) // size of image data
view.setUint32(18, header.length, true) // offset to image data (22)

const out = new Uint8Array(header.length + png.length)
out.set(header, 0)
out.set(png, header.length)
await Bun.write(outPath, out)
console.log(`wrote ${outPath} (${out.length} bytes)`)
