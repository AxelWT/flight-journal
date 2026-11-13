---
title: "Java Web 技术栈深度解析"
date: 2026-11-13
description: Spring Boot 默认架构、WebFlux 适用边界、Tomcat NIO 线程模型与 Java 21 虚拟线程 Pinned 陷阱
tags:
  - Java
  - Spring Boot
  - WebFlux
  - 虚拟线程
  - Tomcat
---

# Java Web 技术栈深度解析：从 Tomcat 线程模型到虚拟线程的 Pinned 陷阱

> **核心一句话**：Tomcat NIO 是"异步接收连接 + 同步处理业务"，FastAPI/asyncio 是"异步接收 + 异步处理"，而 Java 21
> 虚拟线程正是用同步写法弥合这一差距——但代价是必须警惕 `synchronized` 导致的 Pinned 陷阱。

本文系统梳理了 Java Web 技术栈的四个核心问题：Spring Boot 的默认架构选择、WebFlux 的真实适用边界、Tomcat NIO 连接器的底层运作机制，以及
Java 21 虚拟线程的 Pinned 陷阱。

核心结论是： **Spring Boot 默认采用 Spring MVC + 内嵌 Tomcat 的同步阻塞架构，这依然是绝大多数业务系统的最优解**。WebFlux +
Reactor + Netty 是一条"精准武器"路线，在网关、长连接、流式推送等 I/O 密集型场景中是事实标准，但全链路响应式改造的成本使其难以成为通用默认方案。而
Java 21 虚拟线程的出现，正在用同步写法逼近异步的并发能力，重新定义了这一格局。

---

## 一、Spring Boot 默认架构与 WebFlux 的真实采用现状

### 1.1 Spring Boot 默认就是 Tomcat + 线程池，这是 90% 项目的最优选

Spring Boot 的默认选择并非偶然，而是工程权衡的结果。`spring-boot-starter-web` 会自动引入 `spring-boot-starter-tomcat`
，因此默认内嵌 Tomcat 服务器。对于响应式栈，`spring-boot-starter-webflux` 则默认引入 Reactor Netty。

Tomcat 内部采用 NIO 连接器，默认工作线程池约 **200 个线程**。这里存在一个普遍误解： **Tomcat 底层网络 I/O
已经是异步非阻塞的，但对你编写的业务代码而言，依然是同步阻塞的**。这是 Servlet 规范决定的——一个请求绑定一个线程，遇到数据库查询或外部
HTTP 调用就阻塞等待。

Spring Boot 同时支持三种嵌入式 Servlet 容器：Tomcat（默认）、Jetty、Undertow，开发者可以通过排除 `spring-boot-starter-tomcat`
并引入对应 Starter 进行替换。

### 1.2 WebFlux + Reactor + Netty：不是默认，但在特定领域是刚需

WebFlux 在生产环境的采用率远不如 Spring MVC，但在以下几类场景中几乎是事实标准：

| 场景                             | 主流选型            | 原因                                                        |
|----------------------------------|---------------------|-------------------------------------------------------------|
| 普通 CRUD 微服务、后台管理       | Spring MVC + Tomcat | 业务逻辑简单，线程池绰绰有余                                |
| API 网关（Spring Cloud Gateway） | WebFlux + Netty     | 天生高并发，连接数远超线程数                                |
| WebSocket / SSE 推送、IM         | WebFlux + Netty     | 响应式流的背压机制是核心优势                                |
| 海量外部服务调用                 | WebFlux             | `Mono.zip` 实现并行调用，总耗时从"串行之和"变为"并行最大值" |

关键洞察在于： **WebFlux 的 ROI（投资回报率）高度场景依赖**。对于普通业务系统，引入响应式编程范式的 ROI 极低。Spring Cloud
Gateway 采用 WebFlux 正是看中其高并发处理能力，但这并不意味着业务系统也应盲目跟进。

