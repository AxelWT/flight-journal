# Python 语法要点笔记

> **最后更新**: 2026-05-11

---

## 一、类型注解

### 1.1 基础类型注解

```python
# 变量注解
name: str = "Alice"
age: int = 30
scores: list[float] = [98.5, 87.0]
mapping: dict[str, int] = {"a": 1, "b": 2}

# 函数注解
def greet(name: str, times: int = 1) -> str:
    return (f"Hello, {name}! " * times).strip()
```

### 1.2 高级类型

```python
from typing import Optional, Union, Literal, Callable, TypeVar, Generic

# Optional[X] 等价于 X | None（Python 3.10+ 推荐用 X | None）
def find_user(user_id: int) -> Optional[str]:  # 等价于 str | None
    ...

# Union — 多种类型之一（Python 3.10+ 推荐用 X | Y | Z）
def process(value: Union[str, int]) -> str:  # 等价于 str | int
    ...

# Literal — 字面量类型
Mode = Literal["r", "w", "a", "r+"]
direction: Literal["left", "right"] = "left"

# Callable — 可调用类型
Handler = Callable[[str, int], bool]  # 接受 (str, int)，返回 bool

# 泛型
T = TypeVar("T")

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()
```

### 1.3 Python 3.10+ 新语法

```python
# 联合类型用 |
def process(value: str | int | None) -> str:
    match value:
        case str():
            return value
        case int():
            return str(value)
        case None:
            return "empty"

# TypeAlias（3.10+ 推荐）
from typing import TypeAlias
UserId: TypeAlias = int
UserMap: TypeAlias = dict[UserId, str]
```

---

## 二、解构与模式匹配

### 2.1 解构赋值

```python
# 元组解构
x, y, z = (1, 2, 3)

# 列表解构（带剩余）
first, *rest = [1, 2, 3, 4, 5]
# first=1, rest=[2, 3, 4, 5]

first, *middle, last = [1, 2, 3, 4, 5]
# first=1, middle=[2, 3, 4], last=5

# 忽略值
_, y, _ = (1, 2, 3)

# 嵌套解构
(a, b), c = ((1, 2), 3)
# a=1, b=2, c=3

# 字典解构
person = {"name": "Alice", "age": 30, "city": "Beijing"}
{name, age} = person.keys()  # 解构 key：name="name", age="age"
```

### 2.2 match-case 模式匹配（Python 3.10+）

```python
# 基本匹配
def handle_command(cmd):
    match cmd.split():
        case ["quit"]:
            return "Exiting"
        case ["goto", dest]:
            return f"Going to {dest}"
        case ["move", x, y]:
            return f"Moving to ({x}, {y})"
        case _:
            return "Unknown command"

# 类型匹配
def describe(value):
    match value:
        case int():
            return f"Integer: {value}"
        case str() if len(value) > 10:
            return f"Long string: {value[:10]}..."
        case str():
            return f"String: {value}"
        case [x, y]:
            return f"Pair: {x}, {y}"
        case _:
            return f"Unknown: {type(value)}"
```

---

## 三、迭代器与生成器

### 3.1 迭代器协议

```python
class Countdown:
    def __init__(self, start):
        self.current = start

    def __iter__(self):
        return self

    def __next__(self):
        if self.current <= 0:
            raise StopIteration
        self.current -= 1
        return self.current + 1

for i in Countdown(3):
    print(i)  # 3, 2, 1
```

### 3.2 生成器函数

```python
def fibonacci(limit):
    a, b = 0, 1
    while a < limit:
        yield a
        a, b = b, a + b

list(fibonacci(10))  # [0, 1, 1, 2, 3, 5, 8]
```

**yield 的作用**：

- 暂停函数执行，返回值给调用者
- 下次迭代时从暂停处继续执行
- 生成器是惰性求值的，节省内存

### 3.3 生成器表达式

```python
# 列表推导（立即计算，占内存）
squares_list = [x**2 for x in range(1000000)]

# 生成器表达式（惰性计算，省内存）
squares_gen = (x**2 for x in range(1000000))

# 生成器表达式可以直接传给聚合函数
total = sum(x**2 for x in range(100))
```

### 3.4 yield from 委托生成器

```python
def flatten(nested):
    """递归展平嵌套列表"""
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)  # 委托给子生成器
        else:
            yield item

list(flatten([1, [2, 3], [4, [5, 6]]]))  # [1, 2, 3, 4, 5, 6]
```

---

## 四、装饰器

### 4.1 函数装饰器

```python
import functools
import time

def timer(func):
    @functools.wraps(func)  # 保留原函数的 __name__, __doc__ 等
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.3f}s")
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)

# 等价于：slow_function = timer(slow_function)
```

### 4.2 带参数的装饰器

```python
def retry(max_attempts=3, delay=1.0):
    """重试装饰器"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(max_attempts=5, delay=2.0)
def unstable_api_call():
    ...
```

### 4.3 类装饰器

```python
def add_logging(cls):
    """给类的所有方法添加日志"""
    for name, method in cls.__dict__.items():
        if callable(method) and not name.startswith("_"):
            setattr(cls, name, log_calls(method))
    return cls

@add_logging
class MyService:
    def process(self, data):
        return data.upper()
```

