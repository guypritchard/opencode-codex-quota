import { describe, expect, test } from "bun:test"
import { nextDisplayMode, normalizeMode, refreshGlyph } from "../src/mode"
import { formatBars, formatDetails, formatDuration, formatFooter, formatResets, progressBar, usedPercent, type Quota } from "../src/quota"

describe("Codex quota formatting", () => {
  const sample: Quota = { plan: "plus", windows: [
    { label: "5h", used: 52, resetAfterSeconds: 7283, resetAt: 1792257458 },
    { label: "Week", used: 37, resetAfterSeconds: 403282, resetAt: 1792653457 },
  ] }

  test("shows normalized server percentages, plan and reset details", () => {
    expect(formatFooter(sample)).toContain("5h 52%")
    expect(formatFooter(sample)).toContain("Week 37%")
    expect(formatBars(sample)).toContain("W [")
    expect(formatDetails(sample)).toContain("Plan: plus")
    expect(formatDetails(sample)).toContain("5h: 52% used (resets in 2h 1m")
    expect(formatDetails(sample)).toContain("Week: 37% used (resets in 4d 16h")
    expect(formatResets(sample)).toContain("W in 4d 16h")
  })

  test("clamps and rounds used percentages and progress cells", () => {
    expect([usedPercent(-20), usedPercent(0.5), usedPercent(52.6), usedPercent(120)]).toEqual([0, 1, 53, 100])
    expect(progressBar(-1)).toHaveLength(10)
    expect(progressBar(95)).toHaveLength(10)
    expect(progressBar(5)).not.toBe(progressBar(4))
  })

  test("formats reset durations and missing timing", () => {
    expect(formatDuration(0)).toBe("now")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(121)).toBe("2m")
    expect(formatDuration(7283)).toBe("2h 1m")
    expect(formatDuration(403282)).toBe("4d 16h")
    const quota: Quota = { plan: "plus", windows: [
      { label: "5h", used: 52, resetAt: 1792257458 },
      { label: "Week", used: 37 },
    ] }
    expect(formatResets(quota)).toContain(new Date(1792257458000).toLocaleString())
    expect(formatResets(quota)).toContain("W unknown")
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
    expect(refreshGlyph(false)).not.toBe(refreshGlyph(true))
    expect(nextDisplayMode("compact")).toBe("bars")
  })
})
