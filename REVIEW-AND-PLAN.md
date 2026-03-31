# dot-codex Engineering Review + Public-Ready + Multi-Agent 扩展计划

> 生成时间：2026-03-30 | 审查方式：Claude Eng Review + Codex Outside Voice

## Context

dot-codex 是一个 Node.js CLI，把 Codex 会话状态同步到 Quote/0 (Dot) E-Ink 设备上。当前是 private 仓库，目标是：
1. 达到 public-ready 状态
2. 修复轮播状态切换 bug（已完成，待验证）
3. 扩展支持 CodeX + Claude Code 的状态显示（OpenClaw 后续再加）

参考项目 [sk-ruban/notchi](https://github.com/sk-ruban/notchi) 是一个 Swift macOS 应用，通过 Claude Code hooks + Unix socket 在 Dynamic Island 区域显示 agent 状态。

### 用户决策记录

| # | 问题 | 决策 |
|---|------|------|
| 1 | Asset 路径 hardcode | 现在修：加 DOT_CODEX_ASSET_ROOT 环境变量 |
| 2 | wrapper 中 node 路径 | 现在修：安装时解析实际 node 路径 |
| 3 | daemon 容错处理 | 两个都修：cleanup try-catch + main loop 顶层 catch |
| 4 | Claude Code 接入方案 | Hook + CLI 命令（dot-codex report） |
| 5 | OpenClaw 接入 | 先不做，后续再加 |
| 6 | 测试覆盖 | 补齐所有关键 gap |

---

## Codex Outside Voice 关键修正

Codex 审查发现了几个计划中的结构性盲点：

1. **Heartbeat 模型不兼容**：当前 registry 的 session 存活依赖 run.js 的 5s heartbeat + pid 检查。短命 hook reporter 没有 heartbeat，session 会被 prune 掉。
   - **修正**：report 命令需要自带 heartbeat 机制，或者为 hook-driven session 使用不同的过期策略（基于最近 event 时间而非 heartbeat）

2. **Daemon 启动路径缺失**：daemon 当前只在 `run` 命令里自启动。Claude-only 用户无法自动启动 daemon。
   - **修正**：添加 LaunchAgent plist 或在 install-hooks 时提示用户手动启动 daemon

3. **Hook 事件模型不完整**：不能只有 start/stop，需要映射完整生命周期（waiting_input、crash、lost event）。
   - **修正**：Claude Code 的 hook 事件要映射到完整的 RUN_STATES

4. **Hook 并发竞态**：两个快速 hook 可能 race 导致 state regression。
   - **修正**：upsertSession 加 sequenceVersion 单调递增检查

5. **PR 顺序调整**：PR3（测试）应在 PR2（multi-agent）之前，先建立契约再改生命周期。

6. **install-hooks 改为输出代码片段**：不自动编辑 settings.json，而是打印让用户手动粘贴。

---

## 当前架构

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ codex (PTY)  │────▶│ StateDetector │────▶│SessionRegistry│
│ run.js       │     │ output parse  │     │ JSON files    │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │   daemon.js    │
                                          │   (rotator)    │
                                          └───────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │ Quote0Client   │
                                          │ push to Dot    │
                                          └───────────────┘
```

---

## 实施计划

### PR1: Public-Ready 清理 + Bug Fix 确认 + 容错加固

**关键文件清单**：

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1 | 创建 LICENSE (MIT) | `LICENSE` (新) | package.json 声明了 MIT 但没文件 |
| 2 | README 去除 hardcoded 路径 | `README.md` | 替换所有 `/Users/bytedance/` 为相对路径 |
| 3 | README 添加英文摘要 | `README.md` | 在中文 README 头部加英文 overview |
| 4 | package.json 补元数据 | `package.json` | 加 author/repository/homepage |
| 5 | 添加 CONTRIBUTING.md | `CONTRIBUTING.md` (新) | 参考 notchi 的格式 |
| 6 | config.js 支持 ASSET_ROOT | `src/lib/config.js` | 加 `DOT_CODEX_ASSET_ROOT` 环境变量覆盖 |
| 7 | wrapper 解析 node 路径 | `src/commands/install-wrapper.js` | 安装时用 `$(which node)` |
| 8 | daemon cleanup try-catch | `src/commands/daemon.js:42-48` | 包裹 clearPid/clearStatus |
| 9 | daemon main loop 顶层 catch | `src/commands/daemon.js` | while 循环内加 try-catch-continue |
| 10 | sleep() 提取公共模块 | `src/lib/utils.js` (新) + 3 files | DRY |
| 11 | 添加 CI workflow | `.github/workflows/test.yml` (新) | node test runner |
| 12 | 清理 tracked 垃圾文件 | `.DS_Store`, `output/` | git rm --cached |

**验证步骤**：
```bash
npm test                           # 现有 + 新增测试
node src/cli.js doctor             # 设备连通性
node src/cli.js daemon &           # 启动 daemon，观察 starting delay
node --check src/commands/daemon.js  # 语法检查
```

---

### PR2: 补齐关键测试 gap

**先建立测试契约，再改生命周期**（Codex outside voice 建议）。

| # | 测试目标 | 文件 | 优先级 |
|---|---------|------|--------|
| 1 | selectNextSession: waiting_input 抢占 | `test/daemon.test.js` | P0 |
| 2 | selectNextSession: slot 过期轮转 | `test/daemon.test.js` | P1 |
| 3 | selectNextSession: round-robin wrap | `test/daemon.test.js` | P1 |
| 4 | shouldDeferStartingDisplay: 非 starting 状态 bypass | `test/daemon.test.js` | P1 |
| 5 | shouldDeferStartingDisplay: delay=0 禁用 | `test/daemon.test.js` | P1 |
| 6 | shouldDeferRapidActiveStatePush: session switch bypass | `test/daemon.test.js` | P1 |
| 7 | shouldDeferRapidActiveStatePush: settle 过期 | `test/daemon.test.js` | P1 |
| 8 | markExit: exit code 0 | `test/state-detector.test.js` | P0 |
| 9 | markExit: non-zero exit | `test/state-detector.test.js` | P0 |
| 10 | markExit: signal kill | `test/state-detector.test.js` | P1 |
| 11 | pruneExpiredSessions | `test/session-registry.test.js` | P0 |
| 12 | heartbeat | `test/session-registry.test.js` | P1 |
| 13 | upsertSession state tracking | `test/session-registry.test.js` | P1 |

**测试覆盖现状**：

```
CODE PATH COVERAGE
===========================
[+] src/commands/daemon.js
    │
    ├── selectNextSession()
    │   ├── [★★★ TESTED] Single session — daemon.test.js:10
    │   ├── [★★★ TESTED] Focused active jump — daemon.test.js:31
    │   ├── [GAP]         waiting_input preemption
    │   ├── [GAP]         Current session state change
    │   ├── [GAP]         Slot expiration rotation
    │   └── [GAP]         Round-robin wrap-around
    │
    ├── shouldDeferRapidActiveStatePush()
    │   ├── [★★★ TESTED] Coalesce churn — daemon.test.js:55
    │   ├── [★★★ TESTED] Never delay waiting_input — daemon.test.js:77
    │   ├── [GAP]         Session switch bypass
    │   └── [GAP]         Settle window expired
    │
    ├── shouldDeferStartingDisplay()
    │   ├── [★★★ TESTED] Within warm-up — daemon.test.js:99
    │   ├── [★★★ TESTED] After warm-up — daemon.test.js:116
    │   ├── [GAP]         Non-starting state bypass
    │   └── [GAP]         Disabled (delay=0)
    │
    └── daemonCommand() main loop
        ├── [GAP]         No sessions → release takeover
        ├── [GAP]         Terminal-only → result hold
        ├── [GAP]         Active sessions → push frames
        └── [GAP]         Takeover reassert flow

[+] src/lib/state-detector.js
    │
    ├── ingest()
    │   ├── [★★ TESTED] Running detection
    │   ├── [★★ TESTED] Waiting detection
    │   ├── [GAP]       ANSI stripping edge cases
    │   └── [GAP]       Noise-only output filtering
    │
    ├── poll()
    │   ├── [★★ TESTED] Timeout completion
    │   ├── [GAP]       Starting → idle timeout
    │   └── [GAP]       Completed → idle timeout
    │
    └── markExit()
        ├── [GAP]       Signal handling
        ├── [GAP]       Exit code 0 from various states
        └── [GAP]       Non-zero exit code

[+] src/lib/session-registry.js
    │
    ├── [★★ TESTED] selectRenderableSessions
    ├── [★★ TESTED] selectFocusedActiveSession
    ├── [GAP]       upsertSession state change tracking
    ├── [GAP]       pruneExpiredSessions
    ├── [GAP]       heartbeat
    └── [GAP]       Atomic write (tmp + rename)

─────────────────────────────────
COVERAGE: 10/35+ paths tested (~28%)
  Core logic: 8/20 (40%)
  Integration: 0/10 (0%)
  Edge cases: 2/5+ (40%)
QUALITY: ★★★: 6  ★★: 4  ★: 0
GAPS: 25+ paths need tests
─────────────────────────────────
```

---

### PR3: Multi-Agent 扩展（Claude Code 接入）— 含生命周期修正

#### 架构图（修正版，含 Codex 反馈）

```
┌──────────────────────────────────────────────────┐
│                 Agent Adapters                     │
├──────────────────┬───────────────────────────────┤
│  Codex Adapter   │  Claude Code Adapter           │
│  (PTY wrap)      │  (hook → CLI report)           │
│  heartbeat: 5s   │  heartbeat: event-driven       │
│  src/commands/   │  src/commands/report.js (新)    │
│  run.js          │                                │
└────────┬─────────┴────────────┬───────────────────┘
         │                      │
         ▼                      ▼
┌──────────────────────────────────────────────────┐
│           SessionRegistry (修改)                   │
│  + agentType: 'codex' | 'claude-code'             │
│  + heartbeatMode: 'periodic' | 'event-driven'     │
│  + sequenceVersion 单调递增检查（防竞态）           │
│  + 过期策略: periodic → pid+heartbeat              │
│              event-driven → lastEventAt + TTL       │
└──────────────────────┬───────────────────────────┘
                       │
               ┌───────▼───────┐
               │   daemon.js   │  (小改: 支持独立启动)
               └───────┬───────┘
                       │
               ┌───────▼───────┐
               │ frame-overlay  │  (不改 badge，保持简洁)
               └───────┬───────┘
                       │
               ┌───────▼───────┐
               │  Quote0Client  │  (不改)
               └───────────────┘
```

#### Claude Code Hook 集成（修正版）

**完整事件映射**：
| Hook Event | → dot-codex State | 说明 |
|-----------|------------------|------|
| `SessionStart` | STARTING | 新 session 开始 |
| `UserPromptSubmit` | RUNNING | 用户发送 prompt，更新 lastEventAt |
| `PreToolUse` | RUNNING | 工具调用开始，更新 lastEventAt |
| `PostToolUse` | RUNNING | 工具调用完成，更新 lastEventAt |
| `Stop` | COMPLETED / CANCELLED | 根据 stop reason 判断 |
| 缺失终止事件 | → COMPLETED (auto) | daemon 基于 lastEventAt + TTL 自动标记 |

**Heartbeat 双模型**：
- **Codex session**: 长命进程，5s 定期 heartbeat，pid 检查判断存活
- **Claude Code session**: 短命 hook event，每次 event 刷新 lastEventAt，daemon 用 `lastEventAt + hookSessionTtlMs` 判断过期

**竞态防护**：
- upsertSession 加 sequenceVersion 单调递增检查
- 如果新 event 的 sequenceVersion <= 当前值，忽略（防止乱序 hook 回退状态）

**Daemon 启动**：
- report 命令检测 daemon 是否在运行（检查 pid file）
- 如果未运行，自动 fork daemon（类似 run.js 的逻辑）

**Hook 安装示例**（install-hooks 命令输出代码片段，用户手动粘贴）：
```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "dot-codex report --agent claude-code --event start"
    }],
    "UserPromptSubmit": [{
      "type": "command",
      "command": "dot-codex report --agent claude-code --event running"
    }],
    "PreToolUse": [{
      "type": "command",
      "command": "dot-codex report --agent claude-code --event running"
    }],
    "Stop": [{
      "type": "command",
      "command": "dot-codex report --agent claude-code --event stop"
    }]
  }
}
```

#### 关键文件清单

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| 1 | 新增 report 命令 | `src/commands/report.js` (新) | hook 触发 + 自动启动 daemon |
| 2 | 新增 install-hooks 命令 | `src/commands/install-hooks.js` (新) | **输出代码片段**而非自动注入 |
| 3 | CLI 注册新命令 | `src/cli.js` | 加 report + install-hooks |
| 4 | constants 加 AGENT_TYPES | `src/lib/constants.js` | 枚举值 + hook session TTL |
| 5 | registry 双模型过期 | `src/lib/session-registry.js` | heartbeatMode + sequenceVersion 检查 |
| 6 | daemon 独立启动支持 | `src/commands/daemon.js` | 被 report 调用时 fork |
| 7 | 测试 report 命令 | `test/report.test.js` (新) | 核心 + 竞态 + 过期测试 |
| 8 | 测试 install-hooks | `test/install-hooks.test.js` (新) | 输出格式测试 |

---

## NOT in Scope

| 项目 | 原因 |
|------|------|
| macOS 原生 UI（类 notchi 的 Dynamic Island） | 不同技术栈，dot-codex 是 E-Ink 设备方案 |
| 情感分析（notchi 的 EmotionAnalyzer） | E-Ink 设备不适合频繁刷新表情 |
| 音频反馈 | 超出 E-Ink 显示范围 |
| Sparkle 自动更新 | CLI 工具用 npm 更新 |
| Windows/Linux 支持 | 当前只服务 macOS 用户 |
| OpenClaw 接入 | 用户选择后续再做 |
| run.js spawn fallback 重构 | 可 work，不是 blocker |
| Agent badge on E-Ink | Codex 反馈：296x152 E-Ink 空间有限，badge 挤占有用信息 |

## What Already Exists

| 已有 | 状态 | 复用方式 |
|------|------|---------|
| `CodexStateDetector` | 完整且测试过 | Codex adapter 继续用 |
| `SessionRegistry` | 完整，支持多会话 | 加 agentType + heartbeatMode 字段 |
| `daemon.js` rotator | 完整，agent-agnostic | 小改支持独立启动 |
| `Quote0Client` | 完整带 retry | 不需要改 |
| `frame-overlay.js` | 完整 | 不改（保持简洁） |
| `asset-store.js` | 支持主题路径 | 后续可扩展 agent-specific 主题 |

## Failure Modes

| 代码路径 | 失败场景 | 有测试? | 有错误处理? | 用户感知 | 修复计划 |
|---------|---------|---------|------------|---------|---------|
| daemon cleanup | runtime 目录被删 | 否 | **否** | 僵尸 pid | PR1 #8 修复 |
| daemon main loop | uncaught throw | 否 | **否** | daemon 挂掉 | PR1 #9 修复 |
| pushImage timeout | 网络断开 | 否 | 是(retry) | 3次重试后 throw | PR1 #9 兜底 |
| Claude Code hook | hook 脚本失败 | — | — | 静默 | PR3 加日志 |
| registry JSON parse | 文件损坏 | 否 | 是(catch) | 跳过该 session | 可接受 |
| hook 竞态 | 快速连续 hook | — | — | 状态回退 | PR3 sequenceVersion |
| hook session 过期 | 缺失终止事件 | — | — | 僵尸 session | PR3 TTL 自动清理 |

**Critical gaps 均在 PR1/PR3 中修复。**

---

## Completion Summary

| 审查项 | 结果 |
|--------|------|
| Step 0: Scope Challenge | 分 PR1(public-ready) → PR2(测试) → PR3(multi-agent) |
| Architecture Review | 4 issues found, 全部纳入修复计划 |
| Code Quality Review | 4 issues found, 3 纳入修复（spawn fallback 暂不改） |
| Test Review | diagram produced, 25+ gaps, 13 条测试计划 |
| Performance Review | 2 issues found (均可接受，不是 blocker) |
| NOT in scope | written |
| What already exists | written |
| Failure modes | 2 critical gaps → PR1 修复 |
| Outside voice | ran (Codex) — 8 findings, 5 重大修正已纳入计划 |
| Lake Score | 5/6 选择了完整选项 |

---

## Review Report

| Review | Trigger | Runs | Status | Findings |
|--------|---------|------|--------|----------|
| Eng Review | `/plan-eng-review` | 1 | CLEAR | 10 issues, 2 critical gaps |
| Outside Voice | Codex | 1 | 8 findings | 5 重大修正纳入计划 |

**CROSS-MODEL TENSION**: 5/8 Codex findings 是 Claude review 的盲点（heartbeat 模型、daemon 启动、事件映射、竞态、PR 顺序），全部已采纳。

**VERDICT**: ENG CLEARED + OUTSIDE VOICE CLEARED — 所有 findings 已纳入修正计划。实施顺序：PR1 → PR2 → PR3。
