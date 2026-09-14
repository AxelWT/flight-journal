# Node 环境下网络调用方案对比与 undici 使用指南

## 一、技术选型对比

### 1. 按热度与定位

| 库 / 方案 | 定位 | 周下载量级 | 适用场景 |
|---|---|---|---|
| **内置 `fetch`** | Node 18+ 自带 | — | 一般业务项目首选，零依赖 |
| **undici** | Node 官方现代实现 | ~30M | 服务端重度场景：连接池、代理、全局拦截 |
| **axios** | 老牌通用 | ~50M | 同构项目、需要拦截器/转换器 |
| **got** | Node 专用 | ~10M | 纯 Node 服务端、hooks/重试/分页 |
| **ky** | 轻量现代 | ~5M | 基于 fetch、体积小、API 简洁 |
| **ofetch** | unjs 生态 | ~10M | Nuxt/nitro 生态、轻量 |
| **node-fetch** | 早期 fetch polyfill | ~30M | Node < 18 项目，新项目不推荐 |

### 2. 关键维度对比

| 维度 | 内置 fetch | undici | axios | got |
|---|---|---|---|---|
| 是否需要安装 | 否 | 是 | 是 | 是 |
| 浏览器同构 | 是 | 否 | 是 | 否 |
| 全局 dispatcher 拦截 | 受益者 | 提供者 | 不支持 | 不支持 |
| 拦截器 | 需自写 | Dispatcher Interceptor | 内置 | hooks |
| 自动重试 | 需自写 | 需自写 | 需自写或插件 | 内置 |
| 连接池/代理细控 | 需配 dispatcher | 原生支持 | 弱 | 支持 |
| HTTP/2 | 取决于 dispatcher | 支持 | 否 | 否 |
| WebSocket | 否 | 支持 | 否 | 否 |
| 性能 | 好 | 最好 | 一般 | 好 |
| TypeScript 类型 | 自带（@types/node 或 lib.dom） | 自带 | 自带 | 自带 |

### 3. 选型建议

- **一般业务项目**：直接用全局 `fetch`，零依赖。需要拦截器/重试再考虑 `axios` 或 `ky`
- **Node 服务端、要管连接池/代理/全局错误隔离**：`undici` + `setGlobalDispatcher`，所有 `fetch` 自动受控
- **浏览器 + Node 同构**：`axios`（生态最成熟）或 `ky`（更现代）
- **老项目 / Node < 18**：`node-fetch` 或 `axios`
- ** Provider SDK 集成（如 LLM API）**：`undici`，因为第三方 SDK 内部都用 `fetch`，只有 undici 能统一管控

---

## 二、`fetch` 来源与 TypeScript 配置

**关键认知**：TypeScript 本身不提供 `fetch` 的运行时实现，只提供类型。运行时由宿主环境提供。

### 1. fetch 的运行时来源

| 运行时 | fetch 来源 |
|---|---|
| Node.js 18+ | 内置（底层就是 undici） |
| Bun | 内置 |
| Deno | 内置 |
| 浏览器 | 原生 |

代码里直接写 `await fetch(url)` 就能跑，**不用 `npm install` 任何东西**。

### 2. TypeScript 类型来源

- **浏览器项目**：`tsconfig.json` 里 `"lib": ["DOM"]` → `fetch`/`Request`/`Response` 类型在 `lib.dom.d.ts`
- **Node 项目**：装 `@types/node`（v18+ 的类型已包含全局 `fetch`）
- **未配置任何 lib**：会报「找不到名称 fetch」

### 3. 最小可运行示例

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"]   // 浏览器项目
    // 或装 @types/node，配 "types": ["node"]
  }
}
```

```ts
const res = await fetch("https://api.example.com/data");
const data = await res.json();
```

```bash
node script.js    # Node 18+
tsx script.ts
```

---

## 三、undici 使用示例

### 1. `fetch`（最常用，和浏览器 fetch 一致）

```ts
import { fetch } from "undici";

const res = await fetch("https://api.example.com/users");
const data = await res.json();
```

undici 的 `fetch` 就是 Node 内置 `fetch` 的同款实现，区别是可以独立升级版本、显式 import。

### 2. `request`（比 fetch 更轻量，不经 Response/Request 抽象）

```ts
import { request } from "undici";

const { statusCode, body } = await request("https://api.example.com/users", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "alice" }),
});
console.log(statusCode, await body.text());
```

适合纯服务端调用，性能更好。

### 3. `Client` / `Pool` / `Agent`（连接池层）

```ts
import { Client, Pool, Agent } from "undici";

// Client: 单一 origin 的持久连接池
const client = new Client("https://api.example.com");
const { body } = await client.request({ path: "/users", method: "GET" });

// Pool: 多个 origin 共享连接
const pool = new Pool("https://api.example.com");

