// ── ID resolver ────────────────────────────────────────────────────────────
//
// The single largest propose_fix failure class is "agent referenced an ID
// that does not exist on the board" — usually because the agent invented
// a friendly name (`led1`) instead of using the real UUID (`a4d8c4b1-...`),
// or because the UUID was truncated/mistyped. Returning a flat "not found"
// burns one of the 5 retry attempts without giving the model anything to
// correct from. This helper surfaces the most likely intended target so
// the next attempt converges instead of guessing again.

export type IdCandidate = {
  /** Canonical ID on the board (UUID for components, wire-id for wires). */
  id: string
  /** Optional display name (component.name) — agents often reference this. */
  name?: string
  /** Optional type label — useful in the suggestion text. */
  type?: string
}

/** Levenshtein distance — used as a tiebreaker on short tokens. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  let prev = new Array<number>(bl + 1)
  let curr = new Array<number>(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    curr[0] = i
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[bl]!
}

/**
 * Score a candidate against the (lowercased) unknown query.
 * Lower is better. -1 means "definitely not a match."
 * Scoring rules:
 *   - exact id match: 0 (caller should never get here, but cheap to handle)
 *   - exact name match: 1
 *   - id starts with query (truncated UUID): 2
 *   - query starts with id (extra suffix): 3
 *   - name contains query OR query contains name: 4
 *   - id contains query: 5
 *   - small edit-distance to either id or name (≤3): 6 + distance
 *   - everything else: -1 (rejected)
 */
function scoreCandidate(query: string, cand: IdCandidate): number {
  const q = query.toLowerCase()
  const id = cand.id.toLowerCase()
  const name = (cand.name ?? "").toLowerCase()

  if (id === q) return 0
  if (name && name === q) return 1
  if (id.startsWith(q) && q.length >= 4) return 2
  if (q.startsWith(id) && id.length >= 4) return 3
  if (name && (name.includes(q) || q.includes(name))) return 4
  if (id.includes(q) && q.length >= 4) return 5

  // Edit-distance — only useful for short tokens. Skip long UUID comparisons.
  if (q.length <= 24) {
    const dId = id.length <= 24 ? editDistance(q, id) : Infinity
    const dName = name && name.length <= 24 ? editDistance(q, name) : Infinity
    const best = Math.min(dId, dName)
    if (best <= 3) return 6 + best
  }
  return -1
}

/**
 * Return up to `limit` candidates ranked by likelihood that the agent
 * meant them when it wrote `query`. Empty array if no candidate is
 * close enough to suggest.
 */
export function suggestIdMatches(
  query: string,
  candidates: IdCandidate[],
  limit = 2,
): IdCandidate[] {
  if (!query || candidates.length === 0) return []
  const scored: Array<{ cand: IdCandidate; score: number }> = []
  for (const cand of candidates) {
    const score = scoreCandidate(query, cand)
    if (score >= 0) scored.push({ cand, score })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.cand)
}

/**
 * Format suggestions for inclusion in an error message. Returns the
 * empty string when no suggestion is good enough (caller can append
 * unconditionally without producing dangling " Did you mean ?").
 */
export function formatSuggestion(
  query: string,
  candidates: IdCandidate[],
): string {
  const matches = suggestIdMatches(query, candidates, 2)
  if (matches.length === 0) return ""
  const formatted = matches.map((m) => {
    const label = m.name ? `${m.id} (${m.name}${m.type ? `, ${m.type}` : ""})` : m.id
    return label
  })
  return ` Did you mean ${formatted.join(" or ")}?`
}
