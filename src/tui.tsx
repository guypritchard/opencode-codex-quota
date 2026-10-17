import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { resolveConfig } from "./config"
import { formatDetails, formatFooter, parseQuota, type Quota } from "./quota"

const REQUEST_TIMEOUT_MS = 10_000
const CONFIG_HELP = "Set plugins[].options.endpoint in ~/.config/opencode/cli.json or OPENCODE_CODEX_QUOTA_URL. See README."

export default Plugin.define({
  id: "codex-quota.tui",
  setup(context) {
    const config = resolveConfig(context.options, process.env.OPENCODE_CODEX_QUOTA_URL)
    const [quota, setQuota] = createSignal<Quota>()
    const [state, setState] = createSignal<"loading" | "ready" | "unavailable">("loading")
    let active: AbortController | undefined
    let disposed = false

    async function refresh(force = false): Promise<Quota | undefined> {
      if (disposed || !config.endpoint) return undefined
      if (active) {
        if (!force) return undefined // A regular tick never overlaps another request.
        active.abort() // Manual refresh supersedes the in-flight poll.
      }
      const controller = new AbortController()
      active = controller
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const url = new URL(config.endpoint)
        if (force) url.searchParams.set("force", "1")
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error("Quota service unavailable")
        const result = parseQuota(await response.json())
        if (disposed || active !== controller) return undefined
        setQuota(result)
        setState("ready")
        return result
      } catch {
        if (!disposed && active === controller) setState("unavailable")
        return undefined
      } finally {
        clearTimeout(timeout)
        if (active === controller) active = undefined
      }
    }

    const statusColor = () => {
      const current = quota()
      const remaining = current?.windows.map((window) => window.remaining) ?? []
      const lowest = remaining.length ? Math.min(...remaining) : 100
      return config.issue || (config.endpoint && state() === "unavailable")
        ? context.theme.text.feedback.error.muted
        : !config.endpoint
          ? context.theme.text.feedback.warning.base
          : lowest <= 10
            ? context.theme.text.feedback.error.base
            : lowest <= 25
              ? context.theme.text.feedback.warning.base
              : context.theme.text.feedback.success.base
    }
    const statusLabel = () => {
      if (config.issue) return "Codex configuration invalid"
      if (!config.endpoint) return "Codex: configure endpoint"
      const current = quota()
      return state() === "unavailable"
        ? "Codex unavailable"
        : current
          ? formatFooter(current)
          : "Codex loading."
    }
    const Status = () => <text fg={statusColor()}>{statusLabel()}</text>

    context.ui.slot({ append: "home.footer.status", render: () => <Status /> })
    context.ui.slot({ append: "prompt.footer.status", render: () => <Status /> })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "codex-quota.refresh",
        title: "Refresh Codex quota",
        group: "Codex",
        palette: true,
        slash: { name: "quota" },
        run: async () => {
          if (!config.endpoint) {
            await context.ui.dialog.alert({ title: "Codex quota setup", message: `${config.issue ?? "No endpoint configured."}\n${CONFIG_HELP}` })
            return
          }
          const updated = await refresh(true)
          if (updated) {
            await context.ui.dialog.alert({ title: "Codex quota", message: formatDetails(updated) })
          } else if (!disposed) {
            context.ui.toast.show({ title: "Codex quota", message: "Refresh failed; quota unavailable", variant: "error" })
          }
        },
      }],
    }))

    if (config.endpoint) {
      void refresh()
      const interval = setInterval(() => { void refresh() }, config.pollIntervalMs)
      return () => {
        disposed = true
        clearInterval(interval)
        active?.abort()
      }
    }
    return () => { disposed = true }
  },
})
