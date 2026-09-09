---
title: "DeepSeek Harness 背后的心脏：Cordis 到底是什么"
date: 2026-09-09
description: Cordis 元框架核心机制/一切皆插件的底层原理
tags:
  - Agent
  - DeepSeek
  - Cordis
---

# DeepSeek Harness 背后的"心脏"：Cordis 到底是什么

> 一句话概括：DeepSeek Harness 的"一切皆插件"背后，跑的是一个叫 **Cordis** 的框架——原本服务于第三方 QQ 机器人，如今被 DeepSeek 用作整个 Agent 运行时的地基。
>
> 本文想讲清楚三件事：为什么"卸载"和"协作"能变成框架的默认行为，为什么"改配置不用重启"是理所当然，为什么一篇 88 页的论文会以它为研究对象。

---

## 1. 插件系统为什么要一个框架

### 1.1 四个问题

假设你写了一个聊天机器人，最初逻辑都在一个文件里。功能变多后你开始拆模块——但**模块化只解决"代码怎么组织"**，解决不了另外四件事：

| 问题 | 具体含义 |
| --- | --- |
| **安装** | 新功能怎么被"接"进系统？ |
| **配置** | 同一功能在不同部署环境用不同配置，写在哪里？ |
| **卸载** | 功能下线时，它的定时器、监听器、连接由谁来清理？清理不干净就是泄漏。 |
| **协作** | 功能 A 依赖功能 B 的能力，但 B 可能还没启动、之后可能被替换成别的实现，A 该如何应对？ |

插件系统就是对这四个问题的回答。

而 Cordis 的特点是：它把**"卸载"和"协作"**这两件事，从"插件作者的自觉"上升为**"框架级保证"**。

### 1.2 作者：Shigma

先认识一下写出它的人——**Shigma**。

Shigma 在第三方 QQ 机器人圈子里是相当出名的存在，群友们亲切地称呼他为**梦梦**。他的 GitHub 账号下有 130 多个公开仓库。如果你把 npm 上几个包的主页打开，会看到一长串 maintainer 都是同一个人：

| 包 | 一句话描述 |
| --- | --- |
| `koishi` | 跨平台聊天机器人框架（npm 官方描述："Made with Love"） |
| `cordis` | 插件化应用框架，本文的主角 |
| `@satorijs/core` | 跨平台聊天协议适配层（Koishi 支持 QQ、Discord、Telegram 的地基） |
| `schemastery` | 类型驱动的 schema 校验器 |
| `minato` | 类型驱动的数据库框架（Koishi 的数据层） |
| `cosmokit` | 通用工具集 |

这是一套**一个人撑起来的技术栈**：

- **Cordis** 是骨架（生命周期与依赖）
- **Schemastery** 管配置校验
- **Minato** 管数据存取
- **Satorijs** 管平台协议
- **Koishi** 是集大成者

整个体系共同运行在 Cordis 之上。这篇文章里讲到的每一个概念（fiber、effect、Schema、Service），都出自他一人之手。

> Shigma 在 2023 年底接受过腾讯媒体研究院《20 多岁做什么时间更有价值》系列的专访（BV1AQ4y157S8），那时他是研二学生，做 QQ 机器人开发五年了。被问到 AI 会不会取代人类时，他说：旧的岗位被取代，一定会创造出新的岗位，人类反而更有机会生活在更好的世界里。他做 QQ 机器人的初衷之一，就是帮自己提升工作效率。
>
> 那时 Cordis 还在 Koishi 的小圈子里，没人想到它两年后会成为 DeepSeek Harness 的心脏。

### 1.3 出身与名字

- **2020 年 1 月**：Cordis 诞生于 **Koishi**——Shigma 创立的跨平台聊天机器人框架，发布首个正式版本
- **2022 年 4 月**：Koishi 的插件体系成熟后，核心层被独立出来成为通用框架，`cordis` 包登上 npm
- **2023 年底**：进入 3.x
- **2024 年 11 月**：开始迭代 **Cordis 4**（首个 4.0 预发布），一次彻底重构，引入了基于 **fiber** 的生命周期体系

