# pi 启动流程与准备工作详解

## 背景

用户在终端敲 `pi` 这个简单动作背后,`main()` 函数执行了大量准备工作。本文档按**目的**归类(非执行顺序)解释这些准备分别做什么、为什么必要。

## 一、确定运行环境与进程身份

| 准备工作 | 作用 | 不做会怎样 |
|---------|------|-----------|
| `process.title = APP_NAME`、`PI_CODING_AGENT=true` | 设进程身份 | 其他代码无法识别自己在 pi 进程内 |
| `cwd = process.cwd()` | 拿当前项目目录 | agent 不知道在哪干活 |
| `agentDir = getAgentDir()` | 定位配置老家 `~/.pi/agent/` | 不知道配置/会话存哪 |
| `configureHttpDispatcher()` | 装 undici 网络层 | LLM 请求缺代理/超时控制 |

## 二、拦截轻量子命令

以下命令跑完即退,不需要建 session、加载扩展,提前拦掉省资源:

- `pi update` / `pi install` → `handlePackageCommand`
- `pi config` → `handleConfigCommand`
- `pi --version` → 直接打印退
- `pi --export <file>` → 转 HTML 退
- `pi --help` → 等扩展加载后打帮助退
- `pi --list-models` → 等 modelRuntime 建好列模型退

## 三、解析参数与校验语义

- `parseArgs(args)` — 语法解析,有 error 退
- `validateForkFlags` / `validateSessionIdFlags` — 语义校验(`--fork` 不能配 `--session` 等)
- `resolveAppMode` — 根据 flag + TTY 决定 interactive/print/rpc 模式

## 四、配置加载与数据迁移

- `runMigrations(cwd)` — 把老版本配置(auth/sessions/tools/keybindings/extensions)升级到新格式
- `SettingsManager.create(cwd, agentDir)` — 读全局 + 项目设置,合并
- `showFirstTimeSetup`(条件触发) — 新用户引导(主题 + analytics)

**必要性**:pi 在迭代,配置格式会变;不迁移老用户升级后数据会"丢失"。设置要读全(全局+项目)才知道用哪个模型、代理、主题等。

## 五、会话管理

- 解析 `sessionDir`(优先级:CLI flag > 环境变量 > 配置 > 默认)
- `createSessionManager` — 根据 `--continue`/`--resume`/`--session`/`--fork`/默认,决定新建、打开、续接、分叉会话
- `getMissingSessionCwdIssue` — 会话记录的目录不存在时,问用户怎么办
- `--name` — 给会话起名

**必要性**:agent 需要历史对话作为上下文才能接着聊;会话文件是上下文的载体,必须先定位/创建好。

## 六、项目信任机制(安全核心)

- `trustStore` — 持久化的信任记录
- `hasTrustRequiringProjectResources` — 检测项目有无危险资源(扩展/技能)
- `autoTrustOnReloadCwd` — 无危险资源的项目 reload 时免确认
- `projectTrustByCwd` — 运行时缓存,避免重复问
- `trustPromptMode` — 信任提示用什么 UI

**必要性**:`.pi/extensions/` 里的代码会被 pi 执行,恶意项目能通过项目级扩展搞破坏。所以**项目级资源必须用户显式信任**才能加载——防止 clone 一个 repo 然后 `pi` 就被 RCE。这是整个准备流程里最绕但最关键的部分。

## 七、解析 CLI 传入的资源路径

```ts
resolveCliPaths(cwd, parsed.extensions)   // --extension ./my-ext
resolveCliPaths(cwd, parsed.skills)       // --skill ./my-skill
resolveCliPaths(cwd, parsed.promptTemplates)
resolveCliPaths(cwd, parsed.themes)
```

**必要性**:用户在命令行临时加的资源,要规范化成绝对路径,后面 resourceLoader 才能找到。

## 八、搭建运行时(`createRuntime` 闭包,最重的一块)

准备工作的**高潮**,把前面所有零散上下文整合成一个能跑的 agent:

1. **判定项目信任**(可能弹框问用户)
2. **建正式 SettingsManager**(过了信任,能读项目级配置了)
3. **`createAgentSessionServices`**:
   - `settingsManager` — 配置
   - `modelRuntime` — provider、API key、可用模型列表
   - `resourceLoader` — 加载扩展/技能/模板/主题
4. **`resolveModelScope`** — 把 `--models` 模式解析成具体模型列表
5. **`buildSessionOptions`** — 算出 model、thinking level、tools 等
6. **处理 `--api-key`** — 给 provider 设 key
7. **`createAgentSessionFromServices`** — 真正建出 `session`(能 prompt 的 agent 实例)

**必要性**:前面所有准备都是零散的上下文(配置在哪、会话在哪、信任没有、用啥模型...),`createRuntime` 把它们组装成一个**自洽的运行时对象** `{ session, services, diagnostics }`,这是后面主循环能跑的前提。

## 九、用完整配置重配 HTTP

```ts
applyHttpProxySettings(settingsManager.getGlobalSettings().httpProxy);
configureHttpDispatcher(settingsManager.getHttpIdleTimeoutMs());
```

**必要性**:main 开头用 bootstrap settings 配过一次(那时没信任、没读项目级),现在 runtime 建好、设置齐了,重新配一次,保证后面 LLM 请求用对的代理和超时。

## 十、准备初始输入

- `readPipedStdin` — 读管道 stdin(`echo hi | pi`)
- `prepareInitialMessage` — 拼初始消息(管道 + 文件参数 + `-p`)
- `initTheme` — 加载主题,interactive 启主题热重载

