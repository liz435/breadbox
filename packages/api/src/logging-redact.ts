// ── Log redaction ───────────────────────────────────────────────────────
//
// Railway retains stderr indefinitely. A leak of `Authorization` or
// `Cookie` in a log line is durable and impossible to fully claw back.
// Route every header-shaped object through this before logging.

const SENSITIVE_HEADERS = new Set<string>([
  "authorization",
  "cookie",
  "set-cookie",
])

const REDACTED = "[redacted]"

export function redactHeaders(
  headers: Headers | Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value
    })
    return out
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
      ? REDACTED
      : String(value)
  }
  return out
}

/**
 * Recursively scrubs any nested `headers` field (common shape in
 * request-logging contexts) from a plain-object payload. Non-matching
 * keys pass through unchanged. Bounded depth so a pathological cycle
 * can't hang the logger.
 */
export function redactHeadersDeep(data: unknown, depth = 0): unknown {
  if (depth > 4 || data === null || typeof data !== "object") return data
  if (data instanceof Headers) return redactHeaders(data)
  if (Array.isArray(data)) {
    return data.map((v) => redactHeadersDeep(v, depth + 1))
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === "headers" && value && typeof value === "object") {
      out[key] = redactHeaders(value as Record<string, unknown>)
    } else {
      out[key] = redactHeadersDeep(value, depth + 1)
    }
  }
  return out
}
