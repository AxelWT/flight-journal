---
title: "Raft 共识算法：让一群机器说同样的话"
date: 2026-05-18
description: Raft 共识算法全解析——领导者选举、日志复制、安全性保障，以及 etcd、TiKV、Consul 等经典应用
tags:
  - 技术
  - 分布式
  - 共识算法
---

# Raft 共识算法：让一群机器说同样的话

## 一、背景：一致性太难了，共识算法更难懂

分布式系统有一个根本问题：一群机器如何对一件事情达成一致？

举个例子：你做一个分布式 KV 存储，3 台机器各存一份数据。用户写入 `x = 42`，如果只有一台收到、其他两台没收到，那后来读数据时有的人读到 42，有的人读到旧值——系统就「不一致」了。

在 Raft 出现之前，业界已经有 **Paxos 算法**（1998 年由 Leslie Lamport 提出）来解决这个问题。Paxos 理论上很优雅，但出了名的难懂难实现：Lamport 最初用「拜占庭将军」寓言来描述，正式描述极其抽象，整个算法缺少一个主流程骨架，涉及 Prepare、Promise、Accept、Accepted 等多个阶段，边界条件极多。

Google 的 Chubby 系统（基于 Paxos）的作者说过一句著名的话：

> "There are two types of distributed consensus algorithms: Paxos and all others. Paxos is the only widely used one — but it's notoriously difficult to understand."

实际情况是，能正确实现 Paxos 的团队凤毛麟角。很多声称实现了 Paxos 的系统，其实藏着 bug。

2013 年，Stanford 博士生 Diego Ongaro 在导师 John Ousterhout 的指导下，提出了 **Raft**。它的核心设计目标不是「更高效」，而是 **「更容易理解」**（论文标题就叫 *In Search of an Understandable Consensus Algorithm*）。

---

## 二、核心问题：分布式共识

Raft 要解决的根本问题是 **分布式共识（Distributed Consensus）**：

> 在可能发生节点宕机、网络分区、消息延迟/丢失的不可靠环境下，让一组机器对一个值（或者说一系列操作）的顺序达成一致。

**不解决会怎样？**

- 你存钱 100 元，有的节点记了、有的没记，余额不一致
- 你改配置，有的节点用新配置、有的用旧配置，行为分裂
- 选主节点，两个节点都以为自己是主，「脑裂」导致数据冲突

这些在单机系统里不会发生的问题，一旦跨机器就都会出现。共识算法就是给这个混乱加上规则。

---

## 三、实现方案：三个子问题，逐个攻破

Raft 最聪明的设计是 **分解**——把复杂的共识问题拆成三个相对独立、容易理解的子问题：

```
┌─────────────────────────────────────┐
│          Raft 共识算法               │
├─────────────────┬───────────────────┤
│ 1. 领导者选举   │ 2. 日志复制       │
│ (Leader Election)│ (Log Replication) │
├─────────────────┴───────────────────┤
│ 3. 安全性保障                       │
│ (Safety: 选举限制 + 日志匹配)        │
└─────────────────────────────────────┘
```

### 子问题 1：领导者选举（Leader Election）

**思路：选出一个老大，老大说了算。**

Raft 把节点分为三个角色：

- **Leader（领导者）**：整个系统只有一个，负责处理所有写请求
- **Follower（跟随者）**：被动接收 Leader 的指令
- **Candidate（候选者）**：选举阶段临时角色

**选举机制：**

1. Leader 定期给所有 Follower 发心跳（空的 `AppendEntries` RPC），表示「我活着」
2. 如果某个 Follower 在**选举超时**时间内没收到心跳，就认为 Leader 挂了，变成 Candidate
3. Candidate 给自己投票，并向其他节点广播 `RequestVote` RPC
4. 如果获得**过半（majority）**票数，当选 Leader
5. 新 Leader 立即广播心跳，巩固地位

**关键是随机超时时间**（通常 150~300ms）。每个 Follower 的超时计时器是随机的，这样几乎不会有两个节点同时发起选举导致平票。即使平票了，下一轮因为超时再次随机，很快就能收敛。

**任期（Term）：**

Raft 使用一个单调递增的逻辑时钟——**任期号**。每个选举周期是一个任期。在每个任期里，最多只有一个 Leader。任期号贯穿了选举、日志复制的整个流程，是 Raft 最重要的「纪律」机制。

