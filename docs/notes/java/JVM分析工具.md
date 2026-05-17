---
title: "JVM 分析工具"
date: 2026-05-10
description: JVM GC 概览与 jstat、jmap、jstack、Arthas 等分析工具使用指南
tags:
  - Java
  - JVM
  - 工具
---

# JVM 分析工具

---

## GC 概览

在 Java 8 中，默认的垃圾回收器是 **Parallel GC**（吞吐量收集器）。

### Java 8 主要垃圾回收器

| 回收器 | 别名/组合 | 设计目标 | 适用场景 |
|--------|----------|---------|---------|
| **Parallel GC**（默认） | Parallel Scavenge + Parallel Old | 高吞吐量 | 后台运算、批处理、多核 CPU |
| **Serial GC** | Serial + Serial Old | 简单高效、低内存开销 | 客户端模式、单核 CPU、小型应用 |
| **ParNew GC** | ParNew + CMS | 与 CMS 搭配，减少停顿 | 对延迟敏感的系统 |
| **CMS GC** | Concurrent Mark-Sweep | 低延迟 | Web 服务器、B/S 架构等响应时间敏感的应用 |
| **G1 GC** | Garbage-First | 平衡吞吐量与延迟 | 大内存堆（如 6GB 以上），需要可预测停顿时间 |

### 查看当前 GC

```bash
java -XX:+PrintCommandLineFlags -version
```

输出中若看到 `-XX:+UseParallelGC` 即为默认的 Parallel GC。

### 如何选择

- **高吞吐量**且可接受一定停顿 → **Parallel GC**（默认）
- **交互式应用**（如 Web 服务），对低延迟有较高要求 → **CMS** 或 **G1**
- **资源受限环境**（嵌入式、小型桌面应用） → **Serial GC**

---

## G1 GC 工作机制

G1（Garbage-First）旨在**平衡高吞吐量与低停顿时间**，适合多处理器、大内存（如 8GB 以上）的服务器环境。它摒弃了传统连续物理分代设计，采用**基于 Region 的堆内存管理方案**。

### 核心机制

| 概念 | 描述 |
|------|------|
| **堆内存布局** | 将堆划分为多个（约 2048 个）大小相等的 Region，每个 Region 可动态充当 Eden、Survivor、Old 或 Humongous 角色 |
| **Young GC** | Eden 区占满时触发，只收集年轻代 Region，停顿短但较频繁 |
| **Mixed GC** | 老年代占用达到阈值（默认 45%）时触发，回收整个新生代 + **部分老年代**，优先选择回收价值高的 Region |
| **Full GC** | 内存不足、并发处理失败等紧急情况触发，对整个堆单线程标记-整理，应极力避免 |
| **RSet**（记忆集合） | 每个 Region 记录其他 Region 对自身的引用，避免全堆扫描 |
| **SATB**（初始快照） | 在并发标记开始时为对象图建立逻辑快照，通过写屏障记录并发期间的变化 |

### 工作阶段

1. **初始标记**（STW）：标记 GC Roots 直接关联的对象，通常借 Young GC 完成
2. **并发标记**：与用户线程并发，遍历对象图进行可达性分析
3. **最终标记**（STW）：处理并发标记期间遗留的 SATB 记录
4. **筛选回收**（STW）：根据设定的最大停顿时间目标（`-XX:MaxGCPauseMillis`，默认 200ms），筛选回收价值最高的 Region

**Humongous 对象**：超过单个 Region 容量 50% 的大对象，直接在老年代中一个或多个连续的 Humongous Region 中分配。

### 关键参数

| 参数 | 说明 | 建议 |
|------|------|------|
| `-XX:+UseG1GC` | 启用 G1 | — |
| `-XX:MaxGCPauseMillis=200` | 目标最长停顿时间（默认 200ms） | 在线业务建议 ≤ 100ms；离线批处理不建议 > 500ms |
| `-XX:InitiatingHeapOccupancyPercent=45` | 触发并发标记的堆占用百分比 | 大堆（≥ 32GB）适当调大 |
| `-XX:G1HeapRegionSize` | Region 大小（1MB-32MB，2 的幂次） | 小堆且有大对象时可适当调大 |