**名字的由来**：Cordis 是拉丁语"心"（cor）的所有格，意为"心脏"。它是 Koishi 的心脏，如今也成了 DeepSeek Harness 的心脏。

### 1.4 定位：元框架

Cordis **不是**机器人框架（Koishi 才是，Cordis 只是它的底层），也**不是** DI 容器。

| | 回答的问题 |
| --- | --- |
| 传统 DI | "谁创建谁" |
| **Cordis** | **"谁在什么时候活着"** |

论文给它的定位是 **meta-framework（元框架）**：它规定"副作用如何组合、依赖如何解析"，但不预设任何业务领域——QQ 机器人可以用它，Agent 运行时也可以。

### 1.5 一篇论文

Cordis 的配套论文《**A Programming Paradigm for Spatiotemporal Composability**》以预印本发布：

- 署名单位：**北京大学** 与 **DeepSeek-AI**
- 第一作者：**Yifan Shi**
- 合著者：**Wei Zhang、Tianyi Cui**
- 篇幅：88 页

论文把 Cordis 的机制**形式化**，给出了定义、定理与证明。这一点在第 5 章还会回来。

---

## 2. 核心机制：五个概念

Cordis 的全部语义可以浓缩为五个概念：

```
插件 · 上下文 · 注入 · 事件 · 可逆副作用
```

下面由浅入深逐一拆开。

### 2.1 第一个插件

写 Cordis 插件最爽的一点：**完全不需要框架启动代码**。

```ts
// hello.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

```yaml
# cordis.yml —— 应用本身就是一个配置文件
- name: './hello.ts'
```

运行 DSH 自带的小启动器（创建根 Context、挂载 Loader 插件、读取 `cordis.yml`），输出 `hello from my first plugin`。

注意这里的分工：

> **插件只描述贡献，应用长什么样由配置决定。**

这就是"配置即组合"。

插件有三种形态：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. 函数形态（最常见）
export function apply(ctx: Context) {}

// 2. 对象形态
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. 类形态（要对外提供服务时用）
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myService')
  }
}
```

> **在 DSH 里**：你写的每一个工具插件、适配器插件、面板插件，都是这三种形态之一。

### 2.2 上下文（Context）：一切操作的入口

在 Cordis 里，你几乎只会跟一个东西打交道：**`ctx`**。它是上下文，也是服务容器，承载了插件能做的所有事情：

```ts
export function apply(ctx: Context) {
  ctx.on('some/event', (payload) => { /* ... */ })  // 监听事件（卸载时自动移除）
  ctx.effect(() => { /* ... */ })                   // 注册副作用（卸载时自动回滚）
  ctx.plugin(SomePlugin)                            // 挂载子插件（随父插件卸载）
  ctx.get('someService')                            // 读取服务（没有则 undefined）
  ctx.provide('someValue', 42)                      // 提供服务
}
```

**`ctx.plugin(child)` 不是简单的"注册"，而是派生出一个子上下文。** 插件因此不是平铺的，而是一棵树：

```
根 Context
├── plugin A
│   ├── plugin A1
│   └── plugin A2
└── plugin B
    └── plugin B1
```

- 子上下文**能看到父上下文的一切**（继承）
- 但卸载是**按层级的**：父插件卸载，它的所有子插件递归卸载；子插件卸载，不影响兄弟和父级

这棵插件树是 Cordis 一切生命周期语义的骨架。

> **在 DSH 里**：你看到的每个功能（工具、模型、会话、面板）都对应着这棵树上的一次 `ctx.plugin()`。

### 2.3 fiber：插件的生命周期

Cordis 4 为每个已加载的插件实例维护一个 **fiber（纤维）**，状态机如下：

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
              ↘ FAILED ↗
