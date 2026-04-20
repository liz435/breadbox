// ── GitHub OAuth helper ──────────────────────────────────────────────────
//
// Zero-dependency wrapper over GitHub's OAuth endpoints. Uses native
// `fetch` and returns structured errors the routes can translate into
// HTTP responses.
//
// Never log the access token — it's a bearer capability for the user's
// GitHub account and leaks are durable.

import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "../env"

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
const TOKEN_URL = "https://github.com/login/oauth/access_token"
const USER_URL = "https://api.github.com/user"
const EMAILS_URL = "https://api.github.com/user/emails"

const OAUTH_SCOPE = "read:user user:email"

export class GitHubOAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "exchange" | "user" | "network",
    readonly status?: number,
  ) {
    super(message)
    this.name = "GitHubOAuthError"
  }
}

export type GitHubUser = {
  id: number
  login: string
  email: string | null
  name: string | null
}

function requireConfig(): void {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new GitHubOAuthError(
      "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not configured",
      "config",
    )
  }
}

export function buildAuthorizeUrl(params: {
  state: string
  redirectUri: string
}): string {
  requireConfig()
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("client_id", GITHUB_CLIENT_ID)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("scope", OAUTH_SCOPE)
  url.searchParams.set("state", params.state)
  url.searchParams.set("allow_signup", "true")
  return url.toString()
}

export async function exchangeCode(params: {
  code: string
  redirectUri: string
}): Promise<{ accessToken: string }> {
  requireConfig()
  const body = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code: params.code,
    redirect_uri: params.redirectUri,
  })

  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "dreamer-api",
      },
      body,
    })
  } catch (err) {
    throw new GitHubOAuthError(
      `network error exchanging code: ${err instanceof Error ? err.message : err}`,
      "network",
    )
  }

  if (!res.ok) {
    throw new GitHubOAuthError(
      `github token endpoint returned ${res.status}`,
      "exchange",
      res.status,
    )
  }

  const data = (await res.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (data.error || !data.access_token) {
    throw new GitHubOAuthError(
      data.error_description ?? data.error ?? "no access_token in response",
      "exchange",
    )
  }
  return { accessToken: data.access_token }
}

export async function fetchUser(accessToken: string): Promise<GitHubUser> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "dreamer-api",
    "X-GitHub-Api-Version": "2022-11-28",
  }

  let userRes: Response
  try {
    userRes = await fetch(USER_URL, { headers })
  } catch (err) {
    throw new GitHubOAuthError(
      `network error fetching user: ${err instanceof Error ? err.message : err}`,
      "network",
    )
  }
  if (!userRes.ok) {
    throw new GitHubOAuthError(
      `github /user returned ${userRes.status}`,
      "user",
      userRes.status,
    )
  }
  const raw = (await userRes.json()) as {
    id?: number
    login?: string
    email?: string | null
    name?: string | null
  }
  if (typeof raw.id !== "number" || typeof raw.login !== "string") {
    throw new GitHubOAuthError(
      "github /user response missing id or login",
      "user",
    )
  }

  let email: string | null = raw.email ?? null
  if (!email) {
    email = await fetchPrimaryEmail(headers)
  }

  return {
    id: raw.id,
    login: raw.login,
    email,
    name: raw.name ?? null,
  }
}

async function fetchPrimaryEmail(headers: HeadersInit): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(EMAILS_URL, { headers })
  } catch {
    return null
  }
  if (!res.ok) return null
  const list = (await res.json()) as Array<{
    email?: string
    primary?: boolean
    verified?: boolean
  }>
  if (!Array.isArray(list)) return null
  const primary = list.find(
    (e) => e.primary === true && e.verified === true && typeof e.email === "string",
  )
  if (primary?.email) return primary.email
  const verified = list.find(
    (e) => e.verified === true && typeof e.email === "string",
  )
  return verified?.email ?? null
}

/** `"gh:" + login` — our canonical userId for a GitHub-authenticated user. */
export function githubUserId(login: string): string {
  return `gh:${login}`
}
