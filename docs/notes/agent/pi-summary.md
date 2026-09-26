# Pi 项目架构总结

> 对 [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono)(版本 0.80.10)的整体架构梳理。

## 一、项目定位与设计哲学

Pi 是一套 **AI 编程代理 harness 套件**,核心是一个**可自扩展的编码代理**。"harness" 指它提供承载 LLM agent 运行的脚手架——模型提供商抽象、agent 循环、工具调用、会话状态、终端 UI——而具体的 LLM、工具、技能、主题、键位都以扩展形式接入。

设计哲学(`CONTRIBUTING.md`):

> **pi's core is minimal**. If your feature does not belong in the core, it should be an extension.

几个鲜明取向:

- **分层不耦合**:LLM API → agent 运行时 → CLI 三层通过纯接口对接,依赖单向向上
- **类型即文档**:大量使用 TypeBox schema,运行时校验 + 生成 JSON Schema 供 LLM 调用
- **失败不抛错**:失败编码进事件或 `Result<T, E>` 返回值,保证 agent 循环不被打断
- **三运行时兼容**:同一份 TS 源码跑 Node.js、Bun 二进制、浏览器
- **供应链加固**:依赖精确锁定、`--ignore-scripts`、OIDC trusted publishing

## 二、Monorepo 总览

```
packages/
├── ai/              # pi-ai:多提供商 LLM 统一 API
├── agent/           # pi-agent-core:agent 运行时
├── coding-agent/    # pi-coding-agent:交互式 CLI(即 pi 二进制)
├── tui/             # pi-tui:终端 UI 框架
├── server/          # pi-server:实验性 RPC 监督器
└── storage/
    └── sqlite-node/ # SQLite 会话后端
```

依赖方向单向向上,无反向引用。开发命令:`npm run build`(逐包构建)、`npm run check`(lint + 类型检查,改代码后必跑)、`./test.sh`(非 e2e 测试)。

## 三、pi-ai:多提供商 LLM 统一 API

LLM 抽象基座,只收录支持工具调用的模型。

- **三组核心抽象**:`Model`(纯数据,含定价/上下文窗口/能力)、`Provider`(鉴权 + 模型目录 + stream)、`Models`(集合层,`stream()` 用 `lazyStream` 同步返回流、异步解析鉴权——鉴权失败变成流上的 error 事件而非抛错)
- **38 个内置 provider、10 种 wire 协议**(openai-completions/responses、anthropic-messages、google-generative-ai/vertex、bedrock、mistral、pi-messages 等),每个协议独立模块延迟加载,浏览器打包可 tree-shake
- **统一事件流**:所有 API 输出同一套 12 种 `AssistantMessageEvent`(`text_delta`、`thinking_delta`、`toolcall_delta`、`done`、`error` 等)。**失败永远不从 stream 抛出**,而是 `error` 事件 + `stopReason: "error" | "aborted"`——这是 agent 循环稳定性的基石
- **鉴权**:`apiKey` 或 `oauth` 二选一;OAuth flow(PKCE、回调服务器)动态导入,不进浏览器包;凭证存储串行化写
- **跨 provider 上下文交接**:中途换模型时自动变换历史——图片降级、工具调用 ID 规范化、thinking 块转文本、为孤立 tool call 合成错误结果
- 其他:统一 thinking 档位入参、prompt caching、deferred tools、context overflow 检测(匹配 20+ provider 特定错误模式)

## 四、pi-agent-core:agent 运行时

三层递进抽象:

1. **`agentLoop`**:纯函数流式循环,不持有状态
2. **`Agent` 类**:有状态包装,`prompt()`/`steer()`/`abort()` 是公开 API
3. **`AgentHarness`**:编排层,加会话持久化、压缩、树导航、hook 系统

### Agent 循环

双层 `while`:外层排空 followUp 队列,内层处理 steering 消息 + tool call 循环。每轮:发 `turn_start` → 流式拿 assistant 回复 → `stopReason` 是 `toolUse` 就执行工具、否则结束 → 发 `turn_end` → 下一轮。

### 工具调用

`AgentTool` 扩展 pi-ai 的 `Tool`,增加 `execute()`(支持流式 onUpdate、动态加工具、提前终止)和 `executionMode`(sequential/parallel)。执行流程:`prepareToolCall`(校验 + `beforeToolCall` hook 可 block)→ `execute` → `finalizeExecutedToolCall`(`afterToolCall` hook 可改结果)。并行模式先顺序 prepare 再 `Promise.all`,结果按源顺序发事件。

### 会话树与持久化

- **11 种条目类型**(message、model_change、compaction、branch_summary、leaf 等),全部 **append-only**,带 `id`/`parentId` 构成树
- 切换分支通过追加新 `leaf` 条目而非改游标——历史不可变、可回溯
- **自动压缩**:context token 接近窗口时(`reserveTokens: 16384`),把旧历史总结成 `CompactionEntry`,`buildContext` 时用 `[compaction, ...retainedTail]` 替代旧路径
- **分支摘要**:导航离开分支时可生成 `BranchSummaryEntry`,让 LLM 知道废弃分支聊过啥
- 存储后端契约 `SessionStorage`/`SessionRepo`,JSONL(生产默认)/内存/SQLite 三个实现可互换

### 故意不提供的能力

MCP 客户端/服务端、子 agent 编排、OS 级沙箱、内置权限提示——留给应用层。权限通过 `beforeToolCall` hook 拦截,沙箱通过自定义 `ExecutionEnv` 实现。

