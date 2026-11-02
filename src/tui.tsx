import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { resolvePollInterval } from "./config"
import { hasActiveSession, nextDisplayMode, normalizeMode, refreshGlyph } from "./mode"
import { formatBars, formatDetails, formatFooter, formatResets, type Quota } from "./quota"
import { CodexQuota } from "./rpc"
import type { UsageResult } from "./source"


export default Plugin.define({
  id: "codex-quota.tui",
  setup(context) {
    const pollIntervalMs = resolvePollInterval(context.options)
    const [quota, setQuota] = createSignal<Quota>()
    const [state, setState] = createSignal<"loading" | "ready" | "unavailable">("loading")
    const [refreshing, setRefreshing] = createSignal(false)
    const [settings, updateSettings] = context.storage.store("settings", { initial: { mode: "compact" } })
    const displayMode = () => normalizeMode(settings.mode)
    const toggleDisplay = async () => {
      await updateSettings((draft) => { draft.mode = nextDisplayMode(draft.mode) })
    }
    let active: object | undefined
    let requestId = 0
    let disposed = false
    let lastError = "Refresh failed; quota unavailable"

    async function refresh(force = false): Promise<Quota | undefined> {
      if (disposed) return undefined
      if (active) {
        if (!force) return undefined // A regular tick never overlaps another request.
        // Manual refresh supersedes the in-flight poll's UI update.
      }
      const current = {}
      requestId++
      active = current
      lastError = "Refresh failed; quota unavailable"
      try {
        const response = await context.client.rpc(CodexQuota).getUsage({ force }) as UsageResult
        if (!response.ok) {
          const messages: Record<string, string> = {
            NO_CONNECTION: "Connect OpenAI in OpenCode to see quota", OAUTH_REQUIRED: "OpenAI OAuth is required for subscription quota",
            AUTH_EXPIRED: "OpenAI sign-in expired", AUTH_REJECTED: "OpenAI rejected sign-in",
            ACCESS_DENIED: "OpenAI denied quota access", RATE_LIMITED: "Quota rate limited; retry later",
            UPSTREAM_BLOCKED: "OpenAI blocked the quota request", TIMEOUT: "Quota request timed out",
            NETWORK_ERROR: "Quota network unavailable", INVALID_RESPONSE: "Quota response unavailable",
          }
          if (active === current) lastError = messages[response.code] ?? "Quota unavailable"
          throw new Error("Quota unavailable")
        }
        const result = response.usage
        if (disposed || active !== current) return undefined
        setQuota(result)
        setState("ready")
        return result
      } catch {
        if (!disposed && active === current) setState("unavailable")
        return undefined
      } finally {
        if (active === current) active = undefined
      }
    }

    const statusColor = () => {
      const current = quota()
      const used = current?.windows.map((window) => window.used) ?? []
      const highest = used.length ? Math.max(...used) : 0
      return state() === "unavailable"
        ? context.theme.text.feedback.error.muted
        : highest >= 90
            ? context.theme.text.feedback.error.base
            : highest >= 75
              ? context.theme.text.feedback.warning.base
              : context.theme.text.feedback.success.base
    }
    const statusLabel = () => {
      const current = quota()
      return state() === "unavailable"
        ? "Codex unavailable"
        : current
          ? displayMode() === "bars" ? formatBars(current) : displayMode() === "resets" ? formatResets(current) : formatFooter(current)
          : "Codex loading."
    }
    const refreshFromFooter = async () => {
      if (refreshing() || disposed) return
      setRefreshing(true)
      const result = refresh(true)
      const currentRequest = requestId
      try {
        if (!await result && !disposed && requestId === currentRequest) {
          context.ui.toast.show({ title: "Codex quota", message: lastError, variant: "error" })
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
          const updated = await refresh(true)
          if (updated) {
            await context.ui.dialog.alert({ title: "Codex quota", message: formatDetails(updated) })
          } else if (!disposed) {
            context.ui.toast.show({ title: "Codex quota", message: lastError, variant: "error" })
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

    void refresh()
    const interval = setInterval(() => { void refresh() }, pollIntervalMs)
    return () => {
      disposed = true
      clearInterval(interval)
    }
  },
})
