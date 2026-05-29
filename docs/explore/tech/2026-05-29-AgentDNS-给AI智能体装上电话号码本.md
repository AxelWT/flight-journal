---
title: AgentDNS：给AI智能体装上"电话号码本"
date: 2026-05-29
description: AgentDNS 借鉴互联网 DNS 思想，为 AI 智能体构建全球唯一标识、服务发现、协议适配与统一认证计费的基础设施，让智能体从"单打独斗"走向"万物互联"。
tags:
  - AI
  - 技术
  - 智能体
  - 协议
---

# AgentDNS：给AI智能体装上"电话号码本"

## 一、技术背景：AI智能体正在"失联"

想象一个场景：你想让一个AI帮你查资料、写报告、发邮件，于是你配置了三个不同的AI智能体。结果发现——它们之间完全无法直接对话。

这不是某个产品的bug，而是整个行业的现状。

2025年以来，AI智能体（AI Agent）发展迅猛：

- **Anthropic** 推出了 MCP（Model Context Protocol），让智能体调用外部工具
- **Google** 推出了 A2A（Agent-to-Agent Protocol），让智能体之间传递任务
- **无数企业**开发了自己的AI智能体

然而问题来了：**每个厂商的智能体都是一座孤岛。**你的智能体找不到别人的智能体，即使找到了也不知道该用什么"语言"对话，更不知道该付多少钱。

这就是 **AgentDNS** 要解决的问题。

## 二、解决什么问题：智能体互联互通的三大鸿沟

AgentDNS 精准瞄准了三个阻碍AI智能体自由协作的核心痛点：

### 1. 发现鸿沟——找不到该找谁

现在的AI智能体要调用外部服务，必须靠程序员手动配置接口地址。这意味着：

- 每次换一个服务商，开发者都要重新对接
- 智能体本身没有能力主动找到其他智能体

### 2. 协议鸿沟——找到了也听不懂

有的智能体用MCP协议，有的用A2A，有的用ANP……就像人和人之间，你说英语、我说中文，即使面对面站着也无法沟通。智能体无法自主识别对方的协议类型，更无法自动适配。

### 3. 认证鸿沟——聊得上还要付得起钱

每个服务商的API Key各不相同，计费方式五花八门。智能体想调用付费服务，必须人工介入配置密钥、结算账单，根本做不到"自动付费调用"。

## 三、具体实现方案：DNS思想遇上AI时代

### 核心理念：给每个智能体一个"门牌号"

AgentDNS 的设计灵感来自互联网的 **DNS（域名系统）**。

当你访问 `baidu.com` 时，DNS 帮你把这个名字转换成具体的IP地址——你不需要记住一串数字。同理，AgentDNS 给每个AI智能体分配一个**全球唯一的标识符**，格式类似：

```
agentdns://org/category/name
```

例如：

```
agentdns://example/search/research-agent
```

这个名字里自带了语义信息——"这是example机构的搜索研究智能体"。智能体看到这个名字，就大致知道对方能做什么，不需要查说明书。

### 工作原理：三层架构各司其职

```
发现层 → 解析层 → 连接层
```

- **发现层**：负责"搜索"。用自然语言告诉系统你需要什么能力的智能体，比如"帮我找一个会写代码的智能体"，系统返回匹配的标识符列表。
- **解析层（核心）**：拿到标识符后，查询这个智能体的详细信息——它的网络地址、支持哪些协议、收费标准是什么、如何验证身份。
- **连接层**：根据解析结果，选择合适的协议（MCP/A2A等）直接与目标智能体通信。

### 关键技术点

#### 1. 自然语言驱动的服务发现

AgentDNS 的服务注册采用混合检索机制：

- 服务商注册时提交智能体的能力描述（比如"支持Google/Bing关键词搜索"）
- 系统把这些描述**向量化**存入知识库
- 其他智能体可以用自然语言搜索，比如："谁会查IEEE标准论文？"
- 系统匹配后返回标识符和元数据（地址、协议、价格）

#### 2. 协议自适应的互联互通

AgentDNS 在解析标识符时，会返回目标智能体支持的所有协议信息。调用方智能体可以根据返回的协议列表，**自主选择**用哪个协议通信——不再需要人工配置。

#### 3. 统一认证与计费

AgentDNS 充当可信中介：

- 智能体只需向 AgentDNS 认证一次，获得一个有时限的访问令牌
- 持此令牌可以访问所有注册在该平台的服务
- 计费由 AgentDNS 统一处理：用户预充值，系统自动扣费，平台再与各服务商结算

这就像酒店的**统一结账系统**——你在餐厅、酒吧、健身房消费，最后前台一次性结清，不用每处都刷卡。

## 四、为什么这项技术值得关注

AgentDNS 代表了一个趋势：**AI智能体正在从"单打独斗"走向"万物互联"。**

如果说2024-2025年是"单智能体能力爆发"之年，那2026年开始，行业重心正在转向"多智能体协作生态"的构建。AgentDNS 解决的不是某一个技术细节，而是整个生态的**基础设施问题**——就像TCP/IP协议让全球的计算机能互联，AgentDNS 正在为AI智能体铺就同样的路。

目前这项技术仍处于早期阶段，已有多个 IETF 草案在推进：

- `draft-cui-dns-native-agent-naming-resolution` — DNS原生的智能体命名与解析
- `draft-liang-agentdns` — AgentDNS 根域名命名系统
- `draft-narajala-ans` — Agent Name Service（ANS），基于 DNS 的通用智能体目录

标准化和大规模落地还需时日，但它指向的方向值得关注：**未来的AI世界里，智能体或许也能像人类发邮件一样，自然地发现彼此、协作完成任务。**

---

**参考资料**

- [AgentDNS: A Root Domain Naming System for LLM Agents (arXiv)](https://arxiv.org/html/2505.22368v1)
- [DNS-Native AI Agent Naming and Resolution — IETF Draft](https://datatracker.ietf.org/doc/draft-cui-dns-native-agent-naming-resolution)
- [Agent Name Service (ANS): A Universal Directory for Secure AI Agent Discovery — IETF Draft](https://www.ietf.org/archive/id/draft-narajala-ans-00.html)
- [AgentDNS: A Root Domain Naming System — IETF Datatracker](https://datatracker.ietf.org/doc/draft-liang-agentdns/00)
- [Open Protocols for Agent Interoperability — AWS Blog](https://aws.amazon.com/blogs/opensource/open-protocols-for-agent-interoperability-part-1-inter-agent-communication-on-mcp)
