# dot-codex

`dot-codex` is a local CLI that mirrors Codex session state to a Quote/0 / Dot E-Ink device through a dedicated `Image API` slot. It wraps `codex`, tracks multiple sessions, and uses a background rotator to manage takeover, release, and render cadence.

`dot-codex` 是一个本地 CLI，用来把多个 Codex 会话的状态同步到 Quote/0 / Dot 设备上的专用 `Image API` 内容位。

它不是简单的“推一张图”。当前版本已经具备：

- 暹罗猫像素风状态动画
- 会话 `ID` 和状态名叠字
- `codex` shell 包装器，做到直接输入 `codex` 自动触发
- `claude-code` hook 上报入口，支持 event-driven session
- 多会话轮播
- `waiting_input` 高优先级抢占
- 结果态短时保留后释放接管
- takeover 期间只在检测到设备画面真的被别的内容盖掉时才抢回
- 默认减帧并放慢动画节奏，降低闪烁
- 与 Dot 设备原本 loop 内容共存

## 1. 目标

这个项目解决的是一个很具体的问题：

- 你电脑上可能同时跑多个 Codex 会话
- Dot 设备本身也在循环很多别的内容
- 你希望 Dot 在 Codex 活跃时临时接管，展示会话状态
- 等 Codex 不活跃后，再还给设备本身的正常内容轮播

当前实现不是“让 Dot 永远当 Codex 专属屏”，而是：

- 平时：设备继续按自己的 loop 内容轮播
- Codex 活跃时：`dot-codex` 临时接管
- Codex 全部结束后：停止继续抢屏，让设备回到自己的节奏

这里的 rotator 会持续轮询，但轮询本身不等于刷新屏幕：

- rotator 只是在后台检查当前会话池和设备当前图
- 只有确实需要切换画面时才会推送 Dot
- 长时间保持 `running` 的会话会低频换到另一张 `running` 图，避免一直停在同一张画面

## 2. 当前行为模型

### 2.1 会话状态

每个 Codex 会话会被归类到以下状态之一：

- `starting`
- `idle`
- `running`
- `waiting_input`
- `completed`
- `failed`
- `cancelled`

当前屏幕上展示的最终图会带两个元信息：

- 状态名，例如 `RUNNING` / `WAIT` / `DONE`
- 会话标识，优先级如下：
  - `--session-name` / `DOT_CODEX_SESSION_NAME`
  - Codex 自己的 thread name
  - 当前项目目录名
  - 短会话 `ID`

### 2.2 多会话轮播

项目会维护一个最近会话池，默认最多保留：

- `5` 个会话

轮播对象不是“当前你在 tmux 里光标停留的 pane”，而是：

- 所有仍然活着的 Codex 会话
- 再加上最近结束的一小批结果态会话

也就是说：

- 不是看你当前前台 pane
- 不是看哪个终端窗口在最上层
- 只要这是一个活跃 Codex 会话，它就会进入调度池

### 2.3 优先级规则

优先级从高到低：

1. `waiting_input`
- 最高优先级
- 可以抢占当前普通状态
- 因为它需要你立即处理

2. 当前 Dot 上正在展示的那个 Codex 会话
- 如果它状态变化，会立即更新
- 不需要等下一次轮播

3. 其他活跃会话
- `starting` / `running`
- 进入轮播池，按顺序展示
- 新开对话或刚发生状态变化的活跃会话，会先获得一段稳定焦点时间，避免刚切入就被别的内容打断

补充：

- 当同时存在多个活跃会话时，Dot 不再单会话轮播
- 会保留主屏幕上的暹罗猫状态图，并在底部切出一个会话状态条
- 多个活跃会话会被收束到这个底部面板里，而不是全屏切成白底 summary 页
- 这样 `codex` 和 `claude-code` 混跑时，不会来回闪切单个会话卡片，同时主视觉仍然保持统一

4. 终态会话
- `completed` / `failed` / `cancelled`
- 只有在没有活跃会话时，最新结果态才会被短时保留展示
- 展示窗口过后会自动从 runtime 清理掉
- 旧 `DONE` 不会反复混进轮播

### 2.4 接管与释放

当前实现采用“有活跃会话才接管”的规则。

#### 进入接管

只要存在任一活跃会话：

- `starting`
- `running`
- `waiting_input`

Dot 就进入 Codex takeover 模式。

