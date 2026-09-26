# pi 会话树(/tree)机制详解

## 一、会话数据如何保存(存储结构)

### 1. 单文件,所有分支共用

无论 `/tree` 切了多少次分支,**整个会话始终是一个 `.jsonl` 文件**。不会因为分叉就分裂成多个文件。

### 2. 树形结构靠 `id` + `parentId`

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

**8 条 entry 全在一个文件里**,通过 parentId 串成树,两个分支并存。

### 3. `leafId` 标记"当前在哪"

SessionManager 有个 `leafId` 字段(`session-manager.ts:866`),指向"当前所在的叶子节点"。比如在分支 A 的 msg_006,`leafId = "msg_006"`。

### 4. 追加写,不改老数据

新消息直接 `appendFileSync` 到文件末尾,`parentId` 指向当前 `leafId`。**老分支的 entry 永远不会被修改或删除**。

## 二、`/tree` 切换分支时发生什么

### 1. UI 操作

`/tree` 弹出 `TreeSelectorComponent`(`interactive-mode.ts:4585`),显示整棵树,用户选一个节点作为目标。

### 2. 核心调用:`session.navigateTree(targetId)`

`navigateTree`(`agent-session.ts:2839`)干几件事:

#### a. 决定新的 leafId

- **选的是 user 消息** → `newLeafId = targetEntry.parentId`,且把那条 user 消息内容塞回编辑器(让用户重新编辑重发)
- **选的是其他消息(assistant/tool 等)** → `newLeafId = targetId`,直接跳到那里

#### b. 可选:生成分支摘要

如果用户选了"Summarize",会:
1. 找出**从旧 leaf 到目标路径的"分叉点"之间的 entry**(`collectEntriesForBranchSummary`)
2. 调 LLM 把这段对话压缩成一个 summary 文本(`generateBranchSummary`)
3. 创建一个 `branch_summary` entry,`parentId` 指向新 leaf 位置

#### c. 移动 leafId

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

#### d. 重建 agent 状态

```ts
const sessionContext = this.sessionManager.buildSessionContext();
this.agent.state.messages = sessionContext.messages;
```

`buildSessionContext` 根据**新的 leafId** 重新算 LLM 上下文,然后整个替换 agent 的消息列表。

## 三、如何丢给 LLM(`buildSessionContext`)

`buildSessionContext`(`session-manager.ts:461`)根据 `leafId` **从树里抽出一条从根到 leaf 的路径**,只把这条路径发给 LLM。

### 算法:从 leaf 回溯到根

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

### 举例

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

### 路径上每个 entry 怎么转成 LLM 消息

`sessionEntryToContextMessages`(`session-manager.ts:383`):

| entry 类型 | 转成什么 |
|-----------|---------|
| `message` | 原样用(user/assistant/toolResult 消息) |
| `custom_message` | 转成 custom message(扩展注入) |
| `branch_summary` | 转成 branch summary message(摘要) |
| `compaction` | 转成 compaction summary message(压缩摘要) |
| 其他(custom/label/session_info/thinking_level_change/model_change) | **不转,跳过** |

最终发给 LLM 的是:**从根到当前 leaf 这条路径上的所有 message + summary 消息,按时间顺序排列**。

## 四、分支摘要(branch_summary)的作用

切换分支时如果选了"Summarize",会在目标位置插入一个 summary entry。这个 summary 会进入新分支的路径,发给 LLM。

**目的**:让 LLM 知道"之前那条分支聊了啥",避免完全失忆。比如:

```
msg_001 → msg_002 → msg_003 → msg_004 → [summary: "之前尝试了递归方案..."] → msg_009(新分支)
```

LLM 看到的是:原对话 + 摘要 + 新消息,既保留了前情,又不会把废弃分支的完整内容塞进上下文。

## 五、选 user 消息 vs 选 AI 消息的区别

`/tree` 选择不同类型节点,行为不同(`agent-session.ts:2960`):

### 选 user 消息 — 回退到那条消息"之前"

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

### 选 AI 消息 — 在它之后接着聊

```ts
} else {
    newLeafId = targetId;   // leaf = 选中的节点本身
}
```

- `newLeafId = targetId` — leaf 直接指向**那条 AI 消息本身**
- 没有 editorText,输入框是空的

**效果**:下次发的 user 消息会成为这条 AI 消息的子节点。LLM 上下文包含从根到这条 AI 消息的完整路径,新消息接在后面——"之前的消息作为历史上下文"。

