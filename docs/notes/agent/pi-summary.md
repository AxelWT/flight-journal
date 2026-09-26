# Pi 项目架构与原理总结

> 本文档对 [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) 仓库(版本 0.80.10,作者 Mario Zechner,MIT 许可)的整体架构与运行原理进行系统性梳理。目标读者是希望理解 Pi 内部实现的工程师。

## 1. 项目定位与设计哲学

Pi 是一套 **AI 编程代理 harness 套件**,核心是一个**可自扩展的编码代理**(self-extensible coding agent)。所谓 "harness" 指它提供的是承载 LLM agent 运行的脚手架——模型提供商抽象、agent 循环、工具调用、会话状态、终端 UI——而具体的 LLM、工具、技能、主题、键位都以扩展形式接入。

设计哲学在 `CONTRIBUTING.md:7-12` 中明确表述:

> **pi's core is minimal**. If your feature does not belong in the core, it should be an extension. PRs that bloat the core will likely be rejected.

围绕这一原则,项目呈现出几个鲜明的工程取向:

- **分层不耦合**: 从 LLM API(`pi-ai`)到 agent 运行时(`pi-agent-core`)再到 CLI(`pi-coding-agent`)三层之间通过纯接口契约对接,上层不依赖下层的具体实现,下层不知道上层的存在。
- **类型即文档**: 大量使用 TypeBox schema 定义工具参数与可序列化状态,既能在运行时校验,又能生成 JSON Schema 供 LLM 调用。
- **失败不抛错**: LLM 流式调用、文件系统、shell 操作的失败被编码进事件或 `Result<T, E>` 返回值,而非抛异常,保证 agent 循环不会被意外打断。
- **三运行时兼容**: 同一份 TypeScript 源码同时跑在 Node.js、Bun 编译二进制、浏览器三种环境,通过 side-effect-free entrypoint 和 bundler-opaque 动态导入实现。
- **供应链加固**: 依赖精确版本锁定、`--ignore-scripts`、shrinkwrap、npm trusted publishing(OIDC)、pre-commit 锁文件守卫(见 `README.md:62-74`)。

## 2. Monorepo 总览

仓库根 `package.json:5-13` 声明 npm workspaces,包含 6 个核心包及若干扩展示例:

```
packages/
├── ai/              # pi-ai:多提供商 LLM 统一 API
├── agent/           # pi-agent-core:agent 运行时
├── coding-agent/    # pi-coding-agent:交互式 CLI
├── tui/             # pi-tui:终端 UI 框架
├── server/          # pi-server:实验性 RPC 监督器
└── storage/
    └── sqlite-node/ # pi-storage-sqlite-node:SQLite 会话后端
```

### 包依赖关系

```
pi-tui
   ↑
pi-ai ←── pi-agent-core ←── pi-coding-agent ←── pi-server
              ↑
              └──── pi-storage-sqlite-node
```

依赖方向单向向上,没有任何反向引用。`pi-coding-agent` 是最终的应用层,聚合所有底层能力;`pi-server` 是可选的监督进程,通过 spawn `pi --mode rpc` 子进程工作,不在编译期依赖 coding-agent 之外的内部接口。

### 构建与校验流水线

- `npm run build`: 按 `tui → ai → agent → storage/sqlite-node → coding-agent → server` 顺序逐包构建(见 `package.json:16`)。
- `npm run check`: biome lint+format、pinned deps 校验、TS 相对导入校验、shrinkwrap 校验、`tsgo --noEmit` 类型检查(见 `package.json:18`)。代码改动后必须跑此命令。
- `./test.sh`: 运行所有非 e2e 测试(避免触发需要真实 API key 的 e2e)。
- 发布流程: `release:patch`/`release:minor` 脚本统一 bump 所有包版本(锁步版本)、更新 CHANGELOG、打 tag、推送后由 CI 通过 OIDC trusted publishing 发布到 npm(见 `AGENTS.md:120-158`)。

## 3. `pi-ai` 层:多提供商 LLM 统一 API

`packages/ai` 是整个系统的 LLM 抽象基座。README(`packages/ai/README.md:1-5`)将其定位为:"统一 LLM API,提供 provider 集合、自动鉴权、token 与成本追踪、跨模型上下文交接"。只收录支持工具调用的模型,天生为 agentic 工作流设计。

### 核心抽象

三组核心类型定义在 `packages/ai/src/types.ts`:

- **`Model<TApi>`** (`types.ts:710-735`): 纯数据对象,描述一个可调用的模型——`id`、`name`、`api`(wire 协议标识)、`provider`、`baseUrl`、`reasoning`(是否支持 thinking)、`input`(text/image)、`cost`(含分档定价)、`contextWindow`、`maxTokens`,以及一个条件类型字段 `compat`,其具体形状由 `api` 决定(如 `OpenAICompletionsCompat` 有 10 种 thinking 格式开关)。
- **`Provider<TApi>`** (`packages/ai/src/models.ts:75-120`): 提供商抽象。必含 `auth: ProviderAuth`(至少 `apiKey` 或 `oauth` 之一)、`getModels()`(同步返回静态目录)、可选 `refreshModels()`(动态目录)、可选 `filterModels()`(按凭证过滤,如 GitHub Copilot 按订阅过滤可见模型)、`stream()`/`streamSimple()`。
- **`Models`** (`models.ts:127-187`): 集合层。同步方法 `getProviders()`/`getModels()`/`getModel()` 读最近已知目录;异步 `refresh()` 并发刷新所有动态 provider 并持久化;`stream()`/`complete()` 委托给 provider,但在外层包了 `lazyStream` 以**同步返回流、异步解析鉴权**——鉴权失败变成流上的 `error` 事件而非抛错。

`createModels(options?)` (`models.ts:529-531`) 是入口工厂;`createProvider<TApi>(input)` (`models.ts:556-623`) 是通用 provider 工厂,支持单 API 或多 API 分派(后者用于 GitHub Copilot、xAI、Fireworks 等混合协议 provider)。

### 支持的 provider 与协议

内置 **38 个 provider**,在 `packages/ai/src/providers/all.ts:86-126` 注册。涵盖 OpenAI、Anthropic、Google(Gemini + Vertex)、Amazon Bedrock、Mistral、OpenRouter、xAI、DeepSeek、Groq、Cerebras、Cloudflare、Azure、Vercel、Together、Fireworks、HuggingFace、Kimi、MiniMax、Moonshot、Qwen、Xiaomi、OpenCode、Radius 等,以及通过 `createProvider()` 接入任意 OpenAI 兼容服务器(Ollama、vLLM、LM Studio)。

背后是 **10 种 wire 协议**(`types.ts:16-32` 的 `KnownApi` 联合类型):`openai-completions`、`openai-responses`、`azure-openai-responses`、`openai-codex-responses`、`anthropic-messages`、`google-generative-ai`、`google-vertex`、`mistral-conversations`、`bedrock-converse-stream`、`pi-messages`(Pi 自有的 Radius 网关协议)。每个协议在 `packages/ai/src/api/<id>.ts` 实现一个 `stream`/`streamSimple` 模块,通过 `lazyApi(() => import("./<id>.ts"))` 延迟加载,使浏览器打包能 tree-shake 掉 Node-only 代码(如 Bedrock 的 AWS SDK)。

### 统一事件流协议

所有 API 实现都输出同一套 `AssistantMessageEvent`(`types.ts:468-480`),共 **12 种事件类型**:`start`、`text_start/delta/end`、`thinking_start/delta/end`、`toolcall_start/delta/end`、`done`、`error`。每个 delta/end 事件携带 `partial: AssistantMessage` 供 UI 渐进更新,`contentIndex` 用于关联同一块内的多个事件。流式工具调用参数通过 `parseStreamingJson`(`utils/json-parse.ts`)增量解析。

失败**永远不会从 stream 函数抛出**,而是发出 `error` 事件,最终 `AssistantMessage` 携带 `stopReason: "error" | "aborted"` 和 `errorMessage`。这一约定是 agent 循环稳定性的基石。

### 鉴权

`ProviderAuth = { apiKey?: ApiKeyAuth; oauth?: OAuthAuth }`(`packages/ai/src/auth/types.ts:217-220`)。每个 provider 必须声明 auth——即使是无需 key 的本地服务器也要提供 `apiKey`,其 `resolve()` 返回是否已配置。

- **`ApiKeyAuth`**: 标准 helper `envApiKeyAuth(name, envVars)`(`auth/helpers.ts:9-27`),存储凭证优先于环境变量。
- **`OAuthAuth`**: 通过 `lazyOAuth({ name, load })`(`auth/helpers.ts:36-49`)包装动态导入的 OAuth flow,避免把 PKCE、回调服务器等 Node-only 代码拉进浏览器包。内置 flow 模块在 `src/auth/oauth/`:`anthropic.ts`、`github-copilot.ts`、`openai-codex.ts`、`xai.ts`、`radius.ts`。
- **`CredentialStore`**(`auth/types.ts:60-88`): 每 provider 一个类型标签凭证,`modify` 是唯一写路径且串行化。默认 `InMemoryCredentialStore`,应用注入持久存储。
- **`resolveProviderAuth`**(`auth/resolve.ts:37-69`): 存储凭证拥有 provider;OAuth 刷新用双重检查锁,有效 token 零锁开销。

### 跨 provider context handoff

`packages/ai/src/api/transform-messages.ts:64-223` 在跨 provider 重放历史时执行变换:对非视觉模型把图片降级为占位符;规范化跨 provider 的工具调用 ID(OpenAI Responses 的 450+ 字符 ID → Anthropic 的 `^[a-zA-Z0-9_-]+$` 最长 64 字符);把 foreign assistant 的 thinking 块转成 `<thinking>` 标签文本(同模型同 API 时保留签名以复用缓存);跳过 errored/aborted 消息;为孤立的 tool call 合成错误结果。这让用户可以在会话中途切换模型而不破坏上下文。