#### 接管期间

- 当前展示会话状态变化：立即推屏
- 其他会话：统一进入 rotator 调度
- `waiting_input`：允许抢占
- 活跃会话存在时，不再插播旧 `done/failed/cancelled`

#### 退出接管

当没有任何活跃会话时：

- 最新结果态还会短暂停留一段时间
- 之后 `dot-codex` 停止继续推送

此后设备会继续按照自己的内容轮播节奏运行。

注意：

- 当前实现的“释放”是**停止继续抢屏**
- 不是调用某个“立刻切回下一个设备内容”的专用 API

换句话说：

- `dot-codex` 不再继续强制显示 Codex 内容
- Dot 会在它自己的后续内容轮播时机里回到原本内容

补充：

- 旧的 `completed/done` 不会混进轮播
- 每一轮 `running` 结束后，都会进入一次 `done`
- 如果同一个会话后面又开始新一轮任务流，后续仍然可以再次进入 `done`
- `done` 展示窗口结束后，会话会转成 `idle`
- 如果会话已经处在 `idle` 再正常退出，不会额外补一次 `done`
- 结果展示窗口结束后，该终态会话会从 runtime 清理掉

## 3. 与 Dot 原生循环内容的关系

你的设备本来就可能有很多 loop 内容，其中一个是 `Image API`。

这里的关键关系是：

1. `dot-codex` 只会更新一个**专用** `Image API` 内容位
- 由 `taskKey` 指定

2. Codex 会话活跃时
- `dot-codex` 往这个 `taskKey` 推新图
- 并使用 `refreshNow: true`
- 所以设备会立即切到这个 `Image API` 内容位

3. Codex 释放接管后
- `dot-codex` 不再持续推送
- 设备后续回到自己的 loop 节奏

4. 如果设备之后又轮播到这个 `Image API` 内容位
- 会显示该内容位最近一次被写入的那张图

所以结论不是：

- Codex 永远锁住设备

而是：

- Codex 在活跃窗口内临时接管
- 非活跃时让设备继续做自己的内容轮播

## 4. 包装器

### 4.1 已支持

当前已经支持安装 zsh 包装器，安装后：

```bash
codex
```

实际上会变成：

```bash
"$DOT_CODEX_NODE_BIN" "$DOT_CODEX_ROOT/src/cli.js" run -- "$DOT_CODEX_REAL_CODEX" "$@"
```

### 4.2 安装方式

```bash
cd /path/to/dot-codex
node src/cli.js install-wrapper
source ~/.zshrc
```

安装后会写入：

- wrapper 脚本：`~/.dot-codex/bin/codex`
- zsh 配置块：`~/.zshrc`

### 4.3 包装器做的事

- 自动启动或复用后台 rotator
- 为当前会话生成 `sessionId`
- 记录会话状态到本地 runtime 目录
- 把 Dot 显示交给后台调度器

## 5. 目录结构

关键目录：

- 主题资源：
  - [`assets/themes/siamese-sticker`](assets/themes/siamese-sticker)
- CLI 入口：
  - [`src/cli.js`](src/cli.js)
- Codex 包装运行：
  - [`src/commands/run.js`](src/commands/run.js)
- 后台 rotator：
  - [`src/commands/daemon.js`](src/commands/daemon.js)
- wrapper 安装：
  - [`src/commands/install-wrapper.js`](src/commands/install-wrapper.js)
- 会话注册：
  - [`src/lib/session-registry.js`](src/lib/session-registry.js)
- 动画推送控制：
  - [`src/lib/render-controller.js`](src/lib/render-controller.js)
- 叠字：
  - [`src/lib/frame-overlay.js`](src/lib/frame-overlay.js)
- 生成脚本：
  - [`scripts/generate-gemini-reference-holds.py`](scripts/generate-gemini-reference-holds.py)
  - [`scripts/generate-gemini-siamese-theme.py`](scripts/generate-gemini-siamese-theme.py)

## 6. 安装

要求：

- Node.js 20+
- Quote/0 / Dot 设备
- 设备上有一个专用 `IMAGE_API` 内容位
- 有可用的 Dot API key

安装依赖：

```bash
cd /path/to/dot-codex
npm install
```

## 7. 配置

配置来源优先级：

1. CLI flags
2. `.env`
3. `~/.dot-codex/config.json`

### 7.1 `.env`