> **架构选型的核心原则**：技术选型不应基于"听说性能好"，而应基于负载特征。I/O 密集型且连接数巨大时，WebFlux 的优势才真正显现；CPU
> 密集型或低并发场景，其异步特性反而带来负优化。

---

## 二、WebFlux、Reactor、Netty：三个技术栈的分工与协作

这三个技术经常被捆绑出现，但职责完全不同。用餐厅类比可以清晰理解其分工：

| 技术        | 餐厅角色                 | 核心职责                                          | 类比   |
|-------------|--------------------------|---------------------------------------------------|--------|
| **Netty**   | 厨房设备 + 传菜通道      | 底层网络通信：TCP 连接、HTTP 编解码、字节读写     | 发动机 |
| **Reactor** | 订单流转系统             | 响应式编程库：将数据流编排成 `Mono`/`Flux` 异步链 | 变速箱 |
| **WebFlux** | 服务员 + 菜单 + 点餐流程 | Web 框架：提供 Controller、路由、过滤器等开发抽象 | 驾驶舱 |

### 2.1 Netty：底层网络通信引擎

Netty 是一个基于 Java NIO 的高性能异步网络框架，不属于 Spring 生态，是独立的开源项目。其职责包括：

- 管理 TCP 连接的生命周期（建连、读、写、断连）
- 将原始字节流解析为 HTTP 请求对象或 WebSocket 帧
- 采用**事件循环（Event Loop）**模型处理 I/O，少量线程即可管理上万连接
- 通过 Pipeline 机制，让数据像流水线一样经过编解码器、压缩器、SSL 处理器等

在 WebFlux 栈中的位置：

```text
客户端请求 → Netty Event Loop（接收连接、解析 HTTP）
           → 交给 WebFlux 处理
           → WebFlux 返回响应 → Netty 写回字节
```

WebFlux 选择 Netty 而非 Tomcat 的根本原因：Tomcat 的 Servlet API 强制"一个请求一个线程"的语义，而 Netty
从底层就是事件驱动的，完美匹配响应式"不阻塞线程"的诉求。

### 2.2 Reactor：响应式编程库

Reactor 是实现 **Reactive Streams** 规范的 Java 库，由 Spring 官方团队开发，是 WebFlux 的"引擎"。它提供：

- `Mono<T>`：表示 0~1 个元素的异步流
- `Flux<T>`：表示 0~N 个元素的异步流
- 链式操作符：`map`、`flatMap`、`filter`、`zip`、`retry` 等
- **背压（Backpressure）机制**：消费者能告知生产者"慢点发，我处理不过来"
- 调度器（Scheduler）管理线程切换：`publishOn`、`subscribeOn`

代码示例：

```java
Mono<Dashboard> dashboard = userMono
    .flatMap(user ->
        ordersFlux
            .collectList()
            .map(orders -> new Dashboard(user, orders))
    )
    .timeout(Duration.ofSeconds(3))
    .onErrorReturn(Dashboard.EMPTY);
```

Reactor 与 `CompletableFuture` 的关键差异：`CompletableFuture` 只能表示 0~1 个结果且不支持背压，而 Reactor
的流式处理能力和操作符生态使其能优雅组合复杂的异步逻辑。

### 2.3 WebFlux：响应式 Web 框架

WebFlux 是 Spring 官方推出的响应式 Web 框架，与 Spring MVC 共享大量 Spring 生态（DI、Security、Validation 等），但方法返回值从普通对象变为
`Mono<T>` 或 `Flux<T>`。

```java
@RestController
@RequestMapping("/users")
public class UserController {

    @GetMapping("/{id}")
    public Mono<User> getUser(@PathVariable int id) {
        return users.findById(id);
    }

    @GetMapping("/{id}/orders")
    public Flux<Order> getOrders(@PathVariable int id) {
        return orders.findByUserId(id);
    }
}
```

WebFlux vs Spring MVC 的核心区别：

