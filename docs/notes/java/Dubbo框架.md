---
title: "Dubbo 框架"
date: 2026-05-10
description: 从单一架构到微服务的架构演进，Dubbo 框架核心概念与服务治理实践
tags:
  - Java
  - Dubbo
  - 微服务
---

# Dubbo 框架

---

## 架构演进

### 单一应用架构

网站流量很小时，只需一个应用，将所有功能部署在一起，减少部署节点和成本。此时，用于简化增删改查的**数据访问框架（ORM）** 是关键。

### 垂直应用架构

访问量逐渐增大，单一应用增加机器的加速度越来越小，将应用拆成互不相干的几个应用以提升效率。此时，用于加速前端页面开发的 **Web 框架（MVC）** 是关键。

### 分布式服务架构

垂直应用越来越多，应用之间交互不可避免，将核心业务抽取出来作为独立服务，形成稳定的服务中心。此时，用于提高业务复用及整合的**分布式服务框架（RPC）** 是关键。

---

## 架构概览

### 节点角色

| 节点 | 角色说明 |
|------|---------|
| **Provider** | 暴露服务的服务提供者 |
| **Consumer** | 调用远程服务的服务消费者 |
| **Registry** | 服务注册与发现中心 |
| **Container** | 服务运行容器 |
| **Monitor** | 监控 |

### 调用关系

| 线 | 说明 |
|----|------|
| 0 | 服务容器负责启动、加载、运行服务提供者 |
| 1 | 服务提供者在启动时，向注册中心注册自己提供的服务 |
| 2 | 服务消费者在启动时，向注册中心订阅自己所需的服务 |
| 3 | 注册中心返回服务提供者地址列表给消费者；如有变更，基于长连接推送变更数据 |
| 4 | 服务消费者从提供者地址列表中，基于软负载均衡算法选一台进行调用 |
| 5 | 服务提供者和服务消费者会上报相关打点至 Monitor |

> 若注册中心全部宕机，不影响已运行的提供者和消费者——消费者在本地缓存了提供者列表。

---

## 常见问题

### 为什么不能传大包？

Dubbo 协议采用**单一长连接**。假设每次请求数据包 500KB，千兆网卡下每条连接最大约 7MB，则：

- 单个服务提供者 TPS 最大：128MB / 500KB ≈ 262
- 单个消费者调用单个提供者 TPS 最大：7MB / 500KB ≈ 14

如果能接受上述指标则可用，否则网络将成为瓶颈。

### 为什么采用异步单一长连接？

服务现状通常是**提供者少、消费者多**（例如 6 台提供者服务上百台消费者，每天 1.5 亿次调用）。如果采用常规 hessian 服务，提供者容易被压垮。

- **单一连接**：保证单一消费者不会压死提供者
- **长连接**：减少连接握手验证
- **异步 IO**：复用线程池，防止 C10K 问题

### 短连接 vs 长连接

**短连接**：每次通信建立新连接，数据传输完成后立即关闭。
**长连接**：建立连接后保持打开状态，可多次数据传输，直到超时或主动关闭。

#### 短连接适用场景

- 低频请求场景（如用户偶尔提交表单）
- 移动 APP、网页端（百万用户在线，无法维持大量长连接，且请求无状态）
- RESTful API、静态资源请求（每次请求独立无状态）
- 安全性要求高的敏感操作（支付、密码修改，减少被攻击窗口）

#### 长连接适用场景

- 高频实时通信（聊天应用、实时游戏、股票行情）
- 数据库连接池（避免每次 SQL 都建立新连接）
- 服务间 RPC 调用
- 实时数据推送（监控数据等）
- 文件传输、流媒体

---

## 配置规范

### 配置原则

1. **在 Provider 上尽量多配置 Consumer 端属性** — 提供者更清楚服务性能参数（超时时间、重试次数等）
2. Provider 配置后，Consumer 不配置则使用 Provider 的缺省值；否则 Consumer 端设置对 Provider 不可控且往往不合理
3. Provider 上多配置 Consumer 端属性，促使实现者一开始就思考服务质量问题

### 预热功能

Dubbo 对新启动实例进行预热，根据启动时间动态计算权重，按权重负载均衡。预热时间默认 **2 分钟**。

```xml
<dubbo:provider>
  <dubbo:parameter key="warmup" value="120000" />
</dubbo:provider>
```

> 注意：一个项目中只能有一个 `dubbo:provider` 配置，否则不生效。

### retries（重试次数）

调用重试次数（不包括第一次），需 cluster 设置为 `failover`（默认）才生效。推荐配置为 **0**，否则高流量下超时重试可能导致服务雪崩。

```xml
<dubbo:service interface="com.example.service.xxxService" ref="xxxServiceImpl">
  <dubbo:method name="methodA" retries="1"/>
</dubbo:service>
```

> 发布系统全局禁用了调用重试，但允许 method 级别设置重试。

### accepts（不建议配置）

服务提供方最大可接受连接数，默认 **0**（不限制）。每个 Dubbo Client 都会与后端每个 Dubbo Service 建立长连接。

