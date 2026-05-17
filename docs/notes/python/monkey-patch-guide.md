---
title: "Python 猴子补丁（Monkey Patch）指南"
date: 2026-05-11
description: 运行时动态修改模块、类或对象属性的方法、使用场景与风险注意事项
tags:
  - Python
  - 猴子补丁
  - 动态特性
---

# Python 猴子补丁（Monkey Patch）指南

> **最后更新**: 2026-05-11

---

## 一、什么是猴子补丁？

猴子补丁（Monkey Patch）是指在运行时动态修改模块、类或对象的属性和方法。Python 的动态特性使得这一操作非常容易，但也带来了风险。

**核心原理**：Python 中一切皆对象，函数和属性可以在运行时被替换。

```python
import some_module

# 替换模块中的函数
some_module.original_function = my_replacement

# 替换类的方法
SomeClass.original_method = my_method
```

---

## 二、常见使用场景

### 2.1 测试中替换依赖（最安全的场景）

```python
import json
from unittest.mock import patch

# 使用 unittest.mock（推荐，自动恢复）
def test_api_call():
    with patch('requests.get') as mock_get:
        mock_get.return_value.json.return_value = {"status": "ok"}

        result = call_api("https://example.com")
        assert result["status"] == "ok"
        mock_get.assert_called_once()
```

### 2.2 修复第三方库的 Bug

```python
# 第三方库有个 bug，等待官方修复太久
import third_party_lib

def _fixed_method(self, data):
    """修复了空值处理的版本"""
    if data is None:
        return self.default_value
    return self._original_process(data)

# 应用补丁
third_party_lib.SomeClass.buggy_method = _fixed_method
```

### 2.3 性能优化替换

```python
# 用 gevent 替换标准库的阻塞 I/O
import gevent.monkey
gevent.monkey.patch_all()  # 将 socket、threading 等替换为协程版本
```

### 2.4 添加调试信息

```python
import requests

_original_get = requests.get

def _debug_get(*args, **kwargs):
    print(f"[DEBUG] GET {args[0]}")
    response = _original_get(*args, **kwargs)
    print(f"[DEBUG] Response: {response.status_code}")
    return response

requests.get = _debug_get
```

---

## 三、替换技巧

### 3.1 替换模块级函数

```python
import math

# 保存原始函数（以便恢复或调用）
_original_sqrt = math.sqrt

# 替换
def custom_sqrt(x):
    print(f"Computing sqrt({x})")
    return _original_sqrt(x)

math.sqrt = custom_sqrt
```

### 3.2 替换实例方法

```python
class Dog:
    def speak(self):
        return "Woof!"

# 替换实例方法（需注意绑定问题）
dog = Dog()

# 方式一：替换实例属性（只影响该实例）
import types
dog.speak = types.MethodType(lambda self: "Meow!", dog)

# 方式二：替换类方法（影响所有实例）
Dog.speak = lambda self: "Meow!"
```

### 3.3 替换类方法 / 静态方法

```python
class MyClass:
    @classmethod
    def create(cls):
        return cls()

    @staticmethod
    def helper():
        return "help"

# 替换 classmethod
MyClass.create = classmethod(lambda cls: "custom create")

# 替换 staticmethod
MyClass.helper = staticmethod(lambda: "custom help")
```

### 3.4 替换 `__init__` 方法

```python
class Config:
    def __init__(self):
        self.debug = False

_original_init = Config.__init__

def _patched_init(self):
    _original_init(self)
    self.debug = True  # 强制开启 debug

Config.__init__ = _patched_init
```

---

## 四、安全地应用补丁

### 4.1 contextmanager 模式（推荐）

```python
from contextlib import contextmanager

@contextmanager
def monkey_patched(obj, attr, replacement):
    """临时替换属性，退出后自动恢复"""
    original = getattr(obj, attr)
    try:
        setattr(obj, attr, replacement)
        yield
    finally:
        setattr(obj, attr, original)

# 使用
with monkey_patched(math, 'sqrt', custom_sqrt):
    result = math.sqrt(4)  # 使用 custom_sqrt
# 退出后 math.sqrt 恢复原样
```

### 4.2 装饰器模式

```python
def patch_decorator(obj, attr, replacement):
    """装饰器：仅在函数执行期间替换"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            original = getattr(obj, attr)
            setattr(obj, attr, replacement)
            try:
                return func(*args, **kwargs)
            finally:
                setattr(obj, attr, original)
        return wrapper
    return decorator

@patch_decorator(math, 'sqrt', custom_sqrt)
def compute():
    return math.sqrt(4)
```

### 4.3 使用 unittest.mock（最佳实践）

```python
from unittest.mock import patch

# 上下文管理器
with patch('module.function', return_value=42):
    result = module.function()  # 返回 42

# 装饰器
@patch('module.function', return_value=42)
def test_something(mock_func):
    result = module.function()
    assert result == 42

# 对象属性
with patch.object(some_instance, 'method', return_value="mocked"):
    result = some_instance.method()  # "mocked"
```

---

## 五、风险与最佳实践

### 5.1 风险

| 风险 | 说明 | 示例 |
|------|------|------|
| 不可预测的行为 | 其他代码可能依赖被替换的原始实现 | 替换 `json.dumps` 后，所有序列化行为改变 |
| 难以调试 | 补丁在运行时生效，代码阅读时看不到 | Bug 只在特定执行顺序下出现 |
| 时序依赖 | 补丁的先后顺序影响结果 | gevent 必须在其他 import 之前 patch |
| 线程安全 | 多线程环境下动态替换可能导致竞争 | 一个线程看到原函数，另一个看到补丁 |

### 5.2 最佳实践

1. **优先使用 `unittest.mock.patch`**：自动恢复，不会遗漏
2. **补丁范围尽量小**：使用 context manager 限制补丁的生命周期
3. **记录补丁原因**：在代码注释中说明为什么需要补丁，以及何时可以移除
4. **保存原始引用**：如果补丁中需要调用原始实现，务必保存引用
5. **避免在生产环境中使用**：生产环境优先用继承、依赖注入等替代方案
6. **补丁要尽早应用**：特别是 gevent 等，在其他 import 之前执行

### 5.3 替代方案

当想用猴子补丁时，先考虑以下替代方案：

| 猴子补丁场景 | 替代方案 |
|-------------|---------|
| 测试中替换依赖 | `unittest.mock.patch` + 依赖注入 |
| 修改第三方库行为 | 继承 + 重写方法 |
| 添加功能 | 装饰器 / 包装器模式 |
| 修复 Bug | Fork + 修改源码 / 向上游提 PR |
| 横切关注点 | 信号/钩子机制（如 Django signals） |

---

*最后更新: 2026-05-11*