| 维度        | Spring MVC             | WebFlux                      |
|-------------|------------------------|------------------------------|
| 返回值      | `User`、`List<Order>`  | `Mono<User>`、`Flux<Order>`  |
| 线程模型    | 一个请求一个线程       | 少量 Event Loop 线程，不阻塞 |
| HTTP 客户端 | `RestTemplate`（阻塞） | `WebClient`（非阻塞）        |
| 数据库驱动  | JDBC/JPA（阻塞）       | R2DBC（非阻塞）              |
| 编程模型    | 同步顺序               | 异步响应式                   |

### 2.4 三者协作的完整请求链路

```text
1. 客户端发送 HTTP 请求
        ↓
2. Netty Event Loop 线程接收 TCP 数据，解析 HTTP 协议
        ↓
3. Netty 把请求封装成 ServerHttpRequest，交给 WebFlux
        ↓
4. WebFlux 路由匹配，调用 @RestController 方法
        ↓
5. 方法返回 Mono/Flux（此时业务逻辑可能尚未执行完）
        ↓
6. Reactor 编排数据流：数据就绪时执行 map/flatMap 操作符链
        ↓
7. 结果通过 Reactor 回调，交给 WebFlux
        ↓
8. WebFlux 把响应交给 Netty
        ↓
9. Netty Event Loop 把字节写回客户端
```

步骤 4→5 几乎瞬间完成（不等待数据库），线程立即释放去处理其他请求。真正的等待发生在步骤 6，由 Reactor 调度器管理，不占用 Web
处理线程。

---

## 三、Tomcat NIO 的真相：异步接收 + 同步处理

### 3.1 核心认知：Tomcat NIO 连接器内部也有"Event Loop"

这是理解 Java Web 并发模型最关键的一点。Tomcat 的 NIO 连接器内部采用三层线程模型：

```text
┌──────────────────────────────────────────────────────────┐
│                   Tomcat NIO 内部架构                      │
│                                                          │
│  Acceptor 线程（1个）                                      │
│       ↓ 接受 TCP 连接                                     │
│  Poller 线程（N个，通常1-2个）  ← 这就是 Tomcat 的"Event Loop" │
│       ↓ 监听 socket 可读/可写事件（epoll/kqueue）            │
│  Worker 线程池（默认200个）  ← 业务代码在这里运行              │
│       ↓ 同步执行业务逻辑                                   │
│  阻塞在 JDBC / HTTP 调用上                                 │
└──────────────────────────────────────────────────────────┘
```

**关键发现**：Poller 线程本质上就是一个 Event Loop——它用 epoll 监听成千上万个 socket 的读写事件。但它 **只负责网络 I/O
的事件侦测**，一旦数据就绪，就立刻把任务丢给 Worker 线程池，自己不再参与后续处理。

这正是 Tomcat 设计的精妙之处，也是其"拧巴"的原因。Tomcat 面临一个根本矛盾：一方面，为应对海量并发连接，底层 I/O
必须走向非阻塞；另一方面，庞大的 Servlet 生态要求"可以阻塞"。Tomcat 用一个分层设计调和了这个矛盾—— **将 NIO
非阻塞的优势用在"刀刃"上，即高效管理海量连接的"等待"阶段**。

### 3.2 与 FastAPI/asyncio 的本质对比

| 阶段         | Tomcat (Spring MVC)      | FastAPI (ASGI)                     |
|--------------|--------------------------|------------------------------------|
| 接收连接     | NIO 异步（epoll/kqueue） | NIO 异步（事件循环）               |
| 读取请求字节 | NIO 异步                 | 事件循环处理                       |
| 业务处理     | **交给线程池，同步阻塞** | **事件循环内 `await`，协作式让出** |
| I/O 等待时   | 线程卡住，操作系统挂起   | 协程挂起，事件循环切走             |
| 响应写回     | 线程写回                 | 事件循环写回                       |

