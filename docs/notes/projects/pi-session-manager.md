# pi 会话管理机制

## 一、会话是什么

会话 = **一个 `.jsonl` 文件**,记录你跟 pi 从开始到结束的**完整对话历史 + 各种事件**。

`.jsonl` 是"每行一个 JSON"的格式,pi 的会话文件长这样:

```
第1行: {"type":"session","id":"...","cwd":"/Users/allen/proj","timestamp":"..."}   ← header
第2行: {"type":"message","message":{"role":"user","content":"帮我写个函数"}}          ← 你说的话
第3行: {"type":"message","message":{"role":"assistant","content":"好的..."}}        ← pi 的回答
第4行: {"type":"message","message":{"role":"tool",...}}                              ← 工具调用
第5行: {"type":"model_change","provider":"anthropic","modelId":"claude-..."}        ← 换模型
第6行: {"type":"thinking_level_change","thinkingLevel":"high"}                      ← 改思考深度
第7行: {"type":"compaction","summary":"之前聊了X...","tokensBefore":8000}           ← 压缩历史
...
```

## 二、会话里有什么内容(9 种 entry)

每行(entry)是这 9 种之一(`packages/coding-agent/src/core/session-manager.ts:144`):

| 类型 | 干啥 |
|------|------|
| **`message`** | 真正的对话消息(user/assistant/tool),会发给 LLM |
| **`thinking_level_change`** | 你改了思考深度(low/medium/high) |
| **`model_change`** | 你换了模型(比如从 GPT 切到 Claude) |
| **`compaction`** | 历史太长被压缩了,留了个摘要 + token 数 |
| **`branch_summary`** | 从某个分支分叉时的摘要 |
| **`custom`** | 扩展存的私有数据(不进 LLM 上下文) |
| **`custom_message`** | 扩展注入的消息(会进 LLM 上下文) |
| **`label`** | 你给某条消息打的标签(书签) |
| **`session_info`** | 会话的元信息(比如 `--name` 起的名字) |

每个 entry 都有 `id` 和 `parentId`——构成**树形结构**(可以分叉、回退到某条消息重新跑)。

## 三、存储位置

### 默认位置
```
~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<session-id>.jsonl
```

`getDefaultSessionDirPath`(`session-manager.ts:476`)把 cwd 编码成安全目录名:
```
/Users/allen/myproj → --Users-allen-myproj--
```

所以**每个项目目录有自己的会话文件夹**,互不干扰。例子:

```
~/.pi/agent/sessions/
├── --Users-allen-proj-a--/
│   ├── 2026-08-03T10-00-00-000Z_0192abcd.jsonl
│   └── 2026-08-03T14-30-00-000Z_0193efgh.jsonl
├── --Users-allen-proj-b--/
│   └── 2026-08-03T11-00-00-000Z_0194ijkl.jsonl
└── --Users-allen-another--/
    └── ...
```

### 文件名规则
`<timestamp>_<session-id>.jsonl`(`session-manager.ts:953`)
- timestamp 是 ISO 时间,把 `:` 和 `.` 替换成 `-`(文件名安全)
- session-id 是 uuidv7(时间有序,保证排序)

### 三个覆盖层级
sessionDir 可以被三层覆盖(优先级从高到低):
1. `--session-dir <path>` (CLI flag,最高)
2. 环境变量 `PI_CODING_AGENT_SESSION_DIR`
3. settings.json 的 `sessionDir` 字段
4. 默认 `~/.pi/agent/sessions/<encoded-cwd>/` (最低)

## 四、什么时候创建会话

从 `createSessionManager`(`packages/coding-agent/src/main.ts:264`)看,**几乎所有启动方式都会创建/打开会话**,只是方式不同:

### 1. 默认情况(没特殊 flag)
直接 `pi` → 建一个**全新会话**,新文件,新 id,准备开始记录。

### 2. `--no-session`
明确**不创建会话**——用 `SessionManager.inMemory`,纯内存,不落盘,退出即消失。给 `--help`/`--list-models` 这种一次性命令用。

### 3. `--continue`
`SessionManager.continueRecent`(`session-manager.ts:1557`)— 找**当前项目目录下最近的会话文件**,接着聊。文件已有内容,新消息追加进去。

### 4. `--resume`
弹选择器,列出当前项目(或所有项目)的会话,你选一个,open 它接着聊。

### 5. `--session <path 或 id 或 名字>`
按路径/id/名字定位某个特定会话,open 它。

### 6. `--session-id <id>`
按 id 找已有会话;找不到就用这个 id 建新的。

### 7. `--fork <源>`
找到源会话,**复制一份**成新会话(新文件、新 id,但内容从源会话拷过来),从分叉点继续聊。原会话不动。