### 模型目录生成

静态目录由 `packages/ai/scripts/generate-models.ts`(2600 行)生成,数据源包括 models.dev、OpenRouter、NVIDIA NIM、Vercel AI Gateway 及各 provider 端点。聚合器 `src/models.generated.ts:42-80` 把 38 个 provider 映射到各自的 `<id>.models.ts` shard,后者从 `src/providers/data/<id>.json` 导入 JSON 数据并断言为带字面量类型的 `Model` 记录以支持 IDE 自动补全。`npm run build:offline` 复用已生成数据离线构建。`AGENTS.md:24` 禁止手改 `models.generated.ts`,必须改 `generate-models.ts` 后重新生成。

### 其他特性

- **Thinking/Reasoning**: 统一的 `reasoning: "minimal" | "low" | "medium" | "high" | "xhigh" | "max"` 入参,`getSupportedThinkingLevels(model)`(`models.ts:663-672`)读 `model.thinkingLevelMap`,`clampThinkingLevel` 钳到最近支持档位。各 API 有细粒度选项(Anthropic 的 `effort`/`interleavedThinking`、OpenAI Responses 的 `reasoningEffort`、Google 的 `thinking.budgetTokens` 等)。
- **Prompt caching**: `cacheRetention: "none" | "short" | "long"` 按 provider 映射;`sessionId` 用于会话级缓存(OpenAI Codex 据此复用 WebSocket)。
- **Deferred tools**: 工具结果可携带 `addedToolNames` 动态扩展可用工具集;Anthropic 通过 `tool_reference` 块支持,OpenAI Completions 通过 `compat.deferredToolsMode: "kimi"` 支持。
- **图片生成**: 独立 API 面 `ImagesModels`,目前注册了 `openrouter-images`,目录由 `generate-image-models.ts` 生成。
- **Faux provider**: `src/providers/faux.ts`(538 行)内存中脚本化 provider,被 coding-agent 测试套件使用(`AGENTS.md:32` 要求)。
- **Context overflow 检测**: `utils/overflow.ts` 匹配 20+ provider 特定错误模式(包括 Xiaomi 静默截断)。

## 4. `pi-agent-core` 层:agent 运行时

`packages/agent` 提供三层递进的抽象,从纯函数流到有状态编排。README(`packages/agent/README.md:3`)定位:"带工具执行与事件流的有状态 agent,构建于 `pi-ai` 之上"。

### 三层架构

1. **`agentLoop` / `agentLoopContinue`** (`packages/agent/src/agent-loop.ts:30-92`): 纯函数流式循环,输入 `AgentMessage[]` 与 `AgentLoopConfig`,输出 `EventStream<AgentEvent, AgentMessage[]>`。不持有任何状态,所有状态由调用方提供。`agentLoop` 接受新 prompt,`agentLoopContinue` 从已有消息续跑。

2. **`Agent` 类** (`src/agent.ts:170-574`): 有状态包装,持有 `_state: MutableAgentState`(systemPrompt、model、thinkingLevel、tools、messages、isStreaming 等)。`prompt()`/`continue()`/`steer()`/`followUp()`/`abort()` 是公开 API。事件通过 `subscribe(listener)` 分发,每个事件在所有监听器间按注册顺序 await。`PendingMessageQueue`(`agent.ts:122-156`)支持 `"all"` 或 `"one-at-a-time"` 两种排空模式。

3. **`AgentHarness` 类** (`src/harness/agent-harness.ts:165-1038`,1038 行): 编排层,在 `Agent` 之上加会话持久化、运行时配置、资源(skills/prompt templates)、压缩、树导航、hook 系统。`docs/agent-harness.md:38-93` 把状态分成四类: harness config(随时可改)、turn snapshot(单轮快照)、session(已持久化条目)、pending session writes(忙时排队,在 save point flush)。

### Agent 循环原理

`runLoop`(`agent-loop.ts:154-274`)是一个双层 `while`:

- **外层**: 在 agent 本应停止后,排空 `getFollowUpMessages()` 队列继续。
- **内层**: 排空 steering 消息,在 assistant 持续发出 tool call 时循环。

每轮(turn)流程:

1. 发 `turn_start` 事件。
2. 为待处理 steering 消息发 `message_start`/`message_end`。
3. `streamAssistantResponse`(`agent-loop.ts:280-371`): 依次应用 `transformContext` → `convertToLlm`(AgentMessage → LLM Message) → 构建 `Context` → 解析 API key → 调用 `streamFunction` → 把 `AssistantMessageEvent` 转成 `message_start`/`message_update`/`message_end`。
4. `stopReason` 为 `error`/`aborted` → 发 `turn_end` + `agent_end` 返回。
5. `stopReason` 为 `length` → `failToolCallsFromTruncatedMessage`(`agent-loop.ts:380-405`),不执行可能被截断参数的 tool call。
6. 否则 `executeToolCalls`(`agent-loop.ts:410-425`): 按 `config.toolExecution` 与单工具 `executionMode` 决定顺序或并行。
7. 发 `turn_end`。
8. 调 `prepareNextTurn`(可在轮间换 context/model/thinking)。
9. `shouldStopAfterTurn` 为真 → `agent_end` 返回。
10. 轮询 `getSteeringMessages`,回到步骤 2。

### 工具调用机制

`AgentTool<TParameters, TDetails>`(`src/types.ts:380-403`)扩展 `pi-ai` 的 `Tool<TParameters>`(提供 `name`/`description`/`parameters` TypeBox schema),增加:

- `label`: UI 展示名
- `prepareArguments`: 可选的原始参数预处理
- `execute(toolCallId, params, signal, onUpdate)`: 返回 `AgentToolResult<TDetails>`,包含 `content`、`details`、可选 `usage`、可选 `addedToolNames`(从此 transcript 点起动态加入新工具)、可选 `terminate`(批量内全部 terminate 才提前结束循环)
- `executionMode: "sequential" | "parallel"`: 单工具级覆盖;批量中任一为 sequential 则整批顺序执行

执行流程(`agent-loop.ts:599-753`):

1. `prepareToolCall`: 按名查工具(缺失立即返回错误结果) → `prepareArguments` → `validateToolArguments`(TypeBox 校验) → `beforeToolCall` hook 返回 `{block: true, reason}` 则取消执行并发错误结果。
2. 执行 `execute`,期间 `onUpdate` 回调触发 `tool_execution_update` 事件;promise settle 后调用被忽略。
3. `finalizeExecutedToolCall`: 调 `afterToolCall` hook,返回的 `AfterToolCallResult`(`types.ts:79-90`)可逐字段覆盖 `content`/`details`/`usage`/`terminate`/`isError`。

并行模式(`agent-loop.ts:488-553`)先顺序 `prepare` 每个 tool call 得到 thunk,再 `Promise.all` 并发 await;`tool_execution_end` 按完成顺序发,但 toolResult 消息事件按 assistant 源顺序发——这一约定见 `README.md:113-118`。

### 会话状态与持久化

`AgentState`(`types.ts:327-352`)是内存状态。持久化只存在于 `AgentHarness` 层,基于**会话树**模型。

`SessionTreeEntry`(`src/harness/types.ts:420-431`)是一个联合类型,涵盖 11 种条目:`message`、`thinking_level_change`、`model_change`、`active_tools_change`、`compaction`、`branch_summary`、`custom`、`custom_message`、`label`、`session_info`、`leaf`。所有条目 **append-only**,带 `id`/`parentId`/`timestamp`。`LeafEntry`(`types.ts:415-418`)是当前叶子的持久化标记——切换分支通过 `setLeafId` 追加一个新 `leaf` 条目而非修改游标,保证了树的可回溯。

`Session` 类(`src/harness/session/session.ts:150-359`)包装 `SessionStorage<TMetadata>`,提供类型化 appender:`appendMessage`、`appendModelChange`、`appendThinkingLevelChange`、`appendCompaction`、`moveTo`(切换分支并可选追加 branch summary)等。`buildContext`(`session.ts:188-200`)从叶子向根(或第一个 compaction)回溯,应用默认 compaction 变换,投影成 `AgentMessage[]`。

### 存储后端契约

`SessionStorage<TMetadata>`(`types.ts:465-481`)和 `SessionRepo<TMetadata>`(`types.ts:495-505`)是两个核心接口。Repo 负责 create/open/list/delete/fork 整个会话生命周期,Storage 负责单会话内的条目读写。

包内自带三个实现(`src/harness/session/`):

- **`JsonlSessionStorage` + `JsonlSessionRepo`**: 生产默认。append-only JSONL 文件,路径 `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<uuid>.jsonl`。头部行声明 session 版本与元数据,每条目一行 JSON。内存缓存 `entries`/`byId`/`labelsById`。
- **`InMemorySessionStorage` + `InMemorySessionRepo`**: 测试与临时会话用。
- SQLite 后端独立成包 `@earendil-works/pi-storage-sqlite-node`(见第 7 节)。

### 自动压缩与分支摘要

`DEFAULT_COMPACTION_SETTINGS`(`compaction/compaction.ts:146-150`): `enabled: true`、`reserveTokens: 16384`、`keepRecentTokens: 20000`。`shouldCompact`(`compaction.ts:235-238`)在 `contextTokens > contextWindow - reserveTokens` 时触发。`compact`(`compaction.ts:696-781`)与 `prepareCompaction`(`compaction.ts:603-676`)把旧历史总结成一个 `CompactionEntry`(带 `firstKeptEntryId` 与可选 `retainedTail`),默认 context 变换把压缩点之前的路径替换为 `[compaction, ...retainedTail]`。

