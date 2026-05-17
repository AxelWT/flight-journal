---
title: "psutil：Python 系统监控指南"
date: 2026-05-11
description: psutil 库实现 CPU、内存、磁盘、网络与进程监控的完整用法
tags:
  - Python
  - 系统监控
  - psutil
---

# psutil：Python 系统监控指南

> **安装**: `pip install psutil`
> **最后更新**: 2026-05-11

---

## 一、psutil 简介

psutil（Python System and Process Utilities）是一个跨平台库，用于获取系统信息和进程管理。支持 Linux、Windows、macOS、 FreeBSD。

**核心能力**：

- CPU 使用率和统计
- 内存和交换分区使用情况
- 磁盘 I/O 和分区信息
- 网络连接和流量统计
- 进程管理（查找、监控、终止）
- 系统启动时间、用户信息

---

## 二、CPU 监控

```python
import psutil

# CPU 使用率（百分比，阻塞调用需间隔）
psutil.cpu_percent(interval=1)        # 1秒采样，返回总体使用率
psutil.cpu_percent(interval=0, percpu=True)  # 每个核心的使用率列表

# CPU 逻辑核心数
psutil.cpu_count()          # 逻辑核心数（含超线程）
psutil.cpu_count(logical=False)  # 物理核心数

# CPU 时间统计（自启动以来的累计时间，单位秒）
psutil.cpu_times()
# scputimes(user=1234.5, nice=0.0, system=567.8, idle=89012.3, ...)

# CPU 频率
psutil.cpu_freq()
# scpufreq(current=2400.0, min=800.0, max=3500.0)

# CPU 统计信息
psutil.cpu_stats()
# scpustats(ctx_switches=123456, interrupts=78901, soft_interrupts=12345, syscalls=0)
```

### 实时 CPU 监控示例

```python
import psutil
import time

def monitor_cpu(interval=1, duration=60):
    """监控 CPU 使用率，输出每个核心的使用情况"""
    end_time = time.time() + duration
    while time.time() < end_time:
        per_cpu = psutil.cpu_percent(interval=interval, percpu=True)
        avg = sum(per_cpu) / len(per_cpu)
        bars = " | ".join(f"Core{i}: {v:5.1f}%" for i, v in enumerate(per_cpu))
        print(f"[{time.strftime('%H:%M:%S')}] Avg: {avg:5.1f}% | {bars}")
```

---

## 三、内存监控

```python
# 物理内存
mem = psutil.virtual_memory()
# svmem(total=17179869184, available=8589934592, percent=50.0,
#        used=8589934592, free=0, active=... , inactive=..., buffers=..., cached=...)

print(f"总内存: {mem.total / (1024**3):.1f} GB")
print(f"可用:   {mem.available / (1024**3):.1f} GB")
print(f"使用率: {mem.percent}%")

# 交换分区
swap = psutil.swap_memory()
print(f"交换总: {swap.total / (1024**3):.1f} GB")
print(f"交换用: {swap.used / (1024**3):.1f} GB")
print(f"交换率: {swap.percent}%")
```

**各平台内存字段差异**：

| 字段 | Linux | macOS | Windows |
|------|-------|-------|---------|
| `total` | ✅ | ✅ | ✅ |
| `available` | ✅ | ✅ | ✅ |
| `used` | ✅ | ✅ | ✅ |
| `free` | ✅ | ✅ | ✅ |
| `buffers` | ✅ | ❌ | ❌ |
| `cached` | ✅ | ✅ | ❌ |

> **注意**：`used` 和 `available` 的定义在不同平台上不同。Linux 上 `used = total - available`（更准确）；某些平台 `used = total - free`。判断内存压力应优先看 `available` 和 `percent`。

---

## 四、磁盘监控

```python
# 磁盘分区列表
psutil.disk_partitions()
# [sdiskpart(device='/dev/sda1', mountpoint='/', fstype='ext4', opts='rw'),
#  sdiskpart(device='/dev/sda2', mountpoint='/home', fstype='ext4', opts='rw')]

# 磁盘使用率
usage = psutil.disk_usage('/')
print(f"总: {usage.total / (1024**3):.1f} GB, 使用: {usage.percent}%")

# 磁盘 I/O 统计（自启动以来的累计）
io = psutil.disk_io_counters()
# sdiskio(read_count=12345, write_count=67890, read_bytes=..., write_bytes=..., ...)

# 每个磁盘的 I/O
per_disk = psutil.disk_io_counters(perdisk=True)
for name, stat in per_disk.items():
    print(f"{name}: read={stat.read_bytes/1024**2:.1f}MB, write={stat.write_bytes/1024**2:.1f}MB")
```

---

## 五、网络监控

