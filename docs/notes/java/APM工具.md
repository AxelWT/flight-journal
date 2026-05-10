# APM 工具

---

## Tracing API / Tracing Agent 概述

Tracing API / Tracing Agent 为开发者提供完全透明的**全链路标记传递**的框架和服务，分为两部分：

- **Tracing API**：框架的上层组件（API 层），面向用户提供标记的插入、更新和查询等基本操作
- **Tracing Agent**：框架的底层组件，实现上是一个 **Java Agent**，挂载到业务服务上，对业务开发者完全透明，实现标记在 JVM 内部和边界上的自动透传

> 使用文档：全链路标记透传文档

---

## APM 概念

APM（Application Performance Management/Monitoring，应用性能管理/监控）工具的核心目标是确保软件应用的性能、可用性和最终用户体验满足预期。

### 工作原理

大多数 APM 工具通过以下流程实现监控：

1. **数据采集**：通过在应用程序中部署轻量级代理来实现。代理以非侵入或低侵入方式自动收集应用性能数据。非侵入式通常通过 Java Agent 等技术在字节码层面实现，无需修改业务代码
2. **数据处理与传输**：代理将采集到的数据（响应时间、错误日志、调用关系）进行初步处理和聚合，发送到中心化的 APM 服务器
3. **存储与分析**：APM 服务器接收数据后存储到时序数据库或索引引擎中，利用算法生成拓扑图、追踪调用链、聚合指标等
4. **可视化与告警**：通过 Web 界面以仪表盘、拓扑图、调用链详情等形式展示，并支持设置告警规则

---

## Tracing（链路追踪）

通过一个 **traceId** 将该请求经过的所有路径串联起来。通过 **spanId** 表示请求的调用路径关系（例如 spanId=1 是 spanId=1.1 的上游链路，spanId=1.1.1 是 spanId=1.1 的下游链路）。

**实现**：使用字节码增强技术实现 JVM 内以及跨 JVM 标记透传，所有透传的标记数据存储在线程的 ThreadLocal 中。

> 每个请求都需要额外消耗少量的内存和 CPU。在高 QPS 的情况下，会增加服务的 GC 和 CPU 压力，对服务的时延和负载可能造成一定影响。

---

## Metrics（指标）

指标信息可以用来配置成指标曲线进行量的统计，包含以下信息：

| 概念 | 说明 |
|------|------|
| **指标名** | 指标的名称，类似数据库中的表名 |
| **tags（维度）** | 对指标进行分类，查询时可通过 tags 过滤或 group by（分类数量必须可控，常变化的 id 不适合作为分类） |
| **fields（监控项）** | 一个指标名通常有多个 field，如 cnt、sum、min、max 等 |

**示例**：用户下单指标统计

- 指标名：`user.make.order`
- tags：`{platform: android, province: 上海}`
- fields：`cnt` 次数统计

### Tracing 与 Metrics 的关联

通过 Tracing 的服务调用图，既可以看到该 RPC 调用的次数、耗时等 metrics 指标信息，也可以查看到耗时最大的那条 Tracing 链路信息。

---

## Logging（日志）

日志信息主要用于进行全文搜索。

**实现流程**：

```
应用 → log4j2 落盘 → filebeat 采集 → Kafka → Logstash → Elasticsearch → Kibana
```

### Tracing 与 Logging 的关联

在日志信息中记录 `traceId:spanId`，即可将 Tracing 和 Logging 关联起来：

1. 用户搜索特定关键字的日志，获取该日志的 `traceId:spanId`
2. 根据 `traceId:spanId` 找到对应的 Tracing 链路信息

---

## 主流 APM 工具选型

| 类型 | 工具 | 特点 |
|------|------|------|
| **商业全能型** | Dynatrace, AppDynamics, New Relic | 功能全面，开箱即用，费用较高 |
| **开源定制型** | **SkyWalking** | 国产优秀项目，微服务和云原生支持良好，社区活跃 |
| | **Zipkin** | Twitter 开源，轻量级，设计简单，易于上手 |
| | **Pinpoint** | 字节码增强实现无侵入监控 |
| **云厂商集成型** | 阿里云 ARMS, 华为云 APM, AWS X-Ray | 集成度高，部署简便 |

---

## Java Agent 技术

Java Agent 技术允许在不修改源代码的情况下，对 Java 字节码进行改写，实现对运行在 JVM 上的 Java 程序进行监控、分析和增强。

### 两种加载方式

#### 1. 启动时加载（静态加载）

在 JVM 启动时通过 `-javaagent:your-agent.jar` 参数指定 Agent JAR 包。JVM 初始化后执行 `premain` 方法，注册 `ClassFileTransformer`：

```java
public static void premain(String agentArgs, Instrumentation inst) {
    inst.addTransformer(new MyClassFileTransformer());
}
```