`generateBranchSummary`(`compaction/branch-summarization.ts:199-258`)在导航离开被放弃的分支时生成摘要。`AgentHarness.navigateTree`(`agent-harness.ts:747-836`)处理用户侧的树导航操作,触发 `session_before_tree`/`session_tree` hook。

### Skills 与 Prompt Templates

- **Skills**(`src/harness/skills.ts`): 从 `SKILL.md` 文件加载,解析 YAML frontmatter;`formatSkillInvocation` 生成系统提示词片段。`loadSkills`/`loadSourcedSkills`(`skills.ts:49-75`、`233-279`)支持项目与全局发现,`ignore` 库做 gitignore 过滤。
- **Prompt Templates**(`src/harness/prompt-templates.ts`): Markdown 片段,通过 `/name` 展开;`substituteArgs`(`prompt-templates.ts:249-262`)支持 `$1`、`$@`、`$ARGUMENTS`、`${@:N}`、`${@:N:L}` 参数替换。

### Proxy stream

`streamProxy`(`src/proxy.ts:116-233`)是替代 `StreamFn` 的实现,把 `{model, context, options}` POST 到 `${proxyUrl}/api/stream`(Bearer 鉴权),解析 SSE 事件重建 `AssistantMessage`。用于把 LLM 调用代理到远端后端的场景(如 Radius 网关)。

### 不在本包中的能力

`pi-agent-core` **故意不提供**: MCP 客户端/服务端、子 agent 编排、OS 级沙箱、内置权限提示、内置 model provider。这些留给 `pi-ai`(provider)或应用层(coding-agent)实现。`docs/durable-harness.md:17-18` 明确:"工具注册表是运行时依赖,harness 应持久化可序列化的工具配置(如活跃工具名),而非具体工具实现"。权限通过 `beforeToolCall` hook 拦截,沙箱通过自定义 `ExecutionEnv` 实现。

## 5. `pi-coding-agent` 层:交互式编码代理 CLI

`packages/coding-agent` 是最终的应用层,产物是 `pi` 二进制。在 `pi-agent-core` 与 `pi-ai` 之上构建交互式 REPL、内建工具、扩展系统、会话管理、自更新等完整体验。

### 入口与模式分派

进程入口 `src/cli.ts:10-20` 设置 `process.title`、`PI_CODING_AGENT=true` 环境变量,调用 `main()`。`main(args, options?)` 在 `src/main.ts:473`:

1. 包管理命令(`pi install/remove/update/list`)→ `handlePackageCommand()`
2. 配置命令 → `handleConfigCommand()`
3. 参数解析(`cli/` 下的解析器)
4. version/export/help/list-models 短路
5. **模式解析**(`main.ts:100-111`): `interactive`(TTY 默认)、`print`(非交互)、`json`、`rpc`
6. 会话创建(`main.ts:578`,支持 resume/fork/continue/ephemeral)
7. 运行时工厂(`main.ts:615-739`)
8. 模式分派(`main.ts:815-862`): `runRpcMode()` / `InteractiveMode` / `runPrintMode()`

公开 API `src/index.ts`(401 行)导出 `createAgentSession()`、`AgentSession` 类型与辅助函数,供 SDK 编程使用。13 个 SDK 示例在 `examples/sdk/`。

### AgentSession 与运行时

`AgentSession`(`core/agent-session.ts:286`,3270 行)是主会话管理类。`AgentSessionRuntime`(`core/agent-session-runtime.ts:74`)拥有 session 与 services,处理会话替换。`createAgentSession()`(`core/sdk.ts:164`)是工厂函数,接受 cwd/model/tools/session/settings/resources 选项。

与 `pi-agent-core` 的对接在 `core/sdk.ts:289-355`:

- `streamFunction` 包装 `modelRuntime.streamSimple()`
- `convertToLlm` 处理图片阻断(`sdk.ts:251-285`)
- `transformContext` 用于扩展 context 事件
- 设置项 `steeringMode`、`followUpMode`、`transport`、`thinkingBudgets` 注入

### 内建工具

7 个工具在 `core/tools/index.ts:83` 定义为 `ToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls"`。每个工具有 `createXToolDefinition()`(返回 `ToolDefinition`)和 `createXTool()`(返回 `AgentTool`)。

- **默认激活集**: `["read", "bash", "edit", "write"]`(`core/sdk.ts:240`)
- **只读集**: read, grep, find, ls(`tools/index.ts:177-184`)
- **bash**(`core/tools/bash.ts`): 执行命令、流式输出、超时、输出截断。定义 `BashOperations` 接口支持自定义后端(如 SSH),`createLocalBashOperations()`(`bash.ts:82-148`)是本地实现。
- **edit/write**: 通过 `withFileMutationQueue()`(`tools/index.ts:20`)串行化,避免文件写竞争。

工具声明 `executionMode: "sequential" | "parallel"`(见 `extensions/types.ts:466`)。

### 扩展系统

扩展是 TypeScript/JS 模块,导出默认工厂 `ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`(`extensions/types.ts:1482`)。`ExtensionAPI`(`extensions/types.ts:1172-1407`)暴露 `on()` 事件订阅、`registerTool()`、`registerCommand()`、`registerShortcut()`、`registerFlag()`、消息/条目渲染器、provider 注册、session actions。

**28 类事件**(`extensions/types.ts:1023-1048`): `project_trust`、`resources_discover`、`session_*`(start/switch/fork/compact/tree/shutdown)、`context`、`before_provider_request`/`headers`、`after_provider_response`、`agent_start`/`end`/`settled`、`turn_*`、`message_*`、`tool_execution_*`、`tool_call`、`tool_result`、`input`、`user_bash`。

扩展加载器(`extensions/loader.ts`)用 jiti 加载 TS/JS,为 Bun 二进制打包虚拟模块,为 Node.js 做 alias。发现路径: `.pi/extensions/`(项目)、`~/.pi/agent/extensions/`(全局)、`package.json` 的 `pi.extensions` manifest。`ExtensionRunner`(`extensions/runner.ts`)管理生命周期、绑定 core action、事件发射。

内建扩展: llama.cpp provider(`extensions/llama/`)。`examples/extensions/` 下有 79 个示例(hello、tools、permission-gate、git-checkpoint、ssh、plan-mode、sandbox、gondolin 等)。完整文档在 `docs/extensions.md`(2953 行)。

### 信任与权限模型

**项目信任**(`core/trust-manager.ts`): 信任文件 `~/.pi/agent/trust.json`。需信任才能加载的资源: `.pi/settings.json`、extensions、skills、prompts、themes、`SYSTEM.md`、`APPEND_SYSTEM.md`(`trust-manager.ts:29-37`)。`resolveProjectTrusted()` 支持 `--approve`/`-na` CLI 覆盖、`defaultProjectTrust` 设置(`"ask"`/`"always"`/`"never"`),父目录信任继承。

**工具拦截**: 扩展可通过 `tool_call` 事件返回 `{block: true, reason}` 阻止工具执行(见 `examples/extensions/permission-gate.ts`)。沙箱示例在 `examples/extensions/sandbox/`。

`README.md:37-46` 明确: Pi 不内置权限系统,默认以启动用户权限运行;需要更强隔离时容器化或沙箱化,文档给出三种模式(Gondolin 微 VM、Plain Docker、OpenShell)。

### 交互式特性

`InteractiveMode`(`modes/interactive/interactive-mode.ts`,5996 行)是基于 `pi-tui` 的完整 TUI。

- **Slash 命令**(`core/slash-commands.ts:19-42`): 22 个内建(`/settings`、`/model`、`/export`、`/share`、`/copy`、`/name`、`/session`、`/changelog`、`/hotkeys`、`/fork`、`/clone`、`/tree`、`/trust`、`/login`、`/logout`、`/new`、`/compact`、`/resume`、`/reload`、`/quit` 等)。
- **键位**(`core/keybindings.ts:64-120`): `KEYBINDINGS` 对象含 `app.*` 与 `tui.*` 动作,可通过 `~/.pi/agent/keybindings.json` 自定义。
- **REPL 特性**: bash 模式(`!` 前缀)、消息队列(steer/followUp)、自动补全(slash 命令 + 文件路径)、多行编辑器、Ctrl+G 调外部编辑器。
- **Hook**: 扩展可拦截 `tool_call`、`tool_result`、`user_bash`、input 变换、context 修改、`before_provider_request`/`headers`。

### 配置系统

- 配置目录: `.pi`(项目)/`~/.pi/agent/`(全局)(`src/config.ts:491,515-521`)。
- 设置(`core/settings-manager.ts`,1234 行): JSON 文件,深合并 project 覆盖 global。键含 provider、model、thinking、theme、compaction、retry、packages、extensions、skills、prompts、themes、terminal、images、keybindings 等。`proper-lockfile` 做文件锁。
- 主题(`modes/interactive/theme/`): JSON 文件,内建 `dark.json`/`light.json`,schema 校验,自定义主题从 `~/.pi/agent/themes/`。
- 上下文文件: `AGENTS.md`、`CLAUDE.md` 从 cwd 向上发现(`core/resource-loader.ts:67-83`)。

### 会话日志与恢复

`SessionManager`(`core/session-manager.ts`,1712 行)管理 JSONL 会话,路径 `~/.pi/agent/sessions/--<cwd-path>--/<timestamp>_<uuid>.jsonl`。v3 格式用 `id`/`parentId` 链接成树(`session-manager.ts:30`,`CURRENT_SESSION_VERSION = 3`)。

