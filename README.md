# dot-codex

A local CLI that mirrors Codex session state to a Quote/0 device using the Dot. Image API.

## What It Does

- wraps a `codex` session in a PTY so interactive prompts still work
- classifies terminal output into states like `running`, `waiting_input`, `completed`, and `failed`
- maps each state to pre-rendered PNG frames
- pushes frames to a dedicated Quote/0 `IMAGE_API` task via `taskKey`
- supports a `hold` mode and an optional `restore` mode after the task completes

## Requirements

- Node.js 20+
- a Quote/0 device with Dot. API access
- a dedicated `IMAGE_API` task on the device
- a valid Dot. API key and the device serial number

## Install

```bash
npm install
npm run generate:assets
```

## Configure

Create `.env` or `~/.dot-codex/config.json`.

### `.env`

```bash
DOT_CODEX_API_KEY=dot_app_xxx
DOT_CODEX_DEVICE_ID=ABCD1234ABCD
DOT_CODEX_TASK_TYPE=loop
DOT_CODEX_TASK_KEY=image_task_1
DOT_CODEX_ASSET_THEME=mono-bot
DOT_CODEX_BORDER=0
DOT_CODEX_DITHER_TYPE=NONE
DOT_CODEX_MIN_REFRESH_INTERVAL_MS=8000
DOT_CODEX_FRAME_INTERVAL_MS=1500
DOT_CODEX_RESTORE_MODE=hold
DOT_CODEX_RESTORE_DELAY_MS=15000
# optional fallback image used for restore mode
DOT_CODEX_DEFAULT_IMAGE_PATH=/absolute/path/to/default.png
```

### `~/.dot-codex/config.json`

```json
{
  "apiKey": "dot_app_xxx",
  "deviceId": "ABCD1234ABCD",
  "taskType": "loop",
  "taskKey": "image_task_1",
  "assetTheme": "mono-bot",
  "restoreMode": "hold"
}
```

## Usage

Check device health and task resolution:

```bash
node src/cli.js doctor
```

List tasks:

```bash
node src/cli.js tasks
```

Read current device state:

```bash
node src/cli.js snapshot
```

Push a hold frame manually:

```bash
node src/cli.js push running
```

Wrap a Codex session:

```bash
node src/cli.js run -- codex
```

## Git Workflow

The repository is initialized with `main` as the default branch. Recommended branch sequence:

- `feature/bootstrap-cli`
- `feature/quote0-client`
- `feature/codex-adapter`
- `feature/state-renderer`
- `feature/recovery-strategy`

## Notes

- This project intentionally uses a dedicated `taskKey` to avoid clobbering unrelated Dot. content.
- `refreshNow: true` is used during active Codex runs, so it will take over the current screen.
- other scheduled Dot. content can still replace the display later; this tool does not try to globally lock the device.