```

| 状态 | 含义 |
| --- | --- |
| **PENDING** | 已声明，但 `inject` 的服务尚未就绪，等待中 |
| **LOADING** | `apply` 正在执行 |
| **ACTIVE** | `apply` 已完成 |
| **FAILED** | `apply` 抛异常或配置校验失败 |
| **UNLOADING** | 清理中 |
| **DISPOSED** | 已拆除 |

一个 fiber 就是一个已加载插件实例的**生命周期句柄**：

> **无论因何卸载**（改配置 / 热重载 / 显式 `dispose()` / 依赖服务消失），**清理都是自动的**。

> **在 DSH 里**：`cordis_inspect` 巡检的就是每个 fiber 的状态；一个插件"加载了却没反应"，多半是蹲在 **PENDING**。

### 2.4 effect：可逆的副作用

这是 Cordis 的第一个核心机制，也是它与传统 DI 容器的区别所在。

```ts
ctx.effect(() => {
  const conn = createConnection()
  return () => conn.close()   // disposer：如何清理
})
```

- `effect` 的**主体**在加载时执行
- 返回的 **disposer** 在卸载时执行

**你永远不需要自己调用清理函数**——不管插件因为什么原因被卸载，Cordis 都会替你把定时器、监听器、连接全部回滚。

此外，Cordis 的内置 API 本身就是 effect：

- `ctx.on()` 的监听器随插件卸载
- `ctx.plugin()` 的子插件递归卸载
- 服务注册随提供方消失

论文的实现章节有一个关键结论：

> **Cordis 中所有对上下文的变更，最终都归结为 `ctx.effect` 这一个原语。**

提供服务、挂载插件、注册监听器，全是它的特例。因此"任何通过上下文进行的操作都自动可追踪、可恢复"不是设计口号，而是**结构事实**。

插件作者只需要记住一条铁律：

> ⚠️ **凡是自己创建、Cordis 不管的资源，都包进 `ctx.effect()`。**

因为副作用可逆，插件就可以被安全地卸载与重装，由此获得：

- 热重载（HMR）
- 故障自动恢复
- 测试隔离

> **在 DSH 里**：改配置 → 旧插件卸载（所有 effect 回滚）→ 新插件加载，**进程不重启**。这就是"改配置不用重启"的底层原理。

### 2.5 服务与注入：响应式的依赖

这是 Cordis 的第二个核心机制。

把一项能力挂到 `ctx` 上，让别的插件按名字取用，这就是 **Service**：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')   // 注册：以后谁都能 ctx.greeter 拿到我
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}
```

消费方**只声明名字，不 import 实现**：

```ts
export const inject = ['greeter']   // 声明依赖

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))   // 此时 greeter 必定就绪
}
```

`inject` 的语义是：**插件保持 PENDING，直到所列服务全部就绪**。

配置文件顺序无关紧要，**启动顺序由依赖关系决定**。

#### 与传统 DI 的本质区别

| | 假设 |
| --- | --- |
| 传统 DI | "一旦绑定，服务就一直在" |
| **Cordis** | **"服务可以随时出现，也可以随时消失"** |

在 Agent 场景里后者是常态：

- LLM 提供方被限流
- MCP 服务器崩溃导致工具被注销
- 文件 watcher 被系统杀死

Cordis 的处理是：

> **提供方被卸载时，所有依赖它的插件自动卸载（effect 回滚）；新提供方就绪后，自动重载。**

依赖方**不需要写任何重连代码**。

#### 两个配套机制

| 机制 | 作用 |
| --- | --- |
| `ctx.isolate(key, realm)` | **隔离**。让一个作用域内某项服务解析到独立实例，两个组各自用各自的实现，互不干扰 |
| `ctx.intercept(key, meta)` | **拦截**。给依赖访问附加元数据，外层上下文可以约束组件如何使用某个依赖，而不修改组件本身 |

> **在 DSH 里**：`ctx.tools`、`ctx.llm`、`ctx.shell`、`ctx.sessions`、`ctx.skills` 全都是这样的服务（第 4 章会列出完整的槽位表）。

### 2.6 事件：喊话与决策链

服务适合"直接打电话"，但很多时候插件只想"喊一嗓子"或者"拦一下"，不关心谁在听。

Cordis 的事件系统是**类型化**的，事件名和监听器签名靠 TypeScript 声明合并获得全链路类型安全：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

