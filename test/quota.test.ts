import { describe, expect, test } from "bun:test"
import { formatDetails, formatDuration, formatFooter, parseQuota, remainingPercent } from "../src/quota"

describe("Codex quota", () => {
  const sample = {
    ok: true,
    usage: {
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 52, reset_after_seconds: 7283, reset_at: 1792257458 },
        secondary_window: { used_percent: 37, reset_after_seconds: 403282, reset_at: 1792653457 },
      },
    },
    providerUsage: { windows: [{ label: "5h", usedPercent: 52 }, { label: "Week", usedPercent: 37 }] },
  }

  test("uses remaining percentages and includes plan and reset details", () => {
    const quota = parseQuota(sample)
    expect(formatFooter(quota)).toBe("Codex 5h 48% · Week 63%")
    expect(formatDetails(quota)).toContain("Plan: plus")
    expect(formatDetails(quota)).toContain("5h: 48% remaining (resets in 2h 1m")
  })

  test("clamps out-of-range percentages", () => {
    expect(remainingPercent(-20)).toBe(100)
    expect(remainingPercent(120)).toBe(0)
    expect(parseQuota({ ok: true, usage: { rate_limit: { primary_window: { used_percent: 150 } } } }).windows[0]?.remaining).toBe(0)
  })

  test("falls back to provider windows and tolerates one missing window", () => {
    expect(formatFooter(parseQuota({ ok: true, providerUsage: { windows: [{ label: "5h", usedPercent: 35 }] } })))
      .toBe("Codex 5h 65%")
    expect(() => parseQuota({ ok: true, usage: { rate_limit: {} } })).toThrow("Quota windows unavailable")
    expect(() => parseQuota({ ok: false })).toThrow("Quota service unavailable")
  })

  test("formats reset durations", () => {
    expect(formatDuration(0)).toBe("now")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(121)).toBe("2m")
    expect(formatDuration(7283)).toBe("2h 1m")
    expect(formatDuration(403282)).toBe("4d 16h")
  })
})
