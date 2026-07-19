# PipeGate 大白话总览

> 自托管 HTTP 隧道,穷人版 ngrok,~400 行 Python。
> 一条 WebSocket 把你本地的 `localhost:3000` 暴露到公网 VPS 上。
> 项目地址: https://github.com/AxelWT/pipegate

---

## 1. 这是啥

PipeGate 让你**本地跑的服务能被公网访问**。

你在本机 `localhost:3000` 跑了个 web 应用,想让远端同事或 webhook 服务(GitHub、Stripe)能访问到——本地端口公网访问不了。PipeGate 的办法:在一台公网 VPS 上跑 server,在本机跑 client,两者之间用**一条 WebSocket** 把请求从公网"穿"到本地。

| 角色 | 跑在哪儿 | 干啥 |
|---|---|---|
| **调用方** | 任意公网机器 | 发普通 HTTP 请求打 server |
| **Server** | 你的公网 VPS | 对外开 HTTP 收请求,对内开 WS 让 client 连进来 |
| **Client** | 你的本地机器 | 主动拨号 WS 连到 server,把转过来的请求翻译成本地 HTTP 调用 |

不需要账号、不需要云依赖、不需要 daemon。

---

## 2. 整体架构

```
   [任意 HTTP 调用方]
          │ 公网 HTTP
          ▼
   ┌─────────────────────┐
   │   PipeGate Server   │  公网 VPS
   └─────────────────────┘
          │ 单条 WebSocket (JWT 鉴权)
          ▼
   ┌─────────────────────┐
   │  PipeGate Client    │  本地机器
   └─────────────────────┘
          │ 普通本地 HTTP
          ▼
   [你的本地服务]
```

对外是 HTTP 接口,对内是 WebSocket。所有公网请求都从那条 WS 上"穿"过去。

---

## 3. Server 端工作机制

> 对应源码:`pipegate/server.py`

### 角色:公网"中转站"

干两件事:
1. 对外开 HTTP 服务,接公网调用方的请求;
2. 对内开 WS 端点(`/`),让本地 client 主动连进来。

中间靠两个常驻 asyncio 任务在 HTTP 侧和 WS 侧之间搬运。

### 核心数据结构

| 名字 | 类型 | 干啥 |
|---|---|---|
| `buffers` | `dict[cid, Queue]` | **派单队列**:每个隧道一条,HTTP 请求进来往这塞 |
| `futures` | `dict[corr_id, Future]` | **回执登记本**:每个在途请求挂一个 future,等 WS 回响应时点亮它 |

### HTTP handler:接单等回执

1. 解析路由,拆出 `(connection_id, path_slug)`。
2. 生成 `correlation_id`(UUID4),作为请求-响应配对的钥匙。
3. 流式读 body,超 `max_body_bytes`(默认 10MB)立刻 413。
4. 登记一个 future 到 `futures[corr_id]`。
5. 把请求包装成 `BufferGateRequest`,`put_nowait` 进 `buffers[cid]`。队列满 → 503。
6. `await future`(最多 300s)等回执,超时 → 504。
7. 收到响应后解码 base64 body,还原 HTTP 响应还给调用方。

### WS 端两个常驻任务

**`send()` 任务 — 出站派单**:从 `buffers[cid]` 队列取请求,`ws.send_text()` 推给 client。WS 断了就把对应 future 失败成 502。

**`receive()` 任务 — 入站回执**:收 client 回来的 `BufferGateResponse`,按 `correlation_id` 在 `futures` 字典里找到 future,`set_result()` 点亮它——正在 `await future` 的 HTTP handler 就能继续往下走了。

> 这俩任务从 **server 视角**命名:server 发 request 出去、收 response 回来。从 client 视角看就是镜像的 `recv()` / `send()`。

### 路由两种模式

互斥,由 `PIPEGATE_BASE_DOMAIN` 控制:

| 模式 | URL 形式 | 适用 |
|---|---|---|
| 路径模式(默认) | `http://server/{cid}/{path}` | 简单,不需要泛域名 |
| 子域名模式 | `http://{cid}.{base_domain}/{path}` | 前端用绝对路径引用资源(`/static/main.js`)时必须用,否则 cid 前缀丢了资源 404 |

子域名模式需要泛解析 DNS 和泛域名 TLS 证书。

---

## 4. Client 端工作机制

> 对应源码:`pipegate/client.py`

### 角色:本地"内线"

**主动拨号连 server 的 WS,把 server 转过来的请求翻译成本地 HTTP 调用,再把响应原路塞回去**。不监听任何端口,只往外连。