ctx.emit('stats/report', 'tool_call', 42)        // 发出
ctx.on('stats/report', (name, count) => { /* 监听，卸载时自动移除 */ })
```

#### 五种分发模式

事件采用哪种分发模式，是它的**公开契约**，决定了监听器能否返回值、能否并发、能否短路：

| 模式 | 语义 |
| --- | --- |
| `emit` | 同步广播；不等待、不收集返回值 |
| `parallel` | 所有监听器并发执行并等待 |
| `serial` | 按序执行；第一个非空返回值胜出，停止后续 |
| `bail` | `serial` 的同步版本 |
| `waterfall` | 环绕中间件（around-middleware），见下 |

#### waterfall：DSH 用得最多的模式

本质是把 **Koa、Express 的中间件搬进事件系统**：每个监听器收到参数和一个 `next()` continuation：

```ts
ctx.on('some/decision', async (input, next) => {
  if (!hasPermission(input)) return { denied: true }  // 不调 next() = 否决，短路
  return next()                                        // 调 next() = 放行
})
```

多个互不相识的插件，就这样组成一条**决策链**：

```
监听器 A → 监听器 B → 监听器 C → 最内层默认行为
   ↓           ↓           ↓
 放行        否决（短路）   放行
```

> ⚠️ **一条 DSH 明文纪律**：只负责观察和记录的 waterfall 监听器**必须调用 `next()`**，否则会无声地吞掉下游所有默认行为。

> **在 DSH 里**：工具执行管道 `tools/pre-execute → tools/execute → tools/post-execute` 就是一条 waterfall 链；`approval/request`、`agent/request` 也是。

### 2.7 Schema 与声明式组合：配置即程序

`cordis.yml` 里的每一项（entry）都可以带元数据：

```yaml
- id: greeter        # 稳定身份：loader 靠它区分"修改"与"删了重加"
  name: './greeter.ts'

- id: consumer
  name: './consumer.ts'
  disabled: true     # 保留条目但不挂载；改回后自动加载
```

| 字段 | 作用 |
| --- | --- |
| **`id`** | 不带 `id` 的条目每次读取都会获得新 id，于是配置文件的任何编辑都会被当作"先删后加"。**带 `id` 才能精准增量更新。** |
| **`group`** | 把一组插件打包成单元整体装卸；配合 `isolate` 可让组内使用独立的服务实例 |

**Schema 校验**：插件用 schema 声明配置结构（schemastery，就是 Shigma 写的那个），Cordis 在调用 `apply` **前**校验。配置非法则加载失败并给出精确错误——**插件绝不会在配置不完整时半启动**。

```ts
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})
```

**`!!js` 表达式**：DSH 的 Loader 扩展支持在 `config` 与 `disabled` 字段内写运行时求值的表达式（如 `!!js process.env.X ?? 'default'`），并在依赖就绪后才求值。

> **配置即程序**：修改配置 = 局部热替换，无需重启。

> **在 DSH 里**：`cordis.patch.yml` 与 `--patch` 覆盖层，就是这套声明式组合在生产环境的使用方式。

---

Cordis 的五个核心概念全部出场：插件、上下文、注入、事件、可逆副作用，加上把它们串起来的 Schema。这些机制组合起来，能搭出多大的系统？下一章用 DeepSeek Harness 来回答。

---

## 3. 在 DeepSeek Harness 中：一切皆插件

> 以下内容来自 DSH 0.1.0-rc.6 的实际源码（`@deepseek-ai/cordis` 4.0.1）。

### 3.1 启动：约二十行代码搭起整个应用

```ts
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'

async function boot(binName, configPath, patches, prepare, baseUrl) {
  const ctx = new Context()
  ctx.baseUrl = /* 相对路径基准 */
  ctx.provide('dshHomePath', dshHomePath)          // 引导值
  await ctx.plugin(Loader)                          // 挂载 Loader
  await prepare?.(ctx)
  await mountRootInclude(ctx, configPath, patches, baseUrl)  // Include 挂载配置树
  await ctx.get('loader')?.await()                  // 等整棵树稳定
  await assertEntriesActivated(ctx, binName)        // 审计：不允许条目半死不活
  return ctx
}
```

**根 Context 只做了三件小事。其余一切，来自配置树。**

### 3.2 Profile：应用被拆成可叠加的层

DSH 引入了 **Profile** 概念：`$DSH_HOME/profiles/<名字>` 下的一个目录，包含 manifest（`dsh.profile.bundles` 列出按顺序应用的组合包）和用户自己的 `cordis.patch.yml`。

配置树的组装顺序：

```
内置 bundle（如 dsh-base）
        ↓