> G1 的设计目标是尽可能避免 Full GC。核心是调整参数使 Mixed GC 能跟上对象分配速度。

---

## JFR 文件分析

JFR（Java Flight Recorder）是 Oracle JDK 自带的性能记录工具，开销极小，可在生产环境持续运行。

### JFR 录制方式

| 方式 | 适用场景 | 命令/参数 | 优势 |
|------|---------|-----------|------|
| **启动时录制** | 启动阶段问题排查 | `-XX:StartFlightRecording=name=jfr-forever,maxage=1h,maxsize=120M,delay=60s` | 自动化，适合与启动脚本集成 |
| **运行时动态录制** | **生产环境首选** | `jcmd <pid> JFR.start` | 无需重启，灵活，对业务影响最小 |
| **通过工具录制** | 开发/测试环境 | JMC, Arthas | 可视化界面，操作直观 |

### 分析方式

线上碰到 Full GC 告警时，采用 profiler 对 JFR 文件分析，生成 CPU 火焰图和大对象火焰图进行可视化分析。

---

## OOM 问题排查

### 获取堆转储

```bash
# 自动生成（推荐启动时添加）
java -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/path/to/dumps ...

# 手动生成
jmap -dump:format=b,file=heapdump.hprof <pid>
jmap -dump:live,format=b,file=heapdump.hprof <pid>  # 仅存活对象，文件更小
```

### OOM 类型

| 错误信息 | 说明 |
|---------|------|
| `Java heap space` | 堆内存溢出 |
| `Metaspace` | 元空间溢出 |
| `Unable to create new native thread` | 线程创建失败 |
| `GC overhead limit exceeded` | GC 效率低下 |

### MAT 分析

推荐使用 **MAT（Memory Analyzer Tool）** 分析堆内存：

- **Histogram**：查看每个类型占用的内存大小。右键 → `List Object` → `with incoming/outgoing refs` 可查看实例引用，`Path To GC Roots` 快速定位 GC Root
- **Dominator Tree**：对象级别下钻，查看引用树
- **Top Consumers**：class 和包级别展示大对象及饼状图

---

## JDK 8 常见 GC 参数调优推荐

### G1 标记周期阶段

1. **初始标记**：标记 GC Roots，与常规 STW 年轻代 GC 密切相关
2. **根区域扫描**：扫描存活区对老年代的引用（与应用并发运行）
3. **并发标记**：在整个堆中查找存活对象（与应用并发运行）
4. **重新标记**：STW，清空 SATB 缓冲区，跟踪未被访问的存活对象
5. **清理**：STW 统计 + RSet 净化，识别空闲区域和可供 Mixed GC 的区域

### 堆配置

```bash
-Xms{POD内存80%}G -Xmx{POD内存80%}G -Xss512K \
-XX:+UnlockExperimentalVMOptions -XX:G1MaxNewSizePercent=40
```

| 参数 | 默认值 | 说明 | 建议 |
|------|--------|------|------|
| `-Xms` / `-Xmx` | — | 堆内存最小值/最大值 | 建议设为 POD 内存的 80% |
| `-Xss` | 1M | 线程栈大小 | 在线业务建议 512K |
| `-XX:G1NewSizePercent` | 5% | 新生代占堆的最小比例 | 启动需加载大量缓存的服务可调大 |
| `-XX:G1MaxNewSizePercent` | 60% | 新生代占堆的最大比例 | 大堆（≥ 32G）建议调小，降低单次 YGC 时间 |
| `-XX:G1HeapRegionSize` | 自动 | Region 大小（1MB-32MB） | 小堆且有大对象时可适当调大 |
| `-XX:G1ReservePercent` | 10% | 空闲空间预留百分比 | 无需额外配置 |
| `-XX:MaxDirectMemorySize` | 0（自动） | NIO 堆外内存上限 | 无需额外配置 |

### GC 配置

```bash
-XX:+UseG1GC -XX:MaxGCPauseMillis=100 \
-XX:InitiatingHeapOccupancyPercent=50 -XX:MaxTenuringThreshold=10
```

