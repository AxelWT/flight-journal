# LLM 结构化 JSON 输出原理：json_object 与 json_schema 与 function_calling

## 0. 背景：让 LLM 输出结构化 JSON 的三种方式

OpenAI 兼容 API 里，控制模型输出结构化数据主要有三种方式：

| 参数 | 作用 | 约束强度 |
|------|------|----------|
| `response_format={"type": "json_object"}` | 只保证输出是**合法 JSON** | 软约束 |
| `response_format={"type": "json_schema", ...}` | 强制输出**符合指定 schema** 的 JSON | 硬约束 |
| `tools=[{...}]`（function_calling） | 把 schema 绑成 tool，模型用 `tool_calls` 返回 | 声明式 |

下文分别讲解三者的实现原理。

---

## 第一部分：三种结构化输出方式

### 1.1 `json_object`（json_mode）—— 软约束

**参数**：`response_format={"type": "json_object"}`

模型保证输出**是合法 JSON**（能被 `json.loads` 解析），但**不保证字段结构**。

例如你想要 `{"name": str, "age": int}`，模型可能返回：

```json
{"person_name": "Tom", "years": 20}    // 是 JSON，但字段名错了
{"name": "Tom", "age": "twenty"}        // 是 JSON，但类型错了
```

字段名、类型全靠 prompt 引导，模型听话与否不保证。

**实现原理**：`json_object` 模式**不依赖 constrained decoding**，主要靠两件事：
1. **模型微调**：厂商在训练/微调阶段用大量 JSON 数据让模型学会"看到 `response_format=json_object` 时就输出 JSON 语法合法的文本"。
2. **轻量语法约束**：部分实现会在采样层做一个非常简单的 FSM，只保证大括号匹配、字符串转义合法、引号闭合等"JSON 语法层面"的正确性，但**不关心字段名和类型**。

**局限**：字段名可能不一致；类型可能错；可能多/少字段；必须靠 prompt 描述格式。

### 1.2 `json_schema` —— 硬约束（constrained decoding）

**参数**：`response_format={"type": "json_schema", "json_schema": {...}}`

模型不仅输出 JSON，还**强制符合你给的 JSON Schema**（字段名、类型、必填项都被约束）。底层靠 constrained decoding / grammar 机制，模型在生成时就被限制在 schema 范围内。

这是最可靠的方式，但厂商支持最少（OpenAI structured outputs、部分开源框架）。很多兼容端（DeepSeek、MiniMax 等）不支持。

