export const DEFAULT_POLL_INTERVAL_MS = 120_000
export const MIN_POLL_INTERVAL_MS = 10_000

export function resolvePollInterval(options: Record<string, unknown>): number {
  const interval = options.pollIntervalMs
  return typeof interval === "number" && Number.isFinite(interval)
    ? Math.max(MIN_POLL_INTERVAL_MS, Math.floor(interval))
    : DEFAULT_POLL_INTERVAL_MS
}