### 主循环:连、收、派

无限重连循环:

```python
while True:
    if attempt > 0:
        await asyncio.sleep(min(1.0 * 2**(attempt-1), 60.0))  # 指数退避
    try:
        async with connect(server_url) as ws, httpx.AsyncClient() as http:
            attempt = 0
            async with asyncio.TaskGroup() as tg:
                while True:
                    message = await ws.recv()
                    request = BufferGateRequest.model_validate_json(message)
                    tg.create_task(handle_request(target, request, http, ws))
    except asyncio.CancelledError:
        raise                       # Ctrl-C 干净退出
    except (ConnectionRefusedError, OSError, Exception):
        ...                         # 连不上或断了,下一轮
    attempt += 1
```

关键点:
- **每条 request 起一个 task**:用 `TaskGroup` 并发处理,单条 WS 上能同时跑多个请求。
- **每次重连新建 httpx client**:连接级状态不跨 WS 会话。
- **`CancelledError` 必须重抛**:保证 Ctrl-C / 外部取消干净传播。

### `handle_request`:收单→跑本地→回单

1. 用 `httpx` 打本地 HTTP 请求,带上原始 method/path/headers/query/body。
2. 包装响应:同 `correlation_id`,headers 剥掉编码相关头(因为 httpx 已经解压、de-chunk),body base64 编码。
3. 任何异常(本地服务连不上、超时)都包一个 `status_code=504` 的响应回去——**不让 server 干等**。
4. `ws_client.send()` 回去。发不出去就记日志,server 那头 WS 断开处理会把 future 失败成 502。

### 重连退避

`delay = min(1.0 * 2^(attempt-1), 60.0)`,1s → 2s → 4s → 8s → 16s → 32s → 60s 封顶。连上后立刻重置为 0。

### 为什么单 WS 能并发

每收到一条 request 就起一个独立 task,每个 task 独立跑本地 HTTP、独立回响应。响应带着请求时的 `correlation_id`,server 端按 ID 找到对应 future 投递——**先发的不一定先回**,顺序无所谓。

---

## 5. 一次完整请求的故事

以 `GET http://yourserver:8000/a1b2c3/api/data?x=1` 为例:

| 步骤 | 在哪儿 | 干什么 |
|---|---|---|
| ① 调用方发 HTTP | server HTTP handler | FastAPI 把请求分发进来 |
| ② 解析路由 | server | 拆出 `("a1b2c3", "api/data")` |
| ③ 生成 corr_id | server | `uuid.uuid4()` 生成新 ID |
| ④ 登记 future | server | 挂进 `futures[corr_id]` |
| ⑤ 入队 | server | 包装 `BufferGateRequest`,`put_nowait` 进 `buffers["a1b2c3"]` |
| ⑥ 等回执 | server | `await future`(最多 300s) |
| ⑦ WS 派单 | server `send()` 任务 | 从队列取 request,`ws.send_text()` 推给 client |
| ⑧ client 收单 | client | `ws.recv()` 拿到 request,起 `handle_request` task |
| ⑨ client 调本地 | client | `httpx` 打 `GET http://localhost:3000/api/data?x=1` |
| ⑩ client 回单 | client | 包装 `BufferGateResponse`(同 corr_id),`ws.send()` 回去 |
| ⑪ server 收回执 | server `receive()` | `futures[corr_id].set_result(response)` |
| ⑫ HTTP handler 醒来 | server | 构造 HTTP 响应还给调用方 |

---

## 6. 关键设计点

### correlation_id 配对

每个 HTTP 请求生成一个全新 UUID4,跟着 request 到 client,client 原样塞进 response 回来,server 的 `receive()` 任务拿它在 `futures` 字典里查到对应 future。**响应可以乱序到达**,互不干扰。

server 还把这个 UUID 注入到转发请求的 header 里作为 `x-pipegate-correlation-id`,你的本地服务可以记日志做端到端追踪。

### 编码方式

WebSocket 文本帧只能传字符串,用 JSON 做序列化层:

| 字段 | 编码方式 | 为什么 |
|---|---|---|
| `headers` | JSON 数组 `[[k,v],...]` | 保住重复 header(比如多个 `Set-Cookie`),dict 会丢 |
| `url_query` | JSON 数组 `[[k,v],...]` | 保住重复 query key 和顺序,比如 `?x=1&x=2` |
| `body` | base64 字符串 | 让二进制 payload(文件上传、protobuf)活过 JSON 文本帧 |

