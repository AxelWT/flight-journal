# Python asyncio 事件循环完全指南

> **适用版本**: Python 3.10+（部分特性需 3.11+）
> **最后更新**: 2026-05-11

---

## 一、事件循环是什么？

事件循环（Event Loop）是 asyncio 的核心引擎，负责：

1. **调度协程**：将协程包装为 Task 并安排执行
2. **驱动 I/O**：监听网络/文件 I/O 的就绪状态，在就绪时恢复等待的协程
3. **执行回调**：在合适的时机调用通过 `call_soon`、`call_later` 等注册的回调函数
4. **管理定时器**：处理 `asyncio.sleep()` 等定时任务

**核心思维模型**：事件循环就是一个 `while True` 循环，不断检查"谁准备好了"——就绪的协程恢复执行、就绪的 I/O 触发回调、到期的定时器被触发。

```python
# 事件循环的简化模型
while True:
    ready_tasks = check_who_is_ready()   # 检查哪些协程/IO/定时器就绪
    for task in ready_tasks:
        task.run_until_yield()            # 运行到下一个 await
```

---

## 二、获取事件循环

### 2.1 推荐方式：`asyncio.run()`

```python
import asyncio

async def main():
    print("Hello, asyncio!")

asyncio.run(main())  # 创建事件循环 → 运行协程 → 关闭循环
```

**要点**：

- `asyncio.run()` 是 Python 3.7+ 的标准入口，会自动创建、运行、关闭事件循环
- 每次调用都创建一个**全新**的事件循环，不要重复调用
- 只能在**没有运行中事件循环**时调用（不能在协程内部再调用）

### 2.2 底层 API：手动管理循环

```python
loop = asyncio.new_event_loop()   # 创建新循环
asyncio.set_event_loop(loop)      # 设为当前线程的默认循环
loop.run_until_complete(main())   # 运行直到协程完成
loop.close()                      # 关闭循环
```

**何时需要手动管理**：

- 需要在循环运行前设置策略（如 Windows 上的 `ProactorEventLoop`）
- 嵌入到已有事件循环框架中（如 Jupyter、某些 GUI 框架）
- 需要精细化控制循环生命周期

### 2.3 获取已存在的循环

```python
# 获取当前线程的事件循环（无则创建）
loop = asyncio.get_event_loop()

# 安全获取（Python 3.10+，推荐）
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    # 没有运行中的循环
    loop = asyncio.new_event_loop()
```

> **注意**：`get_event_loop()` 在 Python 3.12+ 的行为发生了变化——当没有当前事件循环时不再自动创建，而是抛出 `RuntimeError`。推荐使用 `get_running_loop()` 或 `new_event_loop()`。

---

## 三、Task 与 Future

### 3.1 Task：协程的执行包装

Task 是对协程的包装，让协程可以被事件循环调度执行。

```python
async def fetch(url):
    await asyncio.sleep(1)
    return f"Data from {url}"

async def main():
    # 方式一：自动调度（推荐）
    task = asyncio.create_task(fetch("https://example.com"))

    # 方式二：底层 API
    loop = asyncio.get_running_loop()
    task = loop.create_task(fetch("https://example.com"))

    result = await task
    print(result)
```

**`create_task` vs `ensure_future`**：

| 特性 | `create_task` | `ensure_future` |
|------|--------------|-----------------|
| 推荐度 | **推荐**（Python 3.7+） | 旧版 API |
| 输入类型 | 仅接受协程 | 接受协程、Future、Task |
| 返回类型 | 始终返回 Task | 可能返回原 Future |
| 调试信息 | 更好的异常追踪 | 较弱 |

### 3.2 TaskGroup：结构化并发（Python 3.11+）

```python
async def main():
    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch("https://api1.com"))
        task2 = tg.create_task(fetch("https://api2.com"))
        task3 = tg.create_task(fetch("https://api3.com"))

    # 退出 with 块时，所有任务已完成
    # 任何一个任务异常 → ExceptionGroup 包含所有异常
    print(task1.result(), task2.result(), task3.result())
```

**TaskGroup 的优势**：

- **结构化并发**：所有子任务的生命周期限定在 `with` 块内
- **异常安全**：一个任务异常不会让其他任务静默失败，所有异常收集到 `ExceptionGroup`
- **不会遗漏任务**：必须等待所有任务完成才能退出 `with` 块

### 3.3 Future：结果的占位符

Future 是一个表示"未来某个时刻会产生的结果"的对象。Task 是 Future 的子类。

```python
async def main():
    loop = asyncio.get_running_loop()
    future = loop.create_future()

    # 模拟：1秒后设置结果
    loop.call_later(1.0, future.set_result, "Done!")

    result = await future  # 阻塞直到结果就绪
    print(result)  # "Done!"
```

**Future vs Task**：

- **Future**：底层原语，需要手动 `set_result()` 设置结果
- **Task**：高级抽象，自动驱动协程执行并设置结果

大多数情况下你只需使用 Task，直接操作 Future 的场景很少（如与回调式 API 桥接）。

