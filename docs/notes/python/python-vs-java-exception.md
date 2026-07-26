# Python vs Java 异常体系对比

> **核心一句话**:Java 用"编译器"强制你处理异常,Python 全靠"自觉",运行时才会炸。

---

## 一、Java 的异常体系

```
Throwable
├── Error                    ← 系统级,不该 catch (OOM、栈溢出)
└── Exception
    ├── IOException          ← 受检异常 (Checked),编译器强制处理
    │   └── FileNotFoundException
    └── RuntimeException     ← 非受检异常 (Unchecked),编译器不管
        ├── NullPointerException
        └── IndexOutOfBoundsException
```

**Java 最有特色的一点**:Checked Exception。方法签名要声明 `throws IOException`,调用方**必须** try-catch 或继续往上抛,否则**编译不过**。这是 Java 独有的,Python/C++/Go 都没有。

---

## 二、Python 的异常体系

```
BaseException                          ← 所有异常的根
├── SystemExit                         ← sys.exit() 触发,不该 catch
├── KeyboardInterrupt                  ← Ctrl+C,不该 catch
├── GeneratorExit
└── Exception                          ← 所有"正常"异常的父类
    ├── StopIteration
    ├── ArithmeticError
    │   └── ZeroDivisionError
    ├── LookupError
    │   ├── IndexError
    │   └── KeyError
    ├── OSError                        ← 类似 Java 的 IOException
    │   ├── FileNotFoundError
    │   └── PermissionError
    ├── ValueError
    ├── TypeError
    ├── AttributeError
    └── RuntimeError
```

**Python 没有 Checked Exception 概念**。所有异常都是 unchecked,编译期不检查你处不处理,运行时炸了就炸了。

---

## 三、关键对比

### 1. 根类不同

| 对比项            | Java           | Python                              |
| --------------- | -------------- | ----------------------------------- |
| 根               | `Throwable`    | `BaseException`                     |
| 日常用的父类          | `Exception`    | `Exception`                         |
| 系统级不该 catch 的 | `Error`        | `SystemExit` / `KeyboardInterrupt` |

> **注意**:Python 里 `except Exception` 不会捕获 `SystemExit` / `KeyboardInterrupt`(因为它们直接继承 `BaseException`),这是为了防止你 catch 太宽把 Ctrl+C 也吞了。所以**永远 catch `Exception`,不要 catch `BaseException`**。

### 2. 有无 Checked Exception

| 对比项       | Java                  | Python   |
| --------- | --------------------- | -------- |
| Checked   | ✅ 有,编译器强制             | ❌ 没有     |
| 签名声明      | `throws IOException`  | 无此语法     |

- **Java 派**认为 checked exception 是好东西,强制处理错误
- **Python 派**认为它太啰嗦,污染方法签名,而且实际中大家都是 `throws Exception` 一把梭,反而失去意义

两种哲学之争。

### 3. 语法对比

**Java**:

```java
try {
    readFile();
} catch (IOException e) {
    // 处理
} finally {
    // 必执行
}

// JDK 7+ try-with-resources 自动关资源
try (BufferedReader br = new ...) { }
```

**Python**:

```python
try:
    read_file()
except IOError as e:
    # 处理,as e 绑定异常对象
except (KeyError, ValueError):    # 多类型合并 catch
    pass
else:
    # 没异常时才执行 (Java 没这个)
    pass
finally:
    # 必执行
    pass

# with 语句自动管理资源 (类似 try-with-resources)
with open("f.txt") as f:
    ...
```

> Python 多了个 `else` 段:try 没抛异常时才跑,用来把"可能出错的代码"和"后续逻辑"分开,避免把后续代码也误 catch 进去。

### 4. 抛出异常

```java
// Java
throw new IOException("msg");
```

```python
# Python:raise <实例>,不是 raise <类> new
raise IOError("msg")
```

### 5. 自定义异常

**Java**:

```java
class MyException extends Exception {}           // checked
class MyException extends RuntimeException {}    // unchecked
```

**Python**(没有 checked/unchecked 之分):

```python
class MyError(Exception):
    def __init__(self, msg, code):  # 可以塞额外字段
        super().__init__(msg)
        self.code = code
```

### 6. 异常链 (Cause)

**Java**:`Exception.getCause()`

```java
throw new RuntimeException("上层", originalException);
```

**Python**:`raise ... from ...`

```python
try:
    db_query()
except DBError as e:
    raise ServiceError("查询失败") from e   # 保留原始堆栈
```

`from e` 把原始异常链上去,traceback 会显示 `The above exception was the direct cause of...`,调试时很有用。

---

## 四、实际使用习惯差异

### Java 风格

```java
public void load() throws IOException, SQLException {  // 签名声明
    ...
}
```

方法签名暴露所有可能抛的 checked exception,层层往上抛,经常导致一个底层异常改动牵动整个调用链改签名。

### Python 风格

```python
def load():
    try:
        ...
    except (IOError, DBError) as e:
        logger.warning("...", exc_info=True)
        raise ServiceError("load failed") from e  # 转成业务异常
```

- 签名干净,不暴露异常
- 习惯在边界层(如 API handler)做一次 try-catch,转成业务异常
- 内部代码很少写 try-catch,让异常自然往上冒

### Python 还有"异常即控制流"

```python
try:
    value = my_dict[key]
except KeyError:
    value = default
```

Python 社区推崇 **EAFP**(Easier to Ask Forgiveness than Permission)——先干,出错再处理,而不是先 check 再干。

Java 社区相反,推崇 **LBYL**(Look Before You Leap)先 check。

---

## 五、一句话总结

| 维度     | Java                  | Python            |
| ------ | --------------------- | ----------------- |
| 强制处理   | 编译期强制                 | 运行时再说             |
| 签名声明   | 必须                    | 没有                |
| 风格     | LBYL(先查)              | EAFP(先干)          |
| 根类     | Throwable             | BaseException     |
| 资源管理   | try-with-resources    | with 语句           |

**Java 把异常当契约**(调用方必须知道会出什么错),**Python 把异常当事件**(出错了就处理,不强制提前声明)。两种设计哲学,各有优劣。