profile 中声明的其他 bundle
        ↓
用户 cordis.patch.yml      ← 最后写，覆盖力最强
        ↓
命令行 --patch 覆盖层
```

**Bundle（组合包）** 就是一个 npm 包，其 `package.json` 声明：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

核心组合包 `@deepseek-ai/dsh-base` 的 patch，就是把几十个插件一次 insert 进空根：

```yaml
- insert:
  - id: timer
    name: '@deepseek-ai/cordis-plugin-timer'
  - id: hmr
    name: '@deepseek-ai/cordis-plugin-hmr'
    config:
      root: ['.']
  - id: llm
    name: '@deepseek-ai/dsh-llm'
  - id: session
    name: '@deepseek-ai/dsh-session'
  - id: agent
    name: '@deepseek-ai/dsh-agent'
  - id: jobs
    name: '@deepseek-ai/dsh-jobs-local'
  # ……以及更多
```

部署方想改默认行为，**无需改任何源码**，在自己的 patch 层按 `id` 覆盖一行即可（后写覆盖先写、可 `insert`、可 `disabled`）。

> 连"应用由哪些插件组成、各是什么配置"本身，都是**可叠加、可覆盖、可审计**的声明——这就是"一切皆插件"的技术底座。

在 Web 界面上，这套机制直接暴露成插件管理面板：搜索插件、逐个启停、打开配置文件。安装包里默认可见的插件就有 **160 个**左右。

### 3.3 工具流水线：Agent 的每一项能力

Agent 的能力边界是 `ctx.tools` 服务。注册一个工具，本质就是一个 Cordis 插件：

```ts
export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true },
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

三个细节：

1. `inject: ['tools']` —— 等待注册表就绪
2. `ctx.tools.register(...)` —— **注册即 effect**，插件卸载时工具自动注销
3. `tools/result` 事件 —— 让任何插件都能观察每次工具调用，无需认识执行者

> 本文写作过程中用到的 `bash`、`read`、`grep`、`subagent` 等工具，全部挂在 `ctx.tools` 上。

### 3.4 自指的设计：Agent 检查并改装自己的运行时

DSH 最值得注意的包是 `@deepseek-ai/dsh-tool-cordis`，官方称之为**"自指的 Cordis 工具集"**（self-referential Cordis toolset）。它给 Agent 提供五个工具：

| 工具 | 作用 |
| --- | --- |
| `cordis_inspect` | 对当前进程**只读巡检**：哪些服务在运行、各 fiber 的状态、注册了哪些工具、每个 `ctx.<key>` 的完整契约 |
| `cordis_define` | 现场定义一个小插件包（可带"宿主半 + 浏览器半"），只记录不执行 |
| `cordis_run` | 把宿主半放入 `node:vm` 沙箱执行，把浏览器半推送到每个打开的网页 |
| `cordis_stop` | 卸载动态包 |
| `cordis_undefine` | 卸载动态包 |

于是：

> **Agent 可以检查自己运行的框架、现场编写并运行动态插件、用完再卸载**——全程不动 `cordis.yml`、不装 npm 包、不重启进程。

DSH 的信任立场很明确：**动态包与 bash 同权**，沙箱隔离全局但**不构成安全边界**。

#### 双半插件设计

- **宿主半**跑在服务端，管逻辑
- **浏览器半**跑在网页里，管 UI
- 二者通过 `host.call` 做 RPC

"一切皆插件"在 DSH 里是**字面意义上**的：前端 UI 组件也是插件（`dsh-client-ui-*` 系列有几十个包），**浏览器里运行着一个独立的 Cordis 客户端运行时**。