| 参数 | 默认值 | 说明 | 建议 |
|------|--------|------|------|
| `-XX:+UseG1GC` | — | 使用 G1 回收 | — |
| `-XX:MaxGCPauseMillis` | 200ms | 目标最长 STW 时间 | 对延迟敏感 ≤ 100ms |
| `-XX:InitiatingHeapOccupancyPercent` | 45% | 触发 GC 标记的堆占用百分比 | 大堆（≥ 32GB）适当调大 |
| `-XX:G1HeapWastePercent` | 10% | 堆浪费百分比 | 无需额外配置 |
| `-XX:G1OldCSetRegionThresholdPercent` | 5% | Mixed GC 最大回收旧区域占比 | 无需额外配置 |
| `-XX:G1MixedGCLiveThresholdPercent` | 65% | Mixed GC 中老年代 Region 存活阈值 | 大堆（≥ 32GB）可调大 |
| `-XX:G1MixedGCCountTarget` | 8 | Mixed GC 目标次数 | 无需额外配置 |
| `-XX:MaxTenuringThreshold` | 15 | 对象最大存活年龄 | Survivor 区过大时可调小 |
| `-XX:ParallelGCThreads` | 核数 < 8 时 = 核数；≥ 8 时 = 核数 * 5/8 | STW 并行 GC 线程数 | 无需额外配置 |
| `-XX:ConcGCThreads` | ParallelGCThreads / 4 | 并发标记线程数 | 无需额外配置 |
| `-XX:+ParallelRefProcEnabled` | 关闭 | 并行处理 Reference 对象 | RefGC 耗时较长时可开启 |

### 物理内存监控

```bash
-XX:NativeMemoryTracking=detail
```

| 参数 | 默认值 | 说明 | 建议 |
|------|--------|------|------|
| `-XX:NativeMemoryTracking` | 关闭 | 监控底层 JVM 模块内存分配 | 内存分析时打开 |

### 开关优化

```bash
-XX:-OmitStackTraceInFastThrow -XX:+PreserveFramePointer \
-Djava.security.egd=file:/dev/./urandom -Dfile.encoding=UTF-8
```

| 参数 | 默认值 | 说明 | 建议 |
|------|--------|------|------|
| `-XX:-UseBiasedLocking` | 开启 | 关闭偏向锁 | 高并发场景可关闭 |
| `-XX:GuaranteedSafepointInterval` | 1000ms | 定时进入 Safepoint（需 `+UnlockDiagnosticVMOptions`） | 按需调整 |
| `-XX:+UseCountedLoopSafepoints` | 关闭 | 防止大循环 JIT 编译优化 Safepoint | 性能分析时开启 |
| `-XX:-OmitStackTraceInFastThrow` | 开启 | 不丢弃重复异常的堆栈 | 异常排查场景可关闭 |
| `-XX:+PreserveFramePointer` | 关闭 | 保留帧指针，便于外部 profiler 构建调用栈 | 性能分析时开启 |

### GC Log 配置

**JDK ≤ 1.8：**

```bash
-XX:+PrintGCCause -XX:+PrintGCDetails -XX:+PrintGCApplicationStoppedTime \
-XX:+PrintTenuringDistribution -XX:+PrintReferenceGC -XX:+PrintHeapAtGC \
-XX:+PrintGCDateStamps -XX:+PrintGCTimeStamps
```

**JDK ≥ 9（统一日志格式）：**

```bash
-Xlog:gc*=info,phases*=debug,region*=debug,age*=trace,ergo*=debug,safepoint,heap*=debug:file=gc.log:time,level,tags:filecount=5,filesize=2m
```

