import { describe, expect, test } from "bun:test"
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS, resolveConfig } from "../src/config"

describe("quota configuration", () => {
  test("does not assume a private endpoint", () => {
    expect(resolveConfig({})).toEqual({ endpoint: undefined, pollIntervalMs: DEFAULT_POLL_INTERVAL_MS })
  })

  test("CLI endpoint wins over environment endpoint", () => {
    expect(resolveConfig({ endpoint: "https://example.com/quota", pollIntervalMs: 30_000 }, "https://example.org/other"))
      .toEqual({ endpoint: "https://example.com/quota", pollIntervalMs: 30_000 })
    expect(resolveConfig({}, "https://example.org/quota").endpoint).toBe("https://example.org/quota")
  })

  test("rejects invalid endpoints and clamps poll interval", () => {
    expect(resolveConfig({ endpoint: "file:///private", pollIntervalMs: 1 }).issue).toContain("Invalid endpoint")
    expect(resolveConfig({ endpoint: "https://user:pass@localhost" }).issue).toContain("Invalid endpoint")
    expect(resolveConfig({ endpoint: "https://example.com", pollIntervalMs: 1 }).pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS)
    expect(resolveConfig({ pollIntervalMs: "fast" }).pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS)
  })
})
