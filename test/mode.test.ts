import { describe, expect, test } from "bun:test"
import { hasActiveSession } from "../src/mode"

describe("prompt footer visibility", () => {
  test("hides without a session and shows for an active session", () => {
    expect(hasActiveSession(undefined)).toBe(false)
    expect(hasActiveSession("")).toBe(false)
    expect(hasActiveSession("session-123")).toBe(true)
  })
})
