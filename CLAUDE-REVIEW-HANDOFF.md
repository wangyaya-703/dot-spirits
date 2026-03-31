# Claude Review Handoff

## Scope

This document summarizes the implementation and real-device tuning work completed after the previous Claude review. It is intended to give Claude a compact but complete review target for the current `dot-codex` state.

Repository:

- `https://github.com/wangyaya-703/dot-codex`

Current branch / tip:

- `main`
- commit: `163c8fe`

## Product State

`dot-codex` is now a local CLI that:

- wraps `codex`
- accepts `claude-code` lifecycle events through hooks
- mirrors active agent state to Quote/0 / Dot through a dedicated `Image API` slot
- keeps Dot in takeover while active sessions exist
- summarizes multi-agent activity without replacing the Siamese cat hero art

The current visual model is:

1. Single active session
- background: current Siamese-cat state art for that session
- top-right box 1: agent type (`CODEX` / `CLAUDE`)
- top-right box 2: `NAME:STATE`

2. Multiple active sessions
- background: Siamese-cat state art from the chosen primary active session
- left column: `CODEX`
- right column: `CLAUDE`
- up to 4 session states per column
- overflow folded into `+N MORE`

3. No active sessions
- latest terminal result is held briefly
- takeover is released after the hold window

## What Changed Since The Previous Claude Review

### 1. Public-ready cleanup

Added:

- `LICENSE`
- `CONTRIBUTING.md`
- `.github/workflows/test.yml`

Updated:

- `package.json`
- `README.md`
- `.env.example`
- `src/commands/install-wrapper.js`
- `src/lib/config.js`

Goals:

- remove local-machine hardcoding from docs
- make the repo publishable and easier to audit
- support custom asset roots and more explicit wrapper installation

### 2. Claude Code event-driven integration

Added:

- `src/commands/report.js`
- `src/commands/install-hooks.js`

Updated:

- `src/lib/session-registry.js`
- `src/lib/constants.js`
- `src/lib/config.js`
- `src/lib/logger.js`
- `src/cli.js`

New capabilities:

- `claude-code` hooks can report lifecycle events through stdin JSON
- event-driven sessions now carry:
  - `agentType`
  - `heartbeatMode`
  - `lastEventAt`
  - `hookSessionTtlMs`
  - monotonic `sequenceVersion`

### 3. Session runtime and diagnostics

Added:

- `src/lib/runtime-status.js`

Updated:

- `src/commands/sessions.js`
- `src/commands/snapshot.js`
- `src/commands/doctor.js`

New capabilities:

- `sessions` now exposes:
  - current rotator mode
  - `takeoverLocked`
  - `summaryBoardActive`
  - agent type per session
- `snapshot` now includes both device status and local runtime summary
- `doctor` now reports runtime takeover state alongside device/task checks

### 4. Takeover logic and refresh behavior

Updated:

- `src/commands/daemon.js`

Key changes:

- Dot is only supposed to stay in takeover while active sessions exist
- rotator poll no longer implies screen refresh
- refreshes are gated on:
  - state change
  - session switch
  - summary board update
  - verified reclaim after Dot drifted to other content
- multi-session activity is summarized instead of rotating single-session cards
- old daemon instances now exit if another process owns the runtime pid file

### 5. Visual system refinement

Updated:

- `src/lib/frame-overlay.js`

Major changes:

- single-session and multi-session labels now use the same compact state language
- multi-session display no longer uses a white full-screen dashboard
- hero art remains visible in multi-session mode
- status columns moved to the edges to avoid covering the cat
- urgent rows use a left-side marker instead of a double-border effect
- single-session overlay moved from bottom bar to top-right boxed labels

Current compact state labels:

- `STRT`
- `RUN`
- `WAIT`
- `DONE`
- `FAIL`
- `STOP`

### 6. Test expansion

Updated / added tests include:

- `test/daemon.test.js`
- `test/state-detector.test.js`
- `test/session-registry.test.js`
- `test/report.test.js`
- `test/install-hooks.test.js`
- `test/frame-overlay.test.js`

Current local status:

- `npm run lint`: passing
- `npm test`: `50/50` passing

## Current Rendering Rules

### Single-session mode

Input:

- one active session only

Rendering:

- background art = current state's Siamese cat image
- top-right header box = `CODEX` or `CLAUDE`
- top-right detail box = `NAME:STATE`

