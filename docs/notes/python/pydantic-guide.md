# Pydantic 完全指南

> **适用版本**: Pydantic V2（兼容 V1 迁移提示）
> **安装**: `pip install pydantic`
> **最后更新**: 2026-05-11

---

## 一、Pydantic 是什么？

Pydantic 是 Python 最流行的数据校验库，使用 Python 类型注解来定义数据模型，自动完成：

- **类型校验**：将输入数据转换并校验为声明的类型
- **序列化**：模型与 JSON/dict 之间的转换
- **JSON Schema**：自动生成 JSON Schema 文档
- **IDE 支持**：完整的类型提示和自动补全

**核心思想**：用类型注解声明你期望什么，Pydantic 负责校验和转换。

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str
    age: int
    email: str

# 自动类型转换
user = User(name="Alice", age="25", email="alice@example.com")
print(user.age)    # 25 (int，从字符串自动转换)
print(user.model_dump())  # {'name': 'Alice', 'age': 25, 'email': 'alice@example.com'}
```

---

## 二、基础模型

### 2.1 定义与使用

```python
from pydantic import BaseModel

class Item(BaseModel):
    name: str
    description: str | None = None   # 可选字段，默认 None
    price: float
    tax: float = 0.0                 # 带默认值的字段

# 创建实例
item = Item(name="Widget", price=19.99)

# 访问属性
print(item.name, item.price)  # Widget 19.99

# 转为字典
item.model_dump()  # {'name': 'Widget', 'description': None, 'price': 19.99, 'tax': 0.0}

# 转为 JSON 字符串
item.model_dump_json()  # '{"name":"Widget","description":null,"price":19.99,"tax":0.0}'

# 从 JSON 创建
item2 = Item.model_validate_json('{"name": "Gadget", "price": 29.99}')
```

### 2.2 V1 与 V2 API 对照

| V1 (旧) | V2 (新) | 说明 |
|---------|--------|------|
| `item.dict()` | `item.model_dump()` | 转字典 |
| `item.json()` | `item.model_dump_json()` | 转 JSON 字符串 |
| `Item.parse_obj(d)` | `Item.model_validate(d)` | 从字典创建 |
| `Item.parse_raw(s)` | `Item.model_validate_json(s)` | 从 JSON 字符串创建 |
| `Item.schema()` | `Item.model_json_schema()` | 生成 JSON Schema |
| `class Config` | `model_config` | 模型配置 |

---

## 三、字段类型与校验

### 3.1 常用类型

```python
from pydantic import BaseModel, Field
from datetime import datetime
from pathlib import Path
from uuid import UUID

class TypesDemo(BaseModel):
    # 基础类型
    name: str
    count: int
    score: float
    active: bool

    # 集合类型
    tags: list[str]            # 字符串列表
    scores: dict[str, float]   # 字典
    unique_ids: set[int]       # 集合

    # 可选类型
    nickname: str | None = None   # Python 3.10+ 写法
    bio: str | None = None

    # 标准库类型
    created_at: datetime
    file_path: Path
    id: UUID

    # 严格类型（不做隐式转换）
    # StrictInt 只接受 int，不接受 "123" 这样的字符串
    from pydantic import StrictInt
    exact_count: StrictInt
```

### 3.2 Field 字段配置

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(
        min_length=1,          # 最小长度
        max_length=100,        # 最大长度
        description="Product name",  # 字段描述（用于生成 JSON Schema）
        examples=["Widget"],   # 示例值
    )

    price: float = Field(
        gt=0,                  # 大于 0
        le=10000,              # 小于等于 10000
        description="Price in USD",
    )

    quantity: int = Field(
        default=0,             # 默认值
        ge=0,                  # 大于等于 0
    )
```

**Field 数值约束**：

| 约束 | 含义 | 适用类型 |
|------|------|---------|
| `gt` | 大于 | int, float |
| `ge` | 大于等于 | int, float |
| `lt` | 小于 | int, float |
| `le` | 小于等于 | int, float |
| `multiple_of` | 是某数的倍数 | int, float |
| `min_length` | 最小长度 | str, list, set |
| `max_length` | 最大长度 | str, list, set |
| `pattern` | 正则匹配 | str |

