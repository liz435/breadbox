// ── Arduino Sketch Compilation Route ──────────────────────────────────────
//
// POST /api/compile
// Compiles an Arduino sketch to Intel HEX using arduino-cli.
// Requires arduino-cli to be installed and the arduino:avr:uno core available.

import { Elysia } from "elysia"
import { z } from "zod"
import { createLogger } from "../logger"

const log = createLogger("compile")

const compileRequestSchema = z.object({
  code: z.string().min(1, "Sketch code is required"),
})

/**
 * Write a file using Bun's native file API, creating parent dirs as needed.
 */
async function writeFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content)
}

/**
 * Read a file's text content.
 */
async function readFile(path: string): Promise<string> {
  const file = Bun.file(path)
  return file.text()
}

/**
 * Run a shell command and return stdout/stderr.
 */
async function exec(
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

export const compileRoutes = new Elysia().post("/api/compile", async ({ body, set }) => {
  // Validate request body
  const parsed = compileRequestSchema.safeParse(body)
  if (!parsed.success) {
    set.status = 400
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" }
  }

  const { code } = parsed.data
  const sketchId = crypto.randomUUID()
  const sketchDir = `/tmp/arduino-sketch-${sketchId}`
  const sketchFile = `${sketchDir}/sketch/sketch.ino`
  const outputDir = `${sketchDir}/output`

  try {
    // Check if arduino-cli is available
    const checkResult = await exec(["which", "arduino-cli"])
    if (checkResult.exitCode !== 0) {
      set.status = 503
      return {
        error:
          "arduino-cli is not installed. Install it from https://arduino.github.io/arduino-cli/ and ensure the arduino:avr:uno core is installed.",
      }
    }

    // Create the sketch directory structure (arduino-cli requires a directory
    // containing a .ino file with the same name as the directory)
    await Bun.write(sketchFile, "")  // ensure parent dirs
    await writeFile(sketchFile, code)

    log.info(`Compiling sketch ${sketchId}`)

    // Compile using arduino-cli
    const compileResult = await exec([
      "arduino-cli",
      "compile",
      "--fqbn",
      "arduino:avr:uno",
      "--output-dir",
      outputDir,
      `${sketchDir}/sketch`,
    ])

    if (compileResult.exitCode !== 0) {
      log.info(`Compilation failed for ${sketchId}: ${compileResult.stderr}`)
      return {
        error: compileResult.stderr || compileResult.stdout || "Compilation failed",
      }
    }

    // Read the generated .hex file
    const hexFile = `${outputDir}/sketch.ino.hex`
    let hexContent: string
    try {
      hexContent = await readFile(hexFile)
    } catch {
      // Try alternative name patterns
      const altHexFile = `${outputDir}/sketch.ino.with_bootloader.hex`
      try {
        hexContent = await readFile(altHexFile)
      } catch {
        set.status = 500
        return { error: "Compilation succeeded but hex file not found" }
      }
    }

    log.info(`Compilation succeeded for ${sketchId}`)
    return { hex: hexContent }
  } catch (err) {
    log.info(`Compilation error: ${err instanceof Error ? err.message : "unknown"}`)
    set.status = 500
    return {
      error: err instanceof Error ? err.message : "Internal compilation error",
    }
  } finally {
    // Clean up temp files
    try {
      const rmResult = await exec(["rm", "-rf", sketchDir])
      if (rmResult.exitCode !== 0) {
        log.info(`Failed to clean up ${sketchDir}`)
      }
    } catch {
      // Best effort cleanup
    }
  }
})
