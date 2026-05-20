---
title: LLM 工程开发全览
description: 大语言模型工程化开发的核心概念、架构设计与实践路径
tags:
  - llm
  - prompt-engineering
  - rag
  - agent
  - mcp
  - context-engineering
  - harness-engineering
created: 2025-01-01
updated: 2025-05-01
---

# LLM 工程开发全览

## LLM 基础

### 什么是大语言模型

大语言模型，本质是：**输入一段文本，预测下一个最可能出现的词**。

**典型模型：**
- OpenAI GPT
- Deepseek
- Qwen

### 核心结构（Transformer）

```
输入文本
   ↓
Token 化
   ↓
Embedding（词向量）
   ↓
Transformer
  ├── Attention
  ├── FFN
  └── LayerNorm
   ↓
预测下一个 Token
```

### LLM 能力来源

```
训练阶段：海量文本 → 不断预测下一个词 → 学习语言规律
```

例如：`上海是中国最大的____`，模型学会：**城市**概率最高。

### 核心特点

- ✅ 有通用语言能力（理解、归纳、创作、推理）
- ❌ 知识是固化的（训练时学的，之后不变）
- ❌ 有上下文窗口限制（一次能看的文本有限）
- ❌ 会产生幻觉（编造不存在的事实）
- ❌ 知识滞后（不知道训练后发生的事）

---

## Prompt Engineering（提示词工程）

### 定义

不改模型，靠"话术"激活模型能力上限。同样的模型，问法不同，答案质量天差地别。

### 核心四要素

```
角色（你是谁？） + 任务（要干什么？） + 上下文（背景信息） + 格式（怎么输出？）
```

### 常用技巧

| 技巧 | 说明 | 示例 |
|------|------|------|
| 角色扮演 | 给模型一个身份 | "你是一个资深 Java 架构师" |
| 约束条件 | 限制输出范围 | "回答控制在 100 字" |
| Few-shot | 给几个例子 | 输入→输出的示例 |
| CoT 思维链 | 要求一步步思考 | "请一步一步分析" |

### Prompt 流程

```
用户问题 → Prompt 模板拼接 → LLM → 结果输出
```

## RAG（检索增强生成）

### 定义

给 LLM 外挂一个"可实时更新的知识库"。

### 为什么需要 RAG？

- LLM 不知道公司的私有数据
- LLM 会编造答案（幻觉）
- LLM 的知识过期了

**标准 RAG 流程：**

![rag原理](/images/llm-engineering-development/rag原理.jpg)

```
用户问题 → 向量检索（知识库） → 检索结果 + 问题 → LLM → 回答
```

### 相关参考

