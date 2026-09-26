---
title: "Pi 扩展（Extension）系统总结"
date: 2026-09-26
description: pi 扩展系统机制:TypeScript 模块工厂、事件订阅、工具/命令/键位注册与加载流程
tags:
  - Agent
  - pi
  - 扩展系统
---

# Pi 扩展（Extension）系统总结

> 基于源码 `packages/coding-agent/src/core/extensions/`（loader.ts / runner.ts / types.ts）与官方文档 `packages/coding-agent/docs/extensions.md` 整理。

---

## 1. 什么是 Pi 扩展

Pi 扩展是 **TypeScript 模块**，默认导出一个工厂函数，接收 `ExtensionAPI` 对象，可以：

- 订阅 agent 生命周期事件（`pi.on(...)`）
- 注册 LLM 可调用的工具（`pi.registerTool()`）
- 注册斜杠命令、快捷键、CLI flag
- 注册自定义消息/entry 渲染器、Markdown 转换器
- 注册/覆盖模型 Provider（含 OAuth）
- 通过 `ctx.ui` 与用户交互（select / confirm / input / notify / 自定义 TUI 组件）
- 通过 `pi.appendEntry()` 持久化状态（不进入 LLM 上下文）

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 订阅事件、注册工具/命令...
}
```

工厂函数可以是 async（pi 会 await 完成后才发 `session_start`，再 flush 排队的 provider 注册）。

---

## 2. 工作原理（加载与执行架构)

### 2.1 加载流程（loader.ts）

```
pi 启动
  │
  ├─ 1. 发现扩展路径（discoverAndLoadExtensions）
  │     a. 项目本地:  .pi/extensions/
  │     b. 全局:      ~/.pi/agent/extensions/
  │     c. settings.json 里配置的 extensions/packages 路径
  │        （项目本地扩展只在项目被信任后才加载）
  │
  ├─ 2. 用 jiti 加载模块（TypeScript 免编译直接跑）
  │     - 编译二进制（Bun/Node SEA）模式下通过 virtualModules
  │       内置提供 typebox、@earendil-works/pi-ai、pi-tui、
  │       pi-agent-core、pi-coding-agent 等包给扩展 import
  │
  ├─ 3. 取模块的 default export 作为工厂函数（必须是函数，否则报错）
  │
  ├─ 4. 为每个扩展创建 Extension 对象 + ExtensionAPI 包装
  │     - pi.on()             → 写入 extension.handlers Map
  │     - pi.registerTool()   → 写入 extension.tools Map
  │     - pi.registerCommand()→ 写入 extension.commands Map
  │     - 动作类方法（sendMessage/setModel 等）此时是"未初始化"占位，
  │       加载期调用会抛错（registerTool/registerProvider 例外，可排队）
  │
  ├─ 5. await factory(api) 执行工厂函数
  │     成功 → commit()：flush 排队的 flag 默认值 / provider 注册
  │     失败 → discard()：丢弃所有注册，记录错误，不影响其他扩展
  │
  └─ 6. runner.bindCore() 把真实的动作实现绑进 runtime，
        此后 sendMessage/setModel 等真正可用