恢复选项: `--continue`/`-c`(最近)、`--resume`/`-r`(选择器)、`--session <path|id>`、`--fork <path|id>`、`--session-id <id>`、`--no-session`(临时)、`--name`/`-n`。迁移: v1→v2(树结构)、v2→v3(hookMessage→custom role)(`session-manager.ts:230-291`)。

### RPC/Server 模式

入口 `pi --mode rpc` 或 `pi-rpc-entry`(`src/rpc-entry.ts`)。协议是 stdin/stdout 上的 JSONL,LF 分隔。实现在 `modes/rpc/rpc-mode.ts`(800 行),文档 `docs/rpc.md`(1526 行)。

命令集(`modes/rpc/rpc-types.ts:20-73`): `prompt`、`steer`、`follow_up`、`abort`、`new_session`、`get_state`、`set_model`、`cycle_model`、`get_available_models`、`set_thinking_level`、`compact`、`bash`、`get_session_stats`、`export_html`、`switch_session`、`fork`、`clone`、`get_tree`、`get_messages` 等。

事件: `agent_start`/`end`/`settled`、`turn_*`、`message_*`、`tool_execution_*`、`queue_update`、`compaction_*`、`auto_retry_*`、`extension_error`。扩展 UI 子协议: dialog 方法(`select`/`confirm`/`input`/`editor`)有请求/响应,fire-and-forget 方法(`notify`/`setStatus`/`setWidget`/`setTitle`/`set_editor_text`)。`RpcClient`(`modes/rpc/rpc-client.ts`)供 TS 客户端使用。

### 自更新

`pi update`(`src/package-manager-cli.ts`): 目标 `--self`(默认)、`--extensions`、`--models`、`--all`、`--extension <source>`。安装方式检测(`config.ts:73-94`): `bun-binary`、`npm`、`pnpm`、`yarn`、`bun`、`unknown`。自更新命令(`config.ts:115-187`)按方式分派(如 `npm install -g`),含包名变更时的卸载步骤。路径可写性检查(`config.ts:293-302`)、全局包管理器检查(`config.ts:304-313`)、Windows 原生依赖隔离(`utils/windows-self-update.ts`)。

## 6. `pi-tui` 层:差分渲染终端 UI 框架

`packages/tui`(`package.json:1-3`)是带**差分渲染**与**同步输出**的终端 UI 框架,为 coding-agent 交互模式提供无闪烁渲染。依赖极简(`get-east-asian-width`、`marked`)。

### 核心抽象

整个 UI 模型是 `Component` 对象组成的树(`src/tui.ts:64-88`):

```typescript
interface Component {
  render(width: number): string[];   // 返回行数组,每行可见宽度 ≤ width
  handleInput?(data: string): void;  // 聚焦时调用
  wantsKeyRelease?: boolean;          // 是否接收 Kitty key-release
  invalidate(): void;                 // 清缓存
}
```

没有虚拟 DOM,没有元素类型协调。"树"通过组合实现: `Container`(`tui.ts:256-290`)持 `children: Component[]`,`render()` 顺序拼接子组件行。`TUI extends Container`(`tui.ts:295`)是根容器,增加 terminal 句柄、上一帧缓冲、聚焦组件、overlay 栈、渲染调度、焦点/IME 管理。

`Focusable`(`tui.ts:104-112`)接口: 聚焦时组件在渲染输出中发射 `CURSOR_MARKER`(`"\x1b_pi:c\x07"`, `tui.ts:120`),TUI 扫描该标记、剥离、并把硬件光标定位到该处,用于 IME 候选窗对齐(`tui.ts:1236-1254, 1629-1660`)。

渲染契约: 每个 `render(width)` 返回的行可见宽度必须 ≤ width,否则 TUI 崩溃(`tui.ts:1521-1549`),写崩溃日志到 `~/.pi/agent/pi-crash.log` 并抛错。

### 差分渲染算法

核心在 `TUI.doRender()`(`tui.ts:1256-1622`)。三策略(见 `README.md:593-599`):

1. **首帧**: `previousLines.length === 0` 且无 resize → `fullRender(false)`,不清屏直接输出全部。
2. **宽高变化**: width 变 → 总是 `fullRender(true)`(换行影响每行);height 变 → `fullRender(true)`,Termux 除外(键盘弹出/收起导致 height 变化会重放历史)。
3. **缩容**: `clearOnShrink` 开启且 `newLines.length < maxLinesRendered` 且无 overlay → `fullRender(true)` 清孤立行。
4. **常规差分**: 找首尾变化行,只重绘该范围。

`fullRender(clear)`(`tui.ts:1286-1327`)用 CSI 2026 同步输出包裹:`"\x1b[?2026h"` ... `"\x1b[?2026l"`。若 `clear`,先删所有 Kitty 图、发 `"\x1b[2J\x1b[H\x1b[3J"`。

差分更新(`tui.ts:1370-1622`)逐行字符串比较找 `firstChanged`/`lastChanged`,处理边界: 追加行、Kitty 图块范围扩展(`tui.ts:1140-1161`,确保覆盖多行图)、无变化仅重定位光标、纯删除(移到末尾清行再回退)、变化在视口上方则回退 `fullRender(true)`、追加滚动(用 `\r\n` 滚屏)。写入缓冲统一用 `"\x1b[?2026h"` 包裹,变化行用 `\x1b[2K` 清行后写内容。

每行非图行经 `normalizeTerminalOutput`(`utils.ts:284-306`,tab 转 3 空格、Thai/Lao AM 元音分解)规范化,末尾追 SGR reset + OSC 8 reset(`"\x1b[0m\x1b]8;;\x07"`),确保样式不跨行泄漏。

### 输入处理

`Terminal` 接口(`terminal.ts:52-94`): `start`/`stop`/`drainInput`/`write`/`moveBy`/`hideCursor`/`showCursor`/`clearLine`/`clearScreen`/`setTitle`/`setProgress` 等。两实现: `ProcessTerminal`(`terminal.ts:99-531`,真实 stdin/stdout,raw mode、bracketed paste、Kitty keyboard 协议协商、退回 `modifyOtherKeys`)和 `VirtualTerminal`(测试用,基于 `@xterm/headless`)。

**Kitty keyboard 协议**(`terminal.ts:163-301`): 启动时发 `\x1b[>7u\x1b[?u\x1b[c`(push flags 7、pop、DA 查询);DA 响应作哨兵,先于 Kitty 响应到达则启用 `modifyOtherKeys` 退路。

`StdinBuffer`(`stdin-buffer.ts:61`)拆分批量 stdin,识别 CSI/OSC/DCS/APC/SS3 序列与老式鼠标事件,不完整序列保留 10ms,重裹 bracketed paste 内容。

**键解析**(`src/keys.ts`): `matchesKey(data, keyId)`(`keys.ts:820-1204`)是主 API,支持 Kitty CSI-u、`modifyOtherKeys`、legacy 序列。修饰位掩码(`keys.ts:292-297`): shift=1, alt=2, ctrl=4, super=8;lock mask(Caps/Num Lock)被剥离。`Key` helper(`keys.ts:163-252`)提供 `Key.ctrl("c")`、`Key.shiftTab` 等类型安全构造。

**键位**(`src/keybindings.ts`): `KeybindingsManager`(`keybindings.ts:155-231`)持有命名动作到按键列表的注册表。`TUI_KEYBINDINGS`(`keybindings.ts:54-134`)定义默认,如 `tui.input.submit = enter`、`tui.input.newLine = ["shift+enter", "ctrl+j"]`、`tui.editor.deleteWordBackward = ["ctrl+w", "alt+backspace"]`。下游包通过 declaration merging 扩展(coding-agent `core/keybindings.ts:60-62` 加 `AppKeybindings` 约 40 个 app 动作)。

**Bracketed Paste**: `ProcessTerminal` 发 `\x1b[?2004h` 启用;`StdinBuffer` 识别 paste 标记发 `paste` 事件;`Editor`/`Input` 在标记间缓冲内容并调 `handlePaste`。大 paste(>10 行或 >1000 字符)存入 `Editor.pastes` 并替换为 `[paste #1 +50 lines]` 标记(`editor.ts:1192-1207`),标记对光标移动原子化。

### 布局系统

**无 flexbox/grid**。布局是组件垂直堆叠,每个组件自管水平布局。`Container.render()` 自上而下拼接子组件渲染。

宽度契约: `render(width)` 收到终端宽度,必须产出 ≤ width 的行。各组件自处理:
- **Text**(`text.ts:45-105`): 减 `paddingX*2`,`wrapTextWithAnsi` 换行,加左右 margin,pad 到 width。
- **Box**(`box.ts:74-125`): 减 padding,子组件按 `contentWidth` 渲染,行首加左 pad,加上下 padding 行,应用背景。
- **Editor**(`editor.ts:471-596`): 减 padding,预留 1 列光标,`wordWrapLine` 换行,`maxVisibleLines = max(5, floor(rows*0.3))` 垂直滚动窗。
- **Markdown**(`markdown.ts:151-241`): 减 padding,解析 token,`wrapTextWithAnsi` 换行,加 margin/padding。

**Overlay 布局**(`resolveOverlayLayout`, `tui.ts:899-997`): 支持锚定、百分比、绝对定位。尺寸 `width`(数字或 `"50%"`)、`minWidth`、`maxHeight`,默认宽 `min(80, availWidth)`。定位优先级: 绝对 `row`/`col` → 百分比 → `anchor`(默认 `center`,可选 `top-left` 等 `tui.ts:127-136`),后加 `offsetX/Y`,margin 钳到终端边界,`visible?(w,h)` 每帧求值。

