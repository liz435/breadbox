const port = Number(process.env.PORT ?? 3000)
// Use import.meta.dir (Bun's __dirname equivalent) so the path is always
// resolved relative to this file, not the working directory. This is
// important when the server is started from the monorepo root via
// `bun run --filter=@dreamer/app start`, where process.cwd() points to
// the repo root rather than packages/app/.
const distDir = `${import.meta.dir}/dist`

if (!(await Bun.file(`${distDir}/index.html`).exists())) {
  console.error(
    `[serve] ERROR: dist directory not found at ${distDir}. ` +
      "Run 'bun run build' before starting the server."
  )
  process.exit(1)
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url)
    let filePath = `${distDir}${url.pathname}`

    // Try exact file first
    let file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }

    // Try with index.html for directory paths
    if (!url.pathname.includes(".")) {
      file = Bun.file(`${distDir}/index.html`)
      if (await file.exists()) {
        return new Response(file)
      }
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Serving dist/ on http://0.0.0.0:${port}`)