### 8. `--help` / `--list-models`
不创建会话(inMemory),只是看一下就退。

## 五、会话的生命周期

```
启动 pi
  ↓
createSessionManager 根据 flag 决定:
  ├─ 新建:newSession() → 建 header → 准备写文件
  ├─ 打开已有:SessionManager.open(path) → 读文件 → 解析所有 entry
  └─ 内存:不落盘
  ↓
跟 pi 对话
  ↓
每条消息/事件 → _persist(entry) → appendFileSync 到 .jsonl  ← 追加写
  ↓
历史太长 → compaction → 留 summary,旧消息不再发 LLM(但还在文件里)
  ↓
退出 pi
  ↓
文件保留在磁盘
  ↓
下次 pi --continue / --resume → 重新打开文件接着用
```

## 六、几个关键设计

### 1. 追加写(append-only)
会话文件主要用 `appendFileSync` 追加,不重写。所以即使中途崩溃,前面的消息都在,只是最后一条可能不完整。只有 compaction / fork 等少数情况会 `_rewriteFile` 全量重写。

### 2. 树形结构
每条 entry 有 `parentId`,可以分叉。比如你在第 5 条消息处想"换种思路重来",会从第 4 条分出一条新分支。文件里所有分支都存,通过 parentId 串成树。`leafId` 记录"当前在哪条叶子"。

### 3. compaction(压缩)
历史太长 LLM 装不下时,pi 会把早期对话压缩成一个 summary entry,只发 summary + 最近消息给 LLM。文件里旧消息还在(便于回看),但 LLM 上下文里只看 summary。

### 4. cwd 绑定
会话 header 里存 `cwd`——这个会话是在哪个项目目录里跑的。`getMissingSessionCwdIssue` 会检查这个 cwd 还存不存在,不存在要问用户怎么处理。因为 pi 跑 bash、改文件都基于这个 cwd。

### 5. 项目隔离
默认按 cwd 分目录存,所以你在项目 A 的会话不会污染项目 B。`pi --resume` 默认只列当前项目的,加个选项才能跨项目看。

---

# 多会话区分与切换

## 一、怎么区分多个会话

同一个项目目录下,会话文件都在 `~/.pi/agent/sessions/<encoded-cwd>/` 里。每个会话有三层身份:

### 1. 文件名(时间戳 + id)
```
2026-08-03T10-00-00-000Z_0192abcd....jsonl
```
- 时间戳:创建时间,ISO 格式,文件名安全
- id:uuidv7(时间有序,保证排序)
- 按文件名排序 = 按创建时间排序

### 2. session-id(全局唯一)
文件名里的 `0192abcd...` 就是 session id,uuidv7 格式。在 TUI 里 `/session` 命令会显示这个 id,启动时也可以 `pi --session-id <id>` 指定。

### 3. 显示名(可选,用户给)
通过 `--name "我的实验"` 或 TUI 里 `/name` 命令设置(`packages/coding-agent/src/core/slash-commands.ts:27`)。存成 `session_info` entry(`session-manager.ts:1136`),`getSessionName` 倒序遍历找最新的。

**没起名字时,列表里只显示时间戳 + 第一条消息预览**;起了名字就显示名字,好认多了。

## 二、启动时切换会话(flag 方式)

| flag | 作用 |
|------|------|
| `pi` (无 flag) | 新建会话 |
| `pi --continue` | 接着当前项目**最近**的会话(`SessionManager.continueRecent`) |
| `pi --resume` | 弹选择器,从列表里挑一个(当前项目优先,可切到全部) |
| `pi --session <path\|id\|名字>` | 按路径/id/名字直接打开某个 |
| `pi --session-id <id>` | 按 id 精确找 |
| `pi --fork <源>` | 从某会话分叉出一个新的 |
| `pi --no-session` | 不用会话(纯内存) |

`--resume` 是最直观的"切换"——列出来让你选。

## 三、TUI 里切换会话(slash 命令)

进了 pi 之后,会话相关的命令(`slash-commands.ts`):

| 命令 | 作用 |
|------|------|
| `/new` | 开新会话(当前会话保留) |
| `/resume` | 弹选择器,切换到别的会话 |
| `/fork` | 从某条历史消息处分叉出新会话 |
| `/clone` | 在当前位置复制当前会话 |
| `/tree` | 在会话内**分支树**里切换(同一文件里的不同分支) |
| `/session` | 显示当前会话信息(id、消息数、token 数等) |
| `/name` | 给当前会话起名/改名 |
| `/export` | 导出当前会话成 HTML |
| `/import` | 从 .jsonl 文件导入会话 |