| GC Log 参数 | 说明 | 建议 |
|-------------|------|------|
| `-XX:+PrintGCCause` | 打印 GC 触发原因 | 默认开启 |
| `-XX:+PrintGCDetails` | 打印各阶段详细日志 | 默认开启 |
| `-XX:+PrintGCApplicationStoppedTime` | 打印 GC STW 时间 | 默认开启 |
| `-XX:+PrintTenuringDistribution` | 打印存活对象年龄分布 | 默认开启 |
| `-XX:+PrintReferenceGC` | 打印引用处理详情 | 默认开启 |
| `-XX:+PrintHeapAtGC` | 打印 GC 前后堆各分代详情 | 默认开启 |
| `-XX:+PrintGCDateStamps` | 打印 GC 绝对日期 | 默认开启 |
| `-XX:+PrintGCTimeStamps` | 打印 GC 绝对时间 | 默认开启 |
| `-XX:+PrintAdaptiveSizePolicy` | 打印自适应分代调整信息 | 按需开启 |
| `-XX:+PrintSafepointStatistics` | 打印 Safepoint 等待统计 | 性能分析时开启 |

---

## 工具汇总

| 工具 | 说明 |
|------|------|
| **jstack** | 生成线程快照（thread dump），分析死锁、线程长时间停顿等 |
| **JFR**（Java Flight Recorder） | Oracle JDK 自带的性能记录工具，开销极小，收集 JVM / 应用 / OS 事件 |
| **JMC**（Java Mission Control） | 图形化监控与管理工具，配合 JFR 可视化性能数据 |
| **JMH**（Java Microbenchmark Harness） | OpenJDK 微基准测试工具，方法级纳秒精度，规避 JIT 优化干扰 |
| **jstat** | 命令行监控 GC、类加载、JIT 编译等统计信息 |
| **jmap** | 生成堆转储快照（heap dump），查看堆内对象统计 |
| **JProfiler** | 商业性能分析工具，提供 CPU/内存/线程分析及图形界面 |
| **VisualVM** | 多合一故障诊断和性能监控工具，集成多个 JDK 命令行工具 |
| **MAT**（Memory Analyzer Tool） | 分析堆转储文件，定位内存泄漏，查看对象分布 |
| **Arthas** | 阿里巴巴开源诊断工具，动态跟踪方法执行、监控调用、查看类加载 |
| **Async Profiler** | 低开销采样分析器，分析 CPU 周期、内存分配、锁等 |
| **gctoolkit** | 分析 GC 日志的工具 |

---

## JVM 线程模型

### 1:1 映射 + 时间片轮转

JVM 线程和内核线程通常是 **1:1 映射**。CPU 核心数有限，但操作系统通过**时间片轮转**的分时复用技术，让大量线程感觉在同时运行。

- **时间片轮转**：调度器为每个就绪线程分配极短的时间片（几毫秒到几十毫秒），时间片用完则切换到下一个线程
- **上下文切换**：切换时有成本，线程过多会导致大量时间浪费在切换上而非执行

### 线程数量限制

| 限制因素 | 说明 |
|---------|------|
| **操作系统限制** | 系统最大线程数（`threads-max`）、用户进程数限制（`ulimit -u`） |
| **内存资源** | 每个线程需要独立栈内存（`-Xss`，默认约 1MB），线程数过多会耗尽内存 |
| **性能衰减** | 可运行线程数远超 CPU 核心数时，上下文切换消耗大量 CPU |

### 线程池大小建议

- **CPU 密集型**：线程数 ≈ CPU 核心数 + 1
- **I/O 密集型**：线程数 = CPU 核心数 / (1 - 阻塞率)，可远大于 CPU 核心数

---

## JMH 微基准测试

JMH（Java Microbenchmark Harness）由 OpenJDK 团队打造，用于**方法级**的精准性能测试，精度可达纳秒级别。

### 为什么需要 JMH

直接使用 `System.currentTimeMillis()` 测量性能往往不准确，因为 JVM 会进行多种优化：

- **死码消除**：计算结果未被使用的代码可能直接被优化掉
- **常量折叠与传播**：编译期常量表达式直接被计算结果替换
- **即时编译预热**：JIT 编译优化导致运行初期和稳定期性能差异大

JMH 通过预热、Blackhole 防死码消除、多次 Fork 隔离测试等技术规避这些问题。

### 常见应用场景

- 精确测量方法性能
- 对比不同实现（如 Jackson vs Gson 序列化性能）
- 验证性能优化效果
- 研究 JVM 特性

### JMH vs JMeter

| | JMH | JMeter |
|--|-----|--------|
| **粒度** | 方法级别、白盒 | 接口/服务级别、黑盒 |
| **场景** | 代码执行效率 | 模拟多用户并发 |
| **精度** | 纳秒级 | 业务级 |