### 文本、样式、颜色、主题

ANSI 工具(`src/utils.ts`):

- `visibleWidth(str)`(`utils.ts:216-271`): 剥 ANSI/OSC/APC、tab 转 3 空格、`graphemeWidth` 求和,LRU 512 缓存。
- `graphemeWidth`(`utils.ts:167-211`): tab=3、零宽、RGI emoji=2、regional indicators=2、CJK 经 `eastAsianWidth`、Thai/Lao AM 元音。
- `truncateToWidth(text, maxWidth, ellipsis, pad)`(`utils.ts:936-1072`): 保 ANSI,处理字形边界,可 pad 到精确宽度。
- `wrapTextWithAnsi(text, width)`(`utils.ts:715-738`): 换行时通过 `AnsiCodeTracker`(`utils.ts:390-610`)追踪 bold/dim/italic/underline/blink/inverse/hidden/strikethrough/fgColor/bgColor/activeHyperlink 并在行首重发;CJK 允许相邻字符间断行。
- `sliceByColumn`/`extractSegments`: 列切片与单遍前后片段抽取(含样式继承),用于 overlay 合成。
- `applyBackgroundToLine`: pad 到 width 后应用 bg 函数。

**主题模型**: 主题是**返回 ANSI 字符串的函数对象**,TUI 本身主题无关,主题在 coding-agent。如 `MarkdownTheme`(`markdown.ts:78-96`): `heading`/`link`/`code`/`codeBlock`/`quoteBorder`/`hr`/`bold`/`italic` 等;`EditorTheme`(`editor.ts:228-231`): `borderColor`/`selectList`;`SelectListTheme`(`select-list.ts:18-24`): `selectedPrefix`/`selectedText`/`description`/`scrollInfo`/`noMatch`。

**终端颜色检测**: `queryTerminalBackgroundColor`(`tui.ts:1667-1688`)发 `\x1b]11;?\x07`;`queryTerminalColorScheme`(`tui.ts:1695-1715`)发 `\x1b[?996n` 返回 `"dark"`/`"light"`;`setTerminalColorSchemeNotifications`(`tui.ts:667-675`)发 `\x1b[?2031h` 持续通知。

**超链接**: `hyperlink(text, url)` 发 OSC 8;`detectCapabilities()`(`terminal-image.ts:65-125`)探测 `TERM_PROGRAM`/`TMUX`/`KITTY_WINDOW_ID`/`ITERM_SESSION_ID`/`WT_SESSION`/`WEZTERM_PANE` 等,tmux 经 `probeTmuxHyperlinks` 探测。

**内联图**(`src/terminal-image.ts`): `detectCapabilities()` 返回 `{images: "kitty"|"iterm2"|null, trueColor, hyperlinks}`。Kitty 支持 Kitty/Ghostty/WezTerm/Warp,iTerm2 支持 iTerm。PNG/JPEG/GIF/WebP 尺寸从头解析(`terminal-image.ts:291-380`)。`encodeKitty(base64Data, {columns, rows, imageId, moveCursor})`(`terminal-image.ts:165-209`)分 4096 字节块发,`m=1`/`m=0` 续传标志;`encodeITerm2`(`terminal-image.ts:227-250`)发 `\x1b]1337;File=...`;`deleteKittyImage(id)` 发 `\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`。TUI 在 `previousKittyImageIds`(`tui.ts:298`)追踪所有 Kitty 图 ID,`expandChangedRangeForKittyImages`(`tui.ts:1140-1161`)确保变化范围覆盖整图块,`getKittyImageReservedRows`(`tui.ts:1126-1138`)查图占多少终端行。

### 组件重渲染与协调

**无虚拟 DOM diffing**。重渲染是**拉取式**:

1. 状态变 → 组件调 `tui.requestRender()`(或 `Loader` 在每动画帧经 `setInterval` 调)。
2. `requestRender()` 设标志,经 `process.nextTick → scheduleRender`(`setTimeout` 节流到 16ms / 60fps 上限)。
3. `doRender()` 调 `this.render(width)`(`tui.ts:1273`),即 `Container.render()` 调每个子的 `render(width)`。
4. 新行与 `previousLines` 逐行比较找 `firstChanged`/`lastChanged`。
5. 只写变化范围到终端。

组件缓存: `Text`/`Box`/`Markdown`/`Image` 缓存渲染输出,状态变时 `invalidate()` 清缓存;`Editor` 每次重渲无缓存;`Input`/`SelectList`/`TruncatedText`/`Spacer` 无缓存。`TUI.invalidate()`(`tui.ts:630-633`)遍历子与所有 overlay 组件调 `invalidate()`,主题变更时用。

协调: 组件是可变对象(不重建),无 key 协调。子增删经 `Container.addChild`/`removeChild`。差分行比较(`tui.ts:1370-1395`)是唯一"协调"——字符串相等找首尾变化行。

焦点变化: `setFocus(component)`(`tui.ts:366-368`)→ `setFocusInternal`(`tui.ts:370-433`): 旧组件 `focused=false`、新组件 `focused=true`(若 `Focusable`),管理 overlay 焦点恢复状态。`focused` 标志使 `Input`/`Editor` 在渲染输出中发 `CURSOR_MARKER`,`extractCursorPosition` 找到并定位硬件光标供 IME。

### 与 coding-agent 集成

启动(`cli/startup-ui.ts:77-100`): `new TUI(new ProcessTerminal(), showHardwareCursor)`、`setClearOnShrink`、`start()`。

`InteractiveMode`(`modes/interactive/interactive-mode.ts:453-489`)构造 `TUI`,为屏幕各区域建 Container:

```
TUI (root Container)
├── headerContainer
├── loadedResourcesContainer
├── chatContainer           ← 消息历史(Markdown、工具结果等)
├── pendingMessagesContainer
├── statusContainer
├── widgetContainerAbove
├── editorContainer         ← Editor(焦点目标)
├── widgetContainerBelow
└── footer
```

chat container 持对话消息组件: `UserMessageComponent`、`AssistantMessageComponent`、`ToolExecutionComponent`、`BashExecutionComponent`、`BorderedLoader`、`BranchSummaryMessageComponent`、`CompactionSummaryMessageComponent`、`DynamicBorder` 等。editor container 持 `CustomEditor`(扩展 `Editor`)加 app 键位与 slash 处理。

键位扩展(`core/keybindings.ts:60-62`): coding-agent 经 declaration merging 扩展 `Keybindings` 接口加 `AppKeybindings`,约 40 个 app 动作(`app.interrupt`、`app.exit`、`app.editor.external`、`app.model.select`、`app.clipboard.pasteImage` 等),`KEYBINDINGS` 从 `TUI_KEYBINDINGS` spread 保留所有 editor/select 绑定。

自动补全(`interactive-mode.ts:539-641`): `createBaseAutocompleteProvider()` 建 `CombinedAutocompleteProvider`,含内建 slash 命令、prompt templates、extension commands、skill 命令(`skill:<name>`)、文件路径补全(用 `fd`)。

Overlay(`interactive-mode.ts:2486`): `ui.showOverlay(component, options)` 用于对话框: 模型选择器、session 选择器、设置选择器、主题选择器、登录对话框、信任对话框等,各返回 `OverlayHandle` 控焦点/失焦/隐藏。

主题控制器(`theme/theme-controller.ts`): `InteractiveThemeController` 检测终端背景色与配色方案,订阅 `onTerminalColorSchemeChange` 实时切换主题,动态更新 editor 边框色。

工具渲染: 每个工具结果渲成 TUI 组件——`bash.ts` → `Container`+`Text`+`truncateToWidth`;`edit.ts`/`write.ts` → `Box`/`Container`/`Spacer`/`Text`;`read.ts`/`ls.ts`/`grep.ts`/`find.ts` → `Text`;`render-utils.ts` 用 `getCapabilities`/`hyperlink`/`imageFallback`/`getImageDimensions` 渲工具输出中的图与链接。

扩展: 扩展收 `ExtensionContext` 与 `ExtensionUIContext`(`core/extensions/types.ts`),暴露 `showOverlay`/`pasteToEditor`/`setEditorText`/`getEditorText`,可注册自定义 editor(`EditorComponent`)、widget、dialog。loader(`core/extensions/loader.ts:16,56,66,117,124`)打包同一 TUI 实例,扩展共享运行时。

## 7. `pi-server` 与 SQLite 后端

### `pi-server`:实验性 RPC 监督器

`packages/server`(`README.md:3` 明确标 "Experimental")**不是传统 HTTP/RPC 服务器**,而是 **Unix domain socket 上的 JSONL IPC 服务器**,负责 spawn、追踪、桥接 `pi --mode rpc` 子进程。

源码布局(`packages/server/src/`):

- `cli.ts`: bin 入口,分派 `serve|list|spawn|status|stop|rpc|rpc-stream`
- `config.ts`: 路径 `~/.pi/server/{server.sock,instances.json,machine.json,auth.json}`,`PI_SERVER_DIR`/`PI_CONFIG_DIR` 覆盖
- `handler.ts`: IPC 请求分发 → supervisor
- `ipc/protocol.ts`: 请求/响应类型(`spawn`/`list`/`stop`/`status`/`rpc`/`rpc_stream`)
- `ipc/server.ts`: `startIpcServer()` 在 Unix socket 上 `createServer`;`rpc_stream` 升级为流式桥接
- `ipc/client.ts`: `sendIpcRequest()` 开 socket、写一行 JSONL 请求、读一行响应
- `rpc-process.ts`: `RpcProcessInstance` spawn 并与 `pi --mode rpc` 子进程通信
- `supervisor.ts`: `ServerSupervisor` 活实例 map,spawn/stop/handleRpc/openRpcStream
- `radius.ts`: Radius presence(`radius.pi.dev`)注册 + 心跳
- `storage.ts`: `machine.json`/`instances.json` 的 JSON 读写
- `serve.ts`: 顶层 `serve()` 绑 socket、恢复实例、启 Radius、装信号处理