**用途**:相当于"从这步接着聊"——AI 的回答觉得 OK,想基于这个回答继续。所以 leaf 停在 AI 消息,直接发新 prompt,接着这段历史往下走。

### 对比表

| 选谁 | newLeafId | 编辑器 | LLM 看到的上下文 | 新消息位置 |
|------|-----------|--------|-----------------|-----------|
| **user 消息** | 它的父节点 | 预填该消息文本 | 到它**之前**为止(不含它) | 作为父节点的新子节点 |
| **AI 消息** | 它本身 | 空 | 到它**本身**为止(含它) | 作为它的新子节点 |

**重要**:原分支**都没有被删除**,还在文件里。只是当前 leaf 不在那条路径上,LLM 看不到。随时可以 `/tree` 再切回那条原分支继续。这是 pi 的"非破坏性"设计——所有历史都保留,只是通过 leafId 决定看哪条路径。

## 六、会话里的消息序列(三种角色)

实际消息序列**不是严格的 user/assistant 交替**,有三种 role(`ai/src/types.ts:423`):

```ts
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

| role | 谁 | 内容 |
|------|-----|------|
| `user` | 用户输入 | 文本/图片 |
| `assistant` | LLM 回复 | **文本 + thinking + toolCall**(一次回复里可同时有文本和工具调用) |
| `toolResult` | 工具执行结果 | 工具返回的内容 |

### 真实消息序列示例

"帮我读 a.txt 然后总结"的对话,文件里的消息序列:

```
1. user:       "帮我读 a.txt 然后总结"
2. assistant:  [thinking] + [toolCall: read("a.txt")]     ← LLM 决定调工具
3. toolResult: "a.txt 的内容..."                          ← 工具执行结果
4. assistant:  [text: "a.txt 讲的是..."]                    ← LLM 基于工具结果总结
```

注意 2 和 4 **都是 assistant**,中间夹了个 toolResult。不是 user/assistant 交替。

### 更复杂的例子(一次调多工具 + 多轮工具)

```
1. user:       "对比 a.txt 和 b.txt"
2. assistant:  [toolCall: read("a.txt"), toolCall: read("b.txt")]   ← 一次调俩
3. toolResult: "a.txt 内容..."                ← 第一个工具结果
4. toolResult: "b.txt 内容..."                ← 第二个工具结果
5. assistant:  [toolCall: read("c.txt")]      ← 还要看 c.txt
6. toolResult: "c.txt 内容..."
7. assistant:  [text: "对比结果如下..."]       ← 最终回答
```

这里:
- 2 是 assistant(含 toolCall)
- 3、4 **连续两条 toolResult**
- 5 又是 assistant
- 7 又是 assistant(中间隔着 6 的 toolResult)

### 关键:assistant 里的 toolCall

`AssistantMessage`(`types.ts:390`):
```ts
export interface AssistantMessage {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];   // 数组,可同时含多种
    stopReason: StopReason;   // "stop" | "toolUse" | ...
}
```

一个 assistant 消息的 `content` 是数组,可**同时**含:
- `TextContent` — 文字("我来读一下文件")
- `ThinkingContent` — 思考过程
- `ToolCall` — 工具调用请求

`stopReason` 标志这条 assistant 的结束原因:
- `"toolUse"` — 要调工具,agent 循环继续
- `"stop"` — 真正说完话了,agent 循环结束

### agent 循环的真实结构

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

### 为什么不会"AI 跟自己对话"

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

LLM 不会"自己跟自己说话"——每条 assistant 之间一定夹着 toolResult(工具结果),或 user 消息。LLM 不会连续产生两条 assistant 消息而不经过工具或用户。

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

1. **append-only + 指针切换**:文件只追加不改,切换分支只改内存里的 `leafId`,安全且快
2. **单文件多分支**:所有分支共存于一个文件,不会因分叉产生一堆文件
3. **LLM 只看一条路径**:`buildSessionContext` 从 leaf 回溯到根,其他分支对 LLM 不可见
4. **摘要保留前情**:切分支时可选生成 summary,让 LLM 知道废弃分支聊过啥
5. **非破坏性**:所有历史都保留,只是通过 leafId 决定看哪条路径,原分支随时可切回
6. **`/fork` vs `/tree`**:`/fork` 会 `createBranchedSession` 把一条路径提取成**新文件**;`/tree` 是在**同一文件内**切分支
7. **消息三种角色**:user / assistant / toolResult,工具调用会产生 assistant(含 toolCall)+ toolResult 两个独立消息,会有连续 assistant(被 toolResult 隔开)和连续 toolResult(一次调多个工具),但不会有"AI 跟自己对话"
