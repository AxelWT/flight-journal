# Python 经典编程技巧

> **最后更新**: 2026-05-11

---

## 一、上下文管理器

### 1.1 类实现

```python
class DatabaseConnection:
    def __init__(self, url):
        self.url = url
        self.conn = None

    def __enter__(self):
        self.conn = connect(self.url)
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()
        return False  # 不吞异常

with DatabaseConnection("postgresql://localhost/db") as conn:
    conn.execute("SELECT 1")
```

**`__exit__` 返回值的含义**：

| 返回值 | 行为 |
|--------|------|
| `False`（默认） | 异常正常传播 |
| `True` | 吞掉异常，`with` 外部看不到异常 |

### 1.2 contextlib 实现

```python
from contextlib import contextmanager

@contextmanager
def db_connection(url):
    conn = connect(url)
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()

with db_connection("postgresql://localhost/db") as conn:
    conn.execute("SELECT 1")
```

### 1.3 实用上下文管理器

```python
import time
from contextlib import contextmanager

@contextmanager
def timer(label=""):
    """计时器"""
    start = time.perf_counter()
    yield
    elapsed = time.perf_counter() - start
    print(f"[{label}] elapsed: {elapsed:.3f}s")

@contextmanager
def temp_directory():
    """临时目录，退出时自动清理"""
    import tempfile, shutil
    dirpath = tempfile.mkdtemp()
    try:
        yield dirpath
    finally:
        shutil.rmtree(dirpath, ignore_errors=True)

@contextmanager
def change_dir(path):
    """临时切换工作目录"""
    import os
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)
```

---

## 二、描述符

描述符是实现 `__get__`、`__set__`、`__delete__` 方法的类，用于控制属性访问。

### 2.1 基本原理

```python
class Descriptor:
    def __set_name__(self, owner, name):
        self.name = f"_{name}"

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return getattr(obj, self.name, None)

    def __set__(self, obj, value):
        setattr(obj, self.name, value)

class MyClass:
    attr = Descriptor()  # 使用描述符
```

### 2.2 实用描述符：类型校验

```python
class TypedField:
    def __init__(self, expected_type, default=None):
        self.expected_type = expected_type
        self.default = default

    def __set_name__(self, owner, name):
        self.name = f"_{name}"

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        return getattr(obj, self.name, self.default)

    def __set__(self, obj, value):
        if not isinstance(value, self.expected_type):
            raise TypeError(
                f"{self.name[1:]} expected {self.expected_type.__name__}, "
                f"got {type(value).__name__}"
            )
        setattr(obj, self.name, value)

class Person:
    name = TypedField(str)
    age = TypedField(int, default=0)

p = Person()
p.name = "Alice"   # OK
p.name = 123       # TypeError: name expected str, got int
```

### 2.3 实用描述符：懒加载

```python
class LazyProperty:
    """属性只计算一次，之后缓存结果"""
    def __init__(self, func):
        self.func = func
        self.name = func.__name__

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        value = self.func(obj)
        setattr(obj, self.name, value)  # 替换为实例属性，下次直接访问
        return value

class DataLoader:
    @LazyProperty
    def data(self):
        print("Loading data...")
        return expensive_computation()

loader = DataLoader()
print(loader.data)  # Loading data... (第一次计算)
print(loader.data)  # 直接返回缓存，不再计算
```

> **注意**：`LazyProperty` 本质上是 `functools.cached_property` 的简化版。生产环境建议直接用 `@functools.cached_property`（Python 3.8+）。

---

## 三、元类

元类是"类的类"，控制类的创建过程。

### 3.1 基本用法

```python
class SingletonMeta(type):
    """单例元类"""
    _instances = {}

    def __call__(cls, *args, **kwargs):
        if cls not in cls._instances:
            cls._instances[cls] = super().__call__(*args, **kwargs)
        return cls._instances[cls]

class Database(metaclass=SingletonMeta):
    def __init__(self):
        print("Creating database connection")

db1 = Database()  # Creating database connection
db2 = Database()  # 不再创建，返回同一实例
assert db1 is db2
```

### 3.2 自动注册模式

```python
class PluginRegistry(type):
    """插件自动注册元类"""
    registry: dict[str, type] = {}

    def __new__(mcs, name, bases, namespace):
        cls = super().__new__(mcs, name, bases, namespace)
        if name != "BasePlugin":  # 跳过基类
            mcs.registry[name] = cls
        return cls

class BasePlugin(metaclass=PluginRegistry):
    """所有插件的基类"""
    def process(self, data):
        raise NotImplementedError

class ImagePlugin(BasePlugin):
    def process(self, data):
        return f"Processing image: {data}"

class VideoPlugin(BasePlugin):
    def process(self, data):
        return f"Processing video: {data}"

print(PluginRegistry.registry)  # {'ImagePlugin': <class ...>, 'VideoPlugin': <class ...>}
```

### 3.3 何时使用元类

"如果你不确定是否需要元类，那你不需要。"

| 场景 | 推荐方案 |
|------|---------|
| 简单单例 | 模块级变量或装饰器 |
| 类属性校验 | `__init_subclass__` |
| 自动注册 | 装饰器 + 字典 |
| 复杂的类创建控制 | 元类 |

---