CLI 子命令(`cli.ts:19-23`):

| 命令 | 作用 |
|---|---|
| `server serve` | 启长跑监督进程(绑 socket) |
| `server list` | 一次性 IPC: 列所有实例 |
| `server spawn [--cwd <path>] [--label <label>]` | 让 supervisor spawn 新 pi-rpc 子进程 |
| `server status <id>` | 取一个实例记录 |
| `server stop <id>` | 停实例 |
| `server rpc <id> <json-command>` | 发单 `RpcCommand`,收单 `RpcResponse` |
| `server rpc-stream <id>` | 开双向 JSONL 流 |

spawn 方式(`rpc-process.ts:50-61` `getSpawnCommand`): 若 server 跑在 Bun 编译二进制(由 `import.meta.url` 含 `$bunfs`/`~BUN` 检测,见 `config.ts:16-17`),调内绑 `pi` 可执行带 `["--mode", "rpc"]`;否则用 `process.execPath`(node)带 `[require.resolve("@earendil-works/pi-coding-agent/rpc-entry")]`。coding-agent 的 `package.json:19-22` 导出 `"./rpc-entry"` → `./dist/rpc-entry.js`,`packages/coding-agent/src/rpc-entry.ts:1-12` 简单调 `main(["--mode", "rpc", ...])`。

`RpcProcessInstance`(`rpc-process.ts:25-197`): 在子进程 stdin 写 `RpcCommand` JSONL(每个请求生成 `id` 并在 `pendingRequests` 追踪,`send` 在 `:143-159`);按行读 stdout,`type: "response"` 行 resolve 请求(`handleLine` `:101-128`),`extension_ui_request` 行交 UI handler,其余作 `AgentSessionEvent` 扇出给事件监听器;stderr 缓冲用于退出时报错;`dispose()` 发 SIGTERM 等退出。

`ServerSupervisor`(`supervisor.ts`): `liveInstances: Map<string, LiveInstance>`(`:64`)只放运行实例,持久化记录镜像到 `instances.json`。`spawnInstance`(`:270-298`)生成 UUID、标 `"starting"`、持久化、建 `RpcProcessInstance`、绑事件/退出监听、`syncInstanceRecord`(发 `get_state` RPC 抓 `sessionId`/`sessionFile`)、注册 Radius Pi、标 `"online"`。`handleRpc`(`:321-333`)转发 `RpcCommand`,对元数据变更命令(`SESSION_METADATA_COMMANDS` `:41-48`: `new_session`/`switch_session`/`fork`/`clone`/`set_session_name`/`prompt`)重新同步 `sessionId`/`sessionFile`。`openRpcStream`(`:197-233`)返回 handle 让 IPC 客户端订阅事件、发 RPC、答扩展 UI 请求。`recoverAfterRestart`(`:244-255`)server 启动时把 `"online"`/`"starting"` 实例重写为 `"stopped"`(子进程已没了),断开 Radius 注册。`handleUnexpectedRpcExit`(`:115-134`)子进程意外死则标 `"error"`、清绑定、断 Radius、移除实例。

Radius(`radius.ts`): 可选 presence 上报 `https://radius.pi.dev/`(`PI_RADIUS_URL`/`PI_RADIUS_SERVER_URL` 可覆)。当 `radius` provider 的 OAuth 凭证存在 `~/.pi/agent/auth.json` 或 `RADIUS_API_KEY` 设了才启用(`radius.ts:139-141`)。`registerMachine`(`:232-255`)POST 主机信息存 machine id;`registerPi`(`:189-210`)每实例 POST `machineId`/`cwd`/`pid`/`transport: "local-rpc"`/`capabilities: {rpc: true, relay: false, iroh: false}`;心跳(`heartbeatMachine` `:303-347`、`heartbeatPi` `:349-400`)按注册返回的间隔跑,404(3 次阈值)重注册,瞬态错指数退避带抖动封顶 30s(`computeBackoffDelayMs` `:82-89`)。

**与 coding-agent 的关系**: 编译期与运行期 `coding-agent` 都不依赖 `pi-server`(在 `packages/coding-agent/src` grep `pi-server`/`@earendil-works/pi-server` 零命中)。依赖单向: server 依赖 `@earendil-works/pi-coding-agent` 并 spawn 其 RPC 模式。server 是独立的可选监督层,用户仍可不经 server 直接 `pi`/`pi --mode rpc`/`pi --mode json`。

### `pi-storage-sqlite-node`:SQLite 会话后端

`packages/storage/sqlite-node`(`README.md:1-5`)提供 Node `node:sqlite` 适配器(`SqliteDatabase` 实现)与 SQLite session repo/storage(含迁移与物化视图)。依赖仅 `@earendil-works/pi-ai`(uuidv7)与 `@earendil-works/pi-agent-core`(类型与 helper)。

两层导出(`src/index.ts`):

1. **低层 Node `node:sqlite` 适配器**(`src/index.ts:1-94`): `wrapNodeSqliteDatabase(db)`/`createNodeSqliteFactory()`;`NodeSqliteDatabase` 实现 `exec`/`prepare`(返回 `NodeSqliteStatement` 含 `run`/`get`/`all`)/`transaction<T>`(BEGIN/COMMIT/ROLLBACK)/`close`;语句适配器支持位置与命名参数(`isNamedParameters` `:5-9` 检测)。
2. **高层 session repo**(`src/sqlite/index.ts` 重导出): `SqliteSessionRepo`/`SqliteSessionStorage`/`applyMigrations`/`loadMigrations`。

Schema(`src/sqlite/migrations/001_initial.sql`):单迁移文件,6 表 + 迁移簿记:

| 表 | 作用 | 关键列 |
|---|---|---|
| `migrations` | 迁移追踪 | `id TEXT PK`、`applied_at` |
| `sessions` | 每 session 一行 | `id TEXT PK`(WITHOUT ROWID)、`created_at`、`cwd`、`parent_session_id`、`metadata`(JSON)、`active_leaf_id` |
| `session_entries` | append-only 条目树 | PK `(session_id, id)`、`entry_seq`(session 内唯一)、`parent_id`、`type`、`timestamp`、`payload`(JSON) |
| `session_sequences` | 单调 session 计数器 | PK `session_id`、`next_seq` |
| `branch_entries` | 物化活跃分支成员 | PK `(session_id, branch_id, entry_id)`、`entry_seq` |
| `session_materialized` | 缓存 session 摘要(1 行/session) | PK `session_id`、`payload`(JSON) |
| `entry_materialized` | 每条目物化数据(如 label) | PK `(session_id, entry_seq, type)`、`payload` |

索引覆盖 created_at、cwd、parent、session_seq、session_parent、session_type、branch 各维度。迁移 runner(`src/sqlite/migrations.ts:34-50`)幂等:确保 `migrations` 表、查已应用 id、余下在每迁移事务内应用。SQL 文件由 `scripts/prepare-dist.mjs:17-20` 拷到 `dist/sqlite/migrations/` 供运行时 `readFile(import.meta.url)` 解析。每次开库设 PRAGMA(`src/sqlite/repo.ts:30-34`): `journal_mode=WAL`、`synchronous=FULL`、`busy_timeout=5000`。

`SessionRepo` 契约在 `packages/agent/src/harness/types.ts:495-505` 定义,`SqliteSessionRepo`(`src/sqlite/repo.ts:43-192`)实现 `SqliteSessionRepoApi`(`types.ts:52-53`),特化泛型: `TMetadata = SqliteSessionMetadata`(加 `cwd`/`path`/`parentSessionId?`/`metadata?`)、`TCreateOptions = SqliteSessionCreateOptions`(加 `cwd`/`parentSessionId?`/`metadata?`)、`TListOptions = SqliteSessionListOptions`(`{cwd?}`)。构造函数(`repo.ts:49-53`): `{env, sqlite, databasePath}`,其中 `env = Pick<FileSystem, "absolutePath"|"createDir"|"exists">`。repo 每操作开新库(`openDatabase` `repo.ts:74-85` 跑迁移后返回连接,调用方关),repo 自身无长连接。`fork`(`repo.ts:163-191`)复用 `pi-agent-core` 的 `getEntriesToFork`,开新 session 经 `SqliteSessionStorage.create` 并用 `storage.appendEntry` 重放条目。

`SessionStorage<TMetadata>` 契约在 `types.ts:465-481`,`SqliteSessionStorage`(`src/sqlite/storage/index.ts:116-449`)实现全部方法。关键:

