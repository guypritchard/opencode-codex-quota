import { Plugin } from "@opencode/plugin"
import { CodexQuota } from "./rpc"
import { createUsageSource } from "./source"

export default Plugin.define({
  id: "codex-quota.server",
  async setup(ctx) {
    const getUsage = createUsageSource({ connection: ctx.integration.connection })
    const registration = await ctx.rpc.register(CodexQuota, { getUsage: (input) => getUsage(input as { force?: boolean }) })
    return () => registration.dispose()
  },
})