JVM 加载每个类之前，都会回调已注册的 `ClassFileTransformer.transform` 方法。

#### 2. 运行时加载（动态加载）

通过 Java Attach API 动态地将 Agent 加载到已运行的 JVM 中。需要实现 `agentmain` 方法：

```java
public static void agentmain(String agentArgs, Instrumentation inst) {
    inst.addTransformer(new MyClassFileTransformer());
    inst.retransformClasses(...); // 重新转换已加载的类
}
```

动态加载可对**已经加载的类**进行重定义（Redefine）或重转换（Retransform）。

### 底层基石

| 层级 | 说明 |
|------|------|
| **JVMTI**（JVM Tool Interface） | JVM 提供的原生编程接口，用于监控和控制 JVM |
| **java.lang.instrument** | JDK 标准 API，Java Agent 直接交互的接口，提供 `Instrumentation`、`ClassFileTransformer` 等 |
| **字节码操作库** | ASM、Javassist 等库提供访问和修改字节码的便捷能力 |

### 应用场景

- **性能监控与分析**：在方法执行前后插入代码统计耗时
- **分布式链路追踪**：如 SkyWalking、Pinpoint 等，通过 Agent 自动植入追踪代码
- **热修复与诊断工具**：如 Arthas，运行时诊断 JVM 状态、修改已加载类的行为

### 注意事项

- **MANIFEST.MF 配置**：`Premain-Class` 或 `Agent-Class` 必须在 JAR 包中正确配置
- **性能影响**：字节码转换会带来一定开销，需谨慎设计转换逻辑
- **稳定性**：不正确的字节码修改可能导致 JVM 崩溃，务必充分测试

---

## Tracing 实现细节

### 原理

Agent 包是一个独立的物理文件，放置在服务器文件系统的某个路径下，通过 JVM 参数或运行时指令让目标 Java 进程加载并执行 Agent 包中的代码。其改写/增强方式是使用请求线程的 **ThreadLocal** 进行传递非业务相关的标识，优点是对业务无侵入、无感知。

### Tracing Agent 实现

Tracing Agent 这个 JAR 包实现 Java Agent 字节码增强功能：

- **HTTP 协议**：在 Tomcat 流量入口端通过 Filter 方式将标识塞入 ThreadLocal 进行透传
- **RPC 等其他协议**：在发送方和接收方同时适配该协议，最终在线程的 ThreadLocal 中拿到传递的标识（如 traceId）

### Tracing API 实现

Tracing API 是提供给业务开发者的客户端，开发者可以自己往 ThreadLocal 中塞入自定义的业务标识，然后在下游拿到该标识做处理。

Tracing API 标记在 RPC 协议上的透传基于 **Attachment** 实现。在 RPC 请求发起端将 TraceContext 上下文中的标记置入 Attachment 携带到下游，Attachment Key 格式为：`trace-context-{traceTag}`。提供者端找出所有 `trace-context-{traceTag}` 并放入 TraceContext。

### 不支持的场景

- 直接向线程池等待队列添加 Task 任务（未使用 submit 或 execute 方法）
- 使用 `ThreadPoolExecutor` 时覆盖了原生的 submit、execute 方法，且未桥接到原生方法上
- 线程池使用了优先级队列（`java.util.PriorityQueue`）分发任务
- `ScheduledExecutorService` 的周期任务（`scheduleAtFixedRate`、`scheduleWithFixedDelay`）
- 使用 Hystrix 的请求合并特性
- 部分异步 IO Callback 场景

### 日志输出 TraceId

Tracing Agent 支持使用 Log4j2 输出 TraceId 和流量标记。

```xml
<Property name="LOG_PATTERN">
[$${env:HOST:-localhost}][${sys:app.name:-myApp}][%d{yyyy-MM-dd HH:mm:ss.SSS}][${LOG_LEVEL_PATTERN}][${sys:PID}][%15.15t][%-40.40c{1.}] : [%X{logId}][%X{TRACE-ID}][%X{TRACE-FLAG}]%m%n${sys:LOG_EXCEPTION_CONVERSION_WORD}
</Property>
```

- `%X{TRACE-ID}`：整个完整调用链路的唯一 TraceId
- `%X{TRACE-FLAG}`：流量标记

### 压测结论

| 场景 | 额外负载 |
|------|---------|
| 单机中低 QPS（入 100，出 500） | < 2.4% |
| 单机高 QPS（入 1000，出 5000） | < 15% |

标记透传产生的负载仅和相关流量大小以及标记数量相关，和业务复杂性基本无关。

---

## Metrics 实现

Metrics 打点配合 Tracing 的 traceId 和 Logging 的 ELK，可以实现服务全链路的调用追踪及运行性能分析，并提供服务监控面板和服务告警功能。

### 三种打点方式

