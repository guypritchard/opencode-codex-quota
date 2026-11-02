import { describe, expect, test } from "bun:test"
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS, resolvePollInterval } from "../src/config"

describe("quota polling", () => {
  test("defaults to two minutes and ignores unrelated options", () => {
    expect(resolvePollInterval({})).toBe(DEFAULT_POLL_INTERVAL_MS)
    expect(resolvePollInterval({ unrelated: "value" })).toBe(DEFAULT_POLL_INTERVAL_MS)
  })

  test("clamps small intervals and rejects invalid values", () => {
    expect(resolvePollInterval({ pollIntervalMs: 1 })).toBe(MIN_POLL_INTERVAL_MS)
    expect(resolvePollInterval({ pollIntervalMs: 30_000.9 })).toBe(30_000)
    for (const value of ["fast", null, NaN, Infinity]) {
      expect(resolvePollInterval({ pollIntervalMs: value })).toBe(DEFAULT_POLL_INTERVAL_MS)
    }
  })
})