---

## 四、事件循环的调度方法

### 4.1 回调调度

```python
loop = asyncio.get_running_loop()

# 立即调度（下一个事件循环迭代执行）
loop.call_soon(callback, arg1, arg2)

# 延迟调度（5秒后执行）
loop.call_later(5.0, callback, arg1, arg2)

# 在指定时间点执行
import time
loop.call_at(loop.time() + 5.0, callback, arg1, arg2)
```

### 4.2 线程安全调度

从其他线程向事件循环提交回调：

```python
import threading

def worker(loop):
    # 在子线程中安全地向事件循环提交回调
    asyncio.call_soon_threadsafe(callback, arg1, loop=loop)

async def main():
    loop = asyncio.get_running_loop()
    thread = threading.Thread(target=worker, args=(loop,))
    thread.start()
    await asyncio.sleep(2)
    thread.join()
```

**典型场景**：子线程完成 I/O 操作后，需要通过事件循环通知协程。

### 4.3 执行阻塞代码

事件循环中绝对不能运行阻塞调用（如 `requests.get()`、`time.sleep()`、`subprocess.run()`），否则会卡住整个循环。

```python
async def main():
    loop = asyncio.get_running_loop()

    # 在线程池中执行阻塞函数
    result = await loop.run_in_executor(None, blocking_function, arg1)

    # 使用自定义线程池
    from concurrent.futures import ThreadPoolExecutor
    executor = ThreadPoolExecutor(max_workers=4)
    result = await loop.run_in_executor(executor, blocking_function, arg1)

    # CPU 密集型任务应使用进程池
    from concurrent.futures import ProcessPoolExecutor
    executor = ProcessPoolExecutor()
    result = await loop.run_in_executor(executor, cpu_intensive_function, arg1)
```

**选择线程池还是进程池**：

| 类型 | 适用场景 | 原因 |
|------|---------|------|
| ThreadPoolExecutor | I/O 密集型阻塞调用 | GIL 不会成为瓶颈，线程切换开销小 |
| ProcessPoolExecutor | CPU 密集型计算 | 绕过 GIL，利用多核并行 |

---

## 五、asyncio 同步原语

asyncio 提供了与 `threading` 模块对应的同步原语，但它们的实现机制不同——threading 依赖操作系统锁，asyncio 依赖事件循环的协作式调度。

```python
# Lock - 防止多个协程同时访问共享资源
lock = asyncio.Lock()
async with lock:
    await safe_operation()

# Event - 协程间通知
event = asyncio.Event()
# 等待方
await event.wait()
# 通知方
event.set()

# Condition - 更复杂的等待/通知模式
cond = asyncio.Condition()
async with cond:
    await cond.wait_for(lambda: resource_ready())
    await use_resource()

# Semaphore - 限制并发数
sem = asyncio.Semaphore(10)
async with sem:
    await limited_operation()  # 最多10个协程同时执行

# Queue - 协程间安全传递数据
queue = asyncio.Queue(maxsize=100)
await queue.put(item)
item = await queue.get()
```

---

## 六、常见模式与最佳实践

### 6.1 并发执行多个协程

```python
# 方式一：gather（经典方式）
results = await asyncio.gather(
    fetch("https://api1.com"),
    fetch("https://api2.com"),
    fetch("https://api3.com"),
    return_exceptions=True  # 异常作为结果返回，而非抛出
)

# 方式二：TaskGroup（Python 3.11+，推荐）
async with asyncio.TaskGroup() as tg:
    t1 = tg.create_task(fetch("https://api1.com"))
    t2 = tg.create_task(fetch("https://api2.com"))
    t3 = tg.create_task(fetch("https://api3.com"))
results = [t1.result(), t2.result(), t3.result()]
```

### 6.2 超时控制

```python
# Python 3.11+ 推荐：asyncio.timeout
async with asyncio.timeout(5.0):
    result = await slow_operation()
# 超时抛出 TimeoutError

# 旧版兼容：wait_for
try:
    result = await asyncio.wait_for(slow_operation(), timeout=5.0)
except asyncio.TimeoutError:
    print("Operation timed out")

# 屏蔽取消（防止超时取消后的清理操作被中断）
async def robust_operation():
    try:
        await asyncio.wait_for(slow_operation(), timeout=5.0)
    except asyncio.TimeoutError:
        with asyncio.shield(cleanup_coro()):  # cleanup 不会被取消
            pass
```

### 6.3 取消任务

```python
async def main():
    task = asyncio.create_task(long_running())

    await asyncio.sleep(3)
    task.cancel()  # 请求取消

    try:
        await task
    except asyncio.CancelledError:
        print("Task was cancelled")
```

**协程如何响应取消**：

```python
async def long_running():
    try:
        while True:
            await do_work()
    except asyncio.CancelledError:
        # 执行清理
        await cleanup()
        raise  # 重新抛出，让调用者知道任务被取消
```

> **重要**：捕获 `CancelledError` 后务必重新 `raise`，否则任务不会被标记为已取消，`TaskGroup` 等结构化并发机制可能无法正确工作。

