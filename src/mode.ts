export type DisplayMode = "compact" | "bars" | "resets"

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