```python
# 网络接口信息
psutil.net_if_addrs()
# {'eth0': [snicaddr(family=<AddressFamily.AF_INET>, address='192.168.1.100', ...)], ...}

# 网络 I/O 统计
net = psutil.net_io_counters()
print(f"发送: {net.bytes_sent / 1024**2:.1f} MB")
print(f"接收: {net.bytes_recv / 1024**2:.1f} MB")

# 每个网卡的 I/O
per_nic = psutil.net_io_counters(pernic=True)

# 当前网络连接
connections = psutil.net_connections(kind='inet')
for conn in connections:
    print(f"{conn.laddr}:{conn.laddr.port} -> {conn.raddr} ({conn.status})")

# kind 参数过滤：
# 'inet'   - IPv4 + IPv6
# 'inet4'  - 仅 IPv4
# 'tcp'    - 仅 TCP
# 'udp'    - 仅 UDP
# 'all'    - 所有
```

---

## 六、进程管理

### 6.1 查找进程

```python
# 当前进程
p = psutil.Process()
print(p.pid, p.name(), p.exe(), p.cwd())

# 按 PID 获取
p = psutil.Process(1234)

# 遍历所有进程
for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
    try:
        info = proc.info
        if info['cpu_percent'] and info['cpu_percent'] > 10:
            print(f"PID={info['pid']} Name={info['name']} CPU={info['cpu_percent']:.1f}%")
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

# 查找特定进程
def find_process(name: str) -> list[psutil.Process]:
    """按名称查找进程"""
    result = []
    for proc in psutil.process_iter(['name']):
        if proc.info['name'] == name:
            result.append(proc)
    return result
```

### 6.2 进程详细信息

```python
p = psutil.Process(1234)

# 基本信息
p.pid              # PID
p.ppid()           # 父进程 PID
p.name()           # 进程名
p.exe()            # 可执行文件路径
p.cmdline()        # 命令行参数列表
p.cwd()            # 工作目录
p.status()         # 状态 (running, sleeping, ...)

# 资源使用
p.cpu_percent(interval=0.1)   # CPU 使用率
p.memory_percent()             # 内存使用百分比
p.memory_info()                # 内存详情 (rss, vms, ...)
p.io_counters()                # I/O 统计

# 网络连接
p.connections()

# 打开的文件
p.open_files()

# 线程
p.num_threads()
p.threads()  # 每个线程的信息列表

# 子进程
p.children(recursive=True)  # 递归获取所有子进程
```

### 6.3 进程控制

```python
p = psutil.Process(1234)

# 发送信号
p.send_signal(signal.SIGTERM)

# 终止进程
p.terminate()   # SIGTERM
p.kill()        # SIGKILL（强制）

# 等待进程结束
p.wait(timeout=5)  # 返回退出码，超时抛出 TimeoutExpired

# 优雅终止模式
def graceful_kill(pid: int, timeout: int = 10):
    """先 SIGTERM，超时后 SIGKILL"""
    p = psutil.Process(pid)
    p.terminate()
    try:
        p.wait(timeout=timeout)
    except psutil.TimeoutExpired:
        p.kill()
        p.wait()
```

---

## 七、实用脚本

### 7.1 系统健康检查

```python
import psutil

def health_check():
    """一键系统健康检查"""
    # CPU
    cpu = psutil.cpu_percent(interval=1)
    status = "WARNING" if cpu > 80 else "OK"
    print(f"CPU:    {cpu:.1f}% [{status}]")

    # 内存
    mem = psutil.virtual_memory()
    status = "WARNING" if mem.percent > 85 else "OK"
    print(f"Memory: {mem.percent:.1f}% ({mem.available/1024**3:.1f}GB available) [{status}]")

    # 磁盘
    for part in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(part.mountpoint)
            status = "WARNING" if usage.percent > 90 else "OK"
            print(f"Disk {part.mountpoint}: {usage.percent:.1f}% [{status}]")
        except PermissionError:
            pass

    # 交换分区
    swap = psutil.swap_memory()
    status = "WARNING" if swap.percent > 50 else "OK"
    print(f"Swap:   {swap.percent:.1f}% [{status}]")

health_check()
```

### 7.2 高内存进程 Top 10

```python
import psutil

def top_memory(n=10):
    """按内存使用排序的 Top N 进程"""
    procs = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_percent']):
        try:
            procs.append(proc.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    procs.sort(key=lambda p: p['memory_percent'] or 0, reverse=True)
    print(f"{'PID':>7} {'MEM%':>6} {'Name'}")
    print("-" * 40)
    for p in procs[:n]:
        print(f"{p['pid']:>7} {p['memory_percent']:>5.1f}% {p['name']}")

top_memory()
```

---

## 八、注意事项

| 注意点 | 说明 |
|--------|------|
| 权限 | 获取其他进程信息可能需要 root/管理员权限，否则抛出 `AccessDenied` |
| 进程消失 | 进程可能在遍历时已终止，需要捕获 `NoSuchProcess` |
| 性能 | `process_iter()` 开销较大，不要在高频循环中调用 |
| 跨平台差异 | 部分字段只在特定平台可用（如 `buffers`/`cached` 仅 Linux） |
| 阻塞 | `cpu_percent(interval=1)` 会阻塞指定秒数 |

---

*最后更新: 2026-05-11*
