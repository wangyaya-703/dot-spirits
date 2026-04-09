# dot-spirits

Put your AI coding agents on a desk — literally.

`dot-spirits` syncs live session states from **Codex** and **Claude Code** to a [Quote/0 Dot](https://www.quotezero.com) E-Ink device, so you can glance at a tiny screen and know what your agents are doing without switching terminals.

Both agents share the same Dot display. When multiple sessions run side-by-side, the device shows them all.

## What it does

- Detects `codex` sessions via a shell wrapper (pty bridge)
- Detects `claude-code` sessions via Claude Code hooks (event-driven)
- Renders pixel-art status animations to a Dot E-Ink device in real time
- When agents are active, temporarily takes over the device; when idle, releases it back to the device's normal content loop

### Multi-agent, multi-session

Run Codex in one pane and Claude Code in another — `dot-spirits` tracks all of them:

- **Priority**: `waiting_input` always wins (it needs your attention)
- **Single session**: full-screen status art with state label and session name
- **Multiple sessions**: main art stays, a compact status bar appears at the bottom showing all active agents
- **Idle**: latest result holds briefly, then the device returns to its own content loop

### Status states

| State | Meaning |
|-------|---------|
| `starting` | Agent is booting up |
| `running` | Agent is working |
| `waiting_input` | Agent needs your input |
| `completed` | Task finished successfully |
| `failed` | Task errored out |

## Quick start

```bash
git clone https://github.com/wangyaya-703/dot-spirits.git
cd dot-spirits
npm install
cp .env.example .env   # fill in your Dot API key and device ID
```

### Hook up Codex (shell wrapper)

```bash
node src/cli.js install-wrapper
source ~/.zshrc
codex   # now tracked automatically
```

### Hook up Claude Code (event hooks)

```bash
node src/cli.js install-hooks
# paste the output into .claude/settings.json
```

### Verify

```bash
node src/cli.js doctor     # check device connectivity
node src/cli.js sessions   # see active sessions
```

## Configuration

All config via `.env` or CLI flags. See [`.env.example`](.env.example) for the full list.

Key settings:

| Variable | What it controls |
|----------|-----------------|
| `DOT_CODEX_API_KEY` | Dot device API key |
| `DOT_CODEX_DEVICE_ID` | Target device ID |
| `DOT_CODEX_TASK_KEY` | Which Image API slot to use |
| `DOT_CODEX_ASSET_THEME` | Visual theme (`siamese-sticker` / `mono-bot`) |
| `DOT_CODEX_ROTATE_INTERVAL_MS` | How long each session stays on screen |
| `DOT_CODEX_RESULT_HOLD_MS` | How long a finished result stays before releasing |

## Visual theme

Ships with a Siamese cat pixel-art theme (`siamese-sticker`). Each state has enter animation frames and a hold frame, all rendered at Dot resolution.

```
assets/themes/siamese-sticker/
├── defaults/idle.png
└── states/
    ├── starting/   (enter-01..03.png + hold.png)
    ├── running/
    ├── waiting_input/
    ├── completed/
    └── failed/
```

## Commands

```bash
node src/cli.js doctor          # device health check
node src/cli.js sessions        # list tracked sessions
node src/cli.js snapshot        # current device + runtime state
node src/cli.js daemon          # start background rotator
node src/cli.js push <state>    # manually push a state image
node src/cli.js install-wrapper # install Codex shell wrapper
node src/cli.js install-hooks   # print Claude Code hooks config
```

## Testing

```bash
npm test
npm run lint
```

## Requirements

- Node.js 20+
- A [Quote/0 Dot](https://www.quotezero.com) device with an Image API content slot
- Dot API key

## License

MIT
