---
title: "LSM-Tree（日志结构合并树）：互联网海量数据随便写的地基"
date: 2026-08-19
description: LSM-Tree 原理：WAL/MemTable/SSTable/Compaction 写入流水线、布隆过滤器、三种放大权衡与 Compaction 策略。
tags:
  - 技术
  - 数据库
  - 存储
---

# LSM-Tree（日志结构合并树）

你每天刷的微博、聊的微信、看的 B 站播放记录——这些海量数据是怎么"写"进数据库还不卡死的？今天聊聊背后的功臣：LSM-Tree（Log-Structured Merge-Tree）。它是 RocksDB、LevelDB、Cassandra、HBase、TiKV 等一大批存储引擎的心脏。

## 一、技术产生的背景

故事要从它的"前任" B+ 树说起。MySQL 的 InnoDB 用的就是 B+ 树，它像一本按字母排序的字典：查找极快，但每次写入都要"翻到对应页、擦掉重写"。

这在传统交易系统（下单、转账）里没问题——写少读多。但到了 2000 年代，互联网迎来了完全不同的场景：

- Google 每天要记录几十亿次搜索行为和网页抓取
- Facebook 消息、Netflix 观影记录（每天 3 亿+ 次写入）
- 监控系统每秒上报几百万条指标

这类负载的特点是：**写入量巨大、持续不断**。用 B+ 树扛这种流量，磁盘会在"翻页"（随机 I/O）上耗尽生命。机械盘时代随机写比顺序写慢上百倍，即使是 SSD，顺序写也更省、更快。

> 于是 1996 年 Patrick O'Neil 等人在论文《The Log-Structured Merge-Tree (LSM-Tree)》中提出：既然磁盘爱顺序写，那就把所有写都改成顺序写——LSM-Tree 由此诞生。

## 二、想解决的核心问题

一句话：**让数据库的写入速度不再受随机磁盘 I/O 的限制。**

B+ 树写入时要在树中定位到具体页再原地修改，一次逻辑写入可能触发多次磁盘随机读写（即"写放大"）。如果不解决，会发生什么？

- 海量日志、消息、时序数据根本写不进去，丢数据或延迟爆炸
- 每加一台数据库服务器只能线性扩容，成本失控
- Discord 早期用 B+ 树的 MongoDB 存消息，量级到十亿级后写入成为瓶颈，最终迁移到基于 LSM 的 Cassandra——这是真实发生过的案例

反过来，LSM-Tree 牺牲了一点读性能，换取写入吞吐量数量级的提升，正是互联网海量数据场景最划算的交易。

## 三、具体实现方案

LSM 的核心思想可以用一句话概括：

> 所有写都不落原处，只追加新记录，后台再慢慢整理。

像不像你的待办清单——先一股脑记下来，晚上再统一归档。

### 写入流程分三步

#### 1️⃣ 先记流水账（WAL + MemTable）

数据进来先追加写一份日志（WAL，保证断电可恢复），同时写进内存里的 MemTable（通常用跳表实现，保持有序）。这一步纯内存操作，速度极快。

#### 2️⃣ 内存装满，批量刷盘（SSTable）

MemTable 写满后（比如几 MB），冻结、整体一次性顺序写入磁盘，生成一个不可修改的有序文件 SSTable。这就像把一叠草稿纸整本装订成册——装订好的册子不再改动。

#### 3️⃣ 后台整理（Compaction，最精妙的部分）

同一个 key 被写多次时，磁盘上会留下多个旧版本。所以后台线程会不断把多层 SSTable 归并排序：越新的数据在越上层，合并时旧版本被淘汰，相同 key 只留最新的。磁盘上的层像金字塔，每层容量约为下层的 1/10，数据一层层"沉淀"下去。

### 读取怎么办？

数据散落在内存和多层文件里，查找时从新到旧逐层找。为了不拖慢读速，工程上配了两个关键武器：

- **布隆过滤器（Bloom Filter）**：每个 SSTable 附带一个紧凑的"指纹"，能瞬间判断"这个 key 一定不在这个文件里"，直接跳过，省掉绝大多数无效磁盘读
- **块缓存（Block Cache）**：热数据常驻内存

### 三种放大的三角权衡

LSM 的代价是三个"放大"之间的取舍，这是所有 Compaction 策略设计的主线：

| 放大 | 含义 |
|------|------|
| 写放大 | 1 GB 数据写入后经历 WAL → Flush → L0 → L1 → L2…… 层层合并，实际落盘远大于 1 GB |
| 读放大 | 一个 key 可能要查多个层级、多个文件才能命中 |
| 空间放大 | 同一 key 的多个旧版本占着磁盘，反复修改时空间放大可达 1.1–2 倍 |

### Compaction 策略流派

各家产品按自己的读写比例，在这三个放大之间做取舍：

- **Leveled（分级合并）**：每层内部有序、key 范围不重叠，读放大和空间放大最小，但写放大高（RocksDB 经验值约 10–30 倍）。LevelDB、RocksDB 默认路线
- **Tiered / Size-Tiered（分层堆积）**：同层攒够 T 个大小相近的 SSTable 再合并，写放大低（约 O(L)），但读放大和空间放大高。RocksDB 中对应 Universal Compaction，Cassandra 的 STCS 也属此类
- **混合（Tiered+Leveled）**：小层用 Tiered、大层用 Leveled，两边兼顾——RocksDB 的默认布局（L0 tiered + 其余 leveled）就是这种
- **FIFO**：按文件时间直接淘汰旧数据，适合消息队列、时序数据等有生命周期的场景
- **Time-Window**：按时间窗口组织合并，Cassandra 时序场景常用

> 没有绝对好坏，只有适不适合当前负载：写入吞吐优先选偏 Tiered 的策略；查询稳定性和空间效率优先选偏 Leveled 的策略。

## 总结

LSM-Tree 用"先追加、后整理"的思路，把数据库写入从随机 I/O 的枷锁中解放出来，让记录每一条消息、每一次点击的成本低到可以忽略——它是整个互联网"海量数据随便写"时代的地基之一。

---

**参考资料**

- [The Log-Structured Merge-Tree (LSM-Tree) — Patrick O'Neil et al., 1996 原始论文](https://www.cs.umb.edu/~poneil/lsmtree.pdf)
- [KV存储（一）LSM Tree 基本原理 - 知乎](https://zhuanlan.zhihu.com/p/665583757)
- [LSM-tree Compaction 策略 - quant67.com](https://quant67.com/post/algorithms/63-compaction/compaction.html)
- [Compaction · facebook/rocksdb Wiki - GitHub](https://github.com/facebook/rocksdb/wiki/Compaction)
- [LSM Tree 存储结构解析 - Ryan's Blog](https://ryanchan.top/archives/efficient-writes-lsm-trees-data-storage)
- [LSM-TREE 存储结构的空间放大 - 源代码博客](https://lrita.github.io/2018/10/22/lsm-space-amplification)
- [Constructing and Analyzing the LSM Compaction Design Space - VLDB 2021](http://vldb.org/pvldb/vol14/p2216-sarkar.pdf)