参考 [`.env.example`](.env.example)。

示例：

```bash
DOT_CODEX_API_KEY=dot_app_xxx
DOT_CODEX_DEVICE_ID=ABCD1234ABCD
DOT_CODEX_TASK_TYPE=loop
DOT_CODEX_TASK_KEY=image_task_1
DOT_CODEX_ASSET_THEME=siamese-sticker
DOT_CODEX_BORDER=0
DOT_CODEX_DITHER_TYPE=NONE
DOT_CODEX_MIN_REFRESH_INTERVAL_MS=2200
DOT_CODEX_FRAME_INTERVAL_MS=3200
DOT_CODEX_MAX_ENTER_FRAMES=2
DOT_CODEX_RUNNING_IDLE_MS=9000
DOT_CODEX_RUNNING_FRAME_CYCLE_MS=0
DOT_CODEX_ROTATE_INTERVAL_MS=24000
DOT_CODEX_ROTATOR_POLL_MS=1000
DOT_CODEX_ROTATE_MAX_SESSIONS=5
DOT_CODEX_ACTIVE_SESSION_STALE_MS=90000
DOT_CODEX_HOOK_SESSION_TTL_MS=60000
DOT_CODEX_ACTIVE_SESSION_FOCUS_MS=15000
DOT_CODEX_STARTING_DISPLAY_DELAY_MS=4000
DOT_CODEX_STATE_CHANGE_SETTLE_MS=6000
DOT_CODEX_RESULT_HOLD_MS=15000
DOT_CODEX_TERMINAL_PROMOTION_MS=12000
DOT_CODEX_TAKEOVER_REASSERT_MS=24000
DOT_CODEX_RESTORE_MODE=hold
DOT_CODEX_RESTORE_DELAY_MS=15000
DOT_CODEX_LOG_FILE=~/.dot-codex/runtime/dot-codex.log
DOT_CODEX_SESSION_NAME=
```

### 7.2 重要配置解释

- `DOT_CODEX_TASK_KEY`
  - 你的专用 `IMAGE_API` 内容位 key

- `DOT_CODEX_ROTATE_INTERVAL_MS`
  - 每个会话在 Dot 上的默认停留时间

- `DOT_CODEX_ROTATE_MAX_SESSIONS`
  - 进入轮播池的最近会话数量上限

- `DOT_CODEX_ACTIVE_SESSION_STALE_MS`
  - 活跃会话多久没有心跳就视为失效

- `DOT_CODEX_HOOK_SESSION_TTL_MS`
  - event-driven hook session 在没有新事件时能保留多久
  - 主要用于 Claude Code 这类短命 hook 上报模型

- `DOT_CODEX_ACTIVE_SESSION_FOCUS_MS`
  - 新开对话或刚变更状态的活跃会话，优先独占屏幕多久再恢复普通轮播

- `DOT_CODEX_STARTING_DISPLAY_DELAY_MS`
  - 新 session 刚启动时，先等多久再决定要不要显示 `starting` 这套画
  - 如果它很快就进入 `running`，就直接跳过 `starting`，避免两套画连着切

- `DOT_CODEX_STATE_CHANGE_SETTLE_MS`
  - 同一个活跃会话短时间内连续跳状态时，先稳住当前画面多久再决定是否重绘
  - 主要用于抑制 `starting -> running` 这类连跳导致的频繁推屏

- `DOT_CODEX_RESULT_HOLD_MS`
  - 当所有活跃会话结束后，最新结果态在释放接管前还能保留多久

- `DOT_CODEX_TERMINAL_PROMOTION_MS`
  - 单个会话在内部从 `done` 回到 `idle` 的过渡窗口

- `DOT_CODEX_TAKEOVER_REASSERT_MS`
  - takeover 期间多久检查一次设备当前图是否已被其他 Dot 内容盖掉
  - 只有确认被盖掉时，才会重推当前 `hold` 帧抢回

- `DOT_CODEX_LOG_FILE`
  - rotator 和 run 命令的结构化日志文件
  - 默认写到 `~/.dot-codex/runtime/dot-codex.log`

- `DOT_CODEX_ASSET_ROOT`
  - 直接指定一套主题资源目录
  - 如果设置了它，会覆盖 `DOT_CODEX_ASSET_THEME`

