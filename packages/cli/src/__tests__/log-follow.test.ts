import { describe, expect, test } from "bun:test"
import { appendFile, mkdtemp, rename, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { followLogFile } from "../log-follow"

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("timed out waiting for condition")
}

describe("followLogFile", () => {
  test("streams existing file content and appended bytes", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dreamer-cli-log-follow-"))
    const logFile = join(tempDir, "dreamer.log")
    await writeFile(logFile, "line-1\n", "utf8")

    const chunks: string[] = []
    const controller = new AbortController()
    const followPromise = followLogFile(logFile, {
      intervalMs: 15,
      signal: controller.signal,
      onChunk: (chunk) => chunks.push(chunk),
    })

    try {
      await waitFor(() => chunks.join("").includes("line-1\n"))
      await appendFile(logFile, "line-2\n", "utf8")
      await waitFor(() => chunks.join("").includes("line-2\n"))
    } finally {
      controller.abort()
      await followPromise
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("continues following after truncation", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dreamer-cli-log-follow-"))
    const logFile = join(tempDir, "dreamer.log")
    await writeFile(logFile, "before-truncate\n", "utf8")

    const chunks: string[] = []
    const controller = new AbortController()
    const followPromise = followLogFile(logFile, {
      intervalMs: 15,
      signal: controller.signal,
      onChunk: (chunk) => chunks.push(chunk),
    })

    try {
      await waitFor(() => chunks.join("").includes("before-truncate\n"))
      await writeFile(logFile, "after-truncate\n", "utf8")
      await waitFor(() => chunks.join("").includes("after-truncate\n"))
      await appendFile(logFile, "after-append\n", "utf8")
      await waitFor(() => chunks.join("").includes("after-append\n"))
    } finally {
      controller.abort()
      await followPromise
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test("continues following after log rotation", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dreamer-cli-log-follow-"))
    const logFile = join(tempDir, "dreamer.log")
    await writeFile(logFile, "before-rotation\n", "utf8")

    const chunks: string[] = []
    const controller = new AbortController()
    const followPromise = followLogFile(logFile, {
      intervalMs: 15,
      signal: controller.signal,
      onChunk: (chunk) => chunks.push(chunk),
    })

    try {
      await waitFor(() => chunks.join("").includes("before-rotation\n"))
      await rename(logFile, join(tempDir, "dreamer.log.1"))
      await writeFile(logFile, "after-rotation\n", "utf8")
      await waitFor(() => chunks.join("").includes("after-rotation\n"))
      await appendFile(logFile, "after-rotation-append\n", "utf8")
      await waitFor(() => chunks.join("").includes("after-rotation-append\n"))
    } finally {
      controller.abort()
      await followPromise
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