### 3.3 自定义校验器

```python
from pydantic import BaseModel, field_validator, model_validator

class User(BaseModel):
    name: str
    email: str
    age: int
    password: str
    confirm_password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Email must contain @")
        return v.lower()  # 自动转小写

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int) -> int:
        if v < 0 or v > 150:
            raise ValueError("Age must be between 0 and 150")
        return v

    @model_validator(mode="after")
    def validate_passwords(self) -> "User":
        """跨字段校验：密码一致性"""
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self
```

**校验器类型**：

| 装饰器 | 触发时机 | 用途 |
|--------|---------|------|
| `@field_validator` | 单个字段赋值后 | 校验/转换单个字段 |
| `@model_validator(mode="before")` | 所有字段赋值前 | 预处理原始输入 |
| `@model_validator(mode="after")` | 所有字段赋值后 | 跨字段校验 |

### 3.4 Annotated 写法（推荐）

Pydantic V2 推荐使用 `Annotated` 将校验规则与类型绑定：

```python
from typing import Annotated
from pydantic import BaseModel, Field, UrlConstraints
from pydantic import HttpUrl

class Article(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    url: HttpUrl                          # 自动校验 URL 格式
    views: Annotated[int, Field(ge=0)] = 0
```

---

## 四、嵌套模型

### 4.1 模型嵌套

```python
class Address(BaseModel):
    street: str
    city: str
    country: str = "China"

class Company(BaseModel):
    name: str
    address: Address    # 嵌套模型

    employees: list[Address] = []  # 嵌套模型列表

company = Company(
    name="Tech Corp",
    address={"street": "123 Main St", "city": "Shanghai"}
    # Address 自动从 dict 创建
)
print(company.address.city)  # Shanghai
```

### 4.2 递归模型

```python
class Comment(BaseModel):
    user: str
    content: str
    replies: list["Comment"] = []  # 前向引用

# 更新模型前向引用（Pydantic V2 通常不需要，自动处理）
Comment.model_rebuild()

comment = Comment(
    user="Alice",
    content="Great post!",
    replies=[
        Comment(user="Bob", content="Thanks!"),
    ]
)
```

---

## 五、模型配置

### 5.1 model_config

```python
from pydantic import BaseModel, ConfigDict

class User(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,    # 自动去除字符串首尾空格
        str_min_length=1,             # 字符串最小长度
        frozen=True,                  # 不可变模型（类似 dataclass(frozen=True)）
        extra="forbid",               # 禁止传入未定义的字段
        populate_by_name=True,        # 允许通过字段名赋值（配合 alias）
        from_attributes=True,         # 允许从 ORM 对象创建（原 orm_mode）
    )

    name: str
    email: str
```

**extra 选项**：

| 值 | 行为 |
|----|------|
| `"ignore"` | 忽略多余字段（默认） |
| `"forbid"` | 抛出 ValidationError |
| `"allow"` | 保留多余字段到 `__pydantic_extra__` |

### 5.2 字段别名

```python
from pydantic import BaseModel, Field

class APIResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_name: str = Field(alias="userName")    # API 返回驼峰命名
    created_at: str = Field(alias="createdAt")

# 使用别名创建（对应 API 响应）
resp = APIResponse(userName="Alice", createdAt="2024-01-01")

# 使用原始名创建
resp = APIResponse(user_name="Alice", created_at="2024-01-01")

# 导出时使用别名
resp.model_dump(by_alias=True)  # {'userName': 'Alice', 'createdAt': '2024-01-01'}
```

---

## 六、序列化与反序列化

### 6.1 导出控制

```python
class User(BaseModel):
    name: str
    email: str
    password_hash: str
    internal_id: int

    model_config = ConfigDict(
        json_schema_extra={"example": {"name": "Alice", "email": "a@b.com"}}
    )

user = User(name="Alice", email="a@b.com", password_hash="xyz", internal_id=1)

# 排除字段
user.model_dump(exclude={"password_hash", "internal_id"})
# {'name': 'Alice', 'email': 'a@b.com'}

# 只包含指定字段
user.model_dump(include={"name", "email"})
# {'name': 'Alice', 'email': 'a@b.com'}

# 排除未设置的字段（需要字段有 default）
user.model_dump(exclude_unset=True)

# 排除默认值
user.model_dump(exclude_defaults=True)
```

