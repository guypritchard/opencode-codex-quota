export interface QuotaConfig {
  endpoint?: string
  pollIntervalMs: number
  issue?: string
}

export const DEFAULT_POLL_INTERVAL_MS = 120_000
export const MIN_POLL_INTERVAL_MS = 10_000

/** CLI options take precedence over the optional environment variable. */
export function resolveConfig(options: Record<string, unknown>, environmentEndpoint?: string): QuotaConfig {
  const candidate = options.endpoint ?? environmentEndpoint
  let endpoint: string | undefined
  if (candidate !== undefined && candidate !== null && candidate !== "") {
    if (typeof candidate !== "string") {
      return { pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, issue: "Invalid endpoint: expected an HTTP(S) URL" }
    }
    try {
      const url = new URL(candidate.trim())
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) {
        throw new Error("Invalid endpoint")
      }
      endpoint = url.toString()
    } catch {
      return { pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, issue: "Invalid endpoint: expected an HTTP(S) URL" }
    }
  }

  const interval = options.pollIntervalMs
  const pollIntervalMs = typeof interval === "number" && Number.isFinite(interval)
    ? Math.max(MIN_POLL_INTERVAL_MS, Math.floor(interval))
    : DEFAULT_POLL_INTERVAL_MS
  return { endpoint, pollIntervalMs }
}
