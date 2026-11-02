import { describe, expect, test } from "bun:test"
import { createUsageSource } from "../src/source"

const secret = "SENTINEL_PRIVATE_TOKEN"
const account = "SENTINEL_PRIVATE_ACCOUNT"
const time = 1_800_000_000_000
const valid = { plan_type: "plus", rate_limit: {
  primary_window: { used_percent: 52, reset_after_seconds: 3600, reset_at: 1_800_010_000 },
  secondary_window: { used_percent: 37, reset_at: 1_800_200_000 },
} }
const oauth = (access = secret, expires = time + 100_000) =>
  ({ type: "oauth", access, refresh: secret, expires, metadata: { accountID: account } })
const json = (body: unknown = valid, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

type Fetcher = NonNullable<Parameters<typeof createUsageSource>[0]["fetch"]>
function harness(options: { connection?: unknown; credential?: unknown; responses?: Response[]; fetch?: Fetcher; now?: () => number } = {}) {
  const connection = options.connection === undefined ? { id: "connection" } : options.connection
  let credential: unknown = options.credential === undefined ? oauth() : options.credential
  let resolves = 0
  let calls = 0
  const requests: { url: string; init?: RequestInit }[] = []
  const responses = options.responses ?? [json()]
  const fetcher: Fetcher = options.fetch ?? (async (url, init) => {
    calls++
    requests.push({ url: String(url), init })
    return responses.shift() ?? json()
  })
  const source = createUsageSource({
    connection: { active: async () => connection, resolve: async () => { resolves++; return credential } },
    fetch: fetcher, now: options.now ?? (() => time), timeoutMs: 20,
  })
  return { source, requests, get calls() { return calls }, get resolves() { return resolves }, setCredential: (next: unknown) => { credential = next } }
}

describe("server quota source", () => {
  test("fixed OpenAI upstream and exact header names; strips all secrets and extras", async () => {
    const h = harness({ responses: [json({ ...valid, email: secret, plan_type: secret, rate_limit: { ...valid.rate_limit, primary_window: { ...valid.rate_limit.primary_window, extra: secret } } })] })
    const result = await h.source()
    expect(result.ok).toBe(true)
    expect(result.ok && result.usage).toEqual({ plan: "unknown", windows: [
      { label: "5h", used: 52, resetAfterSeconds: 3600, resetAt: 1_800_010_000 },
      { label: "Week", used: 37, resetAt: 1_800_200_000 },
    ] })
    expect(h.requests[0]?.url).toBe("https://chatgpt.com/backend-api/codex/usage")
    expect(Object.keys(h.requests[0]?.init?.headers ?? {}).sort()).toEqual(["Accept", "Authorization", "User-Agent", "chatgpt-account-id", "originator"].sort())
    expect(h.requests[0]?.init?.redirect).toBe("error")
    const headers = h.requests[0]?.init?.headers as Record<string, string>
    expect(headers.Accept).toBe("application/json")
    expect(headers["User-Agent"]).toBe("codex_cli_rs/0.132.0")
    expect(headers.originator).toBe("codex_cli_rs")
    expect(headers.Authorization.startsWith("Bearer ")).toBe(true)
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain(account)
  })

  test("no connection, API key and missing account are rejected without fetching", async () => {
    for (const [connection, credential, code] of [
      [null, oauth(), "NO_CONNECTION"],
      [{ id: "c" }, { type: "api", key: secret }, "OAUTH_REQUIRED"],
      [{ id: "c" }, { ...oauth(), metadata: {} }, "OAUTH_REQUIRED"],
    ] as const) {
      const h = harness({ connection, credential })
      expect(await h.source()).toEqual({ ok: false, code, retryable: false })
      expect(h.calls).toBe(0)
    }
  })

  test("expired credentials re-resolve once and refuse expired token", async () => {
    const h = harness({ credential: oauth(secret, time - 60_000) })
    expect(await h.source()).toEqual({ ok: false, code: "AUTH_EXPIRED", retryable: false })
    expect(h.resolves).toBe(2)
    expect(h.calls).toBe(0)
  })

  test("expiry can recover after OpenCode refreshes credential", async () => {
    let resolves = 0
    const source = createUsageSource({
      connection: { active: async () => ({ id: "c" }), resolve: async () => ++resolves === 1 ? oauth(secret, time - 60_000) : oauth("new-access") },
      fetch: async () => json(), now: () => time,
    })
    expect((await source()).ok).toBe(true)
    expect(resolves).toBe(2)
  })

  test("401 only retries with a changed token on same account", async () => {
    const unchanged = harness({ responses: [json({}, 401)] })
    expect(await unchanged.source()).toEqual({ ok: false, code: "AUTH_REJECTED", retryable: false })
    expect(unchanged.calls).toBe(1)
    let resolves = 0
    const requests: string[] = []
    const source = createUsageSource({
      connection: { active: async () => ({ id: "c" }), resolve: async () => ++resolves === 1 ? oauth() : oauth("changed-secret") },
      fetch: async (_url, init) => { requests.push(String((init?.headers as Record<string, string>)?.Authorization)); return requests.length === 1 ? json({}, 401) : json() },
      now: () => time,
    })
    expect((await source()).ok).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests[0]).not.toBe(requests[1])
    const changedAccount = createUsageSource({
      connection: { active: async () => ({ id: "c" }), resolve: async () => ++resolves === 3 ? oauth() : { ...oauth("changed-secret"), metadata: { accountID: "other" } } },
      fetch: async () => json({}, 401), now: () => time,
    })
    expect(await changedAccount()).toEqual({ ok: false, code: "AUTH_REJECTED", retryable: false })
  })

  test("challenge, denial, rate limit, timeout, malformed and oversized replies", async () => {
    const examples: [Response | undefined, string][] = [
      [new Response("<html>challenge</html>", { headers: { "content-type": "text/html" } }), "UPSTREAM_BLOCKED"],
      [json({}, 403), "ACCESS_DENIED"], [json({}, 429), "RATE_LIMITED"],
      [new Response("not-json", { headers: { "content-type": "application/json" } }), "INVALID_RESPONSE"],
      [json({ rate_limit: {} }), "INVALID_RESPONSE"],
      [new Response("x".repeat(256 * 1024 + 1), { headers: { "content-type": "application/json" } }), "INVALID_RESPONSE"],
    ]
    for (const [response, code] of examples) {
      const result = await harness({ responses: [response!] }).source()
      expect(result.ok).toBe(false)
      expect(String(!result.ok && result.code)).toBe(code)
      expect(JSON.stringify(result)).not.toContain(secret)
    }
    const timeout = harness({ fetch: async (_url, init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error(secret)), { once: true })
    }) })
    expect(await timeout.source()).toEqual({ ok: false, code: "TIMEOUT", retryable: true })
  })

  test("success cache, force bypass and single-flight", async () => {
    const h = harness()
    expect((await h.source()).ok).toBe(true)
    const cached = await h.source()
    expect(cached.ok && cached.cached).toBe(true)
    expect(h.calls).toBe(1)
    expect((await h.source({ force: true })).ok).toBe(true)
    expect(h.calls).toBe(2)
    let release: (result: Response) => void = () => {}
    let concurrentCalls = 0
    const concurrent = harness({ fetch: async () => { concurrentCalls++; return new Promise<Response>((resolve) => { release = resolve }) } })
    const first = concurrent.source()
    const second = concurrent.source({ force: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    release(json())
    expect((await first).ok).toBe(true)
    expect((await second).ok).toBe(true)
    expect(concurrentCalls).toBe(1)
  })
})