**必要性**:用户可能在命令行就传了消息/文件,agent 一启动就该处理;TUI 一渲染要有正确颜色。

## 十一、诊断报告与最终关卡

- `reportDiagnostics` — 把 runtime 创建中攒的所有 error/warning 打出来,有 error 退 1
- 扩展加载失败额外提示 `pi -ne`
- 非交互模式没模型就退
- benchmark 标志校验
- interactive/rpc 后台静默刷新模型列表

**必要性**:带病运行会出莫名其妙的问题,提前把 error 拦下。后台刷新是为了 TUI 里 `/model` 列表最新,但不阻塞启动。

## 十二、三模式分派

```ts
if (appMode === "rpc") await runRpcMode(runtime)
else if (appMode === "interactive") await interactiveMode.run()
else await runPrintMode(runtime, ...)
```

三种模式对 runtime 的用法完全不同,各走各的入口。

## 十三、`interactiveMode.run()` 主循环

### 初始化与后台检查

```ts
await this.init();   // 初始化 TUI、stdin、渲染

// 后台异步跑,不阻塞主流程
checkForNewPiVersion(...).then(...)        // 检查 pi 新版本
this.checkForPackageUpdates().then(...)    // 检查扩展包更新
this.checkTmuxKeyboardSetup().then(...)    // 检查 tmux 键盘配置
```

### 显示启动警告

- 迁移提示(auth.json 迁移)
- `models.json` 错误
- 模型回退提示
- Anthropic 订阅认证提醒

### 处理命令行初始消息

```ts
if (initialMessage) {
    await this.session.prompt(initialMessage, { images: initialImages });
}
if (initialMessages) {
    for (const message of initialMessages) {
        await this.session.prompt(message);
    }
}
```

**关键**:`session.prompt(...)` 是 `await` 的——发给 LLM、等回复、跑工具、再等回复...直到 agent 这一轮做完才返回。初始消息**串行处理完**才进主循环。

### 主循环

```ts
while (true) {
    const userInput = await this.getUserInput();    // 等用户输入
    try {
        await this.session.prompt(userInput);       // 发给 agent
    } catch (error) {
        this.showError(errorMessage);
    }
}
```

1. `getUserInput()` — 阻塞等用户敲字回车(支持多行、slash 命令、文件补全、历史记录、vim 模式)
2. `session.prompt(userInput)` — 把用户输入发给 agent,agent 调 LLM、可能调工具(bash/edit/read 等)、循环直到完成,期间 TUI 实时渲染输出
3. `await` 等 agent 这一轮做完
4. 回到 1,等下一次输入

**`while (true)` 无限循环**,正常永不返回。退出靠 `/quit`、Ctrl+C 或致命错误。

### `session.prompt` 内部的 agent 循环

```
session.prompt("帮我改 bug")
  ↓
发给 LLM:用户消息 + 历史 + 系统提示 + 工具定义
  ↓
LLM 回复:"好,我先 read 文件" + 工具调用
  ↓
TUI 实时渲染 LLM 回复
  ↓
执行 read 工具 → 返回文件内容
  ↓
再发给 LLM:工具结果 + 上下文
  ↓
LLM 回复:"找到 bug,用 edit 改" + edit 调用
  ↓
执行 edit → 返回成功
  ↓
再发给 LLM...
  ↓
LLM 回复:"改好了"(无工具调用)
  ↓
prompt() 返回,回主循环等下一次输入
```

一次 `prompt()` 可能触发**多轮 LLM 调用 + 多次工具执行**,直到 LLM 不再要求调工具。TUI 在期间实时渲染每一步。

## 十四、为什么要做这么多——根本原因

一个 agent CLI 要正确跑起来,需要回答一堆问题:

1. **我是谁、在哪**:cwd、agentDir、进程身份
2. **用户要干啥**:子命令?help?还是真的要聊?
3. **配置是什么**:全局+项目设置、用啥模型、代理、主题
4. **历史上下文**:接哪个会话、要不要 fork
5. **安不安全**:这个项目可信吗、扩展能不能加载
6. **资源**:扩展/技能/模板/主题都加载好
7. **模型**:用哪个、有 API key 吗、可用列表
8. **初始输入**:用户在命令行传了啥消息/文件
9. **怎么跑**:TUI、一次性、还是 RPC

**任何一个没准备好,主循环都会出问题**:没会话 → 没上下文;没信任 → 安全漏洞;没模型 → 没法调 LLM;没主题 → TUI 难看;没资源路径 → 扩展加载不到。

所以准备逻辑的本质是:**把这些零散条件一个个满足,最后组装成一个自洽的 runtime,丢给主循环用**。`createRuntime` 是组装的高潮,前面都是给它凑材料。

## 总结

```
启动准备:
  确定环境 → 拦截轻量命令 → 加载配置/迁移 → 管理会话 → 判定信任
  → 加载资源 → 选模型 → 准备初始输入 → 诊断校验
  → 组装成 runtime
       ↓
三模式分派:
  rpc → runRpcMode
  interactive → interactiveMode.run()(TUI 主循环)
  print → runPrintMode(一次性跑完)
       ↓
interactive 主循环:
  while (true) {
    getUserInput → session.prompt → 渲染 → 等下一轮
  }
```

每一项准备都是 agent 能正确、安全、按用户意图跑起来的必要条件,缺一不可。