- `create`(`:214-256`): 插 `sessions` 行、初始 `session_sequences`(next_seq=1)、空 `session_materialized` 行。
- `appendEntry`(`:291-346`): 工作马,内存物化态变更后单事务内插 `session_entries`、推进 `session_sequences`、更新 `session_materialized`、插 `entry_materialized`(目前仅 `label`,`entryMaterializedValues` `session-materialized.ts:339-368`)、更新 `sessions.active_leaf_id`、维护 `branch_entries`。`leaf` 条目(分支切换)物化新 branch id 并为叶子路径重建 `branch_entries`;非 leaf 条目若父已有子也分叉新 branch。
- `getPathToRootOrCompaction`(`:399-408`): 用活跃叶子的缓存 `branch_entries`(`getMaterializedBranchPathOrCompaction` `branch-entries.ts:11-57`),任意叶子退回走 parent 指针。
- 物化态(`session-materialized.ts:22-44`)缓存: session 名、消息数、cached/uncached/total token、总成本、label map、用过的 model+thinking 组合、当前 model、当前 thinking level。由 `applyEntryToMaterializedState`(`:136-208`)增量更新,序列化为 JSON 存 `session_materialized.payload`。
- `getEntries`(`:410-444`): 经 `SessionEntryCursorOptions {afterEntrySeq?, limit?}`(`types.ts:460-463`)游标分页。
- 条目载荷由 `encodeEntry`/`decodeEntry`(`session-entries.ts:135-217`)编解码,11 种条目类型经 `validateSessionTreeEntry`(`session-entries.ts:50-128`)持久化前校验。畸形条目读取时跳过(`storage/index.ts:39-42, 380-383`),与 JSONL 后端一致。
- `cleanup()`(`:446-448`)关底层连接;repo 的 `open`/`create` 捕错并关库后重抛(`repo.ts:96-101, 113-117`)。

## 8. 端到端数据流

以交互模式一次用户提问为例,串起各层:

1. **用户输入**: `Editor` 组件(`pi-tui`)收键盘事件,经 `matchesKey` 判定为 `tui.input.submit`(`enter`),把缓冲区内容发给 `InteractiveMode`。
2. **TUI 更新**: `Editor` 清空,`UserMessageComponent` 加到 `chatContainer`,`tui.requestRender()` 触发差分渲染,新增行经 CSI 2026 同步输出到终端。
3. **AgentSession 接管**: `InteractiveMode` 调 `AgentSession.prompt(text)`,经 `AgentSessionRuntime` 转发到 `AgentHarness.prompt()`(`pi-agent-core`)。
4. **Harness 入态**: harness 同步置 `phase: "turn"`,建 turn snapshot(model、thinking、tools、active tools 快照),`Session.appendMessage(userMessage)` 持久化用户消息。
5. **Agent 循环**: `Agent.prompt()` → `runAgentLoop`(`agent-loop.ts:154-274`)进 `streamAssistantResponse`:
   - `transformContext`: AgentMessage → AgentMessage(扩展可改 context)
   - `convertToLlm`: AgentMessage → pi-ai `Message`
   - 构建 `Context {systemPrompt, messages, tools}`
   - `getApiKey(provider)` 解析鉴权
   - 调 `streamFunction`——在 coding-agent 是 `ModelRuntime.streamSimple()` 的包装(`sdk.ts:297-325`),最终调 `pi-ai` 的 `Models.streamSimple()`。
6. **pi-ai 出流**: `Models.stream`(`models.ts:489-502`)用 `lazyStream` 同步返回流,异步解析 provider auth;成功则 provider 的 `stream()` 调对应 API 实现(如 `anthropic-messages.ts`)发 HTTP 请求,收 SSE 解析成 `AssistantMessageEvent`(12 种之一)。
7. **事件回流**: 每个事件经 `Agent.processEvents`(`agent.ts:526-573`)reducer 更新 `_state.streamingMessage`,并 await 所有监听器。harness 的监听器把增量消息发到 TUI(`AssistantMessageComponent` 渐进渲染),`message_end` 时 `Session.appendMessage(assistantMessage)` 持久化。
8. **工具执行**: 若 `stopReason === "toolUse"`,`executeToolCalls` 按 sequential/parallel 执行: `prepareToolCall`(校验 + `beforeToolCall` hook)→ `execute` → `finalizeExecutedToolCall`(`afterToolCall` hook)。`tool_call` 事件先经扩展(可 block)。结果作 `ToolResultMessage` 持久化,`ToolExecutionComponent` 在 TUI 渲染。
9. **循环继续**: 回到步骤 5,直到 `stopReason` 非 `toolUse` 或 `shouldStopAfterTurn`。期间 steering/followUp 队列可插入消息。
10. **结束**: `agent_end` 事件,harness flush `pendingSessionWrites`,置 `phase: "idle"`,TUI 渲染最终状态。

压缩在 context token 接近窗口时自动触发(`shouldCompact`),生成 `CompactionEntry` 持久化,后续 `buildContext` 用 `[compaction, ...retainedTail]` 替代旧路径。分支切换时 `navigateTree` 切 `LeafEntry`,生成放弃分支的 `BranchSummaryEntry`。

RPC 模式数据流相同,只是事件经 JSONL 写 stdout 而非 TUI;`pi-server` 再把子进程的 JSONL 桥接到 Unix socket 客户端。

## 9. 关键设计决策与亮点

### 三运行时兼容

同一份 TS 源码跑 Node、Bun 二进制、浏览器三种环境。手段:

- **Side-effect-free root entrypoint**: `pi-ai` 的 `src/index.ts:4-8` 注释明确分层,root 仅核心类型与 helper,生成目录与 provider 工厂在独立 subpath,让 bundler tree-shake。
- **Bundler-opaque 动态导入**: Bedrock(AWS SDK,Node-only)经 `api/bedrock-converse-stream.lazy.ts:10-13` 用变量 specifier 导入,浏览器 bundle 不跟进;OAuth flow 同理(`auth/oauth/load.ts:9-12`)。`bun-oauth.ts:9-17` 的 `registerBundledOAuthFlowLoaders` 让 Bun 二进制注册静态打包的 flow;`bedrock-provider.ts` 的 `setBedrockProviderModule` 注册静态导入的 AWS SDK 实现。
- **Node-only 隔离**: `pi-agent-core` 的 `NodeExecutionEnv` 在 `src/node.ts` 单独 entrypoint,不进主 bundle;`env-api-keys.ts:1-24` 仅 Node/Bun 动态导 `node:fs`/`node:os`/`node:path`。

### 扩展通过 declaration merging 改类型

`pi-tui` 的 `Keybindings` 接口、`pi-agent-core` 的 `CustomAgentMessages` 都是空接口,下游经 `declare module` 合并扩展(coding-agent `core/keybindings.ts:60-62` 加 `AppKeybindings`;`packages/agent/src/harness/messages.ts:54-61` 加 `bashExecution`/`custom`/`branchSummary`/`compactionSummary` 四个自定义角色)。这让核心包类型开放,应用层类型安全。

### Stream 错误从不抛出

`StreamFn` 契约(`packages/agent/src/types.ts:21-27`): "must not throw or return a rejected promise; failures are encoded in the stream via `stopReason: "error" | "aborted"` and `errorMessage`"。`pi-ai` 的 `Models.stream` 用 `lazyStream` 同步返回流,鉴权失败成 `error` 事件。这一约定让 agent 循环的 `try/catch` 极简,异常路径可预测。

### Result<T, E> 不抛策略

`pi-agent-core` 的 `ExecutionEnv`/`FileSystem`/`Shell` 操作返回 `Result<TValue, TError>`(`types.ts:14-46`),预期失败(如文件不存在、权限拒绝)不抛。`NodeExecutionEnv` 把 `EACCES`/`EPERM` 映射成 `FileError("permission_denied", ...)`(`env/nodejs.ts:91-93`)。这是最接近"沙箱边界"的机制——自定义 `ExecutionEnv` 实现可强制任意访问策略。

### Append-only 会话树

所有 `SessionTreeEntry` append-only,带 `id`/`parentId`。切换分支经 `setLeafId` 追加新 `leaf` 条目而非改游标。这让会话历史**不可变可回溯**,支持 fork/clone/navigateTree 而不丢失任何分支。压缩与分支摘要是树上的特殊条目类型,`buildContext` 按 leaf 路径回溯时自动应用变换。三后端(JSONL/SQLite/内存)实现同一 `SessionStorage`/`SessionRepo` 契约,可互换。

### 供应链加固

- 直接外部依赖精确版本锁定(`.npmrc` `save-exact=true`、`min-release-age=2` 天避同日发布)。
- `package-lock.json` 是依赖真相;pre-commit 阻锁文件提交除非 `PI_ALLOW_LOCKFILE_CHANGE=1`(`AGENTS.md:43`)。
- `npm run check` 校验 pinned deps、原生 TS 导入兼容、生成的 coding-agent shrinkwrap(`AGENTS.md:28`)。
- 发布的 CLI 含 `packages/coding-agent/npm-shrinkwrap.json`,从根 lockfile 生成,钉传递依赖;生成脚本有显式 lifecycle script allowlist,新 lifecycle-script 依赖未审会失败(`AGENTS.md:42`)。
- CI 用 `npm ci --ignore-scripts`,定时跑 `npm audit --omit=dev` + `npm audit signatures --omit=dev`。
- 发布经 GitHub Actions OIDC trusted publishing(环境 `npm-publish`),无需本地 `npm publish`/OTP/WebAuthn(`AGENTS.md:156`)。

## 10. 参考资料

### 关键文件索引

**pi-ai**:
- 核心类型: `packages/ai/src/types.ts`(742 行)
- Provider/Models 抽象: `packages/ai/src/models.ts`(705 行)
- 鉴权: `packages/ai/src/auth/types.ts`、`auth/resolve.ts`、`auth/helpers.ts`
- API 实现: `packages/ai/src/api/<id>.ts`(10 个协议)
- 跨 provider 变换: `packages/ai/src/api/transform-messages.ts:64-223`
- 事件流: `packages/ai/src/utils/event-stream.ts`
- Provider 注册: `packages/ai/src/providers/all.ts:86-126`
- 模型目录生成: `packages/ai/scripts/generate-models.ts`
- Faux provider: `packages/ai/src/providers/faux.ts`(538 行)
- CLI: `packages/ai/src/cli.ts`(118 行,`pi-ai login`/`list`)