> 自省 + 现场改装，这两点叠加就是"**可进化 Agent**"的雏形。论文结论部分恰好把"自进化 Agent 运行时"列为这套理论未来的验证方向（见 5.9）。

---

## 4. 在 DSH 里能开发什么：插件槽位与插件创意

这一章回答一个更实际的问题：如果我想在 DSH 里做点什么，有哪些"槽位"可以插？

以下槽位清单来自 DSH 的能力文档（capability-seams）与安装包中实际注册的服务键。

### 4.1 槽位：扩展点全部是服务

DSH 的扩展点**不是一个"API 列表"，而是一张 Cordis 服务注册表**：任何插件都可以注册新服务，也可以替换已有服务的提供方（这正是 §2.5 响应式依赖的直接应用）。

| 类别 | 槽位（`ctx.<key>`） | 用途 | 现有提供方（可替换） |
| --- | --- | --- | --- |
| **执行** | `shell` | Bash 执行 | `bash-local`、`bash-sandbox`、`pwsh-local`、E2B |
| **执行** | `codeRuntime` | 代码执行 | `code-runtime-worker` |
| **执行** | `subprocess`、`terminals` | 子进程、持久 PTY | `subprocess-local`、`terminal-bash` |
| **执行** | `lsp` | 语言服务器导航 | `lsp-local` |
| **模型** | `llm` | LLM 适配器注册表 | `llm-deepseek`、`llm-pi-ai`、`llm-replay` |
| **智能** | `agents`、`agentLoop`、`agentDefaultModel` | Agent 注册表、循环驱动、默认模型 | `agent-loop`、`agent-default-model` |
| **智能** | `agentPresets` | 会话级 Agent 组合 | `agent-presets` |
| **智能** | `subagents` | 子 Agent 提供方 | `subagent-spawn/fork-in-process`、ACP、Codex、Claude Code |
| **数据** | `sessions`、`sessionPersistence` | 会话日志、持久化 | `session-persistence-jsonl`、`-sqlite` |
| **数据** | `sessionQuery` | 会话读取与检索 | `session-query-sqlite` |
| **数据** | `storage`、`attachments`、`spillStore` | 通用存储、附件、溢出存储 | `storage-json`、`storage-sqlite`、`attachment-local`、`spill-local` |
| **数据** | `sessionTitle`、`sessionProjections` | 会话标题、投影单元 | `session-title-first-prompt-llm` 等 |
| **环境** | `fs` | 文件系统提供方 | `fs-local`、`fs-sandbox`、`fs-e2b` |
| **环境** | `web` | Web 访问（抓取、搜索） | `web-fetch-http`、`web-search-deepseek/exa/perplexity` |
| **环境** | `credentials`、`settings` | 凭据、用户设置 | `credentials-local`、`settings-file` |
| **环境** | `webServer`、`directoryPicker` | HTTP 路由、目录选择 | `webserver`、`directory-picker-native/browse` |
| **治理** | `tools` | 工具注册表与受保护执行管道 | 所有 `dsh-tool-*` |
| **治理** | `approval`、`permissionPresets`、`sandboxPolicy` | 审批、权限、沙箱策略 | `approval`、`permission-presets`、`sandbox-policy` |
| **编排** | `goals`、`jobs`、`workflowEngine`、`planMode` | 长期目标、后台任务、工作流、计划模式 | `dsh-goal`、`dsh-jobs-local`、`workflow-worker-thread` |
| **自指** | `dynamicCordisRunner`、`cordisInspect` | 动态包宿主、运行时巡检 | `cordis-host-runner` |
| **前端** | `slots`、`clientModules`、`theme`、`locale` | UI 槽位、客户端插件图、主题、语言 | `dsh-client-ui-*` 系列 |

### 4.2 槽位背后的设计：三种角色

DSH 对"可替换能力"有一套固定模式——**Service Definition、Service Provider、Consumer** 三种角色。以 `shell` 为例：

