import { open, stat } from "fs/promises"

const READ_CHUNK_BYTES = 64 * 1024

export type FollowLogOptions = {
  intervalMs?: number
  signal?: AbortSignal
  onChunk?: (chunk: string) => void
}

function isErrnoCode(err: unknown, code: string): boolean {
  return typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code?: string }).code === code
}

async function sleep(intervalMs: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    return
  }
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, intervalMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

async function streamRange(
  filePath: string,
  startOffset: number,
  endOffset: number,
  onChunk: (chunk: string) => void,
): Promise<number> {
  const handle = await open(filePath, "r")
  try {
    let offset = startOffset
    let remaining = endOffset - startOffset
    while (remaining > 0) {
      const size = Math.min(remaining, READ_CHUNK_BYTES)
      const buffer = Buffer.allocUnsafe(size)
      const { bytesRead } = await handle.read(buffer, 0, size, offset)
      if (bytesRead <= 0) break
      onChunk(buffer.subarray(0, bytesRead).toString("utf8"))
      offset += bytesRead
      remaining -= bytesRead
    }
    return offset
  } finally {
    await handle.close()
  }
}

export async function followLogFile(filePath: string, options: FollowLogOptions = {}): Promise<void> {
  const intervalMs = options.intervalMs ?? 250
  const onChunk = options.onChunk ?? ((chunk: string) => process.stdout.write(chunk))

  let offset = 0
  let inode: number | null = null

  while (!options.signal?.aborted) {
    try {
      const stats = await stat(filePath)
      const currentInode = Number.isFinite(stats.ino) ? stats.ino : null
      const rotated = (inode !== null && currentInode !== null && currentInode !== inode)
        || stats.size < offset
      if (rotated) {
        offset = 0
      }
      inode = currentInode ?? inode
      if (stats.size > offset) {
        offset = await streamRange(filePath, offset, stats.size, onChunk)
      }
    } catch (err) {
      if (!isErrnoCode(err, "ENOENT")) throw err
      offset = 0
      inode = null
    }
    await sleep(intervalMs, options.signal)
  }
}
