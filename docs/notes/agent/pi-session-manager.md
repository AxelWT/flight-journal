---
title: "pi 会话机制详解:管理、切换与分支树"
date: 2026-09-26
description: pi 会话管理机制:jsonl 存储、生命周期、多会话切换与 /tree 分支树原理
tags:
  - Agent
  - pi
  - 源码
---

# pi 会话机制详解:管理、切换与分支树

> 本文合并介绍 pi 的会话管理机制(存储、生命周期、多会话切换)与会话树(`/tree`)分支机制。源码位置均来自 [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono)。

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

### 1. 会话里的 9 种 entry

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

每个 entry 都有 `id` 和 `parentId`——构成**树形结构**(可以分叉、回退到某条消息重新跑),详见第五节。

### 2. 消息的三种角色

实际消息序列**不是严格的 user/assistant 交替**,有三种 role(`ai/src/types.ts:423`):

```ts
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

| role | 谁 | 内容 |
|------|-----|------|
| `user` | 用户输入 | 文本/图片 |
| `assistant` | LLM 回复 | **文本 + thinking + toolCall**(一次回复里可同时有文本和工具调用) |
| `toolResult` | 工具执行结果 | 工具返回的内容 |

`AssistantMessage`(`types.ts:390`)的 `content` 是数组,可**同时**含多种内容:

```ts
export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];   // 数组,可同时含多种
    stopReason: StopReason;   // "stop" | "toolUse" | ...
}
```

- `TextContent` — 文字("我来读一下文件")
- `ThinkingContent` — 思考过程
- `ToolCall` — 工具调用请求

`stopReason` 标志这条 assistant 的结束原因:

- `"toolUse"` — 要调工具,agent 循环继续
- `"stop"` — 真正说完话了,agent 循环结束

### 3. 真实消息序列示例

"帮我读 a.txt 然后总结"的对话,文件里的消息序列:

```
1. user:       "帮我读 a.txt 然后总结"
2. assistant:  [thinking] + [toolCall: read("a.txt")]     ← LLM 决定调工具
3. toolResult: "a.txt 的内容..."                          ← 工具执行结果
4. assistant:  [text: "a.txt 讲的是..."]                    ← LLM 基于工具结果总结
```

注意 2 和 4 **都是 assistant**,中间夹了个 toolResult。不是 user/assistant 交替。

更复杂的例子(一次调多工具 + 多轮工具):

```
1. user:       "对比 a.txt 和 b.txt"
2. assistant:  [toolCall: read("a.txt"), toolCall: read("b.txt")]   ← 一次调俩
3. toolResult: "a.txt 内容..."                ← 第一个工具结果
4. toolResult: "b.txt 内容..."                ← 第二个工具结果
5. assistant:  [toolCall: read("c.txt")]      ← 还要看 c.txt
6. toolResult: "c.txt 内容..."
7. assistant:  [text: "对比结果如下..."]       ← 最终回答
```

### 4. agent 循环的真实结构

```
user 消息进来
  ↓
[第1轮] 发给 LLM
  LLM 回 assistant 消息(stopReason=toolUse,含 toolCall)
  ↓
执行工具,产生 toolResult 消息
  ↓
[第2轮] 把历史 + toolResult 再发给 LLM
  LLM 可能又回 assistant(还调工具)→ 又 toolResult → 再发...
  ↓
[第N轮] LLM 回 assistant(stopReason=stop,纯文本)
  ↓
prompt() 返回,等下一次 user 输入
```

**所有这些 assistant 和 toolResult 都是独立的消息,全部存进 .jsonl 文件**。LLM 每次调用看到的上下文是:之前所有消息(含历次工具调用和结果)。

### 5. 为什么不会"AI 跟自己对话"

`toolResult` 是**工具执行的结果**,不是 LLM 自己产生的内容。流程是:

```
LLM → 请求调工具(assistant 里的 toolCall)
   ↓
agent 框架(pi)执行工具(bash/read/edit 等)
   ↓
agent 框架把结果包成 toolResult 消息
   ↓