Tomcat 的架构可以概括为：

> **网络 I/O 是异步的（Poller 线程），但业务执行是同步阻塞的（Worker 线程）**

而 FastAPI/asyncio 是：

> **网络 I/O 是异步的（Event Loop），业务执行也是异步的（协程）**

### 3.3 两种"等待"的底层差异

**Tomcat 线程等 I/O：**

```java
// Worker 线程执行到这里
User user = jdbcTemplate.queryForObject(sql, User.class);
// ↑ 线程状态：RUNNABLE → 实际在等 socket read（DB 连接）
// ↑ 操作系统把线程从 CPU 上拿下来，放入等待队列
// ↑ 线程的栈帧、寄存器全部保留，占着内存
// ↑ 线程数量有限（200），全部等待 I/O 则新请求无人处理
```

操作系统层面：线程被阻塞，调度器将其移出运行队列。但线程的栈内存（默认约 1MB）仍然占用，且线程切换本身有开销。

**FastAPI 协程等 I/O：**

```python
# Event Loop 执行到这里
user = await db.fetch_one(query)
# ↑ await 把当前协程挂起，保存一个轻量级"续体"（continuation）
# ↑ Event Loop 立刻切换到其他协程
# ↑ I/O 完成时，事件循环收到通知，恢复该协程
# ↑ 整个过程：单线程，零线程切换开销，栈内存几乎为零
```

操作系统层面：线程一直在运行（处理其他协程），无任何阻塞。协程切换是 **用户态**的，成本约 50ns，而线程上下文切换约 1-10μs。

### 3.4 为什么 Tomcat 不干脆做成 Event Loop？

**历史包袱 + 语言限制**共同决定了这一架构：

1. **Servlet 规范从 1997 年就是同步的**：`doGet()` 方法签名是 `void`，没有 `async/await` 的概念
2. **Java 长期缺乏原生 `async/await`**（Java 21 才引入虚拟线程），早期只能用回调或 Future，写起来极其痛苦
3. **现有生态全是同步的**：JDBC、JPA、MyBatis 等均为阻塞 API。即使 Tomcat 改成 Event Loop，业务代码调用
   `jdbcTemplate.query()` 照样会卡死 Event Loop

Tomcat 的折中方案是： **网络层用 NIO 提高效率，业务层用线程池隔离阻塞**。这样既兼容了所有同步生态，又在连接管理上实现了高并发。

---

## 四、Java 21 虚拟线程：用同步写法逼近异步能力

### 4.1 虚拟线程的工作原理

虚拟线程（JEP 444，Java 21 定稿）的核心魔法在于： **当代码遇到阻塞操作（如 `socket.read()`）时，虚拟线程自动从载体线程（Carrier
Thread）上"卸载"（unmount），载体线程立刻可以去运行其他虚拟线程**。当阻塞操作完成时，虚拟线程被重新挂载（remount）并恢复执行。

虚拟线程是一个真实的 `java.lang.Thread` 对象——类型相同、API 相同，但执行由 JVM 调度在少量平台线程之上，而非与操作系统线程
1:1 映射。

**平台线程（OS 线程）的硬约束：**

| 约束       | 平台线程            | 实际影响                  |
|------------|---------------------|---------------------------|
| 每线程内存 | 约 1MB 栈空间       | ~10,000 线程 ≈ 数 GB 内存 |
| 创建成本   | 系统调用 + 内核簿记 | 无法按请求创建            |
| 上下文切换 | 内核态调度          | 超过数千后性能急剧下降    |
| 现实天花板 | 数千个              | 阻塞请求的并发上限        |

虚拟线程移除了这一天花板，且无需将代码重写为响应式风格。

### 4.2 虚拟线程让 Tomcat 获得类似协程的效果

Java 21+ 中，同样的同步代码运行在虚拟线程上：

