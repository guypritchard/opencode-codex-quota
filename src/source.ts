import type { Quota } from "./quota"

export type FailureCode = "NO_CONNECTION" | "OAUTH_REQUIRED" | "AUTH_EXPIRED" | "AUTH_REJECTED" | "ACCESS_DENIED" | "RATE_LIMITED" | "UPSTREAM_BLOCKED" | "TIMEOUT" | "NETWORK_ERROR" | "INVALID_RESPONSE"
export type UsageResult =
  | { ok: true; source: "openai"; usage: Quota; fetchedAt: string; cached: boolean }
  | { ok: false; code: FailureCode; retryable: boolean }

type Credential = { type?: string; access?: string; expires?: number; metadata?: { accountID?: string } }
type Resolver = { active: (integration: string) => Promise<unknown>; resolve: (connection: never) => Promise<unknown> }
type Dependencies = { connection: Resolver; fetch?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>; now?: () => number; timeoutMs?: number }
const URL_USAGE = "https://chatgpt.com/backend-api/codex/usage"
const MAX_BYTES = 256 * 1024
const fail = (code: FailureCode, retryable = false): UsageResult => ({ ok: false, code, retryable })
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
const plan = (value: unknown): Quota["plan"] =>
  typeof value === "string" && ["free", "plus", "pro", "team", "business", "enterprise", "edu"].includes(value.toLowerCase()) ? value.toLowerCase() : "unknown"

function normalize(payload: unknown): Quota | undefined {
  const root = object(payload)
  const limits = object(root?.rate_limit)
  const windows: Quota["windows"] = []
  for (const [key, label] of [["primary_window", "5h"], ["secondary_window", "Week"]] as const) {
    const item = object(limits?.[key])
    const used = number(item?.used_percent)
    if (used === undefined || used > 100) continue
    const resetAfterSeconds = number(item?.reset_after_seconds)
    const rawReset = number(item?.reset_at)
    const resetAt = rawReset === undefined ? undefined : rawReset > 100_000_000_000 ? rawReset / 1000 : rawReset
    windows.push({ label, used, ...(resetAfterSeconds === undefined ? {} : { resetAfterSeconds }), ...(resetAt === undefined ? {} : { resetAt }) })
  }
  return windows.length ? { plan: plan(root?.plan_type), windows } : undefined
}

function oauth(value: unknown): { access: string; account: string; expires: number } | undefined {
  const credential = value as Credential | undefined
  if (credential?.type !== "oauth" || typeof credential.access !== "string" || !credential.access.trim() ||
    typeof credential.metadata?.accountID !== "string" || !credential.metadata.accountID.trim()) return undefined
  return { access: credential.access, account: credential.metadata.accountID, expires: credential.expires ?? 0 }
}

function connectionKey(value: unknown): unknown {
  const id = object(value)?.id
  return typeof id === "string" && id.length ? id : value
}

export function createUsageSource(deps: Dependencies) {
  const clock = deps.now ?? Date.now
  const request = deps.fetch ?? fetch
  let cache: { usage: Quota; fetchedAt: string; expires: number; connection: unknown; account: string } | undefined
  let flight: { promise: Promise<UsageResult>; connection: unknown; account: string } | undefined

  async function load(connection: unknown, original: { access: string; account: string; expires: number }): Promise<UsageResult> {
    let credential = original
    if (credential.expires <= clock() - 30_000) {
      credential = oauth(await deps.connection.resolve(connection as never)) ?? credential
      if (credential.expires <= clock() - 30_000) return fail("AUTH_EXPIRED")
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15_000)
      let response: Response
      try {
        response = await request(URL_USAGE, { method: "GET", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${credential.access}`, "chatgpt-account-id": credential.account,
            "User-Agent": "codex_cli_rs/0.132.0", originator: "codex_cli_rs", Accept: "application/json" } })
        if (response.status === 401) {
          if (attempt) return fail("AUTH_REJECTED")
          const next = oauth(await deps.connection.resolve(connection as never))
          if (!next || next.account !== credential.account || next.access === credential.access) return fail("AUTH_REJECTED")
          credential = next
          continue
        }
        if (response.status === 429) return fail("RATE_LIMITED", true)
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
        if (response.status === 403) return fail(contentType.includes("html") ? "UPSTREAM_BLOCKED" : "ACCESS_DENIED")
        if (contentType.includes("html")) return fail("UPSTREAM_BLOCKED")
        if (!response.ok || !contentType.includes("application/json")) return fail("INVALID_RESPONSE")
        if (Number(response.headers.get("content-length")) > MAX_BYTES) return fail("INVALID_RESPONSE")
        const reader = response.body?.getReader()
        if (!reader) return fail("INVALID_RESPONSE")
        const parts: Uint8Array[] = []
        let size = 0
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_BYTES) { await reader.cancel(); return fail("INVALID_RESPONSE") }
            parts.push(value)
          }
        } finally { reader.releaseLock() }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
        let payload: unknown
        try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("INVALID_RESPONSE") }
        const usage = normalize(payload)
        if (!usage) return fail("INVALID_RESPONSE")
        const fetchedAt = new Date(clock()).toISOString()
        cache = { usage, fetchedAt, expires: clock() + 120_000, connection: connectionKey(connection), account: credential.account }
        return { ok: true, source: "openai", usage, fetchedAt, cached: false }
      } catch {
        return fail(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR", true)
      } finally { clearTimeout(timeout) }
    }
    return fail("AUTH_REJECTED")
  }

  return async (input: { force?: boolean } = {}): Promise<UsageResult> => {
    try {
      const connection = await deps.connection.active("openai")
      if (!connection) { cache = undefined; return fail("NO_CONNECTION") }
      const raw = await deps.connection.resolve(connection as never)
      if ((raw as Credential | undefined)?.type !== "oauth") { cache = undefined; return fail("OAUTH_REQUIRED") }
      const credential = oauth(raw)
      if (!credential) { cache = undefined; return fail("OAUTH_REQUIRED") }
      if (cache && cache.connection === connectionKey(connection) && cache.account === credential.account && cache.expires > clock() && !input.force && credential.expires > clock() - 30_000)
        return { ok: true, source: "openai", usage: cache.usage, fetchedAt: cache.fetchedAt, cached: true }
      if (flight && flight.connection === connectionKey(connection) && flight.account === credential.account) return flight.promise
      const current = { promise: load(connection, credential), connection: connectionKey(connection), account: credential.account }
      flight = current
      try { return await current.promise } finally { if (flight === current) flight = undefined }
    } catch { return fail("NETWORK_ERROR", true) }
  }
}