LLM 看到自己的请求 + 工具结果,继续
```

每条 assistant 之间一定夹着 toolResult(工具结果),或 user 消息。LLM 不会连续产生两条 assistant 消息而不经过工具或用户。

## 二、存储结构

### 1. 存储位置

默认位置:

```
~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<session-id>.jsonl
```

`getDefaultSessionDirPath`(`session-manager.ts:476`)把 cwd 编码成安全目录名:

```
/Users/allen/myproj → --Users-allen-myproj--
```

所以**每个项目目录有自己的会话文件夹**,互不干扰:

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

### 2. 文件名规则

`<timestamp>_<session-id>.jsonl`(`session-manager.ts:953`):

- timestamp 是 ISO 时间,把 `:` 和 `.` 替换成 `-`(文件名安全)
- session-id 是 uuidv7(时间有序,保证排序)
- 按文件名排序 = 按创建时间排序

### 3. 三个覆盖层级

sessionDir 可以被三层覆盖(优先级从高到低):

1. `--session-dir <path>`(CLI flag,最高)
2. 环境变量 `PI_CODING_AGENT_SESSION_DIR`
3. settings.json 的 `sessionDir` 字段
4. 默认 `~/.pi/agent/sessions/<encoded-cwd>/`(最低)

### 4. 树形结构:id + parentId

每条 entry 都有两个字段(`session-manager.ts:46`):

```json
{
  "id": "msg_005",
  "parentId": "msg_004",
  ...
}
```

所有 entry 通过这俩字段串成一棵树。例如:

```
msg_001 (user: "写个函数")
  └─ msg_002 (assistant: "好的...")
       └─ msg_003 (user: "换个思路")
            └─ msg_004 (assistant: "行...")
                 ├─ msg_005 (user: "用递归")        ← 分支 A
                 │    └─ msg_006 (assistant: "ok")
                 └─ msg_007 (user: "用迭代")        ← 分支 B
                      └─ msg_008 (assistant: "ok")