## 五、pi-coding-agent:交互式编码代理 CLI

最终应用层,产物是 `pi` 二进制。

- **入口流程**(`main.ts`):拦包管理/配置命令 → 解析参数 → 模式分派(interactive/print/json/rpc)→ 创建/打开会话 → 运行
- **内建 7 个工具**:`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`;默认激活前 4 个;edit/write 经文件变更队列串行化
- **扩展系统**:TS/JS 模块导出工厂函数,拿 `ExtensionAPI` 可注册工具/命令/键位/flag/渲染器/provider;28 类事件可订阅;`tool_call` 事件可返回 `{block: true}` 拦截工具(权限就是这么做的)
- **信任模型**:项目级资源(extensions、skills、settings、SYSTEM.md)需信任才加载,信任状态存 `~/.pi/agent/trust.json`
- **交互特性**:22 个 slash 命令、键位自定义、bash 模式(`!` 前缀)、steering/followUp 消息队列、自动补全
- **配置**:`.pi/`(项目)覆盖 `~/.pi/agent/`(全局),JSON 深合并
- **RPC 模式**:stdin/stdout 上的 JSONL 协议,prompt/steer/fork/tree 等命令 + 事件流,供 `pi-server` 等程序化驱动

## 六、pi-tui:差分渲染终端 UI 框架

依赖极简的终端 UI 框架,核心是**无闪烁差分渲染**。

- **组件模型**:`Component` 树(无虚拟 DOM),每个组件 `render(width)` 返回行数组,宽度必须 ≤ width
- **差分渲染**:状态变 → `requestRender()`(节流 16ms)→ 逐行比较新旧帧找首尾变化行 → 只写变化范围;全量重绘用 CSI 2026 同步输出包裹,避免撕裂
- **输入**:Kitty keyboard 协议优先(带退路 modifyOtherKeys)、bracketed paste、大 paste 折叠成标记
- **布局**:无 flexbox/grid,垂直堆叠,组件自管水平布局;overlay 支持锚定/百分比/绝对定位
- **ANSI 工具**:可见宽度计算(CJK/emoji/零宽)、保 ANSI 的截断与换行(行首重发样式)
- **主题**:返回 ANSI 字符串的函数对象,TUI 本身主题无关
- **内联图**:Kitty/iTerm2 协议发图,追踪图 ID 确保差分覆盖整图块

## 七、pi-server 与 SQLite 后端

### pi-server(实验性)

**不是 HTTP 服务器**,是 Unix domain socket 上的 JSONL IPC 监督器:spawn、追踪、桥接 `pi --mode rpc` 子进程。

```
pi-server (supervisor,绑 ~/.pi/server/server.sock)
    └── spawn/管理 N 个 pi --mode rpc 子进程
        └── IPC 客户端经 server rpc / rpc-stream 与子进程通信
```

- `server serve/list/spawn/status/stop/rpc/rpc-stream` 子命令
- 可选 Radius presence 上报(心跳 + 指数退避重连)
- coding-agent 不依赖 server;server 单向依赖 coding-agent——独立的可选监督层

### pi-storage-sqlite-node

Node `node:sqlite` 适配器 + SQLite 会话 repo/storage,实现与 JSONL 相同的契约。单迁移文件 6 表:append-only 条目树 + 物化视图(session 摘要缓存、活跃分支成员),WAL 模式,游标分页读条目。

## 八、端到端数据流

交互模式一次用户提问:

```
Editor(pi-tui)收键入 → AgentSession.prompt()
  → AgentHarness:置 turn 状态,持久化 user 消息
  → Agent 循环:streamAssistantResponse
      transformContext → convertToLlm → 解析鉴权 → Models.stream()
  → pi-ai 出流:SSE 解析成 AssistantMessageEvent
  → 事件回流:TUI 渐进渲染,assistant 消息持久化
  → stopReason=toolUse?执行工具(beforeToolCall 可拦截),结果持久化,回循环
  → stopReason=stop:agent_end,harness flush 落盘,回 idle
```

压缩在 token 接近窗口时自动触发;分支切换追加 leaf 条目;RPC 模式数据流相同,只是事件写 stdout 而非 TUI。

## 九、关键设计决策

1. **Stream 错误从不抛出**:失败编码为 `error` 事件 + `stopReason`,agent 循环的 try/catch 极简,异常路径可预测
2. **Result<T, E> 不抛策略**:文件/shell 操作的预期失败返回 Result 而非抛异常;自定义 `ExecutionEnv` 是最接近沙箱边界的机制
3. **Append-only 会话树**:所有条目只追加,切分支追加 leaf 条目;历史不可变、可回溯,支持 fork/clone/navigateTree 不丢任何分支
4. **扩展经 declaration merging 改类型**:核心包留空接口,下游 `declare module` 合并——核心开放、应用层类型安全
5. **三运行时兼容**:side-effect-free 入口 + bundler 看不见的动态导入,Node-only 代码(AWS SDK、OAuth flow)不进浏览器包
6. **供应链加固**:精确版本锁定、锁文件守卫、shrinkwrap + lifecycle script allowlist、OIDC trusted publishing、CI `--ignore-scripts`

## 十、参考资料

- 项目网站:https://pi.dev ,文档:https://pi.dev/docs/latest
- RFC:https://rfc.earendil.com/keyword/pi/
- 官方文档 `packages/coding-agent/docs/`:quickstart、extensions(最大)、skills、session-format、rpc、sdk 等 28 篇
- 会话分享数据集:https://huggingface.co/datasets/badlogicgames/pi-mono