// Agent: 管理多个 origin 的连接，可作为全局 dispatcher
const agent = new Agent({
  connections: 128,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
});
```

### 4. 全局 dispatcher（工程化最常用）

```ts
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

setGlobalDispatcher(
  new EnvHttpProxyAgent({
    allowH2: false,
    bodyTimeout: 300_000,
    headersTimeout: 300_000,
    connect: { autoSelectFamilyAttemptTimeout: 2_000 },
  }),
);

// 之后所有 fetch() 都走这个 dispatcher，包括第三方 SDK 内部的 fetch
await fetch("https://api.example.com/users");
```

**关键点**：`setGlobalDispatcher` 设置一次，全局 `fetch` 都用它。`EnvHttpProxyAgent` 是 `Agent` 的子类，额外读 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量。

### 5. 代理类型对比

| 类型 | 用途 |
|---|---|
| `Agent` | 默认，直连 |
| `EnvHttpProxyAgent` | 读环境变量自动代理 |
| `ProxyAgent` | 显式指定代理 URL |
| `Interceptor` | 拦截器，可加重试、日志、metrics |

### 6. 常用配置项

```ts
new Agent({
  connections: 128,                       // 每 origin 最大连接数
  pipelining: 1,                          // HTTP pipelining 深度
  keepAliveTimeout: 4_000,                // 空闲连接保持多久
  keepAliveMaxTimeout: 30_000,            // 上限
  bodyTimeout: 300_000,                   // body 两次数据间隔超时
  headersTimeout: 300_000,                // 收到响应头超时
  connect: {
    timeout: 10_000,                      // TCP 连接超时
    autoSelectFamily: true,               // IPv4/IPv6 自动选择
    autoSelectFamilyAttemptTimeout: 250,  // 默认 250ms，高延迟链路要调大
  },
  allowH2: false,                         // 是否允许 HTTP/2
});
```

### 7. WebSocket

```ts
import { WebSocket } from "undici";

const ws = new WebSocket("wss://echo.example.com");
ws.addEventListener("open", () => ws.send("hello"));
ws.addEventListener("message", (e) => console.log(e.data));
```

**注意**：undici 的 WebSocket **不走 fetch/dispatcher 路径**，是独立实现，`bodyTimeout`/`headersTimeout` 等配置对它无效。

---

## 四、Node 内置 `fetch` 使用示例

### 1. 基础 GET

```ts
const res = await fetch("https://api.example.com/users");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const users = await res.json();
```

### 2. POST JSON

```ts
const res = await fetch("https://api.example.com/users", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "alice" }),
});
const created = await res.json();
```

### 3. 超时控制（AbortSignal）

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5_000);
try {
  const res = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timer);
}
```

### 4. 流式读取（适合 LLM SSE 响应）

```ts
const res = await fetch("https://api.example.com/stream");
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value, { stream: true }));
}
```

### 5. 自定义 dispatcher（覆盖全局）

```ts
import { Agent } from "undici";

const agent = new Agent({ connections: 32 });
const res = await fetch(url, { dispatcher: agent });
```

### 6. 错误处理

```ts
try {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
} catch (err) {
  if (err instanceof TypeError) {
    // 网络错误（DNS、连接失败、CORS）
  }
  throw err;
}
```

---

## 五、工程化最佳实践

### 1. 全局 dispatcher 模式

适合：所有出站请求需要统一代理、超时、错误隔离的项目。

```ts
// src/http.ts
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

setGlobalDispatcher(
  new EnvHttpProxyAgent({
    bodyTimeout: 300_000,
    headersTimeout: 300_000,
    connect: { autoSelectFamilyAttemptTimeout: 2_000 },
  }),
);
```

```ts
// src/main.ts
import "./http.js"; // 副作用导入，必须在任何 fetch 之前
// 之后所有 fetch 都受控
```

**为什么必须在启动早期配置**：
- `setGlobalDispatcher` 设的是进程级全局状态
- 晚配会让启动早期的请求走 Node 默认行为（无代理、默认超时）
- 某些 Node 版本的 fetch/undici 不匹配 bug 必须在任何 fetch 前修复

### 2. 分层抽象模式

适合：业务代码不直接调 fetch，封装一层 client。

```ts
class HttpClient {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
  async post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }
}
```

### 3. 注意事项

- **WebSocket 不走 dispatcher**：undici 的 WebSocket 是独立实现，不受全局 dispatcher 配置影响
- **第三方 SDK 不一定走 fetch**：如果 SDK 用了 `node:http` 或自带 fetch 实现，会绕过全局 dispatcher
- **不要混用多套 HTTP 库**：一个项目里既装 axios 又用 fetch 会让全局管控失效
- **Node 26 兼容性**：Node 26.0 内置 fetch 和 npm 版 undici 不匹配时，需要 `undici.install()` 替换全局 fetch
