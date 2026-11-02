# OpenCode Codex Quota

An unofficial OpenCode V2 TUI plugin showing **Codex quota used** for the 5-hour and weekly windows. It appears in the home footer at startup and in the prompt footer during active sessions. Click the quota text to cycle compact percentages, progress bars, and reset timing. The mode persists across restarts and TUI instances; compact is the default. The **Cycle Codex quota display** palette command also cycles modes. Click the separate refresh icon to refresh in place, or use `/quota` to force a refresh and show plan and reset details.

![OpenCode footer showing Codex usage progress bars and refresh control](docs/images/quota-footer.png)

## Requirements

- OpenCode V2 with CLI plugin support.
- An active **OpenAI browser OAuth** connection on the connected OpenCode server. API keys cannot read subscription quota.
- [Bun](https://bun.sh/) for installation and development checks.

## Install

```sh
git clone https://github.com/guypritchard/opencode-codex-quota.git
cd opencode-codex-quota
bun install
```

Add the cloned directory as a server plugin in global `~/.config/opencode/opencode.json(c)` (Windows: `%USERPROFILE%\.config\opencode\opencode.jsonc`). Preserve other entries:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-codex-quota"]
}
```

On Windows use `"C:/path/to/opencode-codex-quota"`. OpenCode loads both server and TUI parts. The TUI gets quota **only** through the server's `codex-quota.v1` RPC. On a remote OpenCode connection, the **remote server's** active OpenAI OAuth is used, not credentials on the terminal. No external quota service is required.

The server resolves the active connection on every request and calls only the fixed direct OpenAI upstream `https://chatgpt.com/backend-api/codex/usage`. It returns only allowlisted plan, 5h/weekly used percentages and reset timing. Access tokens, account identifiers, upstream bodies, and error details never cross the RPC. Refresh tokens are never used; OpenCode owns OAuth refresh. Responses are cached on the server for 120 seconds, and concurrent refreshes share a request. Upstream requests are bounded and time out after approximately 15 seconds; an HTML challenge is reported as blocked, never bypassed.

### Optional polling interval

Set `pollIntervalMs` in the plugin options to adjust polling. It defaults to 120000 (two minutes); values below 10000 are clamped to 10000 ms, and invalid values use the default. An initial request runs when the TUI starts. Polls do not overlap, and both the refresh icon and `/quota` request a forced RPC refresh. A failed manual refresh shows a safe error toast; while unavailable, the footer reads `Codex unavailable` until another poll succeeds.

Only the display-mode preference (`compact`, `bars`, or `resets`) is persisted in OpenCode plugin storage; no OAuth credentials are stored by this plugin. Reset mode shows countdowns when available, local date/time for a reset timestamp otherwise, and `unknown` when timing is missing. `NO_CONNECTION` means OpenAI OAuth needs to be connected on the server; `OAUTH_REQUIRED` means an API key or incomplete OAuth connection is selected; `UPSTREAM_BLOCKED` indicates the upstream rejected the request. This project is **unofficial** and not affiliated with OpenAI or OpenCode. The upstream usage contract can change.

## Develop

```sh
bun install
bun test
bun run typecheck
bun run build
```

The package exports TypeScript source for OpenCode V2 (`.`, `./tui`, and `./rpc`). `bun run build` also creates an ignored `dist/` smoke-check artifact; no npm publishing is performed.