### accesslog

设为 `true` 将输出访问日志到 logger，也可指定文件路径。

推荐设置：`true` 或 `false`，不推荐使用本地日志方式。

### check

| 配置位置 | 说明 | 推荐 |
|---------|------|------|
| `dubbo:reference` | 启动时检查提供者是否存在（默认 true） | 强依赖设为 true，弱依赖设为 false |
| `dubbo:registry` | 注册失败时是否报错（默认 true） | — |

### cluster（集群方式）

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **failover**（默认） | 失败自动切换，重试其它服务器 | 读操作（注意雪崩风险，可设 retries=0） |
| **failfast** | 只发起一次调用，失败立即报错 | 非幂等性写操作 |
| **failsafe** | 出现异常直接忽略，返回 null | 写入审计日志等 |
| **failback** | 后台记录失败请求，每隔 5s 重发 | 消息通知操作 |
| **broadcast** | 同步发送请求给所有服务器 | 缓存更新、系统通知 |
| **forking** | 并行调用，一个成功即返回 | 实时性要求高的读操作 |

### connections（不建议配置）

客户端连接到后端每台服务器的连接数，默认 **1**。

推荐设置：**3**，不推荐设置过大（增大服务端压力，性能提升有限）。

### loadbalance（负载均衡）

默认：**random**（随机）。

其他选项：consistenthash、roundrobin、leastactive 等。

### validation

是否启用 JSR303 标准注解验证，可在 `dubbo:reference`、`dubbo:method` 上配置。

### payload（不建议配置）

请求及响应数据包大小限制，单位：字节，默认 **8MB**。

### return

方法调用是否需要返回值，`async` 设置为 `true` 时才生效。无需返回结果时可设为 `false`。

### sent

是否等待消息完成发送，默认 `false`。如果设置成 `async` 模式，需确认 `sent` 为 `false`。

### serialization（不建议配置）

序列化方式，默认 **hessian2**。不推荐设置为 kryo、dubbo（可能存在版本间兼容问题）。序列化对象中不推荐使用枚举类型。

### threadpool / threads

| 类型 | 说明 | 默认线程数 | 特点 |
|------|------|-----------|------|
| **fixed** | 固定大小线程池 | 500 | 来一个请求增加一个线程，直到达到期望值；适合秒杀等流量突增场景 |
| **cached** | 可缓存线程池 | Integer.MAX_VALUE | 基于请求调整线程数，超过 1min 非活跃线程自动销毁 |
| **limited**（默认） | 增长不销毁 | 500 | 线程不够用则增加，但增加的线程不销毁 |

推荐配置：
- Dubbo 服务端线程池默认 **limited**，线程数根据业务场景及 CPU load 确定
- Dubbo 客户端线程池默认 **cached**，通常不超过 100 个线程
- 秒杀类业务建议使用 **fixed**，日常流量均匀的使用默认值

### lazy（延迟连接）

延迟连接用于减少长连接数，避免启动阶段物理建连，当有调用发起时再创建长连接。谨慎使用，第一次请求会附加额外的建连 RT。

---

## 重要功能

### 一、启动时检查

Dubbo 缺省在启动时检查依赖的服务是否可用，不可用时抛出异常，阻止 Spring 初始化完成（默认 `check="true"`）。

```xml
<dubbo:reference check="false" />
```

- 测试时或存在循环依赖时可关闭检查
- 懒加载或 API 编程延迟引用的场景需关闭检查

### 二、集群容错

集群调用失败时，Dubbo 提供多种容错方案，缺省为 **failover** 重试。

#### 各节点关系

- **Invoker**：Provider 可调用 Service 的抽象，封装了地址及接口信息
- **Directory**：代表多个 Invoker，值可动态变化（如注册中心推送变更）
- **Cluster**：将 Directory 中的多个 Invoker 伪装成一个，对上层透明，包含容错逻辑
- **Router**：从多个 Invoker 中按路由规则选出子集（如读写分离、应用隔离）
- **LoadBalance**：从多个 Invoker 中选出具体的一个，包含负载均衡算法

#### 容错模式

| 模式 | 说明 | 配置值 |
|------|------|--------|
| **Failover Cluster**（默认） | 失败自动切换，重试其它服务器，不推荐（易雪崩） | `cluster="failover"` |
| **Failfast Cluster** | 只发起一次调用，失败立即报错 | `cluster="failfast"` |
| **Failsafe Cluster** | 异常直接忽略 | `cluster="failsafe"` |
| **Failback Cluster** | 后台记录，定时重发 | `cluster="failback"` |
| **Forking Cluster** | 并行调用，一个成功即返回 | `cluster="forking"` |

```xml
<dubbo:service cluster="failsafe" />
<dubbo:reference cluster="failsafe" />
```

### 三、负载均衡

| 策略 | 说明 |
|------|------|
| **Random**（默认） | 按权重随机调用，调用量越大分布越均匀 |
| **ConsistentHash** | 相同参数的请求总发到同一提供者；挂掉时平摊到其它提供者 |
| **HealthStatus** | 根据接口响应时间和异常率动态调整权重 |