```java
// Java 21+，同样的同步代码
@GetMapping("/user/{id}")
public User getUser(@PathVariable int id) {
    return jdbcTemplate.queryForObject(sql, User.class); // 阻塞调用
}
// ↑ 运行在虚拟线程上
// ↑ 遇到 JDBC 阻塞时，虚拟线程自动"卸载"
// ↑ 载体线程去执行其他虚拟线程
// ↑ 效果与 asyncio await 几乎一致
```

| 维度        | Tomcat + 平台线程（200个） | Tomcat + 虚拟线程                    |
|-------------|----------------------------|--------------------------------------|
| 阻塞 I/O 时 | 线程卡住等待               | 虚拟线程挂起，载体线程去处理其他任务 |
| 并发能力    | 受限于线程池大小（200）    | 受限于内存（可达百万级虚拟线程）     |
| 代码写法    | 同步                       | 同步（无需修改）                     |

在 Spring Boot 中只需一行配置即可启用：

```properties
spring.threads.virtual.enabled=true
```

### 4.3 虚拟线程改变技术选型的天平

2026 年的主流共识正在形成：

> **普通业务用 MVC + 虚拟线程；只有真正需要流式处理、背压控制或长连接时，才上 WebFlux。**

虚拟线程让 Spring MVC 用同步写法获得了接近 WebFlux 的并发能力。对于 95% 的业务应用，传统 MVC + 虚拟线程是性价比更高的选择。

---

## 五、Pinned 陷阱：虚拟线程生产落地的最大隐患

### 5.1 什么是 Pinned（固定）

**Pinned = 虚拟线程被"钉"在载体线程上，无法卸载。**

当虚拟线程遇到阻塞操作，但因为某些原因 **不能**从载体线程上卸载时，就发生了 Pinning。结果是：
**载体线程跟着一起卡住，表现得与传统平台线程一样**。

如果大量虚拟线程同时被 Pinned，你以为的"百万并发"实际上退化成了"线程池打满"——而且更糟，因为虚拟线程是按需创建的，你连线程池大小都无法控制。

### 5.2 Pinned 的两大元凶（JEP 444 明确规定）

根据 JEP 444 的原文，Pinning 只发生在两种情况下，没有第三种：

1. **在 `synchronized` 块或方法内执行代码时发生阻塞**
2. **执行 Native 方法或 Foreign Function（JNI 调用）时发生阻塞**

**为什么 `synchronized` 会导致 Pinned？**

虚拟线程的栈存储在堆上（便于卸载/挂载），但 `synchronized` 的底层实现（ObjectMonitor）需要在栈上存储锁信息。如果虚拟线程在
`synchronized` 块内被卸载，栈被搬走后锁信息就会丢失——JVM 目前无法在 `synchronized` 保护下安全卸载，因此直接禁止卸载，即
Pinned。

**常见误区澄清**：并非所有 `synchronized` 使用都是致命的。只有 **在 `synchronized` 内部执行阻塞操作**才会真正
Pinned。保护纯内存操作（如更新内存 Map、递增计数器）的 `synchronized`，虽然技术上也会被标记，但持续时间极短，实践中不构成问题。

### 5.3 Pinned 的实际后果

**场景模拟**：10000 个并发请求，每个请求都需要获取一个 `synchronized` 锁来访问共享资源：

```text
传统线程池（200个线程）：
→ 200 个请求在处理，其余 9800 个在队列等待
→ 可控、有界

虚拟线程 + synchronized（Pinned）：
→ 10000 个虚拟线程全部创建
→ 10000 个虚拟线程全部 Pinned 在载体线程上
→ 载体线程数 ≈ CPU 核数（如 8 个）
→ 8 个载体线程全部被钉住
→ 吞吐量 ≈ 8 个线程的吞吐量
→ 比线程池还惨（线程池至少能限流）
```

**真实生产案例**：某团队将 Spring Boot 从 Java 17 升级到 21，开启虚拟线程后压测结果如下：