详细原理见[第二部分](#第二部分constrained-decoding-原理)。

### 1.3 `function_calling`（工具调用）—— 第三种方式

**参数**：`tools=[{...}]`，可选配 `tool_choice` 控制模型用不用工具。

这是**兼容性最好**的结构化方式：给模型声明一个或多个"函数/schema"，模型如果决定产出结构化数据，就以 `tool_calls` 形式返回：

```json
{
  "tool_calls": [{
    "function": {
      "name": "extract_info",
      "arguments": "{\"name\":\"Tom\",\"age\":20}"
    }
  }]
}
```

`arguments` 是 JSON 字符串，调用方二次解析得到结构化对象。

**实现原理**：function calling 不依赖采样层的 constrained decoding，而是靠**模型训练 + tool 协议**：
1. **模型微调**：厂商用大量 function calling 数据训练模型，让它学会"看到 tools 声明时，按 schema 填 arguments"。
2. **schema 声明式约束**：tool 定义里的 `parameters` 字段就是一个 JSON Schema，模型被训练过按这个 schema 组织 arguments。
3. **协议层封装**：模型把结构化数据包在 `tool_calls` 里返回，与正常 `content` 分离，调用方按协议解析。

**为什么需要它**：很多模型（如 DeepSeek、MiniMax）支持 function calling 但不支持 json_schema。function calling 的 schema 也是声明式的，模型被训练过按 schema 填 arguments，可靠性介于 json_mode 和 json_schema 之间。

**关键参数 `tool_choice`**：控制模型用不用工具，常见取值：
- `"auto"`：模型自己决定（默认）
- `"none"`：禁止调用
- `"required"`：必须调用
- `{"type":"function","function":{"name":"xxx"}}`：强制调用指定函数

### 1.4 三者对比与选型

| 维度 | `json_object` | `json_schema` | `function_calling` |
|------|---------------|---------------|--------------------|
| 保证范围 | 仅"是合法 JSON" | "符合指定 schema" | "按 tool schema 填 arguments" |
| 字段名约束 | ❌ 无 | ✅ 强制 | ✅ 声明式（靠模型遵守） |
| 字段类型约束 | ❌ 无 | ✅ 强制（采样层） | ✅ 声明式（靠模型遵守） |
| 必填字段 | ❌ 无 | ✅ 强制 | ✅ 声明式 |
| 实现机制 | 微调 + 轻量语法 FSM | 完整 schema → FSM 约束解码 | 模型训练 + tool 协议 |
| 厂商支持 | 广泛 | 较少（OpenAI 等） | 最广（几乎所有兼容端） |
| 可靠性 | 中（靠模型自觉） | 高（数学上保证） | 中高 |
| 性能开销 | 几乎无 | 略有（10%-30%） | 几乎无 |
| 输出形式 | JSON 文本 | JSON 文本 | tool_calls 结构（arguments 是 JSON 字符串） |

**同一个例子对比**：假设你想要 `{"name": str, "age": int}`：

| 方式 | 模型可能输出 | 是否符合预期 |
|------|------------|------|
| `json_object` | `{"name": "Tom", "age": 20}` | ✅ 运气好 |
| `json_object` | `{"person_name": "Tom", "years": 20}` | ❌ 是 JSON 但字段错了 |
| `json_object` | `{"name": "Tom", "age": "twenty"}` | ❌ 是 JSON 但类型错了 |
| `json_schema` | `{"name": "Tom", "age": 20}` | ✅ 被 schema 强制 |
| `function_calling` | `tool_calls[...arguments="{\"name\":\"Tom\",\"age\":20}"]` | ✅ 按 tool schema 填 |

**选型建议**：
- **字段多、类型严、不能错 + 厂商支持**：用 `json_schema`。
- **厂商不支持 schema 但需可靠结构化**：用 `function_calling`。
- **字段简单、容错高、跨厂商兼容**：用 `json_object` + 清晰的 prompt 描述。
- **以上都不支持**（弱本地模型）：只能靠 prompt + 解析，最脆弱，最后兜底用。

---

## 第二部分：constrained decoding 原理

### 2.1 先回忆 LLM 的生成本质

LLM 生成文本是**逐 token（词元）**输出的，每一步都计算"下一个 token 是哪个"的概率分布：

```
已生成: {"name": "Tom", "age":
下一步候选 token 及概率:
  "20"    -> 0.45
  "twenty"-> 0.30
  "abc"   -> 0.10
  "}"     -> 0.05
  ...
```

普通模式下，模型按概率采样，可能选 `"twenty"`（schema 要数字，这就违规了）。

### 2.2 核心思路：生成前先算"哪些 token 合法"，把不合法的直接屏蔽

这就是 **constrained decoding（约束解码）**。关键工具是**有限状态机（FSM）或语法解析器**。

### 2.3 第一步：把 JSON Schema 翻译成"状态机"

JSON 本质上是有语法的，JSON Schema 进一步规定了字段名、类型。可以把 schema 编译成一个**状态机**（或上下文无关文法）。

例如 schema：

```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "age":  {"type": "integer"}
  },
  "required": ["name", "age"]
}
```

对应的状态机（简化）大致是这样：

```
状态0: 必须输出 "{"
状态1: 必须输出 '"name"'
状态2: 必须输出 ":"
状态3: 必须输出一个字符串字面量
状态4: 必须输出 ","
状态5: 必须输出 '"age"'
状态6: 必须输出 ":"
状态7: 必须输出一个整数（只允许数字字符）
状态8: 必须输出 "}"
```

每个状态只允许某些字符/token 出现，走错了就违反 schema。

### 2.4 第二步：每一步生成时，用状态机"过滤"模型输出

具体流程：

```
1. 模型算出下一个 token 的概率分布 P(token)
2. 查状态机："当前状态下，哪些 token 是合法的？" → 得到合法 token 集合 L
3. 把 P 中不在 L 里的 token 概率设为 -∞（屏蔽）
4. 在剩下的合法 token 里采样
5. 根据选中的 token 推进状态机到下一个状态
6. 回到第 1 步
```

### 2.5 直观例子

生成到 `{"name": "Tom", "age":` 时：

- 当前状态是"等待整数字面量"。
- 状态机说：只允许 `0-9`（以及可选的负号）。
- 模型原本可能想输出 `"twenty"`，但 `"` 这个 token 在当前状态非法 → 概率被设成 `-∞`。
- 采样只能在数字 token 里挑，所以必然输出数字。

### 2.6 第三步：终止条件

状态机走到"结束态"（JSON 闭合、所有 required 字段填完）时停止。这保证最终输出**结构完整**且**符合 schema**。

---

## 第三部分：实现方式与关键细节

### 3.1 constrained decoding 的三种实现路径

针对 `json_schema` 的约束解码，主要有三种实现：

1. **服务端原生支持**（OpenAI structured outputs）
   - 模型推理引擎内置了 schema → FSM 的编译和屏蔽逻辑，调用方只传 schema。
   - 用户无感，效果最好。

2. **第三方库在前端做**（`outlines`、`guidance`、`lm-format-enforcer`）
   - 适用于开源模型自己部署的场景。
   - 库接管采样过程，每步过滤 token。

3. **CFG/正则约束**
   - 把约束写成上下文无关文法或正则，编译成 FSM 后同样做 token 屏蔽。

### 3.2 关键细节

- **token 边界问题**：状态机是在字符层面定义的，但 LLM 在 token 层面生成。一个 token 可能跨状态边界（比如 token `"age":` 一次性把字段名+冒号都生成了）。实际实现要把状态机和 tokenizer 的词表对齐，预先算出每个状态允许哪些 token——这部分是工程难点。

- **性能开销**：预先编译 FSM + 每步查表有成本，但通常只比裸生成慢 10%-30%，因为屏蔽逻辑是查表不是重算模型。

- **不能做什么**：约束解码管的是**结构/类型**（字段名、是整数还是字符串），**管不了语义**（age 填 999 还是 25 都合法）。语义正确性仍要靠模型本身的能力。

- **只对 json_schema 有效**：function_calling 和 json_object 都不依赖这套机制，靠的是模型训练和微调，所以它们的可靠性"中等"而非"数学保证"。

---

## 总结

> - **`json_object`**：软约束，靠模型微调 + 轻量语法保证，只确保"是 JSON"，不保证"对"。
> - **`json_schema`**：硬约束，把 schema 编译成状态机，LLM 每生成一个 token 前先问状态机"哪些 token 合法"，把不合法的概率清零，最终输出必然落在 schema 允许的范围内——本质是"在采样层做硬过滤"，不是模型"学会"了 schema。
> - **`function_calling`**：声明式约束，靠模型训练 + tool 协议，schema 绑成 tool，模型用 `tool_calls` 返回结构化数据，兼容性最好、可靠性中高，是 json_schema 不可用时的首选替代。
