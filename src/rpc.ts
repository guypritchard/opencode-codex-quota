import { Rpc } from "@opencode/plugin/rpc"

const window = {
  type: "object",
  properties: {
    label: { enum: ["5h", "Week"] },
    used: { type: "number", minimum: 0, maximum: 100 },
    resetAfterSeconds: { type: "number", minimum: 0 },
    resetAt: { type: "number", minimum: 0 },
  },
  required: ["label", "used"],
  additionalProperties: false,
} as const

export const CodexQuota = Rpc.define({
  id: "codex-quota.v1",
  methods: {
    getUsage: {
      input: { type: "object", properties: { force: { type: "boolean" } }, additionalProperties: false },
      output: {
        oneOf: [
          {
            type: "object", properties: {
              ok: { const: true }, source: { const: "openai" },
              usage: { type: "object", properties: {
                plan: { enum: ["free", "plus", "pro", "team", "business", "enterprise", "edu", "unknown"] },
                windows: { type: "array", items: window, minItems: 1, maxItems: 2 },
              }, required: ["plan", "windows"], additionalProperties: false },
              fetchedAt: { type: "string", format: "date-time" }, cached: { type: "boolean" },
            }, required: ["ok", "source", "usage", "fetchedAt", "cached"], additionalProperties: false,
          },
          {
            type: "object", properties: {
              ok: { const: false },
              code: { enum: ["NO_CONNECTION", "OAUTH_REQUIRED", "AUTH_EXPIRED", "AUTH_REJECTED", "ACCESS_DENIED", "RATE_LIMITED", "UPSTREAM_BLOCKED", "TIMEOUT", "NETWORK_ERROR", "INVALID_RESPONSE"] },
              retryable: { type: "boolean" },
            }, required: ["ok", "code", "retryable"], additionalProperties: false,
          },
        ],
      },
    },
  },
  events: {},
} as const)