| 指标       | 预期        | 实际                   |
|------------|-------------|------------------------|
| 吞吐量     | 提升 3-5 倍 | **下降 40%**           |
| P99 延迟   | 降低        | **飙升到 8 秒**        |
| CPU 使用率 | 平稳        | 飙升（大量上下文切换） |

排查发现：项目中大量使用 `synchronized` 的缓存工具类 + HikariCP 的 `synchronized` 方法 + Logback 的 `synchronized`
appender。全部叠加后，虚拟线程几乎 100% 时间处于 Pinned 状态。

### 5.4 如何检测 Pinned

**方法一：JVM 参数（最简单）**

```bash
# 打印被钉住的完整堆栈
java -Djdk.tracePinnedThreads=full MyApp

# 或只输出有问题的帧
java -Djdk.tracePinnedThreads=short MyApp
```

当发生 Pinning 时，JVM 会打印堆栈：

```text
Thread[#42,ForkJoinPool-1-worker-3,5,CarrierThreads]
    java.base/java.lang.VirtualThread.park(VirtualThread.java:123)
    com.example.Cache.get(Cache.java:45)        ← 你的代码
    ...
    com.example.Service.handle(Service.java:23)  ← synchronized 在这里
```

**方法二：JFR（Java Flight Recorder）**

```bash
java -XX:StartFlightRecording:filename=vt.jfr MyApp
```

JFR 会发出 `jdk.VirtualThreadPinned` 事件（默认当阻塞操作超过 20ms 时触发），开销远低于打印堆栈，适合生产环境。

**方法三：Spring Boot Actuator**

```properties
management.endpoints.web.exposure.include=metrics,health
```

然后查看 `/actuator/metrics/jvm.threads.virtual.pinned` 指标。

### 5.5 如何解决 Pinned

**方案 1：将 `synchronized` 替换为 `ReentrantLock`（最推荐）**

```java
// ❌ 之前：synchronized 内包含 I/O，会导致 Pinned
public synchronized User getUser(int id) {
    return cache.computeIfAbsent(id, this::loadFromDB);
}

// ✅ 之后：ReentrantLock 不依赖栈上锁信息，可正常卸载
private final ReentrantLock lock = new ReentrantLock();

public User getUser(int id) {
    lock.lock();
    try {
        return cache.computeIfAbsent(id, this::loadFromDB);
    } finally {
        lock.unlock();
    }
}
```

`ReentrantLock` 基于 AQS（AbstractQueuedSynchronizer），其 `park` 机制已被改造，虚拟线程在 `lock()` 内部阻塞时可以安全卸载。

**方案 2：缩小 `synchronized` 范围，将 I/O 移出锁外**

```java
// ❌ 锁内包含 I/O
public synchronized void processOrder(Order order) {
    validate(order);
    saveToDB(order);      // I/O 在锁内 → Pinned
    sendNotification();   // I/O 在锁内 → Pinned
}

// ✅ 锁只保护内存操作
public void processOrder(Order order) {
    validate(order);
    Order validated = order.copy();

    synchronized (this) {
        state.update(validated);  // 纯内存操作
    }  // ← 锁退出，解除 Pinned

    saveToDB(validated);      // I/O 在外面，可正常卸载
    sendNotification();
}
```

**方案 3：用 `@Async` + 平台线程池隔离**

对于无法避免的 `synchronized` 代码（如第三方库），将其放入传统线程池运行：

```java
@Bean
public Executor platformExecutor() {
    return Executors.newFixedThreadPool(200); // 传统平台线程池
}

// 在虚拟线程中调用
CompletableFuture.supplyAsync(() -> {
    return legacyLibrary.blockingCall(); // synchronized 在里面，但跑在平台线程上
}, platformExecutor).join(); // 虚拟线程在这里 await，可正常卸载
```

**方案 4：升级 JDK 24+**