## 四、`__init_subclass__` 钩子

Python 3.6+ 提供了更简洁的方式来定制子类创建，大多数场景可以替代元类。

```python
class ValidatedModel:
    """自动校验子类的字段定义"""
    def __init_subclass__(cls, validate=True, **kwargs):
        super().__init_subclass__(**kwargs)
        if validate:
            cls._validate_fields()

    @classmethod
    def _validate_fields(cls):
        for name, value in cls.__annotations__.items():
            if not name.startswith("_"):
                assert hasattr(cls, name), f"{cls.__name__} missing field: {name}"

# 不满足校验时抛出 AssertionError
class User(ValidatedModel):
    name: str
    age: int  # 如果没有给 age 赋默认值且没有类属性，会校验失败
```

**与元类对比**：

| 特性 | `__init_subclass__` | 元类 |
|------|---------------------|------|
| 学习曲线 | 低 | 高 |
| 功能范围 | 定制子类创建 | 完全控制类创建 |
| 多继承兼容性 | 好（协作式调用 `super()`） | 复杂（元类冲突） |
| 推荐度 | 优先使用 | 复杂场景再用 |

---

## 五、魔术方法速查

### 5.1 对象创建与销毁

| 方法 | 触发时机 |
|------|---------|
| `__new__(cls, ...)` | 创建实例（在 `__init__` 之前） |
| `__init__(self, ...)` | 初始化实例 |
| `__del__(self)` | 实例被垃圾回收前 |

### 5.2 表示与格式化

| 方法 | 触发时机 | 示例 |
|------|---------|------|
| `__repr__(self)` | `repr()` / 调试 | `User(name='Alice')` |
| `__str__(self)` | `str()` / `print()` | `Alice` |
| `__format__(self, spec)` | f-string / `format()` | `f"{user:>20}"` |
| `__bytes__(self)` | `bytes()` | `b'...'` |

> **最佳实践**：始终实现 `__repr__`（调试必备），`__str__` 可选。如果只实现一个，实现 `__repr__`。

### 5.3 比较操作

```python
from functools import total_ordering

@total_ordering  # 只需定义 __eq__ 和 __lt__，自动生成其他比较方法
class Version:
    def __init__(self, major, minor, patch):
        self.major, self.minor, self.patch = major, minor, patch

    def __eq__(self, other):
        return (self.major, self.minor, self.patch) == (other.major, other.minor, other.patch)

    def __lt__(self, other):
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)
```

### 5.4 容器与迭代

| 方法 | 触发时机 |
|------|---------|
| `__len__(self)` | `len()` |
| `__getitem__(self, key)` | `obj[key]` |
| `__setitem__(self, key, value)` | `obj[key] = value` |
| `__delitem__(self, key)` | `del obj[key]` |
| `__contains__(self, item)` | `item in obj` |
| `__iter__(self)` | `for x in obj` |
| `__next__(self)` | 迭代器协议 |

### 5.5 可调用对象

```python
class Adder:
    def __init__(self, n):
        self.n = n

    def __call__(self, x):
        return self.n + x

add5 = Adder(5)
add5(10)  # 15
```

---

## 六、functools 实用工具

```python
from functools import lru_cache, wraps, partial, singledispatch

# 1. lru_cache - 缓存函数结果
@lru_cache(maxsize=128)
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# 2. wraps - 保留被装饰函数的元信息
def my_decorator(func):
    @wraps(func)  # 保留 __name__, __doc__ 等
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

# 3. partial - 偏函数，固定部分参数
def power(base, exp):
    return base ** exp

square = partial(power, exp=2)
cube = partial(power, exp=3)
square(4)  # 16
cube(3)    # 27

# 4. singledispatch - 单分派泛型函数
@singledispatch
def process(data):
    raise TypeError(f"Unsupported type: {type(data)}")

@process.register(str)
def _(data):
    return data.upper()

@process.register(list)
def _(data):
    return [process(item) for item in data]

process("hello")       # "HELLO"
process(["a", "b"])    # ["A", "B"]
```

---

## 七、dataclass 与 attrs

### 7.1 dataclass（标准库）

```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: float
    y: float
    label: str = ""

    def distance_to(self, other: "Point") -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5

@dataclass(frozen=True)  # 不可变（可作为 dict key 或 set 元素）
class Color:
    r: int
    g: int
    b: int

@dataclass
class Config:
    name: str
    tags: list[str] = field(default_factory=list)  # 可变默认值必须用 field
```

**常见陷阱**：可变默认值需要 `field(default_factory=...)`，使用 `[]` 或 `{}` 会导致所有实例共享同一对象。

### 7.2 dataclass vs 普通类 vs NamedTuple

| 特性 | dataclass | 普通类 | NamedTuple |
|------|-----------|--------|------------|
| 自动生成 `__init__` | ✅ | ❌ | ✅ |
| 自动生成 `__repr__` | ✅ | ❌ | ✅ |
| 可变性 | 默认可变 | 可变 | 不可变 |
| 继承 | 支持 | 支持 | 不支持 |
| 添加方法 | 支持 | 支持 | 支持 |
| 性能 | 中等 | 最快 | 最快（元组底层） |
| 类型检查 | 声明式 | 手动 | 声明式 |

---

*最后更新: 2026-05-11*
