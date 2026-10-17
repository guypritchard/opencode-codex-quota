import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { resolveConfig } from "./config"
import { hasActiveSession, nextDisplayMode, normalizeMode, refreshGlyph } from "./mode"
import { formatBars, formatDetails, formatFooter, formatResets, parseQuota, type Quota } from "./quota"

const REQUEST_TIMEOUT_MS = 10_000
const CONFIG_HELP = "Set plugins[].options.endpoint in ~/.config/opencode/cli.json or OPENCODE_CODEX_QUOTA_URL. See README."

export default Plugin.define({
  id: "codex-quota.tui",
  setup(context) {
    const config = resolveConfig(context.options, process.env.OPENCODE_CODEX_QUOTA_URL)
    const [quota, setQuota] = createSignal<Quota>()
    const [state, setState] = createSignal<"loading" | "ready" | "unavailable">("loading")
    const [refreshing, setRefreshing] = createSignal(false)
    const [settings, updateSettings] = context.storage.store("settings", { initial: { mode: "compact" } })
    const displayMode = () => normalizeMode(settings.mode)
    const toggleDisplay = async () => {
      await updateSettings((draft) => { draft.mode = nextDisplayMode(draft.mode) })
    }
    let active: AbortController | undefined
    let requestId = 0
    let disposed = false

    async function refresh(force = false): Promise<Quota | undefined> {
      if (disposed || !config.endpoint) return undefined
      if (active) {
        if (!force) return undefined // A regular tick never overlaps another request.
        active.abort() // Manual refresh supersedes the in-flight poll.
      }
      const controller = new AbortController()
      requestId++
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
      const used = current?.windows.map((window) => window.used) ?? []
      const highest = used.length ? Math.max(...used) : 0
      return config.issue || (config.endpoint && state() === "unavailable")
        ? context.theme.text.feedback.error.muted
        : !config.endpoint
          ? context.theme.text.feedback.warning.base
          : highest >= 90
            ? context.theme.text.feedback.error.base
            : highest >= 75
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
          ? displayMode() === "bars" ? formatBars(current) : displayMode() === "resets" ? formatResets(current) : formatFooter(current)
          : "Codex loading."
    }
    const refreshFromFooter = async () => {
      if (refreshing() || !config.endpoint || disposed) return
      setRefreshing(true)
      const result = refresh(true)
      const currentRequest = requestId
      try {
        if (!await result && !disposed && requestId === currentRequest) {
          context.ui.toast.show({ title: "Codex quota", message: "Refresh failed; quota unavailable", variant: "error" })
        }
      } finally {
        if (!disposed) setRefreshing(false)
      }
    }
    const Status = () => <box flexDirection="row">
      <text fg={statusColor()} onMouseUp={(event) => {
        event.stopPropagation()
        if (event.button !== 0) return
        void toggleDisplay()
      }}>{statusLabel()}</text>
      <text>  </text>
      <text fg={statusColor()} onMouseUp={(event) => {
        event.stopPropagation()
        if (event.button !== 0) return
        void refreshFromFooter()
      }}>{refreshGlyph(refreshing())}</text>
    </box>

    context.ui.slot({ append: "home.footer.status", render: () => <Status /> })
    context.ui.slot({ append: "prompt.footer.status", render: ({ sessionID }) => hasActiveSession(sessionID) ? <Status /> : null })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "codex-quota.refresh",
        title: "Refresh Codex quota (/quota details; footer ↻ refreshes in place)",
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
      }, {
        id: "codex-quota.toggle-display",
        title: "Cycle Codex quota display (click quota text: used, bars, resets)",
        group: "Codex",
        palette: true,
        run: toggleDisplay,
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