### 6.2 自定义序列化

```python
from pydantic import BaseModel, field_serializer
from datetime import datetime

class Event(BaseModel):
    name: str
    timestamp: datetime

    @field_serializer("timestamp")
    @classmethod
    def serialize_timestamp(cls, v: datetime) -> str:
        return v.isoformat()  # 自定义日期格式

event = Event(name="Launch", timestamp=datetime.now())
event.model_dump()  # {'name': 'Launch', 'timestamp': '2024-01-01T12:00:00'}
```

---

## 七、继承与组合

### 7.1 模型继承

```python
class BaseUser(BaseModel):
    name: str
    email: str

class Admin(BaseUser):
    role: str = "admin"
    permissions: list[str] = []

# Admin 继承了 BaseUser 的所有字段
admin = Admin(name="Boss", email="boss@example.com", permissions=["read", "write", "delete"])
```

### 7.2 create_model 动态创建

```python
from pydantic import create_model

DynamicUser = create_model(
    "DynamicUser",
    name=(str, ...),          # (类型, 默认值)，... 表示必填
    age=(int, 18),            # 带默认值
)

user = DynamicUser(name="Alice")  # age 默认 18
```

---

## 八、错误处理

```python
from pydantic import BaseModel, ValidationError

class Item(BaseModel):
    name: str
    price: float = Field(gt=0)

try:
    Item(name="", price=-10)
except ValidationError as e:
    print(e.error_count())    # 错误数量
    for error in e.errors():
        print(f"  字段: {'.'.join(str(x) for x in error['loc'])}")
        print(f"  类型: {error['type']}")
        print(f"  信息: {error['msg']}")
        print(f"  输入: {error['input']}")
```

**错误输出示例**：

```
字段: price
类型: greater_than
信息: Input should be greater than 0
输入: -10
```

---

## 九、Pydantic Settings

`pydantic-settings` 是独立的包，用于管理应用配置（从环境变量、.env 文件等加载）。

```bash
pip install pydantic-settings
```

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="APP_",        # 环境变量前缀：APP_DATABASE_URL
        case_sensitive=False,     # 环境变量名不区分大小写
    )

    database_url: str = "postgresql://localhost/dev"
    secret_key: str
    debug: bool = False
    port: int = 8080
    allowed_hosts: list[str] = ["*"]

# 自动从环境变量加载，类型校验和转换
settings = AppSettings()
```

**环境变量映射规则**：

| 字段 | 环境变量（无前缀） | 环境变量（有前缀 APP_） |
|------|-------------------|----------------------|
| `database_url` | `DATABASE_URL` | `APP_DATABASE_URL` |
| `secret_key` | `SECRET_KEY` | `APP_SECRET_KEY` |
| `allowed_hosts` | `ALLOWED_HOSTS` | `APP_ALLOWED_HOSTS` |

列表类型的环境变量用逗号分隔：`APP_ALLOWED_HOSTS=localhost,127.0.0.1`

---

## 十、性能优化

Pydantic V2 的核心用 Rust 编写，性能比 V1 提升了 5-50 倍。

| 操作 | V1 | V2 | 提升 |
|------|----|----|------|
| 校验 | 基准 | ~17x 快 | 核心操作用 Rust 实现 |
| 序列化 | 基准 | ~5x 快 | Rust 实现 |
| JSON Schema | 基准 | ~50x 快 | Rust 实现 |

**优化建议**：

1. 使用 V2 原生 API（`model_validate` 而非 `parse_obj`）
2. 大量数据校验时，考虑用 `TypeAdapter` 避免 BaseModel 开销
3. `frozen=True` 的模型更快（不可变，跳过变更追踪）

```python
from pydantic import TypeAdapter

# TypeAdapter：不需要定义模型，直接校验原始类型
adapter = TypeAdapter(list[int])
result = adapter.validate_python("[1, 2, 3]")  # [1, 2, 3]
```

---

*适用版本: Pydantic V2 | 安装: pip install pydantic pydantic-settings | 最后更新: 2026-05-11*