| 方式 | 特点 |
|------|------|
| **Transaction** | 监控一段代码运行情况：运行时间统计、次数、错误次数等 |
| **Event** | 记录事件发生次数和错误次数，无运行时间统计 |
| **Metrics** | 更专业的打点计数工具，支持多维度，无法与 trace 关联但性能更好 |

### JVM 监控

通过采集 JMX 相关指标实现。以 G1 垃圾收集器为例：

| 指标 | 含义 |
|------|------|
| **G1YoungGeneration** | YoungGC / MixedGC 发生的次数（均会 STW） |
| **G1OldGeneration** | G1 的 FullGC，回收整个堆，性能影响较大；有 FullGC 通常意味着内存压力较大 |

### 底层实现：Disruptor

基于 CAT 开源库，底层采用 **Disruptor** 高性能线程间消息传递库。

**Disruptor 的核心优化：**

- **环形缓冲区（Ring Buffer）**：首尾相接的环状数组，内存预先分配，减少 GC 压力
- **无锁设计与 CAS**：通过 CAS 操作协调生产者和消费者，避免锁带来的内核态切换开销
- **解决伪共享（False Sharing）**：在关键变量周围增加填充字段，确保每个重要变量独占 CPU 缓存行

### 时序数据存储

基于开源的单机版 **InfluxDB** 自研的集群版分布式时序数据库。

> 时序数据库适合 metrics，不适合 logging 和 tracing。非 metrics 数据可选择更合适的存储，例如 ES。

**时序数据的特点：**

- **海量性**：数据点连续不断产生，数据量巨大
- **写多读少**：95% 以上操作是写入，读取相对较少
- **按时间顺序写入**：数据点按时间戳递增追加，少有更新或删除
- **近期热点性**：更常查询近期数据
- **多维性**：数据点包含时间戳、值和多个标签

---

## Logging 实现细节

### 架构

基于传统 **ELK** 架构（Elasticsearch + Logstash + Kibana）：

```
应用 → log4j2 落盘 → filebeat 采集 → Kafka → Logstash → Elasticsearch → Kibana
```

### 日志查询语法

#### 字段类型

| 字段类型 | 是否分词 | 是否可聚合 | 是否可排序 | 是否可搜索特殊字符 | 备注 |
|---------|---------|-----------|-----------|------------------|------|
| **text** | 是 | 否 | 否 | 否 | 允许超过 256 字符（如 msg, message） |
| **keyword** | 否 | 是 | 是 | 是 | 建议不超过 256 字符（如 host, traceId） |

> 单条日志不宜过大，超过 20KB 算大日志。

#### 搜索方式

| 输入 | 说明 |
|------|------|
| `search request` | 无引号，命中包含 search 或 request 的日志 |
| `"search request"` | 有引号，命中包含该短语的日志 |
| `search AND request` | 同时包含 search 和 request |
| `search AND NOT request` | 包含 search 但不包含 request |
| `traceid:3903220179071*` | 根据 traceId 过滤，末尾加 `*` |
| `msg:success` | 搜索 msg 字段包含 success |

#### 大小写规则

- 分词字段（msg、message）：**大小写不敏感**
- 非分词字段（其他字段）：**大小写敏感**（如搜索 `level:WARN` 不可搜 `level:warn`）

#### 布尔逻辑

支持 `AND`、`OR`、`NOT` 运算符，大小写均可。

#### 非分词字段

- 需完全匹配
- 可用通配符：`module:*Ring*`
- 建议加上字段名提高查询性能

#### 特殊字符

`+ - = && \|\| > < ! ( ) { } [ ] ^ " ~ * ? : \ /`

- 分词字段中以上字符会被过滤掉
- 非分词字段中需使用 `\` 转义（如 `\(1\+1\)\=2`）

### 日志落盘要求

| 要求 | 说明 |
|------|------|
| **命名** | 正在写入的以 `.log` 结尾，分割后的加日期后缀 |
| **大小** | 单个文件不超过 256MB |
| **轮转方式** | 推荐 `create` 模式（创建新文件继续写入） |
| **压缩** | 轮转后不要压缩（收集完即删除） |

### Log4j2 配置示例

```xml
<Properties>
    <Property name="PID">????</Property>
    <Property name="LOG_EXCEPTION_CONVERSION_WORD">%xEx</Property>
    <Property name="LOG_LEVEL_PATTERN">%5p</Property>
    <Property name="LOG_PATTERN">[$${env:HOST:-localhost}][${sys:app.name:-myApp}][%d{yyyy-MM-dd HH:mm:ss.SSS}][${LOG_LEVEL_PATTERN}][${sys:PID}][%15.15t][%-40.40c{1.}] : [%X{logId}][%X{TRACE-ID}][%X{TRACE-FLAG}]%m%n${LOG_EXCEPTION_CONVERSION_WORD}
    </Property>
    <Property name="LOG_PATH">./logs</Property>
</Properties>
```