- [LangChain RAG 教程](https://python.langchain.com/docs/tutorials/rag/)
- [LlamaIndex RAG 框架](https://www.llamaindex.ai/)
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401)

---

## Function Calling & Tools

### 流程

1. 用 JSON Schema 定义工具/函数（名称、描述、参数）

![function-calling](/images/llm-engineering-development/function-calling.jpg)
2. 模型分析用户问题，判断是否要调用、调用哪个、参数是什么
3. 应用执行函数（查数据库、调 API、发邮件等）
4. 把执行结果回传给模型
5. 模型把结果整理成自然语言回答用户

### 核心理解

- **Function Calling** 是"协议/能力"——LLM 输出结构化函数参数
- **Tools** 是"真正的工具集合"——真正干活的人（查询天气 API）

```
Tools
  ↑
通过 Function Calling 被调用
```

**重要：** LLM 不执行代码，它只负责识别用户意图 → 决定调用哪个函数 → 生成函数参数 → 返回给系统执行。

### 参考资料

- [OpenAI Function Calling 文档](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic Tool Use 文档](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Google Gemini Function Calling](https://ai.google.dev/docs/function_calling)

---

## MCP（Model Context Protocol）

AI 世界里的"USB 协议"，由 Anthropic 提出，作用是统一 AI 与外部工具连接方式。

### MCP 之前的痛点

- **重复造轮子**：为每个数据源编写专用集成代码
- **安全性噩梦**：直接 API 访问带来的权限管理复杂性
- **维护负担**：数据源变更导致集成代码频繁更新
- **扩展瓶颈**：添加新功能需要修改核心 AI 应用代码

### MCP 解决的问题

MCP 通过标准化协议层，实现了 AI 应用与外部工具/数据源的解耦，大幅降低了集成成本和维护负担。

### MCP 架构

![mcp协议](/images/llm-engineering-development/mcp协议.jpg)

```
AI 应用 → MCP 客户端 → MCP 协议 → MCP 服务器 → 外部工具/数据源
```

### 参考资料

- [MCP 中文站](https://mcpcn.com/docs/introduction/)
- [MCP 官方规范](https://spec.modelcontextprotocol.io/)
- [Anthropic MCP 介绍](https://www.anthropic.com/news/model-context-protocol)

---

## Agent

### 定义

```
Agent = LLM + 记忆 + 规划 + 工具
```

普通 LLM 是"一问一答"，Agent 是"给他目标，他自己搞定"。「提示词 + LLM + Tools」就可以构成一个最简单的 Agent。

### Agent vs 普通 LLM

| 能力 | 普通 LLM | Agent |
|------|----------|-------|
| 单次问答 | ✅ | ✅ |
| 自主拆解任务 | ❌ | ✅ |
| 多步骤执行 | ❌ | ✅ |
| 调用工具 | 需要人写代码 | ✅ 自主决定 |
| 自我纠错 | ❌ | ✅ |

### Agent 核心闭环（ReAct 模式）

```
┌─────────────────────────────────────────┐
│  Thought（思考）: 我需要先查天气         │
│       ↓                                 │
│  Action（行动）: 调用 getWeather()      │
│       ↓                                 │
│  Observation（观察）: 返回"雨天"         │
│       ↓                                 │
│  Thought（思考）: 下雨要提醒带伞         │
│       ↓                                 │
│  Action（行动）: 生成提醒               │
│       ↓                                 │
│  （循环，直到目标达成）                    │
└─────────────────────────────────────────┘
```

### ReAct 模式详解

Agent = 给 LLM 配上手脚和大脑，让他自己干活。ReAct 模式基于文本推理的链式思考（Reasoning + Acting），具备反思和自我纠错能力。

![agent架构](/images/llm-engineering-development/agent架构.jpg)

- **推理（Reasoning）**：分析当前状态，决定下一步行动
- **行动（Acting）**：调用工具并返回结果
- 通过自然语言描述决策过程

### 参考资料

- [Agent 原理、架构、工程实践](https://x.com/HiTw93/article/2034627967926825175)
- [主流的 Agent 设计模型](https://mp.weixin.qq.com/s/7CZ6cHWQ-T9bmaWoJFwdwA)
- [ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)](https://arxiv.org/abs/2210.03629)
- [OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents)
- [Anthropic Claude Agent 构建指南](https://docs.anthropic.com/en/docs/build-with-claude/agents)

---

## Multi-Agent（多智能体系统）

### 单 Agent vs 多 Agent

- **单 Agent** = 一个 LLM + 若干工具，所有任务自己处理
- **多 Agent** = 多个专门的 Agent，每个负责一个领域，通过协调机制分工协作

### 什么时候需要多 Agent？

| 场景 | 单 Agent | 多 Agent |
|------|----------|----------|
| 任务类型单一 | 够用 | 不需要 |
| 需要代码+写作+搜索 | 容易混淆 | 每个 Agent 专精一项 |
| 需要审核/校验 | 自己检查自己，容易漏 | 专门放一个 Review Agent |
| 多轮复杂流程 | prompt 越来越长 | 拆成多个节点，各自简洁 |

### 两种核心架构

**1. Supervisor 模式（中心化）**

```
用户 → Supervisor → 判断类型 → Agent A / Agent B / Agent C
                           ↑                        |
                           └──── 收集结果后汇总返回 ──┘
```

- 一个中央协调者（Supervisor）接收所有请求
- Supervisor 决定分配给哪个子 Agent
- 子 Agent 执行后结果返回给 Supervisor 汇总
- 适合：任务分类明确、需要统一入口的场景

**2. Handoff 网络模式（去中心化）**

```
用户 → Agent A → 判断需要 B → Agent B → 判断需要 C → Agent C → 返回
```

- 没有中央协调者
- 每个 Agent 执行完后自己决定下一步交给谁
- 适合：工单流转、客服转接、流水线处理

### 参考资料

- [Building Multi-Agent Systems (Anthropic)](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)
- [Orchestrating Agents: Routines and Handoffs](https://platform.openai.com/docs/guides/orchestrating-agents)
- [AutoGen (Microsoft Research)](https://github.com/microsoft/autogen)
- [CrewAI 多 Agent 框架](https://www.crewai.com/)

---

## Context Engineering（上下文工程）

大型语言模型就像一种新型的操作系统。LLM 就像 CPU，而它的上下文窗口则像 RAM，充当模型的工作记忆。就像操作系统会筛选哪些内容可以放入 CPU 的 RAM 中，Context Engineering 就是发挥类似作用的机制——对模型上下文进行筛选、压缩、排序、拼接的工程手段。

### 核心问题

LLM 的上下文窗口有限（比如 128K tokens），但实际情况中：
- 用户问题 + 历史对话 + RAG 知识 + 工具结果 + System Prompt
- 可能远超窗口限制！

### 导致的问题

| 问题 | 后果 |
|------|------|
| 上下文太长 | 成本高、响应慢 |
| 关键信息被淹没 | LLM 注意力下降 |
| 信息冲突 | LLM 不知道该信哪个 |

### 常见优化手段

| 手段 | 说明 |
|------|------|
| Sliding Window | 只保留最近 N 条消息 |
| Summary Memory | 长历史先让 LLM 总结再放入 |
| Intent Routing | 不同意图的问题走不同的上下文 |
| 信息压缩 | 把冗余内容压缩成摘要 |
| 排序优化 | 重要信息放开头或结尾 |

### 与 Prompt Engineering 的区别

- **Prompt Engineering**：研究"怎么写一句好的 Prompt"
- **Context Engineering**：研究"模型这一轮到底应该看到哪些信息"
- Prompt Engineering 更像：写提示词技巧
- Context Engineering 更像：管理整个上下文系统

### 示例结构

```none
# System Prompt（固定指令）
你是电商平台客服助手。
请根据提供的信息回答用户问题。
要求：不要编造、语气礼貌、回答简洁、无法确认时明确说明。

# Context（动态上下文）
【用户信息】用户昵称：Tom
【历史会话摘要】用户昨天申请退款，商品金额 299 元
【订单状态】refund_status = processing
【知识库】退款到账时间通常为 1~3 个工作日

# User Query（用户当前问题）
为什么我退款还没到账？
```

### 参考资料

- [Context Engineering for Agents (LangChain)](https://www.langchain.com/blog/context-engineering-for-agents)
- [Prompting Guide (Anthropic)](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering)

---

## Skill（技能）

Agent 的可复用能力模块，类似插件，也可以认为是可复用的标准化能力单元 = **Prompt + Tool + Workflow** 的封装。

Agent Skills = 把"复杂任务能力"打包成可复用的模块，让 Agent 在需要时按需加载，而不是靠长 prompt 硬塞上下文。

### 示例

| Skill 名称 | 封装内容 | 使用时 |
|-----------|----------|--------|
| 翻译 Skill | Prompt 模板 + 翻译 API | 输入中文 → 输出英文 |
| SQL Skill | 少样本示例 + 数据库工具 | 输入自然语言 → 输出 SQL 和结果 |
| 代码审查 Skill | 代码规范 Prompt + Git 工具 | 输入 PR 链接 → 输出审查意见 |

### 核心价值

| 价值 | 说明 |
|------|------|
| 能力可复用 | 一次封装，到处使用 |
| 开箱即用 | 新人直接用，不用重复造轮子 |
| 降低开发成本 | 不用每次重新写 Prompt + 工具适配 |
| Agent 的能力底座 | Agent 可以组合调用多个 Skill |

### 与 MCP Tool 的区别

- **MCP Tool**：本质是一个"可以被 LLM 调用的函数能力"
- **Skill**：是"完成一个完整任务的封装能力"，Skill 里面通常会调用多个 tool、做 reasoning、做 memory retrieval、做 context compression

---

## Harness Engineering（驾驭工程）

### 定义

Harness Engineering 是一套面向 LLM 应用的全链路工程体系与运行时控制系统工程，核心目标是将原型级 Demo 转化为稳定、可监控、可迭代的生产级产品。

![harness-engineering](/images/llm-engineering-development/harness-engineering.jpg)

### 为什么需要？

写 Demo 只需半天，让 Demo 稳定上线、可监控、可迭代需数百倍的工程投入。Harness Engineering 就是 LLM 应用从 **Demo 到生产级产品的"工业化流水线"**。

### Harness 负责什么

| 模块 | 具体内容 |
|------|----------|
| 生命周期管理 | 启动、暂停、恢复、重试 |
| 状态管理 | Memory、Checkpoint、上下文恢复 |
| 安全治理 | 权限控制、敏感词过滤、审计日志 |
| 评测体系 | 效果评测、A/B 测试、回归测试 |
| 监控告警 | 延迟监控、错误率、成本追踪 |
| 版本管理 | Prompt 版本、RAG 版本、模型版本 |
| 日志溯源 | 每一次调用的完整链路记录 |

### 核心问题

> 模型跑起来之后，怎么保证不崩、不乱、不失控？

### 常用工具与框架

目前工业界用的最多的还是 **LangGraph** 框架：
- Checkpoint / Retry / Fallback
- Graph Workflow
- HITL（Human in the Loop）
- Tracing / Observability → LangSmith

### 与 Context Engineering 的区别

- **Context Engineering**：解决"给模型看什么"
- **Harness Engineering**：解决"模型怎么被稳定、安全、可控地使用"

---

## 参考资料与扩展阅读

### 经典论文

| 论文 | 作者 | 年份 | 说明 |
|------|------|------|------|
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Vaswani et al. | 2017 | Transformer 架构 |
| [Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165) | Brown et al. | 2020 | GPT-3 |
| [Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401) | Lewis et al. | 2020 | RAG 框架 |
| [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629) | Yao et al. | 2022 | Agent ReAct 模式 |
| [Training Verifiers to Solve Math Word Problems](https://arxiv.org/abs/2110.14168) | Cobbe et al. | 2021 | Chain-of-Thought |
| [Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/abs/2212.08073) | Bai et al. | 2022 | Claude 宪法 AI |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) | Yao et al. | 2023 | ToT 推理框架 |
| [Toolformer](https://arxiv.org/abs/2302.04761) | Schick et al. | 2023 | LLM 自主调用工具 |

### 学习资源

- **[HuggingFace NLP Course](https://huggingface.co/learn/nlp-course)** — Transformers/LLM 入门
- **[LLM Visualization](https://bbycroft.net/llm)** — 交互式 GPT 推理可视化
- **[Andrej Karpathy Intro to Large Language Models](https://www.youtube.com/watch?v=zjkBMFhNj_g)** — LLM 入门视频
- **[OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)** — Prompt 工程最佳实践
- **[Anthropic Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering)** — Anthropic Prompt 指南
- **[LangChain 官方文档](https://python.langchain.com/docs/introduction/)** — LLM 应用开发框架
- **[LlamaIndex 文档](https://docs.llamaindex.ai/)** — 数据框架（RAG 专用）

### 开源工具与框架

| 项目 | 说明 | 链接 |
|------|------|------|
| LangChain | LLM 应用开发框架 | https://github.com/langchain-ai/langchain |
| LangGraph | Agent 工作流执行引擎 | https://docs.langchain.com/oss/langgraph/ |
| LangSmith | LLM 可观测性平台 | https://smith.langchain.com/ |
| LlamaIndex | 数据索引与 RAG 框架 | https://github.com/run-llama/llama_index |
| Mem0 | 开源的 Memory 框架 | https://github.com/mem0ai/mem0 |
| AutoGen | 微软多 Agent 框架 | https://github.com/microsoft/autogen |
| CrewAI | 多 Agent 协作框架 | https://github.com/crewAIInc/crewAI |
| Milvus | 向量数据库 | https://milvus.io/ |
| Qdrant | 向量数据库 | https://qdrant.tech/ |
| Chroma | 轻量级向量数据库 | https://www.trychroma.com/ |
| ollama | 本地 LLM 运行工具 | https://ollama.ai/ |
| vLLM | 高性能 LLM 推理引擎 | https://github.com/vllm-project/vllm |
| DSPy | LLM 编程框架 | https://github.com/stanfordnlp/dspy |

### 产品与平台

- [OpenAI Platform](https://platform.openai.com/) — GPT 系列模型 API
- [Anthropic Console](https://console.anthropic.com/) — Claude 模型 API
- [Google AI Studio](https://aistudio.google.com/) — Gemini 模型平台
- [HuggingFace](https://huggingface.co/) — 开源模型社区