### 哪些 header 会被剥掉

**请求方向**(server → client):剥掉 hop-by-hop 头——`connection, content-length, host, keep-alive, proxy-*, te, trailers, transfer-encoding, upgrade`。这些是 HTTP/1.1 逐跳语义,跨代理不该透传。

**响应方向**(client → server → 调用方):剥掉 `content-encoding, content-length, transfer-encoding`。因为 httpx 在 client 端已经解压、de-chunk 了 body——留着这些头会让 body 字节数和头里写的不一致,浏览器报 `ERR_CONTENT_DECODING_FAILED`。

Starlette 会根据实际 body 字节数自动加上正确的 `content-length`。

---

## 7. 鉴权

### JWT 是干啥的

JWT 用来**给 WS 升级做鉴权**,不是给 HTTP 调用方用的。

- 签名密钥:`PIPEGATE_JWT_SECRET`(server 和 token 生成方共享)
- `sub` claim:connection_id(隧道 ID)
- 可选 `iss`/`aud`:默认都是 `"pipegate"`,两边必须匹配
- `exp`:默认不设 = 永不过期;设了 `PIPEGATE_JWT_TTL_DAYS` 才有

### 谁来用 token

| 角色 | 需要 token 吗 | 怎么用 |
|---|---|---|
| 公网 HTTP 调用方 | **不需要** | URL 里的 cid 就是能力令牌 |
| Client 连 WS | **需要** | 拼到 WS URL 的 query 里:`ws://server/?token=<jwt>` |
| Server 验证 | — | WS 升级时验证,失败 → close 1008 |

---

## 8. 配置

### Server / Token 生成方:环境变量

`pydantic-settings` 自动读 `PIPEGATE_*` 前缀的环境变量:

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `PIPEGATE_JWT_SECRET` | ✅ | — | JWT 签名密钥 |
| `PIPEGATE_JWT_ALGORITHMS` | ❌ | `["HS256"]` | 算法列表 |
| `PIPEGATE_JWT_ISSUER` | ❌ | `pipegate` | iss claim |
| `PIPEGATE_JWT_AUDIENCE` | ❌ | `pipegate` | aud claim |
| `PIPEGATE_JWT_TTL_DAYS` | ❌ | `None`(永不过期) | token 有效期天数 |
| `PIPEGATE_CONNECTION_ID` | ❌ | 随机 UUID | 生成 token 时固定的 cid |
| `PIPEGATE_MAX_BODY_BYTES` | ❌ | 10 MB | 超过 → 413 |
| `PIPEGATE_MAX_QUEUE_DEPTH` | ❌ | 100 | 队列上限,超过 → 503 |
| `PIPEGATE_BASE_DOMAIN` | ❌ | — | 设了就走子域名路由 |

### Client:TOML profile

`pipegate connect` 命令从两个位置找 TOML 配置并合并(项目级覆盖用户级):

1. `~/.config/pipegate/config.toml`(或 `$XDG_CONFIG_HOME/pipegate/config.toml`)——用户级
2. `./.pipegate.toml`——项目级

Profile schema:

```toml
[profiles.default]
target     = "http://localhost:3000"      # 必填:本地服务地址
server     = "https://tunnel.example.com" # 必填:server 基础 URL
cid        = "my-app"                     # 可选:固定 cid(不写就随机)
secret     = "inline-secret"              # secret 和 secret_env 二选一
secret_env = "PIPEGATE_JWT_SECRET"        # 这个优先,更安全
ttl_days   = 30                           # 可选:token 有效期
```

**安全建议**:用 `secret_env` 而不是 `secret`——密钥放环境变量里,避免误提交。

### Docker 多隧道

设计是严格 1:1:1——**一个 cid → 一条 WS → 一个 target**。要隧道多个服务就跑多个 client 进程。

`docker-compose.client.yml` 把多个 client 跑成独立的 compose service,共享同一镜像和同一份 `.pipegate.toml`,每个 service 有 `restart: unless-stopped`。

---

## 9. 一句话再总结

- **HTTP 请求** = 调用方敲门,server HTTP handler 接单。
- **WS `send()`** = server 把单子丢给 tunnel client 去办。
- **WS `receive()`** = server 等 tunnel client 把办好的单子送回来,转交给正在等的 HTTP handler。

`buffers` 队列解决"send 任务怎么知道有活干"——出站派单。
`futures` 字典解决"receive 任务怎么找到该交给哪个 HTTP handler"——入站回执。
`correlation_id` 是这两个字典之间穿针引线的钥匙。