- `DOT_CODEX_MAX_ENTER_FRAMES`
  - 每次状态切换最多播放几张 `enter` 帧
  - 默认播放 `2` 张，再进入 `hold`

- `DOT_CODEX_RUNNING_IDLE_MS`
  - `running` 安静多久后，被视为这一轮任务流已经结束，进入 `done`

- `DOT_CODEX_RUNNING_FRAME_CYCLE_MS`
  - 长时间保持 `running` 时，多久切换一次另一张 `running` 图
  - 默认关闭，不主动为了“活着感”去轮换 `running` 图

## 8. 常用命令

检查设备健康：

```bash
node src/cli.js doctor
```

列出设备内容：

```bash
node src/cli.js tasks
```

读取当前设备状态：

```bash
node src/cli.js snapshot
```

`snapshot` 现在也会输出本地 runtime 摘要，包括：

- `takeoverLocked`
- `summaryBoardActive`
- `currentSessionId`
- `activeSessionIds`

手工推一个状态图：

```bash
node src/cli.js --session-id TEST push running
```

安装 zsh 包装器：

```bash
node src/cli.js install-wrapper
```

直接包一层跑 Codex：

```bash
node src/cli.js run -- codex
```

查看当前会话池和 rotator 状态：

```bash
node src/cli.js sessions
```

`sessions` 表格现在会额外显示：

- `AGENT`
- `TakeoverLocked`
- `summary_board`

查看机器可读 JSON：

```bash
node src/cli.js sessions --json
```

上报外部 agent 生命周期事件：

```bash
printf '{"session_id":"abc123","cwd":"/tmp/demo","hook_event_name":"SessionStart"}' | node src/cli.js report --agent claude-code --sequence 1
```

输出 Claude Code hooks 配置片段：

```bash
node src/cli.js install-hooks
```

启动后台 rotator：

```bash
node src/cli.js daemon
```

安装完 wrapper 后，直接：

```bash
codex
```

## 9. 本地测试

语法检查：

```bash
npm run lint
```

测试：

```bash
npm test
```

当前测试覆盖：

- `AssetStore`
- `Codex thread id` 解析
- `frame overlay`
- `RenderController`
- `SessionRegistry` 选择逻辑
- `sessions` 相关选择逻辑
- `CodexStateDetector`

## 10. 视觉资源

最终主题：

- [`siamese-sticker`](assets/themes/siamese-sticker)

每个状态都包含：

- `enter/enter-01.png`
- `enter/enter-02.png`
- `enter/enter-03.png`
- `hold.png`

当前状态：

- `starting`
- `running`
- `waiting_input`
- `completed`
- `failed`

## 11. 真机联调结果

当前版本已经完成过以下联调：

- 手工推送最终 `running`
- 真实 Codex 完成链路：
  - `running -> completed`
- 真实 Codex 等待输入链路：
  - `running -> waiting_input`
- `failed` 真机显示验证
- wrapper 实际接管验证
- 多会话轮播日志验证

## 12. 安全要求

### 12.1 不要提交 key

以下内容绝不能进 Git：

- `.env`
- 任何真实 API key
- 任何带真实 token 的调试文件

当前 `.gitignore` 已忽略：

- `.env`
- `output/`

### 12.2 Gemini 相关

仓库里只保留：

- [`config/gemini.env.example`](config/gemini.env.example)

不要把真实 `gemini.env` 提交进仓库。

## 13. 当前限制

- Dot 官方公开 API 里，这个项目当前只使用了 `Image API` 等公开接口
- 当前实现的“释放接管”是停止继续抢屏，不是强制设备立刻跳到下一个原生内容
- 所以设备何时回到其他 loop 内容，仍取决于设备自身的内容轮播节奏

## 14. 建议的日常使用方式

1. 新开终端
2. `source ~/.zshrc`
3. 直接运行 `codex`
4. 在 tmux 多 pane 里同时跑多个 Codex 会话
5. Dot 会按优先级和轮播策略显示：
   - `waiting_input` 优先
   - 单个活跃会话时，当前展示会话实时更新
   - 多个活跃会话时，主图保持暹罗猫状态画，底部附带多会话状态条
   - 新进入 `done/failed` 的会话会被提升展示一次
   - takeover 期间只有在检测到设备已经被其他内容盖掉时才会抢回
   - 长时间 `running` 会低频切换另一张 `running` 图
   - 无活跃会话后自动释放接管
