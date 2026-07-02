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

// ── Broad payload scrub ────────────────────────────────────────────────
//
// Log `data` payloads land in the JSONL file sink, which can outlive
// a session. The header redaction above catches HTTP shapes, but agent
// runs also embed raw tokens / emails in `data` fields. Strip those by
// key name before write, leaving everything else intact for
// debuggability.
//
// Match is case-insensitive on the literal key (not contains), so
// `email`, `access_token`, etc. are scrubbed but `display_name` or
// `tokenCount` (which contains "token" as a substring) survive. The
// few keys that aren't an exact match but are still sensitive
// (`anthropic_api_key`, `service_role_key`) are listed explicitly.

const SENSITIVE_KEYS = new Set<string>([
  "authorization",
  "bearer",
  "cookie",
  "set-cookie",
  "password",
  "email",
  "code",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "anthropic_api_key",
  "service_role_key",
  "secret",
  "client_secret",
  "private_key",
])

/**
 * Deep-scrub `data` for logging into a durable sink. Replaces values at
 * any depth whose key matches the sensitive set, scrubs `headers`
 * objects via redactHeaders, and otherwise passes through. Use this
 * instead of redactHeadersDeep for sinks that durably retain payloads.
 */
export function redactSensitive(data: unknown, depth = 0): unknown {
  if (depth > 4 || data === null || typeof data !== "object") return data
  if (data instanceof Headers) return redactHeaders(data)
  if (Array.isArray(data)) {
    return data.map((v) => redactSensitive(v, depth + 1))
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase()
    if (SENSITIVE_KEYS.has(lower)) {
      out[key] = REDACTED
    } else if (key === "headers" && value && typeof value === "object") {
      out[key] = redactHeaders(value as Record<string, unknown>)
    } else {
      out[key] = redactSensitive(value, depth + 1)
    }
  }
  return out
}
