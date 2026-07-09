const port = Number(process.env.PORT ?? 28460)
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

// Optional runtime override: if BREADBOX_API_ORIGIN is set we inject
// `window.__BREADBOX__` into index.html so the frontend uses that origin
// instead of the value baked into the bundle at build time. Lets the same
// `dist/` ship to staging/prod without a rebuild per API URL.
const runtimeApiOrigin = process.env.BREADBOX_API_ORIGIN ?? ""
const runtimeInject = runtimeApiOrigin
  ? `<script>window.__BREADBOX__=${JSON.stringify({ apiOrigin: runtimeApiOrigin })};</script>`
  : ""

async function serveIndex(): Promise<Response> {
  const file = Bun.file(`${distDir}/index.html`)
  if (!runtimeInject) return new Response(file)
  const html = await file.text()
  return new Response(html.replace("<head>", `<head>${runtimeInject}`), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url)
    const filePath = `${distDir}${url.pathname}`

    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }

    if (!url.pathname.includes(".")) {
      return serveIndex()
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(
  `Serving dist/ on http://0.0.0.0:${port}${runtimeApiOrigin ? ` (api → ${runtimeApiOrigin})` : ""}`
)