```
   ┌─────────────────┐
   │   Definition    │  只声明服务与类型，几乎不变
   │     (shell)     │
   └────────┬────────┘
            │
   ┌────────┴────────┐
   │    Provider     │  可独立替换：bash-local / bash-sandbox / pwsh-local / E2B
   └────────┬────────┘
            │
   ┌────────┴────────┐
   │    Consumer     │  tool-bash 等，与具体 Provider 互不依赖
   └─────────────────┘
```

> **换提供方 = 在 `cordis.yml` 里改一行。** Definition 和所有 Consumer 保持不变，依赖方自动重载。

这套模式就是"一切皆插件"在能力层面的落地：

> 每一项能力都是一个 **seam（接缝）**，接缝两侧可以独立演进。

### 4.3 开发入口：三种方式把插件装进去

| 方式 | 适用场景 | 做法 |
| --- | --- | --- |
| **patch 覆盖层**（最快） | 临时试验 | 写一个 YAML，`dsh web --patch ./my-plugins.yml` 启动时插入条目 |
| **profile 的 `cordis.patch.yml`** | 常驻生效 | 写在用户层，每次启动自动应用 |
| **bundle 包** | 分发复用 | 把一组插件打包成 npm 包，声明 `dsh.bundle.patch`，成为可复用的"组合包" |

patch 覆盖层示例：

```yaml
- insert:
  - id: my-plugin
    name: '/abs/path/to/my-plugin.ts'
```

插件代码本身依然是 Cordis 那套：函数、对象、类三种形态、`inject` 声明依赖、`ctx.effect` 管理资源、`Schema` 校验配置、`ctx.tools.register(defineTool(...))` 注册工具。

### 4.4 已经存在的插件

内置的插件（`dsh-*` 包）按角色分四类：

**① 工具类**（挂在 `ctx.tools` 上，即 Agent 能调用的能力）

`tool-bash`、`tool-fs`、`tool-fs-search`、`tool-web`、`tool-subagent`、`tool-subagent-control`、`tool-workflow`、`tool-goal`、`tool-jobs`、`tool-todo`、`tool-skill`、`tool-ralph`、`tool-ask-user`、`tool-lsp`、`tool-cordis`（自指工具集）……

**② 提供方类**

| 类别 | 提供方 |
| --- | --- |
| 模型适配器 | DeepSeek、pi-ai 多提供方、replay |
| shell 提供方 | 本地、沙箱、PowerShell |
| fs 提供方 | 本地、沙箱、E2B |
| web 搜索源 | DeepSeek、Exa、Perplexity |
| 持久化后端 | JSONL、SQLite |
| 其他 | 存储后端、技能提供方、会话标题生成器 |

**③ 系统类**

上下文压缩（`compaction-basic`）、token 计量、消息反馈、权限预设、计划模式、长期目标、审批管道……

**④ 前端类**

`dsh-client-ui-*` 数十个包：设置页、模型选择、插件管理、任务面板、子 Agent 面板、目标面板、主题……

#### 社区生态

内置之外，社区已经长出了一片插件生态。GitHub 上有一个社区维护的精选列表 **awesome-dsh-plugin**（搜 `dsh-plugin` 话题就能找到），截至 **2026 年 8 月**收录 **174 个**可通过 `dsh plugin add` 安装的插件。

几个有代表性的例子：

| 方向 | 插件 | 作用 |
| --- | --- | --- |
| **改界面** | `dsh-visualize` | 让模型把交互式 HTML 卡片直接画进会话流 |
| **改界面** | `dsh-TUI` | 像素鲸鱼顶栏的全屏终端 UI |
| **改界面** | `dsh-deep-whale` | 一系列 Web 皮肤 |
| **改界面** | `dsh-balance-meter` | 在输入框显示账户余额与花费 |
| **改记忆** | `dsh-memento` | 有界、分层、带审批门、可审计的跨会话记忆 |
| **改记忆** | `dsh-mneme` | 用 SQLite + 可编辑的 Markdown 镜像做跨会话记忆 |

---

## 5. 论文视角：从开发者纪律到定理

前四章讲的是"怎么用"，这一章回到开头那个问题：**为什么一篇 88 页的论文会以 Cordis 为研究对象？**

