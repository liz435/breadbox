const port = Number(process.env.PORT ?? 3000)
const distDir = new URL("./dist", import.meta.url).pathname

Bun.serve({
  port,
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

console.log(`Serving dist/ on http://localhost:${port}`)