JEP 491（JDK 24）对 `synchronized` 的 Pinning 问题做了改进。但 JNI 导致的 Pinning 在任何版本中都无法解决。升级前务必确认目标
JDK 版本的实际行为。

### 5.6 生产落地避坑清单

| 检查项                       | 工具/方法                       | 说明                                            |
|------------------------------|---------------------------------|-------------------------------------------------|
| 项目中的 `synchronized` 用法 | `grep -r "synchronized"`        | 重点检查锁内是否有 I/O                          |
| 第三方库的 `synchronized`    | `-Djdk.tracePinnedThreads`      | 很多库无法修改                                  |
| 连接池（HikariCP 等）        | 确认版本                        | 新版已改用 LockSupport                          |
| 日志框架                     | 检查 appender 是否 synchronized | Logback 的 console appender 有此问题            |
| 缓存框架                     | Caffeine vs Guava               | Caffeine 对虚拟线程更友好                       |
| 老 JDBC 驱动                 | 升级驱动                        | 内部大量 synchronized 是重灾区                  |
| ThreadLocal 膨胀             | 代码审查                        | 百万虚拟线程 × 每个 ThreadLocal 值 = 堆爆炸风险 |

---

## 六、技术选型决策指南

综合以上分析，Java Web 技术栈的选型可以归纳为以下决策矩阵：

| 业务特征                     | 推荐架构                          | 核心理由                            |
|------------------------------|-----------------------------------|-------------------------------------|
| 常规 CRUD 微服务、后台管理   | **Spring MVC + 虚拟线程**         | 95% 场景的最优解，同步写法 + 高并发 |
| 高并发 I/O 密集型服务        | **Spring MVC + 虚拟线程**         | 虚拟线程已逼近响应式并发能力        |
| API 网关、代理、路由转发     | **WebFlux + Netty**               | 天生高并发，连接数远超线程数        |
| 长连接服务（WebSocket）      | **WebFlux + Netty**               | 背压机制是处理海量推送的核心        |
| 实时数据推送（SSE）          | **WebFlux + Netty**               | 流式响应天然契合                    |
| 流式处理且需背压控制         | **WebFlux + Netty**               | 响应式流的核心优势场景              |
| 外部服务并行调用             | **WebFlux（或 MVC + WebClient）** | `Mono.zip` 实现真正的并行调用       |
| 已有 WebFlux 项目            | **继续使用 WebFlux**              | 无需为并发改回 MVC                  |
| CPU 密集型计算               | **Spring MVC + 平台线程池**       | 响应式在此场景是负优化              |
| 依赖大量同步 SDK（JDBC/JPA） | **Spring MVC + 虚拟线程**         | 避免 Event Loop 被阻塞              |

**坚决拒绝 WebFlux 的情况：**

- 团队技术栈深度不足，无法熟练处理响应式错误传播和上下文传递
- 只是"听说性能好"但业务是普通 CRUD
- 团队没用过 Reactor，又没有时间踩坑
- 维护成本与收益严重不成正比

---

## 七、结论

Java Web 技术栈的演进，本质上是围绕一个核心矛盾展开的： **如何在保持开发体验（同步、顺序、易调试）的同时，突破并发瓶颈**。

1. **Spring MVC + Tomcat** 用"线程池隔离阻塞"的方式，以最小的复杂度换取足够好的性能，是绝大多数项目的正确选择。

2. **WebFlux + Reactor + Netty** 通过全链路响应式，在特定场景下（网关、长连接、流式推送）提供了碾压性的性能优势，但代价是认知成本陡增和生态改造。

3. **Tomcat NIO 的本质**是"异步接收连接 + 同步处理业务"——Poller 线程扮演 Event Loop 的角色，但只负责网络 I/O，业务逻辑仍在
   Worker 线程中同步执行。这与 FastAPI/asyncio 的"全异步"模型存在根本差异。