论文《A Programming Paradigm for Spatiotemporal Composability》做的是一件事：**把 Cordis 的机制形式化**。

- **空间维（spatial）**：组件如何组合、依赖如何解析、作用域如何隔离
- **时间维（temporal）**：组件在什么时候活着、卸载时如何完整恢复

前四章里那些"用起来很顺手"的特性，在论文里都有对应的定义、定理与证明：

| 工程特性 | 对应的形式化保证 |
| --- | --- |
| 卸载自动清理 | 副作用的**可逆性**（所有上下文变更归结为 `ctx.effect` 一个原语） |
| 依赖方自动重载 | 依赖的**响应式解析**（服务可随时出现或消失） |
| 改配置不重启 | 配置的**声明式组合**与局部热替换 |
| 决策链可短路 | waterfall continuation 的语义 |

### 5.9 结论：点名自进化 Agent

论文结论明确把 **self-evolving agent harnesses（自进化 Agent 运行时）** 列为未来验证方向：

> AI 在少有人监督的情况下持续生成并替换自己的组件，需要"**快速替换下的完整恢复保证**"（时间维）与"**频繁拓扑变化下的依赖协调保证**"（空间维）。

论文写作时这还只是展望——而 DSH 的 `cordis_define`、`cordis_run` 正是这一方向的具体实现。

换句话说：**论文里展望的东西，DSH 已经做出来了。**

---

## 6. 结语：心脏、引擎与定理

回到标题那个问题：Cordis 到底是什么？

**它是 Koishi 的心脏，如今也是 DeepSeek Harness 的心脏。**

但最值得关注的不是它"写得不错"，而是它完成了一次性质上的转变：

> **它把"安全地动态装卸组件"从开发者纪律，变成了定理。**

在此之前，"插件卸载时记得清理定时器"是一条写在文档里的**提醒**——遵守靠自觉，违反靠 review。在此之后，它是框架结构上的一个**事实**——你想不清理都做不到，因为所有变更都必须经过 `ctx.effect` 这一个原语。

而这恰恰是**自进化软件唯一靠得住的地基**：

- 当 AI 开始持续生成并替换自己的组件时，没有人会去逐行 review 它写的清理代码
- 唯一能依赖的，是框架在结构上保证"卸载必然完整恢复"

一个 2020 年为 QQ 机器人写下的核心层，五年后成了 Agent 运行时的地基，还被写进了 88 页的论文——这大概就是"把一件事做对"的样子。

---

## 附：概念速查表

| 概念 | 一句话 |
| --- | --- |
| **插件（Plugin）** | 函数 / 对象 / 类三种形态，`apply(ctx)` 描述贡献 |
| **上下文（Context）** | 一切操作的入口，派生出子上下文形成插件树 |
| **fiber** | 插件实例的生命周期句柄：`PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED` |
| **effect** | 可逆副作用，返回 disposer，卸载时自动回滚 |
| **Service** | 挂在 `ctx` 上的命名能力，可随时出现或消失 |
| **inject** | 声明依赖，未就绪则保持 PENDING |
| **isolate** | 让作用域内某项服务解析到独立实例 |
| **intercept** | 给依赖访问附加元数据，约束使用方式 |
| **事件模式** | `emit` / `parallel` / `serial` / `bail` / `waterfall` |
| **waterfall** | 环绕中间件，不调 `next()` 即否决短路 |
| **Schema** | 声明式配置校验，调用 `apply` 前完成 |
| **Bundle** | npm 包形态的插件组合，声明 `dsh.bundle.patch` |
| **Profile** | 可叠加的配置层：`$DSH_HOME/profiles/<名字>` |
| **seam** | Definition / Provider / Consumer 三层分离的可替换能力接缝 |


## 参考文章

> 本文基于以下资料整理与扩展，并结合源码进行二次分析。

| # | 标题 | 来源 | 链接 |
| --- | --- | --- | --- |
| 1 | DeepSeek Harness 背后的"心脏"：Cordis 到底是什么 | 微信公众号 | [mp.weixin.qq.com](https://mp.weixin.qq.com/s/3vtCkp6EbA5MhRERD6f17A) |