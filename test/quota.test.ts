import { describe, expect, test } from "bun:test"
import { nextDisplayMode, normalizeMode, refreshGlyph } from "../src/mode"
import { formatBars, formatDetails, formatDuration, formatFooter, formatResets, parseQuota, progressBar, usedPercent } from "../src/quota"

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

  test("shows used percentages, plan and reset details", () => {
    const quota = parseQuota(sample)
    expect(quota.windows.map((window) => window.used)).toEqual([52, 37])
    expect(formatFooter(quota)).toBe("Codex used: 5h 52% · Week 37%")
    expect(formatBars(quota)).toBe("Codex used: 5h [█████░░░░░] 52% · W [████░░░░░░] 37%")
    expect(formatDetails(quota)).toContain("Plan: plus")
    expect(formatDetails(quota)).toContain("5h: 52% used (resets in 2h 1m")
    expect(formatDetails(quota)).toContain("Week: 37% used (resets in 4d 16h")
  })

  test("clamps and rounds used percentages and progress cells", () => {
    expect([usedPercent(-20), usedPercent(0.5), usedPercent(52.6), usedPercent(120)]).toEqual([0, 1, 53, 100])
    expect(parseQuota({ ok: true, usage: { rate_limit: { primary_window: { used_percent: 150 } } } }).windows[0]?.used).toBe(100)
    expect([progressBar(-1), progressBar(4), progressBar(5), progressBar(94), progressBar(95), progressBar(120)])
      .toEqual(["░░░░░░░░░░", "░░░░░░░░░░", "█░░░░░░░░░", "█████████░", "██████████", "██████████"])
  })

  test("falls back to provider windows and normalizes millisecond reset timestamps", () => {
    const quota = parseQuota({ ok: true, providerUsage: { windows: [{ label: "5h", usedPercent: 35, resetAt: 1792257458000 }] } })
    expect(formatFooter(quota)).toBe("Codex used: 5h 35%")
    expect(quota.windows[0]?.resetAt).toBe(1792257458)
    expect(formatDetails(quota)).toContain("resets ")
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

  test("shows reset countdowns for both windows", () => {
    expect(formatResets(parseQuota(sample))).toBe("Codex resets: 5h in 2h 1m · W in 4d 16h")
  })

  test("shows local reset date when only resetAt exists and unknown when neither exists", () => {
    const quota = parseQuota({ ok: true, usage: { rate_limit: {
      primary_window: { used_percent: 52, reset_at: 1792257458000 },
      secondary_window: { used_percent: 37 },
    } } })
    expect(quota.windows[0]?.resetAt).toBe(1792257458)
    expect(formatResets(quota)).toBe(`Codex resets: 5h at ${new Date(1792257458000).toLocaleString()} · W unknown`)
  })

  test("cycles all display modes and treats invalid persisted values as compact", () => {
    expect(normalizeMode("compact")).toBe("compact")
    expect(normalizeMode("bars")).toBe("bars")
    expect(normalizeMode("resets")).toBe("resets")
    expect(normalizeMode("legacy")).toBe("compact")
    expect(nextDisplayMode("compact")).toBe("bars")
    expect(nextDisplayMode("bars")).toBe("resets")
    expect(nextDisplayMode("resets")).toBe("compact")
    expect(nextDisplayMode("legacy")).toBe("bars")
  })

  test("shows an in-progress refresh glyph without changing display mode", () => {
    expect(refreshGlyph(false)).toBe("↻")
    expect(refreshGlyph(true)).toBe("⟳")
    expect(nextDisplayMode("compact")).toBe("bars")
  })
})