最常用的"切换"是:
- **`/resume`** — 列出所有会话选一个切过去(等于运行时版的 `pi --resume`)
- **`/new`** — 开新会话
- **`/tree`** — 在同一会话的分支间切(不是切会话,是切分支)

## 四、会话内分支 vs 多个会话

这点容易混,pi 有两层"分叉"概念:

### 1. 会话内分支(同一文件)
一个会话文件里,每条 entry 有 `parentId`,构成树。你可以在第 5 条消息处 fork 出一个新分支,文件里多存一条分支,通过 `leafId` 指向当前在哪个叶子。`/tree` 命令切这些分支。

→ **一个会话文件,多个分支,`/tree` 切**

### 2. 多个会话(多个文件)
项目目录下有多个 `.jsonl` 文件,每个是一个独立会话。`/resume` 在这些文件间切。

→ **多个会话文件,`/resume` 切**

## 五、切换会话时发生什么

从 `packages/coding-agent/src/core/agent-session-runtime.ts:193` 的 `switchSession` 看,切换会话不是简单"换个文件读",而是:

1. 找到目标会话文件
2. **重建整个 runtime**:新 SessionManager、新 AgentSession、重新加载扩展状态等
3. 扩展的 ctx 会失效(`runner.ts:540` 那个报错就是"切会话后别用旧 ctx")
4. TUI 重新渲染历史消息

所以切会话是个"重活",不是瞬时切换。这也是为什么 `switchSession` 返回 `{ cancelled: boolean }`——用户可能在确认框里取消。

## 六、会话列表怎么显示

`SessionManager.list(cwd, sessionDir, onProgress)` 列当前项目的,`listAll(sessionDir, onProgress)` 列所有项目的。列表项通常显示:
- 时间戳(或名字)
- 第一条用户消息预览
- 消息数、token 数

`pi --resume` 和 TUI 里的 `/resume` 都用这个列表。

---

# 常见场景:同一目录再次执行 pi

## 问题

在某个工作项目文件夹目录下执行 `pi` 创建了一个会话,关掉进程后,一段时间后再次在该目录执行 `pi`——这是新会话吗?如何回到之前的会话?

## 回答

### 第二次执行 `pi` 是新会话吗

**是的,默认是新会话。**

`pi` 不带任何 flag 启动时,`createSessionManager` 走的是"默认建新会话"分支(`main.ts:264`),会创建一个全新的 session-id 和新 `.jsonl` 文件。它**不会自动接上上次那个会话**。

所以你两次 `pi` 后,项目目录下会有两个会话文件:

```
~/.pi/agent/sessions/--Users-allen-myproj--/
├── 2026-08-03T10-00-00-000Z_0192abcd.jsonl   ← 第一次
└── 2026-08-03T15-00-00-000Z_0193efgh.jsonl   ← 第二次(当前)
```

### 怎么回到之前的会话

#### 方法 1:启动时用 `--continue`
```bash
pi --continue
```
直接接着**当前项目最近**的那个会话(第一次的)继续聊。最省事。

#### 方法 2:启动时用 `--resume`
```bash
pi --resume
```
弹一个列表,列出当前项目(可切到全部项目)的所有会话,你选一个。适合最近不只一个会话、想挑具体哪个时用。

#### 方法 3:已经进了新会话,用 `/resume` 切
如果第二次 `pi` 已经进去了(新会话),不想退出重启,直接在 TUI 里输:
```
/resume
```
同样弹列表选之前的会话切过去。

#### 方法 4:给会话起名,方便认
之前那个会话如果起过名字,列表里一眼能认出来:
```bash
pi --continue --name "重构登录模块"   # 续接 + 起名
```
或在 TUI 里 `/name 重构登录模块`。之后 `pi --resume` 列表里就显示这个名字,不用看时间戳猜。

### 推荐做法

如果你**经常在同一项目来回切会话**,养成两个习惯:

1. **重要会话起名**:`/name xxx` 或 `pi --name xxx`,列表里好认
2. **想接着聊用 `--continue`**:`pi --continue` 一句话搞定,不用每次选列表

如果你**每次都想接着上次聊**,可以考虑在 shell 里加个 alias:
```bash
alias pic='pi --continue'
```
以后 `pic` 就是"接着上次",`pi` 就是"开新的"。

### 一个细节

`pi --continue` 找的是**当前 cwd 对应的会话目录**里最近的文件。所以你必须**在同一个项目目录**下执行才行。换到别的目录 `pi --continue` 会找那个目录的会话,不是你想要的。

如果那个项目目录已经删了/移了,就是 `getMissingSessionCwdIssue` 那个场景——pi 会问你"原目录不在了,要不要用当前目录顶替"。
