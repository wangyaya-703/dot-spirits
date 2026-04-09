# dot-spirits

Put your AI coding agents on a desk — literally.

把你的 AI 编程 agent 放到桌面上 —— 真·物理桌面。

---

`dot-spirits` syncs live session states from **Codex** and **Claude Code** to a [Quote/0 Dot](https://www.quotezero.com) E-Ink device. Glance at a tiny screen and know what your agents are doing — no terminal switching needed.

`dot-spirits` 把 **Codex** 和 **Claude Code** 的实时会话状态同步到 [Quote/0 Dot](https://www.quotezero.com) 墨水屏设备。瞄一眼桌上的小屏幕，就知道 agent 在干什么，不用切终端。

Both agents share the same Dot display. When multiple sessions run side-by-side, the device shows them all.

两个 agent 共享同一块 Dot 屏幕。多会话并行时，设备会同时展示所有活跃状态。

## What it does / 功能

- Detects **Codex** sessions via a shell wrapper (pty bridge)
  通过 shell 包装器（pty 桥接）检测 Codex 会话
- Detects **Claude Code** sessions via Claude Code hooks (event-driven)
  通过 Claude Code hooks（事件驱动）检测 Claude Code 会话
- Renders pixel-art status animations to Dot in real time
  实时渲染像素风状态动画到 Dot 设备
- Temporarily takes over the device when agents are active; releases it when idle
  agent 活跃时临时接管设备，空闲后自动释放，让设备回到原本内容轮播

### Multi-agent, multi-session / 多 agent、多会话

Run Codex in one pane and Claude Code in another — `dot-spirits` tracks all of them:

一个 pane 跑 Codex，另一个跑 Claude Code —— `dot-spirits` 全部追踪：

- **Priority / 优先级**: `waiting_input` always wins — it needs your attention / `waiting_input` 永远最高优先 —— 因为它需要你操作
- **Single session / 单会话**: full-screen status art with state label and session name / 全屏状态图 + 状态标签 + 会话名
- **Multiple sessions / 多会话**: main art stays, a compact status bar appears at the bottom / 主图保持不变，底部出现紧凑的多会话状态条
- **Idle / 空闲**: latest result holds briefly, then the device returns to its own content loop / 最新结果短暂保留后自动释放

### Status states / 状态列表

| State | Meaning | 含义 |
|-------|---------|------|
| `starting` | Agent is booting up | 正在启动 |
| `running` | Agent is working | 正在执行任务 |
| `waiting_input` | Agent needs your input | 等待你的输入 |
| `completed` | Task finished successfully | 任务完成 |
| `failed` | Task errored out | 任务失败 |

## Quick start / 快速开始

```bash
git clone https://github.com/wangyaya-703/dot-spirits.git
cd dot-spirits
npm install
cp .env.example .env   # fill in your Dot API key and device ID / 填入 Dot API key 和设备 ID
```

### Hook up Codex / 接入 Codex

```bash
node src/cli.js install-wrapper
source ~/.zshrc
codex   # now tracked automatically / 自动追踪
```

### Hook up Claude Code / 接入 Claude Code

```bash
node src/cli.js install-hooks
# paste the output into .claude/settings.json
# 把输出粘贴到 .claude/settings.json
```

### Verify / 验证

```bash
node src/cli.js doctor     # check device connectivity / 检查设备连通性
node src/cli.js sessions   # see active sessions / 查看活跃会话
```

## Configuration / 配置

All config via `.env` or CLI flags. See [`.env.example`](.env.example) for the full list.

所有配置通过 `.env` 或 CLI 参数设置，完整列表见 [`.env.example`](.env.example)。

| Variable | What it controls | 说明 |
|----------|-----------------|------|
| `DOT_CODEX_API_KEY` | Dot device API key | Dot 设备 API 密钥 |
| `DOT_CODEX_DEVICE_ID` | Target device ID | 目标设备 ID |
| `DOT_CODEX_TASK_KEY` | Which Image API slot to use | 使用哪个 Image API 内容位 |
| `DOT_CODEX_ASSET_THEME` | Visual theme (`siamese-sticker` / `mono-bot`) | 视觉主题 |
| `DOT_CODEX_ROTATE_INTERVAL_MS` | How long each session stays on screen | 每个会话在屏幕上停留多久 |
| `DOT_CODEX_RESULT_HOLD_MS` | How long a finished result stays before releasing | 结果态保留多久后释放 |

## Visual theme / 视觉主题

Ships with a Siamese cat pixel-art theme (`siamese-sticker`). Each state has enter animation frames and a hold frame, all rendered at Dot resolution.

内置暹罗猫像素风主题（`siamese-sticker`）。每个状态包含入场动画帧和持续帧，均按 Dot 分辨率渲染。

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

## Commands / 命令

```bash
node src/cli.js doctor          # device health check / 设备健康检查
node src/cli.js sessions        # list tracked sessions / 列出追踪的会话
node src/cli.js snapshot        # current device + runtime state / 当前设备和运行时状态
node src/cli.js daemon          # start background rotator / 启动后台轮播器
node src/cli.js push <state>    # manually push a state image / 手动推送状态图
node src/cli.js install-wrapper # install Codex shell wrapper / 安装 Codex shell 包装器
node src/cli.js install-hooks   # print Claude Code hooks config / 输出 Claude Code hooks 配置
```

## Testing / 测试

```bash
npm test
npm run lint
```

## Requirements / 环境要求

- Node.js 20+
- A [Quote/0 Dot](https://www.quotezero.com) device with an Image API content slot / 一台带 Image API 内容位的 Dot 设备
- Dot API key

## Architecture / 架构

See [`docs/architecture.md`](docs/architecture.md).

## Contributing / 参与贡献

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT
