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

export function usedPercent(used: number): number {
  return Math.round(Math.max(0, Math.min(100, used)))
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

export function formatResets(quota: Quota): string {
  return `Codex resets: ${quota.windows.map((window) => {
    const label = window.label === "Week" ? "W" : window.label
    if (window.resetAfterSeconds !== undefined) return `${label} in ${formatDuration(window.resetAfterSeconds)}`
    if (window.resetAt !== undefined) {
      const date = new Date(window.resetAt * 1000)
      if (Number.isFinite(date.getTime())) return `${label} at ${date.toLocaleString()}`
    }
    return `${label} unknown`
  }).join(" · ")}`
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