### 示例：测试 CompletableFuture

```java
@BenchmarkMode({Mode.Throughput})
@Fork(1)
@Threads(8)
@Warmup(iterations = 2, time = 10)
@Measurement(iterations = 6, time = 10)
@OutputTimeUnit(TimeUnit.MINUTES)
@State(Scope.Benchmark)
public class DefaultFutureBenchmark {

    private ExecutorService pool = Executors.newFixedThreadPool(4);

    @Benchmark
    public void testCompletableFutureGet() {
        // ... 测试逻辑
    }
}
```

**结果参考：**

| Benchmark | 吞吐量（ops/min） | 说明 |
|-----------|-----------------|------|
| `testCompletableFutureGet` | 93994 ± 4342 | 性能显著最优，稳定 |
| `testCompletableFutureGetTimeout` | 47404 ± 11263 | 约为无超时的一半，误差极大 |
| `testConsumerFuture` | 50488 ± 3728 | 与带超时版接近，稳定性更好 |

---

## JVM 参数推荐

### GC 算法选择

| JDK 版本 \ 堆大小 | < 64G | ≥ 64G |
|-----------------|-------|-------|
| 1.8 | G1 | G1 |
| 11 | G1 | G1 |
| 17 | G1 | ZGC |

### 内存参数计算

**变量参数：**

| 参数 | 说明 | 计算方式 |
|------|------|---------|
| `heapSize` | 堆大小 | TotalMem < 4G: 0.5 \* TotalMem; < 6G: 0.6 \* TotalMem; ≥ 6G: 0.75 \* TotalMem |
| `stackSize` | 线程栈大小 | TotalMem ≤ 2G: 256K; 否则 512K |
| `metaspaceSize` | Metaspace 大小 | TotalMem ≤ 2G: 100M; 否则 320M |

**常见规格（G1）：**

| 规格 | Xmx | 栈大小 |
|------|-----|--------|
| 1C2G | 1G | 256K |
| 1C4G | 2400M | 512K |
| 1C8G | 6G | 512K |

### GC 参数计算

| 参数 | 计算方式 |
|------|---------|
| `parallelGCThreads` | cpuCores ≤ 8 ? cpuCores : max(8, cpuCores \* 5 / 8) |
| `concGCThreads` | parallelGCThreads / 4 |
| `ihop` | heapSizeInGB ≤ 12 ? 50 : 40 |

### 完整示例

**G1 参数格式：**

```bash
-Xmx{heapSize} -Xms{heapSize} -Xss{stackSize} \
-XX:MaxMetaspaceSize=320M -XX:MetaspaceSize={metaspaceSize} \
-XX:+UseG1GC -XX:ParallelGCThreads={n} -XX:ConcGCThreads={n} \
-XX:MaxGCPauseMillis=100 -XX:-OmitStackTraceInFastThrow \
-XX:+ParallelRefProcEnabled -XX:InitiatingHeapOccupancyPercent={ihop}
```

**GC Log 格式（JDK ≤ 1.8）：**

```bash
-XX:+PrintGCCause -XX:+PrintGCDetails -XX:+PrintGCApplicationStoppedTime \
-XX:+PrintAdaptiveSizePolicy -XX:+PrintTenuringDistribution \
-XX:+PrintReferenceGC -XX:+PrintHeapAtGC -XX:+PrintGCDateStamps \
-XX:+PrintGCTimeStamps -Xloggc:gc.log -XX:+UseGCLogFileRotation \
-XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=2M
```

---

## 参考资料

- [G1 GC 官方文档](https://www.oracle.com/technical-resources/articles/java/g1gc.html)
- [Java VM Options](https://www.oracle.com/java/technologies/javase/vmoptions-jsp.html)
- [JDK 8 Tools](https://docs.oracle.com/javase/8/docs/technotes/tools/unix/java.html)
- [Netflix JVM GC Causes](https://netflix.github.io/spectator/en/latest/ext/jvm-gc-causes/)
- [IHOP 详解](https://heapdump.cn/article/2712390)