```

**8 条 entry 全在一个文件里**,通过 parentId 串成树,两个分支并存。无论 `/tree` 切了多少次分支,**整个会话始终是一个 `.jsonl` 文件**,不会因为分叉就分裂成多个文件。

### 5. leafId:标记"当前在哪"

SessionManager 有个 `leafId` 字段(`session-manager.ts:866`),指向"当前所在的叶子节点"。比如在分支 A 的 msg_006,`leafId = "msg_006"`。

### 6. 追加写,不改老数据

会话文件主要用 `appendFileSync` 追加,不重写。新消息直接 append 到文件末尾,`parentId` 指向当前 `leafId`,**老分支的 entry 永远不会被修改或删除**。所以即使中途崩溃,前面的消息都在,只是最后一条可能不完整。只有 compaction / fork 等少数情况会 `_rewriteFile` 全量重写。

## 三、会话的创建与生命周期

### 1. 什么时候创建会话

从 `createSessionManager`(`packages/coding-agent/src/main.ts:264`)看,**几乎所有启动方式都会创建/打开会话**,只是方式不同:

| 启动方式 | 行为 |
|---------|------|
| `pi`(无 flag) | 建一个**全新会话**,新文件,新 id |
| `pi --no-session` | 不创建会话——`SessionManager.inMemory`,纯内存,不落盘,退出即消失 |
| `pi --continue` | `SessionManager.continueRecent`(`session-manager.ts:1557`)— 找**当前项目目录下最近的会话文件**,接着聊 |
| `pi --resume` | 弹选择器,列出当前项目(或所有项目)的会话,选一个接着聊 |
| `pi --session <path\|id\|名字>` | 按路径/id/名字定位某个特定会话,打开它 |
| `pi --session-id <id>` | 按 id 找已有会话;找不到就用这个 id 建新的 |
| `pi --fork <源>` | 复制源会话成新会话(新文件、新 id,内容从源会话拷过来),从分叉点继续聊,原会话不动 |
| `pi --help` / `--list-models` | 不创建会话(inMemory),看一下就退 |

### 2. 生命周期

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

### 3. compaction(压缩)

历史太长 LLM 装不下时,pi 会把早期对话压缩成一个 summary entry,只发 summary + 最近消息给 LLM。文件里旧消息还在(便于回看),但 LLM 上下文里只看 summary。

### 4. cwd 绑定

会话 header 里存 `cwd`——这个会话是在哪个项目目录里跑的。`getMissingSessionCwdIssue` 会检查这个 cwd 还存不存在,不存在要问用户怎么处理。因为 pi 跑 bash、改文件都基于这个 cwd。

### 5. 项目隔离

默认按 cwd 分目录存,所以你在项目 A 的会话不会污染项目 B。`pi --resume` 默认只列当前项目的,加个选项才能跨项目看。

## 四、多会话管理与切换

### 1. 会话的三层身份

同一个项目目录下,会话文件都在 `~/.pi/agent/sessions/<encoded-cwd>/` 里。每个会话有三层身份:

**文件名(时间戳 + id)**

```
2026-08-03T10-00-00-000Z_0192abcd....jsonl
```

**session-id(全局唯一)**

文件名里的 `0192abcd...` 就是 session id,uuidv7 格式。TUI 里 `/session` 命令会显示这个 id,启动时也可以 `pi --session-id <id>` 指定。

**显示名(可选,用户给)**

通过 `--name "我的实验"` 或 TUI 里 `/name` 命令设置(`packages/coding-agent/src/core/slash-commands.ts:27`)。存成 `session_info` entry(`session-manager.ts:1136`),`getSessionName` 倒序遍历找最新的。

**没起名字时,列表里只显示时间戳 + 第一条消息预览**;起了名字就显示名字,好认多了。

### 2. 启动时切换会话

启动时的各 flag 见第三节。`--resume` 是最直观的"切换"——列出来让你选。

### 3. TUI 里切换会话(slash 命令)

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

最常用的"切换":

- **`/resume`** — 列出所有会话选一个切过去(等于运行时版的 `pi --resume`)
- **`/new`** — 开新会话
- **`/tree`** — 在同一会话的分支间切(不是切会话,是切分支)

### 4. 切换会话时发生什么

从 `packages/coding-agent/src/core/agent-session-runtime.ts:193` 的 `switchSession` 看,切换会话不是简单"换个文件读",而是:

1. 找到目标会话文件
2. **重建整个 runtime**:新 SessionManager、新 AgentSession、重新加载扩展状态等
3. 扩展的 ctx 会失效(`runner.ts:540` 那个报错就是"切会话后别用旧 ctx")
4. TUI 重新渲染历史消息

所以切会话是个"重活",不是瞬时切换。这也是为什么 `switchSession` 返回 `{ cancelled: boolean }`——用户可能在确认框里取消。

### 5. 会话列表怎么显示

`SessionManager.list(cwd, sessionDir, onProgress)` 列当前项目的,`listAll(sessionDir, onProgress)` 列所有项目的。列表项通常显示:

- 时间戳(或名字)
- 第一条用户消息预览
- 消息数、token 数

`pi --resume` 和 TUI 里的 `/resume` 都用这个列表。

### 6. 会话内分支 vs 多个会话

这点容易混,pi 有两层"分叉"概念:

**会话内分支(同一文件)**

一个会话文件里,每条 entry 有 `parentId`,构成树。你可以在第 5 条消息处 fork 出一个新分支,文件里多存一条分支,通过 `leafId` 指向当前在哪个叶子。`/tree` 命令切这些分支。

→ **一个会话文件,多个分支,`/tree` 切**

**多个会话(多个文件)**

项目目录下有多个 `.jsonl` 文件,每个是一个独立会话。`/resume` 在这些文件间切。

→ **多个会话文件,`/resume` 切**

另外 `/fork` 和 `/tree` 也常被混:`/fork` 会 `createBranchedSession` 把一条路径提取成**新文件**;`/tree` 是在**同一文件内**切分支。

## 五、会话内分支树(/tree 机制)

### 1. /tree 切换分支时发生什么

**UI 操作**

`/tree` 弹出 `TreeSelectorComponent`(`interactive-mode.ts:4585`),显示整棵树,用户选一个节点作为目标。

**核心调用:`session.navigateTree(targetId)`**

`navigateTree`(`agent-session.ts:2839`)干几件事:

a. **决定新的 leafId**

- 选的是 user 消息 → `newLeafId = targetEntry.parentId`,且把那条 user 消息内容塞回编辑器(让用户重新编辑重发)
- 选的是其他消息(assistant/tool 等)→ `newLeafId = targetId`,直接跳到那里

b. **可选:生成分支摘要**

如果用户选了"Summarize",会:

1. 找出**从旧 leaf 到目标路径的"分叉点"之间的 entry**(`collectEntriesForBranchSummary`)
2. 调 LLM 把这段对话压缩成一个 summary 文本(`generateBranchSummary`)
3. 创建一个 `branch_summary` entry,`parentId` 指向新 leaf 位置

c. **移动 leafId**

```ts
if (summaryText) {
    this.sessionManager.branchWithSummary(newLeafId, summaryText, ...);
} else if (newLeafId === null) {
    this.sessionManager.resetLeaf();    // 跳回根之前
} else {
    this.sessionManager.branch(newLeafId);  // 跳到目标
}
```

`branch()` 就一行(`session-manager.ts:1360`):

```ts
branch(branchFromId: string): void {
    this.leafId = branchFromId;   // 只改指针,不动数据
}
```

**关键**:切换分支 = 只改 `leafId` 指针,文件里一个字节都不改。

d. **重建 agent 状态**

```ts
const sessionContext = this.sessionManager.buildSessionContext();
this.agent.state.messages = sessionContext.messages;
```

`buildSessionContext` 根据**新的 leafId** 重新算 LLM 上下文,然后整个替换 agent 的消息列表。

### 2. LLM 只看一条路径:buildSessionContext

`buildSessionContext`(`session-manager.ts:461`)根据 `leafId` **从树里抽出一条从根到 leaf 的路径**,只把这条路径发给 LLM。

算法:从 leaf 回溯到根

```ts
function buildSessionPath(entries, leafId, byId): SessionEntry[] {
    const index = buildEntryIndex(entries, byId);
    let leaf = leafId ? index.get(leafId) : entries[entries.length - 1];
    if (!leaf) return [];

    const path: SessionEntry[] = [];
    let current = leaf;
    while (current) {
        path.push(current);
        current = current.parentId ? index.get(current.parentId) : undefined;
    }
    path.reverse();   // 反转成从根到 leaf 的顺序
    return path;
}
```

逻辑:

1. 从 `leafId` 开始
2. 沿 `parentId` 一路往上找,直到根(parentId = null)
3. 收集这条路径上所有 entry
4. 反转,变成从根到 leaf 的时间顺序

**举例**

假设树是这样,`leafId = "msg_006"`(分支 A):

```
msg_001 → msg_002 → msg_003 → msg_004 → msg_005 → msg_006  [分支 A]
                                    └─ msg_007 → msg_008      [分支 B]