```

### 2.2 目录发现规则（只递归一层）

| 形式 | 规则 |
|---|---|
| 单文件 | `extensions/*.ts` / `*.js` 直接加载 |
| 子目录 | `extensions/<name>/index.ts` 或 `index.js` |
| npm 包 | `extensions/<name>/package.json` 里 `"pi": { "extensions": ["./src/index.ts"] }` |

### 2.3 事件分发（runner.ts）

- 每个事件有一个 `ExtensionRunner.emitXxx()` 方法，在 agent 相应生命周期点被调用
- 分发顺序：**按扩展加载顺序、扩展内按注册顺序** 依次 `await` 每个 handler
- **管道语义**：拦截类事件（`context`、`before_provider_request`、`message_end`、`tool_result`、`input`）的返回值会作为下一个 handler 的输入，形成链式改写
- **短路语义**：`tool_call` 返回 `{ block: true }` 立即返回；`session_before_*` 返回 `{ cancel: true }` 立即取消；`input` 返回 `{ action: "handled" }` 短路
- handler 抛异常不会崩掉 pi：错误进 `emitError()` 通知错误监听器，继续下一个 handler
- handler 每次收到新鲜创建的 `ExtensionContext`（值在调用时解析，防止 stale）

### 2.4 内置扩展（builtInExtensions）

`packages/coding-agent/src/extensions/index.ts`:

```typescript
export const builtInExtensions: InlineExtension[] = [
  { name: "llama.cpp", factory: llamaExtension, hidden: true },
];
```

- 在 `main()` 中与外部扩展工厂合并：`[...builtInExtensions, ...options?.extensionFactories]`
- 走 `loadExtensionFromFactory()`（内联工厂，不经过 jiti/文件系统）
- 目前唯一内置扩展是 **llama.cpp**：注册 llama.cpp provider（`pi.registerProvider`）+ `/llama` 命令（模型加载/卸载/下载管理 UI）
- 内置扩展与外部扩展在同一 ExtensionRunner 中运行，无特殊待遇

---

## 3. 可订阅的事件（共 40 个）

⚡ = 带 Result 类型，可拦截/修改行为；其余为纯通知。

### 3.1 会话与项目生命周期

| 事件 | 类型 | 说明 |
|---|---|---|
| `project_trust` | ⚡ | 项目信任决策，返回 `yes/no/undecided`，第一个 yes/no 赢；仅全局/CLI 扩展参与 |
| `session_start` | 通知 | 会话启动/加载/fork/reload。`event.reason`: startup/new/resume/fork/reload |
| `session_info_changed` | 通知 | 会话元数据（如名字）变化 |
| `session_before_switch` | ⚡ | 切换会话前，可 `cancel` |
| `session_before_fork` | ⚡ | fork 前，可 `cancel` |
| `session_before_compact` | ⚡ | 压缩前，可取消或自定义压缩 |
| `session_compact` / `session_compact_failed` | 通知 | 压缩完成/失败 |
| `session_before_tree` | ⚡ | 会话树导航前，可取消/自定义 |
| `session_tree` | 通知 | 会话树导航后 |
| `session_shutdown` | 通知 | 会话关闭（退出/fork/切换前），做清理 |
| `resources_discover` | ⚡ | 贡献额外的 skill/prompt/theme 路径 |

### 3.2 Agent 与回合

| 事件 | 类型 | 说明 |
|---|---|---|
| `before_agent_start` | ⚡ | agent 启动前最后一道拦截：可注入消息、改 system prompt |
| `agent_start` / `agent_end` | 通知 | agent 开始/结束 |
| `agent_settled` | 通知 | 完全落定（无重试/压缩/后续消息） |
| `turn_start` / `turn_end` | 通知 | 每个回合（LLM 调工具的循环）开始/结束 |
| `context` | ⚡ | 组装 LLM 上下文时，可增删改 messages（链式管道） |

### 3.3 Provider 请求层

| 事件 | 类型 | 说明 |
|---|---|---|
| `before_provider_request` | ⚡ | 请求发出前，可整体替换 payload（链式管道） |
| `before_provider_headers` | 通知 | 就地 mutate HTTP headers（返回值被忽略） |
| `after_provider_response` | 通知 | 收到响应（状态码+headers，流消费前） |

### 3.4 消息流

| 事件 | 类型 | 说明 |
|---|---|---|
| `message_start` / `message_update` | 通知 | 消息开始/流式增量 |
| `message_end` | ⚡ | 消息结束，可返回改写后的 message（role 必须一致） |

### 3.5 工具执行

| 事件 | 类型 | 说明 |
|---|---|---|
| `tool_call` | ⚡ | LLM 发起工具调用前，可 `{ block: true, reason }` 阻止或改参数 |
| `tool_execution_start` / `update` / `end` | 通知 | 工具实际执行过程 |
| `tool_result` | ⚡ | 结果返回后，可改写 content/details/isError/usage（链式管道） |

### 3.6 用户输入与 UI

| 事件 | 类型 | 说明 |
|---|---|---|
| `input` | ⚡ | 用户提交输入前：`handled`（拦截）/ `transform`（改写文本与图片，链式） |
| `user_bash` | ⚡ | 用户在 pi 里执行 bash 命令前 |
| `ui_prompt_start` / `ui_prompt_end` | 通知 | 扩展 UI 弹窗（select/confirm 等）打开/关闭 |
| `model_select` / `thinking_level_select` | 通知 | 用户切换模型/思考等级 |

### 3.7 生命周期总览图

```
pi 启动
  ├─► project_trust（仅全局/CLI 扩展）
  ├─► session_start { reason: "startup" }
  └─► resources_discover { reason: "startup" }

用户发 prompt
  ├─►（扩展命令优先匹配，命中则 bypass）
  ├─► input（可拦截/改写/处理）
  ├─► before_agent_start（可注入消息、改 system prompt）
  ├─► agent_start
  │     ┌── turn 循环（LLM 调工具时重复）──┐
  │     ├─► turn_start                    │
  │     ├─► context（可改 messages）      │
  │     ├─► before_provider_headers       │
  │     ├─► before_provider_request       │
  │     ├─► after_provider_response       │
  │     │   LLM 响应，可能调工具：         │
  │     │     tool_execution_start         │
  │     │     tool_call（可 block）        │
  │     │     tool_execution_update        │
  │     │     tool_result（可改写）        │
  │     │     tool_execution_end           │
  │     └─► turn_end                      │
  ├─► agent_end
  └─► agent_settled

/new、/resume:  session_before_switch → session_shutdown → session_start → resources_discover
/fork、/clone:  session_before_fork   → session_shutdown → session_start → resources_discover
/compact:       session_before_compact → session_compact | session_compact_failed
/tree:          session_before_tree → session_tree
退出:           session_shutdown
```

### 3.8 哪些事件最重要

1. **`tool_call` + `tool_result`** — 权限管控（危险命令确认）、审计、改写工具参数/结果
2. **`before_provider_request`** — 注入系统提示、脱敏、代理改写、计费统计
3. **`context`** — 控制发给 LLM 的上下文（裁剪/注入项目知识）
4. **`input` / `user_bash`** — 输入拦截与过滤
5. **`session_start` / `session_shutdown`** — 状态加载/清理（配合 `appendEntry` 持久化）
6. **`before_agent_start`** — 动态注入消息、按会话改 system prompt

---

## 4. ExtensionAPI 全貌

| 类别 | 方法 |
|---|---|
| 事件 | `on(event, handler)`（方法重载，事件名→handler 类型精确推导） |
| 工具 | `registerTool(tool)` |
| 命令/快捷键/flag | `registerCommand(name, opts)`、`registerShortcut(key, opts)`、`registerFlag(name, opts)`、`getFlag(name)` |
| 渲染 | `registerMessageRenderer(type, renderer)`、`registerMarkdownTransformer(fn)`、`registerEntryRenderer(type, renderer)` |
| 发消息 | `sendMessage(customMsg, opts)`、`sendUserMessage(content, opts)`（deliverAs: steer/followUp） |
| 持久化 | `appendEntry(type, data)`（不进 LLM 上下文） |
| 会话 | `setSessionName` / `getSessionName` / `setLabel` |
| 执行 | `exec(cmd, args, opts)` |
| 工具管理 | `getActiveTools` / `getAllTools` / `setActiveTools` / `getCommands` |
| 模型 | `setModel(model)` / `getThinkingLevel` / `setThinkingLevel` |
| Provider | `registerProvider(name, config)` / `unregisterProvider(name)`（加载期排队，bindCore 后立即生效） |
| 扩展间通信 | `events: EventBus`（`events.emit/on`，跨扩展发布订阅，session 替换后自动退订） |

Handler 通用签名：

```typescript
type ExtensionHandler<E, R = undefined> =
  (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

`ExtensionContext` 提供：`ui`、`mode`、`hasUI`、`cwd`、`sessionManager`、`modelRegistry`、`model`、`signal`、`abort()`、`isIdle()`、`isProjectTrusted()`、`compact()`、`getContextUsage()`、`getSystemPrompt()`、`shutdown()` 等。

命令上下文 `ExtensionCommandContext` 额外有：`waitForIdle`、`newSession`、`fork`、`navigateTree`、`switchSession`、`reload`。

---

## 5. 如何编写外部扩展

### 5.1 放置位置

| 位置 | 作用域 | 热重载 |
|---|---|---|
| `~/.pi/agent/extensions/*.ts`（或 `*/index.ts`） | 全局 | `/reload` 支持 |
| `.pi/extensions/*.ts`（或 `*/index.ts`） | 项目本地（需项目被信任） | `/reload` 支持 |
| `pi -e ./path.ts` | 临时测试 | 不支持 |

settings.json 里也可配置：

```json
{
  "packages": ["npm:@foo/bar@1.0.0", "git:github.com/user/repo@v1"],
  "extensions": ["/path/to/extension.ts", "/path/to/extension/dir"]
}
```

### 5.2 最小完整示例

```typescript
// ~/.pi/agent/extensions/my-extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  // 权限门：危险命令先确认
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // 注册 LLM 可调用的工具
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_toolCallId, params) {
      return { content: [{ type: "text", text: `Hello, ${params.name}!` }], details: {} };
    },
  });

  // 注册斜杠命令
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => ctx.ui.notify(`Hello ${args || "world"}!`, "info"),
  });
}
```

测试：`pi -e ./my-extension.ts`

### 5.3 三种组织形态

1. **单文件** — 小扩展直接一个 `.ts`
2. **目录 + index.ts** — 多文件扩展
3. **带 package.json 的包** — 需要 npm 依赖时：

```json
{
  "name": "my-extension",
  "dependencies": { "zod": "^3.0.0" },
  "pi": { "extensions": ["./src/index.ts"] }
}
```

目录里 `npm install` 后 `node_modules/` 的 import 自动可用。

### 5.4 可用的 import

| 包 | 用途 |
|---|---|
| `@earendil-works/pi-coding-agent` | 扩展类型（ExtensionAPI、事件等） |
| `typebox` | 工具参数 schema |
| `@earendil-works/pi-ai` | AI 工具（StringEnum 等） |
| `@earendil-works/pi-tui` | TUI 组件 |
| Node 内置（`node:fs` 等） | 正常可用 |

### 5.5 常见模式

- **状态持久化**：`pi.appendEntry("my-ext:state", data)` 写入 session 文件（不进 LLM 上下文），`session_start` 时从 `ctx.sessionManager` 读回
- **动态资源**：`resources_discover` 返回 `{ skillPaths, promptPaths, themePaths }`
- **注册 Provider**：`pi.registerProvider("name", { baseUrl, apiKey: "$ENV_VAR", api, models, oauth? })`；async 工厂里可先 fetch 模型列表再注册
- **自定义渲染**：`registerMessageRenderer` / `registerEntryRenderer` / `registerMarkdownTransformer`
- **后台资源**：不要在工厂函数里启动（工厂可能在无 session 的调用里运行）；推迟到 `session_start` 或命令/事件里，并在 `session_shutdown` 里清理
- **注意 stale ctx**：`newSession/fork/switchSession/reload` 后旧的 `pi`/`ctx` 失效，再调用会抛错；后续工作放进 `withSession` 回调

### 5.6 参考示例

官方在 `packages/coding-agent/examples/extensions/` 提供了 70+ 个可运行示例，包括：权限门（`permission-gate.ts`、`confirm-destructive.ts`）、路径保护（`protected-paths.ts`）、git 检查点（`git-checkpoint.ts`）、自定义压缩（`custom-compaction.ts`）、自定义 provider（`custom-provider-anthropic/`）、系统提示定制（`system-prompt-header.ts`）、todo 工具（`todo.ts`）、子代理（`subagent/`）等。

完整清单见 `packages/coding-agent/examples/extensions/README.md`。

#### 如何使用这些示例（4 种方式，按临时 → 永久排列）

**1. `-e` 临时加载（最快，适合试用）**

```bash
# 在 pi 仓库内（路径相对于仓库根）
pi -e packages/coding-agent/examples/extensions/permission-gate.ts

