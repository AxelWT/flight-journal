# frp-deploy 项目 Overview

## 一、关于 frp

- **frp (fast reverse proxy)** 是一款开源的内网穿透工具,由 fatedier 用 Go 编写,仓库地址 `github.com/fatedier/frp`。它的核心用途是把"位于内网、没有公网 IP"的服务暴露到公网访问。

- 项目地址: https://github.com/AxelWT/frp-deploy

### 核心组件

| 组件 | 部署位置 | 作用 |
|---|---|---|
| **frps** (server) | 公网服务器 | 监听端口(默认 7000),接受 frpc 的隧道连接,对外提供 HTTP/TCP/UDP 等访问入口 |
| **frpc** (client) | 内网机器 | 主动连接 frps,把本地服务通过隧道暴露出去 |

### 典型流量路径

```
用户 ──► 公网 frps (:8080 vhost) ──frp 隧道──► 内网 frpc ──► 本地服务 (:2026)
```

### 常见代理类型

- **http / https**:通过 `customDomains` 把域名请求转发到内网 Web 服务(本项目主用)
- **tcp / udp**:把任意 TCP/UDP 端口暴露到 frps 服务器
- **stcp**(secret tcp):加密的 TCP 代理,访问端需配置 visitor,流量经 frps 中转
- **xtcp**:P2P 直连,通过 NAT 打洞直接访问被访问端,**业务流量不经 frps**(失败可 fallback 到 stcp)
- **static_file / plugin** 等扩展

### 配置格式

从 v0.52.0 起官方推荐 **TOML** 格式(老版本用 ini),本项目即使用 `frps.toml` / `frpc.toml`。

### 为什么需要"部署项目"

frp 本身只提供二进制 + 配置文件,但实际生产中需要处理:systemd/docker 托管、密钥管理、版本升级、域名反代、多端同步、P2P fallback 等。本项目就是把这些工程化环节封装好。

---

## 二、关于 frp-deploy 项目

### 定位

> 基于 Docker Compose 的 frp 内网穿透**一键部署方案**,封装 frps(服务端)与 frpc(客户端)的配置、管理脚本与 CI/CD 流程。

### 解决的痛点

| 手搓 frp 痛点 | 本项目方案 |
|---|---|
| 命令行长选项难记 | `frps.sh` / `frpc.sh` 封装 start/stop/restart/status/logs/reload/update/clean |
| systemd 单元手写繁琐 | docker-compose `restart: unless-stopped` 托管 |
| 配置散落多处 | 整目录 `rsync` 同步,配置即代码 |
| 密钥容易误提交 | `*.toml.tpl` 模板 + GitHub Secrets + `envsubst` 渲染 |
| 升级版本要手改 compose | `./frps.sh update v0.71.0` 一行搞定 |
| 改服务端配置要 SSH | push 到 main 自动触发 GitHub Actions 部署 |

### 三端架构

项目包含 **3 个子目录**,对应 frp 的 3 种角色:

```
frp-deploy/
├── frps/              # 服务端:部署到云服务器,接受 frpc 连接,提供 HTTP vhost
├── frpc/              # 客户端(被访问端):跑在本地 Mac,把 Mac 服务暴露到公网
├── frpc-visitor/      # P2P 访问端(可选):跑在固定访问者桌面,xtcp 直连 Mac
└── .github/workflows/deploy-frps.yml   # frps 自动部署
```

### 流量路径(主路径)

```
用户访问 app.your-domain.com
  └─► NPM(443/80) ──► frps(:8080 vhost)
                          └─frp 隧道─► 本地 frpc ──host.docker.internal──► Mac 本地服务(:2026)
```

### 关键设计亮点

1. **配置模板化 + 渲染**:`frps.toml.tpl` 等用 `${VAR}` 占位,通过 `envsubst` 注入真实值,渲染产物入 `.gitignore`,模板可安全入库。
2. **密钥隔离**:真实 token / 密码仅存于 GitHub Secrets(CI)或本地环境变量,不入 git。
3. **Mac 友好**:frpc 容器通过 `host.docker.internal` 访问宿主机服务,无需额外网络配置。
4. **P2P 直连可选**:`frpc-visitor` 子项目提供 xtcp 直连 + stcp 兜底,业务流量可绕过云服务器,适合固定少数人桌面访问。
5. **CI/CD 自动部署**:push 到 main 即自动 rsync + 渲染 + 重启 frps,SSH 仅用于部署不再用于日常维护。
6. **版本管理对称**:三端都有 `update <ver>` 命令,可独立升级但需保持版本一致。

### 部署入口

- **服务端**:首次 `rsync` + `envsubst` + `./frps.sh start`;之后 push 即 CI 自动部署
- **客户端**(Mac):本地 `envsubst` 渲染 + 编辑代理规则 + `./frpc.sh start`
- **P2P 访问端**:在访问者机器上 `envsubst` + `./frpc-visitor.sh start`,验证日志 `xtcp connect success`

---

## 三、架构总览图

```
                          Public Internet / 公网
                                 │
   ┌─────────────────────────────┼─────────────────────────────┐
   │                             ▼                             │
   │   ┌─────────────────────────────────────────────────┐     │
   │   │  Cloud Server / 云服务器 (<your-server-ip>)     │     │
   │   │                                                 │     │
   │   │   ┌───────────┐         ┌───────────────────┐   │     │
   │   │   │  Nginx    │  HTTP   │  frps container   │   │     │
   │   │   │  Proxy    │◀───────│  :7000 (bind)     │   │     │
   │   │   │  Manager  │  :8080  │  :7500 (dashboard)│   │     │
   │   │   │  :80/:443 │         │  :8080 (vhost)    │   │     │
   │   │   └─────┬─────┘         └────────▲──────────┘   │     │
   │   │         │                        │              │     │
   │   │         ▼                        │ frp tunnel   │     │
   │   │   app.your-domain.com             │              │     │
   │   └───────────────────────────────────┼──────────────┘     │
   │                                       │                    │
   └───────────────────────────────────────┼────────────────────┘
                                            │
   ┌───────────────────────────────────────┼────────────────────┐
   │  Local Mac / 本地 Mac                  │                    │
   │                                       │                    │
   │   ┌───────────────────┐    ┌──────────┴───────────┐        │
   │   │  Local Service    │    │  frpc container      │        │
   │   │  (e.g. :2026)     │◀───│  connects to frps    │        │
   │   │                   │    │  host.docker.internal│        │
   │   │  Local Service 2  │◀───│  :7400 (admin UI)    │        │
   │   │  (e.g. :8004)     │    └──────────────────────┘        │
   │   └───────────────────┘                                    │
   └────────────────────────────────────────────────────────────┘
```

**主路径流量**:用户访问 `app.your-domain.com` → NPM（Nginx Proxy Manager） 443 → NPM 转发到 `frps:8080` → frps 通过 frp 隧道转发到本地 frpc → frpc 通过 `host.docker.internal` 访问 Mac 上的本地服务。

**P2P 直连(可选)**:固定少数人桌面端可通过 `frpc-visitor` 直连 Mac,xtcp 优先 + stcp 兜底,业务流量不经云服务器。