```

`buildSessionPath` 从 msg_006 开始:

- msg_006 → parentId=msg_005
- msg_005 → parentId=msg_004
- msg_004 → parentId=msg_003
- msg_003 → parentId=msg_002
- msg_002 → parentId=msg_001
- msg_001 → parentId=null,停

反转后:`[msg_001, msg_002, msg_003, msg_004, msg_005, msg_006]`

**分支 B 的 msg_007、msg_008 完全不在路径里,LLM 看不到**。

切到分支 B 后(`/tree` 选 msg_008,`leafId` 变成 "msg_008"),路径变成:
`[msg_001, msg_002, msg_003, msg_004, msg_007, msg_008]`

现在 LLM 看到的是分支 B,msg_005/msg_006 消失。

**路径上每个 entry 怎么转成 LLM 消息**

`sessionEntryToContextMessages`(`session-manager.ts:383`):

| entry 类型 | 转成什么 |
|-----------|---------|
| `message` | 原样用(user/assistant/toolResult 消息) |
| `custom_message` | 转成 custom message(扩展注入) |
| `branch_summary` | 转成 branch summary message(摘要) |
| `compaction` | 转成 compaction summary message(压缩摘要) |
| 其他(custom/label/session_info/thinking_level_change/model_change) | **不转,跳过** |

最终发给 LLM 的是:**从根到当前 leaf 这条路径上的所有 message + summary 消息,按时间顺序排列**。

### 3. 分支摘要(branch_summary)的作用

切换分支时如果选了"Summarize",会在目标位置插入一个 summary entry。这个 summary 会进入新分支的路径,发给 LLM。

**目的**:让 LLM 知道"之前那条分支聊了啥",避免完全失忆。比如:

```
msg_001 → msg_002 → msg_003 → msg_004 → [summary: "之前尝试了递归方案..."] → msg_009(新分支)
```

LLM 看到的是:原对话 + 摘要 + 新消息,既保留了前情,又不会把废弃分支的完整内容塞进上下文。

### 4. 选 user 消息 vs 选 AI 消息的区别

`/tree` 选择不同类型节点,行为不同(`agent-session.ts:2960`):

**选 user 消息 — 回退到那条消息"之前"**

```ts
if (targetEntry.type === "message" && targetEntry.message.role === "user") {
    newLeafId = targetEntry.parentId;                          // leaf 退到父节点
    editorText = contentText(targetEntry.message.content, ""); // 消息内容塞回编辑器
}
```

- `newLeafId = targetEntry.parentId` — leaf 指向**那条 user 消息的父节点**(即它之前那条消息,如果是第一条则为 null)
- `editorText` — 把那条 user 消息的文本**塞回输入框**,可以改完后重新发

**效果**:从那条 user 消息**之前**分叉出新分支。原 user 消息那条路径还在文件里(没删),但当前 leaf 在它之前,所以 LLM 上下文里**看不到那条 user 消息和它之后的所有内容**。重新输入(可能改过)发出去,就是一条全新分支。

**用途**:相当于"我想重新组织这条提问"——改措辞、换思路重问。所以退到它之前,把原文给你做参考,改完重发,生成新分支。原分支保留,可以 `/tree` 再切回去。

**选 AI 消息 — 在它之后接着聊**

```ts
} else {
    newLeafId = targetId;   // leaf = 选中的节点本身
}
```

- `newLeafId = targetId` — leaf 直接指向**那条 AI 消息本身**
- 没有 editorText,输入框是空的

**效果**:下次发的 user 消息会成为这条 AI 消息的子节点。LLM 上下文包含从根到这条 AI 消息的完整路径,新消息接在后面——"之前的消息作为历史上下文"。

**用途**:相当于"从这步接着聊"——AI 的回答觉得 OK,想基于这个回答继续。所以 leaf 停在 AI 消息,直接发新 prompt,接着这段历史往下走。

**对比表**

| 选谁 | newLeafId | 编辑器 | LLM 看到的上下文 | 新消息位置 |
|------|-----------|--------|-----------------|-----------|
| **user 消息** | 它的父节点 | 预填该消息文本 | 到它**之前**为止(不含它) | 作为父节点的新子节点 |
| **AI 消息** | 它本身 | 空 | 到它**本身**为止(含它) | 作为它的新子节点 |

**重要**:原分支**都没有被删除**,还在文件里。只是当前 leaf 不在那条路径上,LLM 看不到。随时可以 `/tree` 再切回那条原分支继续。这是 pi 的"非破坏性"设计——所有历史都保留,只是通过 leafId 决定看哪条路径。

## 六、常见场景:同一目录再次执行 pi

### 问题

在某个工作项目文件夹目录下执行 `pi` 创建了一个会话,关掉进程后,一段时间后再次在该目录执行 `pi`——这是新会话吗?如何回到之前的会话?

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

**方法 1:启动时用 `--continue`**

```bash
pi --continue
```

直接接着**当前项目最近**的那个会话(第一次的)继续聊。最省事。

**方法 2:启动时用 `--resume`**

```bash
pi --resume
```

弹一个列表,列出当前项目(可切到全部项目)的所有会话,你选一个。适合最近不只一个会话、想挑具体哪个时用。

**方法 3:已经进了新会话,用 `/resume` 切**

如果第二次 `pi` 已经进去了(新会话),不想退出重启,直接在 TUI 里输:

```
/resume
```

同样弹列表选之前的会话切过去。

**方法 4:给会话起名,方便认**

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

## 七、总结

```
会话文件(.jsonl)——存所有分支
┌─────────────────────────────────────────┐
│ msg_001 (parentId=null)                  │
│ msg_002 (parentId=msg_001)               │
│ msg_003 (parentId=msg_002)               │
│ msg_004 (parentId=msg_003)               │
│ msg_005 (parentId=msg_004) [分支A]       │
│ msg_006 (parentId=msg_005) [分支A leaf]  │
│ msg_007 (parentId=msg_004) [分支B]       │
│ msg_008 (parentId=msg_007) [分支B leaf]  │
└─────────────────────────────────────────┘
                    ↓
        SessionManager.leafId = "msg_006"
                    ↓
        buildSessionContext()
                    ↓
    从 msg_006 回溯到根,抽出路径:
    [msg_001, msg_002, msg_003, msg_004, msg_005, msg_006]
                    ↓
        转成 LLM messages,发给模型
```

### 关键设计点

1. **append-only + 指针切换**:文件只追加不改,切换分支只改内存里的 `leafId`,安全且快;即使中途崩溃,前面的消息都在
2. **单文件多分支**:所有分支共存于一个文件,不会因分叉产生一堆文件
3. **LLM 只看一条路径**:`buildSessionContext` 从 leaf 回溯到根,其他分支对 LLM 不可见
4. **摘要保留前情**:切分支时可选生成 branch_summary,让 LLM 知道废弃分支聊过啥;历史太长时 compaction 压缩,文件里旧消息保留
5. **非破坏性**:所有历史都保留,只是通过 leafId 决定看哪条路径,原分支随时可切回
6. **两层分叉要分清**:`/tree` 在同一文件内切分支;`/fork`/`/resume` 在多个会话文件间分叉/切换
7. **项目隔离**:按 cwd 分目录存,`--continue` 只找当前项目的会话
8. **消息三种角色**:user / assistant / toolResult,工具调用会产生 assistant(含 toolCall)+ toolResult 两个独立消息,会有连续 assistant(被 toolResult 隔开)和连续 toolResult(一次调多个工具),但不会有"AI 跟自己对话"
