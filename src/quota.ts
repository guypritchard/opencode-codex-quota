export interface QuotaWindow {
  label: string
  used: number
  resetAfterSeconds?: number
  resetAt?: number
}

export interface Quota {
  plan: string
  windows: QuotaWindow[]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function usedPercent(used: number): number {
  return Math.round(Math.max(0, Math.min(100, used)))
}

function normalizeResetAt(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value > 100_000_000_000 ? value / 1000 : value
}

function windowFrom(value: unknown, label: string): QuotaWindow | undefined {
  const item = record(value)
  const used = number(item?.used_percent) ?? number(item?.usedPercent)
  if (used === undefined) return undefined
  return {
    label,
    used: usedPercent(used),
    resetAfterSeconds: number(item?.reset_after_seconds),
    resetAt: normalizeResetAt(number(item?.reset_at) ?? number(item?.resetAt)),
  }
}

export function parseQuota(payload: unknown): Quota {
  const root = record(payload)
  if (root?.ok !== true) throw new Error("Quota service unavailable")
  const usage = record(root.usage)
  const limits = record(usage?.rate_limit)
  const provider = record(root.providerUsage)
  const providerWindows = Array.isArray(provider?.windows) ? provider.windows : []
  const fallback = (label: string) =>
    providerWindows.find((entry) => {
      const name = record(entry)?.label
      return typeof name === "string" && name.toLowerCase() === label.toLowerCase()
    })

  const windows = [
    windowFrom(limits?.primary_window, "5h") ?? windowFrom(fallback("5h"), "5h"),
    windowFrom(limits?.secondary_window, "Week") ?? windowFrom(fallback("Week"), "Week"),
  ].filter((entry): entry is QuotaWindow => entry !== undefined)
  if (windows.length === 0) throw new Error("Quota windows unavailable")

  return {
    plan: typeof usage?.plan_type === "string" && usage.plan_type ? usage.plan_type : "Unknown",
    windows,
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "now"
  const total = Math.ceil(seconds)
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  if (days) return `${days}d${hours ? ` ${hours}h` : ""}`
  if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ""}`
  if (minutes) return `${minutes}m`
  return `${total}s`
}

export function formatFooter(quota: Quota): string {
  return `Codex used: ${quota.windows.map((window) => `${window.label} ${window.used}%`).join(" · ")}`
}

/** Ten cells filled in proportion to usage. */
export function progressBar(used: number): string {
  const filled = Math.round(usedPercent(used) / 10)
  return "█".repeat(filled) + "░".repeat(10 - filled)
}

export function formatBars(quota: Quota): string {
  return `Codex used: ${quota.windows.map((window) => `${window.label === "Week" ? "W" : window.label} [${progressBar(window.used)}] ${window.used}%`).join(" · ")}`
}

export function formatDetails(quota: Quota): string {
  const windows = quota.windows.map((window) => {
    const duration = window.resetAfterSeconds === undefined
      ? ""
      : `in ${formatDuration(window.resetAfterSeconds)}`
    const reset = window.resetAt === undefined
      ? ""
      : new Date(window.resetAt * 1000).toLocaleString()
    const note = [duration, reset].filter(Boolean).join(" · ")
    return `${window.label}: ${window.used}% used${note ? ` (resets ${note})` : ""}`
  })
  return [`Plan: ${quota.plan}`, ...windows].join("\n")
}