Example:

- `CODEX`
- `BYTE:RUN`

### Multi-session mode

Input:

- two or more active sessions

Primary background session selection:

1. any `waiting_input` session
2. focused active session
3. first active session

Rendering:

- left column = `CODEX N`
- right column = `CLAUDE N`
- each row = `NAME:STATE`
- max 4 visible rows per column
- overflow row = `+N MORE`

### Terminal / release behavior

- while active sessions exist, terminal sessions do not displace active takeover
- when active sessions end, the newest terminal result can be briefly promoted
- after hold timeout, takeover is released

## Naming Rules

Session display name priority is currently:

1. `--session-name`
2. `DOT_CODEX_SESSION_NAME`
3. Codex thread name
4. last path segment of `cwd`
5. short generated `sessionId`

Implications:

- if the Codex conversation is renamed and no explicit session-name is pinned, the thread name should win over the directory name
- directory-based fallback only uses the last folder in the path
- display names are truncated in overlays

Current truncation:

- summary view rows: 4 characters
- session table display name: 12 characters

## Real-device Validation Performed

The following device was used:

- `deviceId`: `9C9E6E3B407C`

Observed during the final rounds:

### Single-session takeover

- active `codex` session displayed correctly
- runtime showed:
  - `takeoverLocked = true`
  - `summaryBoardActive = false`

### Multi-session takeover

A temporary `claude-code` session was injected through `report`.

Observed runtime/device state:

- `currentSessionId = "__SUMMARY__"`
- `activeSessionIds` contained both active sessions
- `takeoverLocked = true`
- `summaryBoardActive = true`

This confirms:

- multi-agent summary mode is active in runtime
- device status reflects the summary takeover state

### Important caveat

CDN image fetches do not always line up perfectly with the latest device snapshot timing. Device status and CDN render availability can briefly diverge. The runtime and device status API are more reliable than immediate CDN fetches for determining whether a new summary frame is active.

## Files Claude Should Review Closely

### Highest priority

- `src/commands/daemon.js`
- `src/lib/session-registry.js`
- `src/lib/frame-overlay.js`

### Secondary

- `src/commands/report.js`
- `src/lib/runtime-status.js`
- `src/commands/sessions.js`
- `src/commands/snapshot.js`
- `src/commands/doctor.js`
- `src/commands/run.js`

### Supporting config / docs

- `src/lib/config.js`
- `src/lib/constants.js`
- `README.md`

## Known Risks / Areas Worth Challenging

1. Quote/0 API rate limits
- `429` responses were observed in real-device testing
- retry behavior exists, but Claude should assess whether the current backoff strategy is sufficient

2. Device/CDN synchronization
- device status may advance before the corresponding CDN image URL is stable
- this is relevant for any test strategy that tries to confirm final pixels by immediately fetching the render URL

3. Runtime ownership model
- stale daemon ownership was fixed by yielding when pid ownership differs
- Claude should still review for any remaining race windows around daemon restarts

4. Summary layout density
- the current visual balance is much better than the earlier bottom panel and white dashboard variants
- Claude can still critique whether:
  - top-right labels in single-session mode are too heavy
  - 4-character name truncation is the right choice
  - column width / row count assumptions are robust enough across all hero frames

5. Naming consistency
- the intended priority is `explicit session name > thread name > cwd basename > session id`
- Claude should verify that this is true across all code paths and not just the common `codex run` path

## Suggested Review Questions For Claude

1. Is the takeover / release model coherent under mixed `codex` + `claude-code` activity?
2. Are there remaining race conditions in daemon ownership, session pruning, or summary promotion?
3. Is the event-driven `claude-code` TTL / freshness model correct?
4. Is the summary layout implementation in `frame-overlay.js` clean enough, or should it be split into smaller render primitives?
5. Are the naming and truncation rules applied consistently across:
   - single-session overlay
   - multi-session summary
   - `sessions`
   - runtime/session persistence
6. Is the Quote/0 retry/reclaim behavior likely to behave well in long-running real-world usage?

## Current Recommendation

Claude should review the current tip as a productized mixed-agent state display system, not as a single-purpose Codex wrapper anymore.

The main review goal should be:

- correctness of session orchestration
- robustness of takeover / reclaim
- consistency of single-session and multi-session rendering semantics
- operational safety under API retries, stale processes, and event-driven hooks
