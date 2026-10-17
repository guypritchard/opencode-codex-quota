export type DisplayMode = "compact" | "bars" | "resets"

export function hasActiveSession(sessionID: string | undefined): boolean {
  return Boolean(sessionID)
}

export function refreshGlyph(refreshing: boolean): string {
  return refreshing ? "⟳" : "↻"
}

export function normalizeMode(mode: unknown): DisplayMode {
  return mode === "bars" || mode === "resets" ? mode : "compact"
}

export function nextDisplayMode(mode: unknown): DisplayMode {
  switch (normalizeMode(mode)) {
    case "compact": return "bars"
    case "bars": return "resets"
    case "resets": return "compact"
  }
}
