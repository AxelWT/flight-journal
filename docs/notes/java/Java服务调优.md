# Java 服务调优

## JVM 启动参数推荐值

### JAVA_MEM

```bash
-Xmx2400M -Xms2400M -Xss512K -XX:MaxMetaspaceSize=512M -XX:MetaspaceSize=320M
```

Xmx/Xms 堆内存最大和最小值保持一致（跟机器内存走），Xss 栈内存建议 512k，服务内存为 4G。

### JAVA_GC

```bash
-XX:+UseG1GC -XX:ParallelGCThreads=2 -XX:ConcGCThreads=1 -XX:MaxGCPauseMillis=100 -XX:-OmitStackTraceInFastThrow -XX:+ParallelRefProcEnabled -XX:InitiatingHeapOccupancyPercent=50 -XX:+PrintGCCause -XX:+PrintGCDetails -XX:+PrintGCApplicationStoppedTime -XX:+PrintAdaptiveSizePolicy -XX:+PrintTenuringDistribution -XX:+PrintReferenceGC -XX:+PrintHeapAtGC -XX:+PrintGCDateStamps -XX:+PrintGCTimeStamps -Xloggc:gc.log -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=2M -XX:-UseBiasedLocking
```

主要跟 G1 垃圾回收相关。

### JAVA_OPTION

```bash
-Djava.security.egd=file:/dev/./urandom -Dfile.encoding=UTF-8 -Dlog4j2.kafka.topic=default-app-log -Ddubbo.provider.group=my-group -Ddubbo.consumer.group=my-group
```

其他 JVM 参数。

## Java 服务常见内存指标相关问题排查

### RSS 使用率过高

**问题表现：**

服务出现 RSS 使用率过高告警（默认阈值 95%），仍持续增长至内存使用超过 Pod 配置限制会触发 K8S OOM Killer。

**排查思路：**

NMT 使用说明

### Java Heap OOM

**问题表现：**

服务频繁触发 Full GC，甚至出现报错：`java.lang.OutOfMemoryError: Java heap space`

**排查思路：**

尝试输出 Heap Histogram：

执行命令 `jmap -histo 1` 并分析输出结果，由于输出结果没有对象引用关系，需要对业务逻辑十分了解且问题较明显才能分析出问题。

**Heapdump 分析（管控平台 可用）：** heapdump 调试使用说明

注意事项：

- heapdump 前必须摘流，因为 dump 过程会导致 JVM STW，影响业务流量，摘流入口：实例调权
- 对于堆内存配置较大的服务，需要挂云盘才能执行 heapdump，否则会因 dump 文件写入磁盘超过限制被 Kill：
  - heapdump 调试使用说明#常见问题FAQ

### Java Metaspace OOM

**问题表现：**

服务频繁触发 Full GC，甚至出现报错：`java.lang.OutOfMemoryError: Metaspace`

**排查思路：**

- 可上调 `MaxMetaspace` 配置临时缓解问题（要关注下整体内存使用会不会超过 k8s 实例内存上限，防止 RSS 内存使用超过限制）。
- 服务添加 JVM 启动参数 `-verbose:class` 后重新发布，服务启动后 Class Load 信息会持续输出在标准输出中。
- 如果标准输出内容过多，需要调整标准输出日志级别至 ERROR 以上。
- 执行以下命令对输出的 Class Load 结果排序（其中 `verbose.log` 为包含 class load 信息的文本文件名，按需调整 awk 中输出包前缀数量）：

```bash
grep "\[Loaded" verbose.log \
  | sed -E 's/.*Loaded ([^ ]+) from.*/\1/' \
  | sed -E 's/[0-9]+//g' \
  | awk -F. '{
      if (NF > 3) {
        print $1"."$2"."$3
      } else {
        print $0
      }
    }' \
  | LC_ALL=C sort \
  | uniq -c \
  | LC_ALL=C sort -k1,1nr -k2,2
```

根据加载的 class 数量 package 排序结果分析可能存在的问题点，示例：

一般情况下：class 数量越多，占用 Metaspace 越大；class 文件越大，占用 Metaspace 越多。

如果出现无法判断 class 来源，可尝试通过 profiler 获取 jfr 并检索 class 调用情况。

获取 jfr 之后使用 IDEA 打开并检索调用情况。

## heapdump 调试使用说明

### heapdump 调试流程

#### 分析软件

- MAT (Memory Analyzer Tool)（推荐）
- VisualVm

#### 软件操作

1. 拷贝 dump 文件由 远程存储 到 local 文件夹。
2. 打开 MAT，由 local 文件夹加载 Heapdump 文件。

#### 分析视图

建议先掌握下 Shallow Heap、Retained Heap、outgoing reference、incoming reference 四个概念，然后几种常用技巧：

##### 支配树视图（推荐）

`Dominator Tree + Group by package + Retained Heap Desc`（对象视角，自上往下）

发现主要引用对象，或者比例异常的引用对象。

##### 直方图（Histogram）

类的视角，自下往上。

依旧是 Retained Heap Desc，用来发现内存占用最多的类。可以使用对比工具，和不同时间段 / 不同 实例组 / pod 的 dump 文件进行对比，发现异常 / 增长点。

##### OQL

#### 分析目标

内存泄漏 / 大对象 / 频繁 GC

- 首先可以参考「Leak Suspects」的分析结果。
- 可以考虑支配树视图，发现引用高的对象，特别是 Shallow Heap 很小，但是 Retained Heap 很大的对象；发现可疑对象后，继续自上向下（outgoing reference）分析引用关系：
  - 这里的占用可看到来自 LocalCache，类似的通过引用关系找到实际占用大的对象。
- 直方图，例如有无法 GC 的一些大对象引入，可能最终存储是一些大的 string / hashmap / object ... ，这时候直方图就可以很直观的发现占用不合理的类，并通过自下往上分析（incoming reference）发现具体类中的大的对象。

## 常见问题 FAQ

**OOM 时能否拿到 dump 文件？**

不能，k8s 默认要保证其他实例的安全，长期我们可能会对接更好的解决方案。Java 的内存使用分堆内和堆外，平台上对服务的内存限制限制的是堆内 + 堆外，对于进程内存超过限制的处理方式是 `kill -9` 直接强杀，会收到 OOMKilled 告警。这类情况即使配置了 dump java，也是 dump 不出来的。

**对于大内存服务（一般 >= 20G），需要哪些额外配置？**

是需要配置，联系平台技术支持，目前不多，后续会逐步优化：

dump & 上传过程：

需要修改探活失败次数 3 -> 50，发版生效，因为是服务粒度，所以修改时不要发布其他 实例组，避免影响其他 实例组。（创建完发布单即可改回）

**为什么 dump 分析出来的堆比监控上小很多？**

简言之因为这些部分已经被标记可回收了，只是没有回收这部分，对于内存问题分析不重要，可以参考这篇文章：MAT分析dump文件显示大小比jmap查询结果小