### 4.4 常用内置装饰器

| 装饰器 | 用途 |
|--------|------|
| `@staticmethod` | 静态方法，不接收 self/cls |
| `@classmethod` | 类方法，接收 cls 而非 self |
| `@property` | 将方法变为属性访问 |
| `@functools.lru_cache` | 缓存函数结果 |
| `@functools.wraps` | 保留被装饰函数元信息 |
| `@dataclasses.dataclass` | 自动生成 `__init__`/`__repr__` 等 |

---

## 五、推导式

### 5.1 列表推导

```python
# 基本形式
squares = [x**2 for x in range(10)]

# 带条件过滤
even_squares = [x**2 for x in range(10) if x % 2 == 0]

# 嵌套推导（注意可读性）
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flattened = [x for row in matrix for x in row]  # [1, 2, 3, 4, 5, 6, 7, 8, 9]
```

### 5.2 字典推导

```python
# 键值互换
original = {"a": 1, "b": 2, "c": 3}
swapped = {v: k for k, v in original.items()}  # {1: 'a', 2: 'b', 3: 'c'}

# 从两个列表创建字典
keys = ["name", "age", "city"]
values = ["Alice", 30, "Beijing"]
person = {k: v for k, v in zip(keys, values)}
```

### 5.3 集合推导

```python
# 提取唯一单词长度
words = ["hello", "world", "hi", "python"]
lengths = {len(word) for word in words}  # {2, 5, 6}
```

### 5.4 推导式 vs 循环

**选择原则**：

- 推导式：简单的过滤/变换，一行能写完
- 循环：逻辑复杂、需要 try/except、需要多步处理

---

## 六、异常处理

### 6.1 异常层次结构

```
BaseException
├── SystemExit              # sys.exit()
├── KeyboardInterrupt       # Ctrl+C
├── GeneratorExit           # 生成器关闭
└── Exception               # 所有常规异常的基类
    ├── ArithmeticError
    │   └── ZeroDivisionError
    ├── LookupError
    │   ├── IndexError
    │   └── KeyError
    ├── TypeError
    ├── ValueError
    ├── AttributeError
    ├── OSError
    │   └── FileNotFoundError
    ├── RuntimeError
    └── ...
```

### 6.2 最佳实践

```python
# 1. 捕获具体异常，不要裸 except
try:
    result = int(value)
except ValueError:
    print(f"Invalid number: {value}")

# 2. 多个异常同时处理
except (ValueError, TypeError) as e:
    print(f"Bad input: {e}")

# 3. try 中只放可能出错的代码
# 好的写法
try:
    value = data[key]
except KeyError:
    value = default
process(value)  # 不在 try 中

# 4. else 和 finally
try:
    result = risky_operation()
except ValueError:
    result = fallback()
else:
    log_success()        # 只在没有异常时执行
finally:
    cleanup()            # 无论如何都执行
```

### 6.3 自定义异常

```python
class AppError(Exception):
    """应用基础异常"""
    pass

class ValidationError(AppError):
    """数据校验失败"""
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")

class NotFoundError(AppError):
    """资源未找到"""
    pass

# 使用层级：
# except AppError 可以捕获所有应用异常
# except ValidationError 只捕获校验异常
```

---

## 七、walrus 运算符（:=）

Python 3.8+ 引入的赋值表达式，在表达式中同时赋值。

```python
# 1. 在 while 循环中（最常见的场景）
while chunk := f.read(8192):
    process(chunk)

# 2. 在条件判断中避免重复计算
if (n := len(data)) > 10:
    print(f"Too long: {n} characters")

# 3. 在列表推导中过滤并使用计算结果
results = [
    cleaned
    for item in raw_data
    if (cleaned := clean(item)) is not None
]

# 4. 在正则匹配中
import re
if match := re.search(pattern, text):
    print(match.group(1))
```

---

## 八、其他实用语法

### 8.1 海象运算符外的 3.8+ 新特性

```python
# 仅位置参数（/ 左侧的参数只能位置传递）
def greet(name, /, greeting="Hello"):
    # name 只能位置传递，greeting 可以关键字传递
    return f"{greeting}, {name}!"

greet("Alice")                    # OK
greet("Alice", greeting="Hi")    # OK
greet(name="Alice")              # TypeError
```

### 8.2 f-string 调试（Python 3.8+）

```python
x = 42
print(f"{x = }")           # x = 42
print(f"{x = :08b}")       # x = 00101010
```

### 8.3 类型别名与 Protocol

```python
from typing import Protocol

# Protocol — 结构化子类型（鸭子类型的类型检查版）
class Closeable(Protocol):
    def close(self) -> None: ...

def with_resource(resource: Closeable):
    resource.close()  # 任何有 close() 方法的对象都满足

# 不需要显式继承 Closeable
class MyFile:
    def close(self) -> None:
        ...

with_resource(MyFile())  # OK，MyFile 满足 Closeable 协议
```

---

*最后更新: 2026-05-11*
