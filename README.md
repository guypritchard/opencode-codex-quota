# OpenCode Codex Quota

An unofficial OpenCode V2 TUI plugin showing **Codex quota used** for the 5-hour and weekly windows in the home and prompt footers. Click either footer indicator to switch between compact percentages and graphical progress bars. The choice persists across OpenCode restarts and is synchronized between TUI instances. By default, the display is compact. The **Toggle Codex quota display** palette command (`codex-quota.toggle-display`) provides keyboard access. Press `/quota` to refresh and inspect the plan and reset times.

```text
Codex used: 5h 52% · Week 37%
(click indicator)
Codex used: 5h [█████░░░░░] 52% · W [████░░░░░░] 37%

/quota
Plan: plus
5h: 52% used (resets in 2h 1m)
Week: 37% used (resets in 4d 16h)
```

## Requirements

- OpenCode V2 with CLI plugin support.
- An HTTP(S) service returning normalized quota JSON (see below). **You supply and protect this service.** This plugin does not implement authentication against upstream Codex/ChatGPT.
- [Bun](https://bun.sh/) to install dependencies and run development checks.

## Install

Clone the repository and install its dependencies:

```sh
git clone https://github.com/guypritchard/opencode-codex-quota.git
cd opencode-codex-quota
bun install
```

Add the cloned directory as a CLI plugin in the **global** `~/.config/opencode/cli.json` (on Windows, `%USERPROFILE%\.config\opencode\cli.json`). Preserve any other existing settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-codex-quota",
      "options": {
        "endpoint": "https://quota.example.com/api/quota",
        "pollIntervalMs": 120000
      }
    }
  ]
}
```

On Windows the package path can be written as `"C:/path/to/opencode-codex-quota"`. A string-only plugin entry also works if you prefer the environment variable:

```json
{ "plugins": ["/absolute/path/to/opencode-codex-quota"] }
```

Set `OPENCODE_CODEX_QUOTA_URL=https://quota.example.com/api/quota` in the environment **before starting OpenCode**. `options.endpoint` overrides this variable. No endpoint is baked into the repository. If one is missing or invalid, the footer shows a configuration status and `/quota` explains how to set it; no polling occurs. Endpoints must be HTTP(S) URLs without embedded credentials. `pollIntervalMs` defaults to 120000 (2 minutes), and values below 10000 are clamped to 10000 ms.

An initial request runs when the TUI starts; later requests poll at the configured interval without overlapping. The latest successful quota is kept in memory for the current TUI process; `/quota` requests a fresh value with `force=1` in the endpoint query string and displays it. If the service fails, the footer displays `Codex unavailable` until another poll succeeds. Requests time out after 10 seconds. The server entrypoint does not make quota requests, so the CLI-only view also works with remote OpenCode servers.

## Endpoint response

Return JSON with `ok: true` and `usage.rate_limit.primary_window` (5h) and/or `secondary_window` (Week). The plugin displays used percentages from `used_percent`; it accepts `providerUsage.windows` entries with `usedPercent` as a fallback. Reset fields are optional. For example (fictional values):

```json
{
  "ok": true,
  "usage": {
    "plan_type": "plus",
    "rate_limit": {
      "primary_window": { "used_percent": 52, "reset_after_seconds": 7283, "reset_at": 1792257458 },
      "secondary_window": { "used_percent": 37, "reset_after_seconds": 403282, "reset_at": 1792653457 }
    }
  }
}
```

The plugin stores only the display-mode preference (`compact` or `bars`) in OpenCode durable plugin storage; it stores no OAuth tokens or API credentials. Protect the quota endpoint (network access and transport), especially if it contains account-specific usage data. Do not put secrets in the URL. This project is **unofficial** and is not affiliated with OpenAI or OpenCode. The upstream Codex/ChatGPT usage endpoint and response may change; adapt your own normalization service if necessary.

## Develop

```sh
bun install
bun test
bun run typecheck
bun run build
```

The package exports TypeScript source for OpenCode V2 (`.` and `./tui`). `bun run build` additionally produces an ignored `dist/` smoke-check artifact; no npm publishing is performed.