**pi-agent-core**:
- 公开类型: `packages/agent/src/types.ts`(`AgentMessage` 310-319、`AgentState` 327-352、`AgentTool` 380-403、`AgentLoopConfig` 144-287、`AgentEvent` 422-437)
- Agent 类: `packages/agent/src/agent.ts:170-574`(`prompt` 334-344、`runWithLifecycle` 468-491、`processEvents` 526-573)
- 低层循环: `packages/agent/src/agent-loop.ts`(`runLoop` 154-274、`streamAssistantResponse` 280-371、`executeToolCalls` 410-425、顺序 432-486、并行 488-553)
- Harness: `packages/agent/src/harness/agent-harness.ts:165-1038`(`createTurnState` 322-354、`executeTurn` 546-621、`compact` 701-745、`navigateTree` 747-836)
- Harness 类型: `packages/agent/src/harness/types.ts`(`ExecutionEnv` 340、`SessionStorage` 465-481、`SessionTreeEntry` 420-431、事件 663-689)
- Session: `packages/agent/src/harness/session/session.ts:150-359`(`buildContext` 188-200、`moveTo` 338-358)
- JSONL 存储: `packages/agent/src/harness/session/jsonl-storage.ts:187-376`
- JSONL repo: `packages/agent/src/harness/session/jsonl-repo.ts:38-179`
- 内存存储: `packages/agent/src/harness/session/memory-storage.ts:43-189`
- Node env: `packages/agent/src/harness/env/nodejs.ts:246-569`
- 自定义消息: `packages/agent/src/harness/messages.ts:54-61`(`convertToLlm` 120-163)
- 压缩: `packages/agent/src/harness/compaction/compaction.ts`(`compact` 696-781、`prepareCompaction` 603-676、`findCutPoint` 368-416)
- 分支摘要: `packages/agent/src/harness/compaction/branch-summarization.ts:199-258`
- Skills: `packages/agent/src/harness/skills.ts`(`loadSkills` 49-75、`loadSkillFromFile` 233-279)
- Prompt templates: `packages/agent/src/harness/prompt-templates.ts`(`loadPromptTemplates` 30-62、`substituteArgs` 249-262)
- Proxy stream: `packages/agent/src/proxy.ts:116-233`(`processProxyEvent` 238-366)

**pi-coding-agent**:
- 进程入口: `packages/coding-agent/src/cli.ts:10-20`
- main 分派: `packages/coding-agent/src/main.ts:473`(模式解析 100-111,会话创建 578,运行时工厂 615-739,模式分派 815-862)
- 公开 API: `packages/coding-agent/src/index.ts`(401 行)
- AgentSession: `packages/coding-agent/src/core/agent-session.ts:286`(3270 行)
- SDK 工厂: `packages/coding-agent/src/core/sdk.ts:164`(与 pi-agent-core 对接 289-355)
- Session 管理: `packages/coding-agent/src/core/session-manager.ts`(1712 行,树 v3 格式 30,迁移 230-291)
- 设置: `packages/coding-agent/src/core/settings-manager.ts`(1234 行)
- Slash 命令: `packages/coding-agent/src/core/slash-commands.ts:19-42`(22 个内建)
- 键位: `packages/coding-agent/src/core/keybindings.ts:64-120`
- 信任: `packages/coding-agent/src/core/trust-manager.ts:29-37`
- 内建工具: `packages/coding-agent/src/core/tools/index.ts:83`(7 工具,默认激活 177-184)
- bash 工具: `packages/coding-agent/src/core/tools/bash.ts`(`BashOperations` 82-148)
- 扩展类型: `packages/coding-agent/src/core/extensions/types.ts:1172-1407`(`ExtensionAPI`)、`:1023-1048`(28 类事件)、`:1482`(`ExtensionFactory`)
- 扩展加载器: `packages/coding-agent/src/core/extensions/loader.ts`
- 扩展运行器: `packages/coding-agent/src/core/extensions/runner.ts`
- 交互模式: `packages/coding-agent/src/modes/interactive/interactive-mode.ts`(5996 行,TUI 结构 703-714,自动补全 539-641,overlay 2486)
- RPC 模式: `packages/coding-agent/src/modes/rpc/rpc-mode.ts`(800 行),类型 `rpc-types.ts:20-73`,客户端 `rpc-client.ts`
- 配置/路径: `packages/coding-agent/src/config.ts:73-94`(安装检测)、`:115-187`(自更新)、`:293-313`(可写/包管理器检查)、`:491,515-521`(配置目录)
- 自更新: `packages/coding-agent/src/package-manager-cli.ts`

**pi-tui**:
- 公开导出: `packages/tui/src/index.ts`
- 核心 TUI 类: `packages/tui/src/tui.ts:295`(1716 行;`Component` 64-88、`Container` 256-290、`doRender` 1256-1622、`fullRender` 1286-1327、overlay 布局 899-997、overlay 合成 1034-1093、光标提取 1236-1254)
- 终端接口: `packages/tui/src/terminal.ts:52-94`(`ProcessTerminal` 99-531,Kitty 协商 163-301)
- 键解析: `packages/tui/src/keys.ts`(`matchesKey` 820-1204、`Key` 163-252、Kitty CSI-u 587-651)
- 键位: `packages/tui/src/keybindings.ts:54-134`(`TUI_KEYBINDINGS`)、`:155-231`(`KeybindingsManager`)
- Stdin 缓冲: `packages/tui/src/stdin-buffer.ts:61`
- ANSI 工具: `packages/tui/src/utils.ts`(`visibleWidth` 216-271、`graphemeWidth` 167-211、`truncateToWidth` 936-1072、`wrapTextWithAnsi` 715-738、`AnsiCodeTracker` 390-610、`extractSegments` 1138-1209、`normalizeTerminalOutput` 284-306)
- 终端图: `packages/tui/src/terminal-image.ts`(`detectCapabilities` 65-125、`encodeKitty` 165-209、`encodeITerm2` 227-250)
- Editor 组件: `packages/tui/src/components/editor.ts`(2346 行,大 paste 1192-1207)
- Markdown 组件: `packages/tui/src/components/markdown.ts`(858 行,主题 78-96)
- 原生插件: `packages/tui/native/{darwin,win32}/prebuilds/`

**pi-server**:
- README: `packages/server/README.md:3`(实验性声明)
- CLI: `packages/server/src/cli.ts:19-23`(子命令)
- 配置: `packages/server/src/config.ts:45-53`(路径)
- IPC 协议: `packages/server/src/ipc/protocol.ts:10-50`(请求类型)、`:54-62`(`InstanceSummary`)
- IPC 服务器: `packages/server/src/ipc/server.ts:46-160`(rpc_stream 升级 68-135)
- RPC 子进程: `packages/server/src/rpc-process.ts:25-197`(spawn 50-61,send 143-159,handleLine 101-128)
- Supervisor: `packages/server/src/supervisor.ts:64`(liveInstances)、`:270-298`(spawnInstance)、`:321-333`(handleRpc)、`:197-233`(openRpcStream)、`:244-255`(recoverAfterRestart)、`:115-134`(handleUnexpectedRpcExit)
- Radius: `packages/server/src/radius.ts:139-141`(启用条件)、`:232-255`(registerMachine)、`:189-210`(registerPi)、`:303-400`(心跳)
- 存储: `packages/server/src/storage.ts`(JSON 读写)

**pi-storage-sqlite-node**:
- README: `packages/storage/sqlite-node/README.md:1-5`
- 入口: `packages/storage/sqlite-node/src/index.ts:1-94`(Node adapter 84-94)
- Repo: `packages/storage/sqlite-node/src/sqlite/repo.ts:43-192`(构造 49-53、openDatabase 74-85、fork 163-191)
- Storage: `packages/storage/sqlite-node/src/sqlite/storage/index.ts:116-449`(create 214-256、appendEntry 291-346、getPathToRootOrCompaction 399-408、getEntries 410-444)
- 迁移: `packages/storage/sqlite-node/src/sqlite/migrations/001_initial.sql`(6 表)、`migrations.ts:34-50`(runner)
- 物化态: `packages/storage/sqlite-node/src/sqlite/session-materialized.ts:22-44`(缓存)、`:136-208`(增量更新)
- 条目编解码: `packages/storage/sqlite-node/src/sqlite/session-entries.ts:135-217`(encode/decode)、`:50-128`(validate)
- 分支条目: `packages/storage/sqlite-node/src/sqlite/branch-entries.ts:11-57`

### 文档导航

`packages/coding-agent/docs/` 下 28 个 Markdown + `docs.json`(Mintlify 导航),按组:

- **Start here**: `index.md`、`quickstart.md`、`usage.md`、`providers.md`、`security.md`、`containerization.md`、`settings.md`、`keybindings.md`、`sessions.md`、`compaction.md`
- **Customization**: `extensions.md`(2953 行,最大)、`skills.md`、`prompt-templates.md`、`themes.md`、`packages.md`、`models.md`、`custom-provider.md`
- **Reference**: `session-format.md`
- **Programmatic usage**: `sdk.md`、`rpc.md`(1526 行,RPC 协议完整参考)、`json.md`、`tui.md`
- **Platform setup**: `windows.md`、`termux.md`、`tmux.md`、`terminal-setup.md`、`shell-aliases.md`
- **Development**: `development.md`
- **未进 docs.json**: `llama-cpp.md`

### 外部链接

- 项目网站: https://pi.dev
- 文档: https://pi.dev/docs/latest
- RFC: https://rfc.earendil.com/keyword/pi/
- Discord: https://discord.com/invite/3cU7Bz4UPx
- 会话分享数据集: https://huggingface.co/datasets/badlogicgames/pi-mono