### 四、线程模型

**核心设计：I/O 线程与业务线程分离。**

Dubbo 底层使用 Netty 进行网络通信：

- **I/O 线程（Netty EventLoopGroup）**：负责连接管理、数据编解码、心跳检测。**绝对不允许被阻塞**，默认线程数为 CPU 核数的两倍
- **业务线程池（Server ThreadPool）**：执行业务逻辑，默认策略为 `all`，确保 I/O 线程快速处理网络读写后立即交给业务线程

#### 分发策略

| 策略 | 工作机制 | 适用场景 |
|------|---------|---------|
| **all**（默认） | 所有消息提交给业务线程池 | 通用场景，防止 I/O 线程被阻塞 |
| **direct** | 所有消息直接在 I/O 线程执行 | 业务逻辑极轻量的快操作（慎用） |
| **message** | 仅请求/响应派发到业务线程池 | 高并发场景，减少对业务线程池的占用 |
| **execution** | 仅业务请求派发到业务线程池，响应在 I/O 线程处理 | 减少线程切换开销 |
| **connection** | 连接/断开事件在 I/O 线程排队有序执行 | 需要保证连接事件处理顺序的场景 |

```yaml
dubbo:
  protocol:
    name: dubbo
    port: 20880
    dispatcher: all
    threadpool: fixed
    threads: 200
    queues: 1000
```

### 五、泛化调用

泛化调用允许在**不依赖服务提供方接口 JAR 包**的情况下进行远程服务调用。

#### 核心概念

| 特性 | 说明 |
|------|------|
| 核心定位 | 无需接口 JAR 包即可调用远程服务 |
| 关键接口 | `GenericService` 及其 `$invoke` 方法 |
| 主要价值 | 解耦接口依赖，支持动态调用和跨语言场景 |
| 典型场景 | 服务网关、测试平台、接口频繁变更 |
| 性能特点 | 略高于普通调用（需动态序列化/反序列化） |

#### 核心原理

消费端将 `generic` 属性设为 `true` 后，Dubbo 创建 `GenericService` 代理对象，所有调用通过 `$invoke` 方法转发。

- 消费者端：`GenericImplFilter` 拦截并重构参数
- 提供者端：`GenericFilter` 拦截请求，通过反射调用目标方法

#### API 方式

```java
ReferenceConfig<GenericService> reference = new ReferenceConfig<>();
reference.setInterface("com.example.UserService");
reference.setGeneric("true");
reference.setRegistry(new RegistryConfig("zookeeper://127.0.0.1:2181"));

GenericService genericService = reference.get();
Object result = genericService.$invoke(
    "getUser",
    new String[]{"java.lang.Integer"},
    new Object[]{1}
);
```

#### Spring 配置方式

```xml
<dubbo:reference id="userService"
    interface="com.example.UserService"
    generic="true" />
```

```java
GenericService userService = (GenericService) applicationContext.getBean("userService");
Object result = userService.$invoke("getUser", new String[]{"java.lang.Integer"}, new Object[]{1});
```

#### 参数处理

- **基本类型**：可直接传递（如 String, Integer）
- **POJO 对象**：需转换为 `Map<String, Object>` 格式，Dubbo 自动递归转换为对应 POJO
- **复杂嵌套对象**：可使用 `PojoUtils` 工具类转换

#### 限制与优化

- 不支持方法重载
- 注意类型安全，调用方需确保参数与结构匹配
- 性能优化：缓存 `GenericService` 实例；选用合适的序列化方式（如 Protobuf）

### 六、上下文信息

通过 `RpcContext` 的 `setAttachment` / `getAttachment` 在服务消费方和提供方之间进行参数的**隐式传递**。

**消费方设置：**

```java
RpcContext.getContext().setAttachment("index", "1");
xxxService.xxx(); // 远程调用
```

**提供方获取：**

```java
public void xxx() {
    String index = RpcContext.getContext().getAttachment("index");
}
```

> 注意：`path`, `group`, `version`, `token`, `timeout` 为保留字段，请使用其它值。请务必在提供方代码最开头调用 `getAttachment`，否则下一次 RPC 调用会覆盖掉 `RpcContext`。

### 七、优雅关机

Dubbo 通过 JDK 的 **ShutdownHook** 完成优雅关机。

**Spring 优雅关机配置：**

```java
public static void main(String[] args) {
    SpringApplication springApplication = new SpringApplication(ProviderService.class);
    springApplication.setRegisterShutdownHook(false);
    ConfigurableApplicationContext ctx = springApplication.run(args);
    Runtime.getRuntime().addShutdownHook(
        new Thread(() -> {
            try {
                TimeUnit.MILLISECONDS.sleep(10000L);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            ctx.close();
        }));
}
```

**服务提供方：**
1. 从注册中心注销当前节点，新请求直接报错，让客户端重试其它机器
2. 检测线程池中的线程是否正在运行，等待执行完成（除非超时）

**服务消费方：**
1. 不再发起新的调用请求
2. 检测是否有请求响应未返回，等待响应（除非超时）