### 子问题 2：日志复制（Log Replication）

**思路：Leader 把操作以「日志条目」的形式，复制到所有节点。**

1. 客户端发请求给 Leader（`x = 42`）
2. Leader 在本机追加一条日志条目（任期号 + 命令 + 索引位置）
3. Leader 并发发 `AppendEntries` RPC 给所有 Follower
4. 当**过半节点**写入了这条日志，Leader 就认为该条目已**提交（committed）**，然后应用到自身的状态机，返回客户端成功
5. Follower 在下一轮心跳中得知该条目已提交，也会应用到自己的状态机

**类比**：就像一个编辑部，主编（Leader）写下了今天的内容，把草稿分发给所有编辑（Follower），当超过一半编辑确认收到了，主编就宣布「可以发版了」。所有人收到「发版」信号后，一起把内容发布出去。

**日志一致性保证**：Raft 通过两条规则确保所有节点日志完全一致：

- **日志匹配特性（Log Matching）**：如果两个节点在同一个索引位置有同一个任期号的日志，那么从开头到这个位置的所有日志完全相同
- **Leader 强制覆盖**：如果 Follower 的日志和 Leader 不一致，Leader 会强制用自己正确的日志覆盖 Follower

### 子问题 3：安全性保障（Safety）

光有选举和复制还不够——必须保证绝对不会出现两个 Leader 同时存在（脑裂）或者已提交的日志被覆盖。Raft 用两条关键约束：

1. **选举限制（Election Restriction）**：Candidate 要当选，除了拿到过半票数，还必须在自己的日志中包含所有已提交的日志条目。具体说，投票者只给那些日志「至少和自己一样新」的 Candidate 投票。这条规则确保了新 Leader 一定拥有所有已提交的日志，不需要像 Paxos 那样在选举后再补日志。

2. **只有 Leader 能提交当前任期的日志**：Leader 不能通过「之前任期」的日志条目被复制到多数派就提交它。必须先提交当前任期的一条日志，然后根据「日志匹配」特性间接确保之前任期的日志也被正确提交。这条规则防止了已提交的日志被后续 Leader 覆盖。

这些约束加起来，Raft 论文证明了以下安全性：

- 每个任期最多一个 Leader
- Leader Append-Only：Leader 从不覆盖自己的日志
- 已提交的日志一定会出现在后续所有 Leader 中
- 如果某个节点把日志项应用到状态机了，其他节点不会在同一个位置应用不同的日志项

---

## 四、典型应用

Raft 已经覆盖了大量基础设施：

| 系统 | 用途 |
|------|------|
| **etcd** | K8s 的核心存储，声明式配置全靠它 |
| **Consul** | 服务发现和配置存储 |
| **TiKV** | 分布式 KV，TiDB 的存储层 |
| **MongoDB** | 副本集一致性 |
| **Kafka（KRaft）** | 新版 Kafka 用 Raft 替代 ZK 做元数据管理 |

---

## 五、总结

Raft 的厉害之处不在于「发明了新的一致性模型」——它在数学上和 Paxos 等价。厉害的是它把复杂问题分解成了工程师能理解、能实现的三个子问题，用 **「强 Leader + 随机超时 + 日志匹配」** 这套优雅的组合，让分布式共识从「仅限少数人能实现」变成了「读一遍论文就能写代码实现」。

正是这种**可理解性**，让共识算法真正从象牙塔走进了每一行基础设施代码。

### 大白话解释

> "选个大管家（Leader），所有的活儿大管家先记在小本本上（Log），同步给超过半数的小伙伴后，大家一起照着小本本干活。"

---

**参考资料**

- Diego Ongaro & John Ousterhout, *In Search of an Understandable Consensus Algorithm* (Raft 原始论文): <https://raft.github.io/raft.pdf>
- Raft 官方网站（含动画演示）：<https://raft.github.io/>
- 可视化交互教程（强烈推荐）：<http://thesecretlivesofdata.com/raft/>
- Leslie Lamport, *The Part-Time Parliament* (Paxos 原始论文, 1998)
- etcd 文档：<https://etcd.io/docs/>
- TiKV 架构说明：<https://tikv.org/docs/latest/concepts/overview/>