### 6.4 生产者-消费者模式

```python
async def producer(queue: asyncio.Queue):
    for i in range(10):
        await asyncio.sleep(0.1)
        await queue.put(f"item-{i}")
    await queue.put(None)  # 哨兵值，通知消费者结束

async def consumer(queue: asyncio.Queue):
    while True:
        item = await queue.get()
        if item is None:
            queue.task_done()
            break
        await process(item)
        queue.task_done()

async def main():
    queue = asyncio.Queue(maxsize=5)
    await asyncio.gather(producer(queue), consumer(queue))
```

### 6.5 速率限制

```python
async def rate_limited(tasks, rate=10):
    """限制每秒提交的任务数"""
    semaphore = asyncio.Semaphore(rate)
    interval = 1.0 / rate

    async def limited(task):
        async with semaphore:
            await asyncio.sleep(interval)
            return await task

    return await asyncio.gather(*[limited(t) for t in tasks])
```

---

## 七、事件循环策略

事件循环策略（Event Loop Policy）决定事件循环的创建方式和选择哪种循环实现。

```python
import asyncio

# Windows：使用 ProactorEventLoop（支持子进程、高性能 I/O）
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# macOS：使用 kqueue 选择器（默认 uvloop 不可用时的回退）
# Linux：默认使用 epoll 选择器
```

**uvloop 加速**（仅限 Linux/macOS）：

```python
# pip install uvloop
import uvloop
uvloop.install()  # 在 asyncio.run() 之前调用

# uvloop 用 Cython 实现了事件循环，性能比内置循环提升 2-4 倍
```

---

## 八、调试技巧

### 8.1 启用调试模式

```python
# 方式一：通过 asyncio.run
asyncio.run(main(), debug=True)

# 方式二：环境变量
# PYTHONASYNCIODEBUG=1 python app.py

# 方式三：手动设置
loop = asyncio.get_event_loop()
loop.set_debug(True)
```

**调试模式会启用**：

- 未 await 协程的警告（会打印 "coroutine was never awaited"）
- 记录耗时超过 100ms 的回调（帮助发现阻塞操作）
- 更详细的异常堆栈（Task 的 `repr()` 包含创建位置）

### 8.2 常见错误排查

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `RuntimeError: no running event loop` | 在协程外调用 `create_task` | 确保 `create_task` 在 `async` 函数内 |
| `RuntimeError: coroutine was never awaited` | 创建了协程但未 await | 使用 `await` 或 `create_task` |
| `RuntimeWarning: coroutine was never awaited` | 遗漏了 `await` | 检查函数是否是 `async def` |
| 事件循环卡死 | 在协程中执行了阻塞调用 | 使用 `run_in_executor` |
| `TimeoutError` | 操作超时 | 增加超时时间或优化操作 |

### 8.3 实用调试代码

```python
import asyncio

async def debug_tasks():
    """打印当前所有任务"""
    tasks = asyncio.all_tasks()
    for task in tasks:
        print(f"  {task.get_name()}: {task.get_coro()} "
              f"done={task.done()} cancelled={task.cancelled()}")

# 给 Task 命名，方便调试（Python 3.11+）
task = asyncio.create_task(fetch(url), name="fetch-api-1")
```

---

## 九、完整示例：异步 HTTP 客户端

```python
import asyncio
import aiohttp  # pip install aiohttp
from typing import Optional

class AsyncHTTPClient:
    def __init__(self, max_concurrent: int = 10, timeout: float = 30.0):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    async def get(self, url: str) -> str:
        async with self.semaphore:
            async with self.session.get(url) as resp:
                resp.raise_for_status()
                return await resp.text()

    async def fetch_all(self, urls: list[str]) -> list[str]:
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(self.get(url)) for url in urls]
        return [t.result() for t in tasks]

async def main():
    urls = [
        "https://httpbin.org/get",
        "https://httpbin.org/ip",
        "https://httpbin.org/headers",
    ]

    async with AsyncHTTPClient(max_concurrent=5) as client:
        results = await client.fetch_all(urls)
        for url, result in zip(urls, results):
            print(f"{url}: {len(result)} bytes")

asyncio.run(main())
```

---

## 十、速查表

| 操作 | 代码 |
|------|------|
| 运行协程 | `asyncio.run(main())` |
| 创建任务 | `asyncio.create_task(coro)` |
| 并发等待 | `await asyncio.gather(*tasks)` |
| 超时控制 | `async with asyncio.timeout(5.0):` |
| 取消任务 | `task.cancel()` |
| 睡眠 | `await asyncio.sleep(1.0)` |
| 执行阻塞调用 | `await loop.run_in_executor(None, func)` |
| 信号量限流 | `asyncio.Semaphore(n)` |
| 当前所有任务 | `asyncio.all_tasks()` |
| 当前事件循环 | `asyncio.get_running_loop()` |

---

*适用版本: Python 3.10+ | 重点更新: Python 3.11+ TaskGroup/timeout | 最后更新: 2026-05-11*