4. **Java 21 虚拟线程**试图用"同步写法 + 自动卸载"来弥合这一差距，让阻塞代码在 I/O 等待时自动让出载体线程。但
   `synchronized` 导致的 **Pinned 陷阱**是其生产落地的最大隐患——`synchronized` 内执行阻塞操作时，虚拟线程会被钉在载体线程上，导致并发能力退化到平台线程水平。

5. **虚拟线程的正确使用姿势**：短生命周期、频繁阻塞、避免 Pinning。检测 Pinning 用 `-Djdk.tracePinnedThreads` 或
   JFR，解决方法是替换为 `ReentrantLock`、缩小锁范围，或将阻塞代码隔离到平台线程池。

最终的建议是： **新项目优先评估 Spring MVC + 虚拟线程；只有当业务真正需要 WebFlux
的差异化能力（背压、长连接、流式处理）时，才选择响应式路线。**

---

## 参考资料

- [Spring Boot 官方文档 - Embedded Web Servers](https://docs.springframework.org.cn/spring-boot/how-to/webserver.html) — 嵌入式 Web 服务器配置与替换
- [Spring 官方文档 - Web on Reactive Stack](https://docs.spring.io/spring/docs/5.0.6.RELEASE/spring-framework-reference/web-reactive.html) — WebFlux 响应式栈参考
- [Oracle 官方文档 - Java 21 Virtual Threads](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html) — 虚拟线程官方指南
- [OpenJDK - Project Loom: Modern Scalable Concurrency for the Java Platform](https://cr.openjdk.org/~alanb/devoxx2023/ProjectLoomDevoxx2023.pdf) — Project Loom 演讲材料
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444) — 虚拟线程定稿规范（含 Pinning 规定）
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491) — JDK 24 对 synchronized Pinning 的改进
- [Apache Tomcat - NioEndpoint 类文档](https://tomcat.apache.org/tomcat-7.0-doc/api/org/apache/tomcat/util/net/NioEndpoint.html) — Tomcat NIO 连接器实现
- [Spring MVC vs Spring WebFlux — When to Use Each](https://www.trinitylogic.co.uk/blog/spring-webflux-vs-spring-mvc) — 两大框架选型对比
- [WebFlux 架构演进实录：从响应式陷阱到生产环境的理性回归](https://tsight.io/articles/12743268) — 响应式改造的实战反思
- [解密 Tomcat 的 I/O 模型：非阻塞之上，为何要兼容阻塞？](https://wozhenbang.blog.csdn.net/article/details/151762159) — Tomcat 分层设计解读
- [Java Virtual Threads (Project Loom): A Production Deep Dive](https://devscampus.com/articles/java-virtual-threads-loom-deep-dive) — 虚拟线程生产实践
- [Pinning in Virtual Threads: The Two Real Cases According to JEP 444](https://juanchi.dev/en/blog/pinning-virtual-threads-jep-444-two-cases) — JEP 444 Pinning 两大场景详解
- [Virtual Thread Pinning: The Synchronized Block Trap Nobody Warned You About](https://www.javacodegeeks.com/?p=144670/) — synchronized 陷阱分析
- [Virtual Thread Pinning: where synchronized stops being free](https://github.com/alxkm/loom/tree/main) — Pinning 复现实验代码
- [Java 21 虚拟线程对 JVM 调优策略的影响](https://openeuler.csdn.net/6ab64262ad85947e68cc3844.html) — JVM 调优视角
- [为什么越来越多人使用 WebFlux？](https://cloud.tencent.com/developer/article/2715430) — WebFlux 采用趋势
- [Spring WebFlux：响应式 Web 框架](https://wiloon.com/spring-webflux) — WebFlux 入门概述
- [Project Loom 不是一次升级：三块内容分属 JDK 21 与 JDK 25 两条时间线](https://www.chenxutan.com/d/7866.html) — Loom 演进路线