# 仓库外用绝对路径
pi -e /path/to/pi/packages/coding-agent/examples/extensions/snake.ts
```

退出即失效，不污染配置。目录型示例（`plan-mode/`、`subagent/` 等）指向其目录或 `index.ts` 均可。

**2. 复制到扩展目录（自动发现 + `/reload` 热重载）**

```bash
# 全局（所有项目生效）
cp packages/coding-agent/examples/extensions/todo.ts ~/.pi/agent/extensions/

# 或项目本地（仅当前项目，需项目已信任）
mkdir -p .pi/extensions
cp packages/coding-agent/examples/extensions/todo.ts .pi/extensions/
```

**3. 软链接（跟踪仓库更新）**

```bash
ln -s /path/to/pi/packages/coding-agent/examples/extensions/todo.ts ~/.pi/agent/extensions/todo.ts
```

**4. settings.json 持久配置**

```json
{
  "extensions": [
    "/path/to/pi/packages/coding-agent/examples/extensions/permission-gate.ts"
  ]
}
```

**注意事项**：

- 部分示例有额外依赖或前提：`with-deps/` 需先在其目录 `npm install`；`sandbox/`、`gondolin/` 依赖外部运行时；`custom-provider-*` 需要 API 凭证
- 示例从源码直接跑（jiti 免编译），直接引用仓库里的路径即可，无需构建
- 建议流程：先 `pi -e <路径>` 试用，满意后再复制/链接到 `~/.pi/agent/extensions/`

---

## 6. 关键源码索引

| 文件 | 职责 |
|---|---|
| `packages/coding-agent/src/core/extensions/types.ts` | ExtensionAPI / 40 个事件类型 / Handler 定义 |
| `packages/coding-agent/src/core/extensions/loader.ts` | jiti 加载、路径发现、ExtensionAPI 包装、commit/discard |
| `packages/coding-agent/src/core/extensions/runner.ts` | ExtensionRunner：事件分发、管道/短路语义、bindCore、命令/快捷键冲突处理 |
| `packages/coding-agent/src/extensions/index.ts` | 内置扩展清单（llama.cpp） |
| `packages/coding-agent/docs/extensions.md` | 官方完整文档（3000 行） |
