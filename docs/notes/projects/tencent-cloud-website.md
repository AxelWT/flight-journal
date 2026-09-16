---
title: "从裸服务器到全站 HTTPS：云服务器 · 域名解析 · SSL 证书 · NPM 反代"
date: 2026-09-16
description: 个人自建站点完整实践：云服务器选型、DNS 解析、Let's Encrypt 证书申请（HTTP-01/DNS-01）、NPM 反向代理与安全加固
tags:
  - 运维
  - HTTPS
  - Nginx
  - 网站
---

# 从裸服务器到全站 HTTPS：云服务器 · 域名解析 · SSL 证书 · NPM 反代

> 面向个人自建站点的完整实践记录。
> 覆盖链路：买服务器 → 买域名 → DNS 解析 → 申请证书 → HTTPS 加密 → 反代分发到各应用。
> 文中以示例域名 `example.com`（个人作品集站点，含博客、AI 应用、NPM 等十余个子服务）为例。

---

## 一、先看清整条链路

在动手之前，先把"谁负责什么"分清楚。整条链路上有四个互相独立的角色，混淆它们是绝大多数困惑的根源：

```
┌──────────┐   DNS      ┌──────────┐   证书    ┌──────────┐  反代   ┌──────────┐
│  浏览器   │ ────────► │  DNS 解析 │          │  HTTPS   │ ──────► │  真实应用 │
│          │  域名→IP   │ (DNSPod) │  加密    │  (NPM)   │ 转发    │ (Docker) │
└──────────┘           └──────────┘          └──────────┘         └──────────┘
                            ▲                      ▲
                            │                      │
                       负责「指路」            负责「加密」
                     （跟加密毫无关系）      （跟指路毫无关系）
```

| 环节 | 做的事 | 关键产物 |
|---|---|---|
| **DNS 解析** | 把域名翻译成 IP 地址 | A / CNAME / TXT 记录 |
| **SSL 证书** | 让浏览器和服务器之间加密通信 | 证书文件 + 私钥 |
| **反向代理** | 按域名把流量分发到内部不同端口 | NPM 的 Proxy Host |

一句话概括三者关系：**DNS 告诉你家在哪，证书决定进门要不要对暗号，反代负责把客人领到正确的房间。**

---

## 二、第一步：购买云服务器

选型上个人站点一般 2 核 2G / 2 核 4G 起步即可，重点是三件事：

1. **地域**：中国大陆节点速度快，但域名必须完成 **ICP 备案** 才能开放 80/443 端口；境外节点（香港、新加坡、日本）免备案，延迟略高。
2. **带宽**：个人站 3~5 Mbps 足够，图片站建议配合对象存储（COS/OSS）分流。
3. **安全组**：必须放行 `80`、`443`；**不要**放行 `81`（NPM 管理面板）、数据库端口、`2375`（Docker 远程 API）。

> ⚠️ `.cn` 后缀域名在国内注册需**实名认证**，且中国大陆服务器 + 域名对外提供服务需备案。这一步没完成，80/443 会被直接拦截。

装好 Docker 和 Docker Compose 后，后续所有服务都以容器方式部署，互不干扰。

---

## 三、第二步：购买域名

域名在哪买都行，但有一个原则：**推荐在哪家买域名，就用哪家的 DNS 解析**。

原因是后面要讲到的 DNS-01 验证（通配符证书的必经之路）需要调用 DNS 服务商的 API。同一家的账号体系、密钥授权、控制台操作都最顺畅。本文案例里域名在腾讯云，解析用 DNSPod。

---

## 四、第三步：配置 DNS 解析

以 DNSPod「权威解析 / 记录管理」为例，常见记录类型：

| 主机记录 | 类型 | 记录值 | 作用 |
|---|---|---|---|
| `@` | A | 服务器公网 IP | 裸域名 `example.com` 指向服务器 |
| `www` | A | 服务器公网 IP | `www.example.com` 指向服务器 |
| `*` | A | 服务器公网 IP | **泛解析**：任意未单独配置的子域都落到这台服务器 |
| `img` | CNAME | `xxx.cos-website.myqcloud.com` | 静态资源交给对象存储托管 |
| `_dnsauth` | TXT | 验证字符串 | 厂商证书做域名所有权验证时留下 |

### 关于泛解析 `*` 的取舍

泛解析常被安全文章劝退——别人可以拿你的域名做钓鱼子域、被搜索引擎收录垃圾页面拖累主域信誉。

但在**自建多服务**场景下它是加分项：新增子域不用回控制台改记录，反代里加一条规则就立刻生效。本案中有十几个子服务（`1panel`、`albums`、`deerflow`、`nas`……），泛解析省掉了大量重复劳动。

结论：**单站点建议关闭；多子域自建场景可以保留。**

### 源站 IP 暴露问题

A 记录直连意味着任何人 `ping` 一下就能拿到源站 IP，CDN、WAF、高防都能被绕过直接打源。

代价是：**一旦套 CDN，Let's Encrypt 的 HTTP-01 续期会失败**（CDN 会拦截验证请求），届时必须切换到 DNS-01 验证。这是个后面会反复出现的关键约束。

---

## 五、第四步：从 HTTP 到 HTTPS

HTTP 是明文传输，密码、Cookie 在网络上裸奔。HTTPS 就是在 HTTP 外面套一层 TLS 加密。

### 一个必须澄清的误区

**DNS 服务商（DNSPod/腾讯云）本身并不颁发证书。**

腾讯云 SSL 服务是"代你向 CA 申请"，真正的签发方是背后的 TrustAsia、DigiCert 这类 CA。DNSPod 只是解析平台，它在证书流程里的角色是**帮你完成所有权验证**。

### CA 为什么要"验证"

Let's Encrypt 是免费公开的，谁都能来申请。所以它必须防住"跑去给 `google.com` 申请证书"。办法是发证前让你证明域名归你控制——这一步叫 **Challenge（验证挑战）**。

注意区分两个动作：

| 动作 | 谁做 | 类比 |
|---|---|---|
| **颁发证书** | CA（Let's Encrypt / TrustAsia） | 政府部门盖章发证 |
| **验证所有权** | 你配合 CA 完成一道题 | 证明"这个域名是我的" |

---

## 六、两条主路径

```
申请 SSL 证书
├── 路径 A：云厂商证书服务（腾讯云 / 阿里云）
│     特点：单域名免费，通配符昂贵
└── 路径 B：服务器上装 NPM，走 Let's Encrypt
      ├── B1：HTTP-01 验证 —— 单域名，免费，开箱即用
      └── B2：DNS-01 验证 —— 支持通配符，免费，需配 API 密钥
```

---

## 七、路径 A：云厂商的域名 SSL 证书

### 价格梯度

| 类型 | 验证级别 | 价格 |
|---|---|---|
| 单域名 DV | 只验域名所有权 | **免费** |
| 通配符 OV | 审营业执照等组织资质 | 数千元/年 |
| 通配符 EV | 严格审核组织 | 更贵 |

### 为什么通配符要收这么多钱

商业 CA 对通配符强制要求提升到 **OV（组织验证）** 级别：

- 提交营业执照、组织机构代码
- 人工审核 + 可能电话回访
- 签发后带 **赔付保险**（证书被冒签导致损失，CA 赔钱）
- 7×24 人工技术支持
- 有效期 1 年，可续期

**你掏钱买的是"人工审核 + 保险 + 售后"，不是那串加密密钥。** 加密强度上，免费的 DV 证书和商业 OV 证书完全一样，浏览器都显示同一把小锁。

### 验证方式：DNS-01

腾讯云证书用 DNS 验证，会在解析里留下一条 TXT 记录：

```
_dnsauth  TXT  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 这条路径的局限

- **通配符贵**，个人站点不划算
- **需手动下载部署**，到期不会自动续（免费证书一般不可续期，只能重新申请）
- 到期前会持续收到短信/邮件提醒

本案中的实际状态：这张证书 2026-08-25 到期，状态为**「未使用」**，从未真正参与加密。它属于闲置资产。

---

## 八、路径 B：NPM + Let's Encrypt（推荐）

### NPM 是什么

Nginx Proxy Manager，一个带 Web 界面的 Nginx 反向代理管理器，Docker 一键部署。核心价值：**不用手写 nginx.conf，点几下就能给每个子域配上 HTTPS 并自动续期。**

默认占用端口：

| 端口 | 用途 | 是否应对公网 |
|---|---|---|
| 80 | HTTP 流量 + HTTP-01 验证 | ✅ 必须开放 |
| 443 | HTTPS 流量 | ✅ 必须开放 |
| 81 | NPM 管理后台 | ❌ 建议仅内网/VPN 访问 |

### Let's Encrypt 的定位

非营利机构 ISRG 运营，背后赞助方包括 Mozilla、Google、Meta、思科。立场明确：**加密应该免费、人人可得**。

> **Let's Encrypt 所有证书都免费，通配符也免费，不设等级。**

它做不到的是"人工审营业执照"——因为压根没有人工环节，全靠 ACME 协议自动化。所以它只发 DV 级，有效期也只有 90 天。

### 两种验证方式对比

#### B1：HTTP-01（NPM 默认，开箱即用）

> Let's Encrypt："我给你一串随机字符，你去 `http://你的域名/.well-known/acme-challenge/xxx` 放好，我来访问一次，读到了就算你赢。"

NPM 自动放文件，Let's Encrypt 自动来取，全程无人参与。

- ✅ 零配置，选好域名直接申请
- ✅ 不需要任何 API 密钥
- ❌ **不支持通配符**
- ⚠️ **80 端口必须长期对公网开放**，否则续期失败

#### B2：DNS-01（通配符唯一路径）

> Let's Encrypt："我给你一串随机字符，你去 DNS 加一条 TXT `_acme-challenge.你的域名 = 这串字符`，我查一次，查到了就算你赢。"

### 为什么通配符只能用 DNS-01

关键在于：你要签的是 `*.example.com`——**星号是占位符，不是真实地址**。

Let's Encrypt 想做 HTTP-01 验证，得知道访问哪个网址。可 `http://*.example.com/.well-known/...` 根本不存在，它不知道该敲哪扇门。**通配符是"概念"而非可访问的主机**，HTTP-01 物理上做不到。

而 DNS 不同：只要你在 `_acme-challenge.example.com` 加对了值，就等于证明 **你控制着整个 example.com 的 DNS**——DNS 都归你管，那所有子域自然也归你。CA 就敢签通配证书。

> **HTTP-01 证明"我住这间房"，DNS-01 证明"这整栋楼的户口本在我手上"。要拿覆盖全楼的通行证，只能用户口本。**

### 填 API 密钥是在干什么

DNS-01 有个麻烦：证书 90 天就过期，每 90 天手动加一次 TXT 就失去"自动续期"的意义。

解决办法是给 NPM 一把钥匙：

```
NPM 容器 ──(API Token)──► DNSPod API
                              ↓
                  自动添加/删除 _acme-challenge TXT
                              ↓
              Let's Encrypt 查 DNS → 通过 → 发证
```

**这把钥匙只授权操作 DNS 记录，不涉及证书颁发。** DNSPod 从头到尾没参与发证，只是被临时写了一条 TXT 又被删掉。证书仍是 Let's Encrypt 签的，仍躺在 NPM 容器里。

### 三种方案横向对比

| | 腾讯云单域名 | 腾讯云通配符 | Let's Encrypt (NPM) |
|---|---|---|---|
| 价格 | 免费 | **数千元/年** | **全免费（含通配符）** |
| 验证级别 | DV | OV（审执照） | DV |
| 有效期 | 1 年 | 1 年 | 90 天，自动续 |
| 通配符 | ❌ | ✅ | ✅ |
| 赔付保险 | 无 | 有 | 无 |
| 人工支持 | 有 | 有 | 无（社区） |
| 加密强度 | 相同 | 相同 | 相同 |

### 什么时候才值得买商业通配符

- 公司商用、需 OV 级别做合规背书
- 客户/合作方要求证书里显示组织名称
- 需要赔付保险和人工支持兜底
- 有老设备不信任 Let's Encrypt 根证书（极少见）

个人站点、自建服务、内部面板 → **Let's Encrypt 更合适**。

---

## 九、通配符证书的盲区（重要）

`*.example.com` 的星号**只匹配一层子域**：

```
✅ 1panel.example.com     子域，被覆盖
✅ img.example.com        子域，被覆盖
❌ example.com            裸域，不在覆盖范围内
❌ a.b.example.com        两级子域，不匹配
```

**解决方案**：申请时把两个都填进同一张证书（SAN 字段），Let's Encrypt 免费额度不变：

```
example.com
*.example.com
```

另外注意：**通配对证书跟域名严格绑定**，`example.com` 和 `example.org` 是两个独立注册域，证书互不通用。

---

## 十、NPM 的流量转发机制

### 拓扑结构

```
互联网
   │  443 / 80
   ▼
┌─────────────────────────────┐
│  宿主机                      │
│  ┌───────────────────────┐  │
│  │ NPM 容器              │  │
│  │ 解密 HTTPS，按域名路由 │  │
│  └──────────┬────────────┘  │
│             │ 172.17.0.1    │
│             ▼ docker0 网桥  │
│  ┌───────────────────────┐  │
│  │ 1panel  albums  nas... │  │
│  │ 各应用监听不同端口      │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### 为什么是 `172.17.0.1`

这是 Docker 默认网桥 `docker0` 的网关 IP，**从容器视角看就是宿主机**。

在 NPM 里填 `http://172.17.0.1:端口` 是标准写法——比填公网 IP 更好，因为**流量不出网卡**，性能更高且不消耗公网带宽。

后端走 `http://` 明文也没问题：这段只在宿主机内部回环，加密只需要在"浏览器 ↔ NPM"这一段做就够了。

> ⚠️ 前提：宿主机上的服务要监听 `0.0.0.0` 或 `172.17.0.1`，**不能只监听 `127.0.0.1`**，否则 NPM 连不上。

### NPM 的职责

1. 终结 TLS（443 解密）
2. 按 Host 头部路由到不同后端
3. 强制 HTTP 跳转 HTTPS
4. 挂载证书、配置 Access List
5. 自动续期所有证书

---

## 十一、完整操作流程清单

### 阶段 1：基础

- [ ] 购买云服务器，安全组放行 80/443
- [ ] 购买域名，完成实名认证
- [ ] （国内服务器）完成 ICP 备案
- [ ] 配置 DNS：`@`、`www`、`*` 三条 A 记录指向服务器 IP

### 阶段 2：部署 NPM

```bash
mkdir -p npm/{data,letsencrypt} && cd npm

cat > docker-compose.yml <<'EOF'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: always
    ports:
      - '80:80'
      - '443:443'
      - '81:81'      # 管理后台，建议仅内网访问
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
EOF

docker compose up -d
```

### 阶段 3：申请证书

**子域证书（HTTP-01，推荐先用这个）**

1. SSL Certificates → Add SSL Certificate → Let's Encrypt
2. 填域名：`example.com`
3. **不勾** DNS Challenge
4. 同意条款 + 填邮箱 → 保存

**通配符证书（DNS-01）**

1. 获取腾讯云 API 密钥（见下节）
2. Add SSL Certificate → 勾选 DNS Challenge
3. DNS Provider 选 **Tencent Cloud**
4. 凭据框填：

```ini
dns_tencentcloud_secret_id = AKIDxxxxxxxxxxxxxxxxxxxx
dns_tencentcloud_secret_key = xxxxxxxxxxxxxxxxxxxxxxxx
```

5. Propagation Seconds 填 **60**（保守 120）
6. 域名填两行：`example.com` 和 `*.example.com`

### 阶段 4：配置反向代理

Hosts → Add Proxy Host：

| 字段 | 值 |
|---|---|
| Domain Names | `1panel.example.com` |
| Scheme | `http` |
| Forward Hostname | `172.17.0.1` |
| Forward Port | 应用端口 |
| SSL | 选中刚才申请的证书 |
| Force SSL | ✅ 开启 |

---

## 十二、获取腾讯云 API 密钥

**地址：https://console.cloud.tencent.com/cam/capi**

> 不推荐用主账号密钥——它等同于整个腾讯云账号的登录密码，能开机器、删存储桶、动数据库。而 NPM 会把凭据**明文写进容器文件**。

### 正确做法：建专用子账号

1. 打开 https://console.cloud.tencent.com/cam → 用户 → 新建用户 → 自定义创建
2. 访问方式勾 **「编程访问」**（不要勾控制台登录）
3. 权限策略搜索勾选 **`QcloudDNSPodFullAccess`**——只给这一个
4. 进入用户详情 → API 密钥 → 新建密钥

### 最小权限策略（可选，更精细）

```json
{
  "statement": [{
    "action": [
      "dnspod:DescribeRecordList",
      "dnspod:DescribeRecordFilterList",
      "dnspod:CreateRecord",
      "dnspod:DeleteRecord"
    ],
    "effect": "allow",
    "resource": ["*"]
  }],
  "version": "2.0"
}
```

### 两个关键提醒

- **SecretId** 以 `AKID` 开头，相当于用户名
- **SecretKey 只在创建弹窗显示这一次**，关掉永远查不到（自 2023-11-30 起腾讯云关闭了查询功能）。务必当场复制或点「下载 CSV」

### 别填错格式

| Provider | 凭据格式 | 获取地址 |
|---|---|---|
| **Tencent Cloud**（推荐） | `dns_tencentcloud_secret_id` / `_secret_key` | console.cloud.tencent.com/cam/capi |
| **DNSPod**（旧版插件） | `dns_dnspod_api_token = "ID,Token"` | console.dnspod.cn/account/token |

两者**不是一回事**，混用必失败。

---

## 十三、实战踩坑记录

以下均来自本次真实操作过程。

### 坑 1：Internal Error —— 插件装不上

NPM 的机制是：**选定 DNS Provider 后，提交时临时用 pip 安装对应 certbot 插件**（这里是 `certbot-dns-tencentcloud`）。国内服务器上这步经常出问题：

| 现象 | 原因 |
|---|---|
| `Read timed out` / `Could not find a version` | 容器连不上 pypi.org |
| `ModuleNotFoundError: No module named 'zope'` | 缺 zope 依赖 |
| 插件装进 venv 但系统 certbot 找不到 | pip 软链接缺失 |

**排查命令**：

```bash
docker ps | grep -i npm
docker logs --tail 200 <容器名> 2>&1 | grep -iE "pip|tencentcloud|zope|error|timed out"
```

**修法**：

```bash
docker exec -it <容器名> bash

# 用清华源，避免连不上 pypi
pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
  zope zope.interface certbot-dns-tencentcloud

certbot plugins        # 能看到 dns-tencentcloud 即成功
exit
```

若 `certbot plugins` 里看不到，补软链接：

```bash
ln -sf /usr/bin/pip /opt/certbot/bin/pip
# 重装一次 certbot-dns-tencentcloud
docker restart <容器名>
```

### 坑 2：别为单域名硬上 DNS-01

**裸域 `example.com` 是单域名，不是通配符——它完全不需要 DNS-01。**

`example.com` 是能真实访问的网址，走 HTTP-01 即可。这样不用装插件、不用填密钥、不用管 pip 和 zope。

推荐组合：

```
*.example.com  → DNS-01（通配符，必须）
example.com    → HTTP-01（单域名，走简单路径）
```

### 坑 3：传播时间填太短

10 秒不够，DNSPod 生效虽快但有缓冲。填 **60**（保守 120），否则会出现"TXT 还没同步就查询"导致的失败。

### 坑 4：`_dnsauth` 残留记录

用腾讯云证书服务留下的验证 TXT。既然走 NPM 就**删掉完全没影响**，留着也无害（只是公开可见的验证串，不含密钥）。

### 坑 5：已过期的自定义证书

NPM 证书列表里若出现「Custom」来源、状态红色「未使用」的证书（本案那张 2026-08-25 到期的），说明它是手动上传的厂商证书且从未被引用。**直接删除**，腾讯云控制台里那张也一并清理，免得持续收到到期提醒。

### 坑 6：Let's Encrypt 速率限制

**每个注册域名每周最多 50 张证书**（即 `example.com` 下所有子域加起来）。

正常用碰不到，但**重装 NPM 容器或误删 `/etc/letsencrypt` 会导致全部重签**，撞线后锁 1 小时到 1 周。

对策：
1. **备份 NPM 数据卷**
2. 子域超过 20 个时改用通配符，续期请求从 20 次降到 1 次

### 坑 7：80 端口必须长期开放

HTTP-01 续期时 Let's Encrypt 要访问 `http://域名:80`。所以：

- 防火墙不能封 80
- 不要让 CDN 全接管 80 做强制跳转（会让挑战请求拿不到源站文件）
- NPM 的 Force SSL 要开，但别把 80 整个关掉

很多人证书到期才发现续期失败，根因就在这里。

---

## 十四、安全加固

### 1Panel 不要裸奔

服务器运维面板（能管 Docker、文件、数据库、定时任务）如果 Access 是 `Public`，公网无门槛可访问风险极高。

建议三选一：

1. NPM → **Access Lists** 建规则，加用户名密码认证后挂到 `1panel`
2. 限制来源 IP（只允许自己的出口 IP）
3. 面板根本不映射公网端口，走 SSH 隧道或 VPN 访问

顺手检查 **NPM 自身管理界面（81 端口）** 有没有暴露在公网。

### 其他建议

- **CAA 记录**：限定只允许指定 CA 给你的域名签发证书，防止被冒签
- **MX + SPF/DKIM/DMARC**：用域名邮箱发信必需，缺 SPF 会被大量判为垃圾邮件
- 免费版 DNSPod 不支持 DNSSEC，有劫持防护需求需升级套餐

---

## 十五、验收与运维

### 验证命令速查

```bash
# 看子域名用的是哪张证书
echo | openssl s_client -connect 1panel.example.com:443 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
# issuer 应为 R10/R11（Let's Encrypt），subject 应为 *.example.com

# 看裸域有没有证书覆盖
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates

# 解析是否生效
dig example.com A +short
dig www.example.com A +short
dig img.example.com CNAME +short

# 验证泛解析是否已关闭（正常应为空）
nslookup 随便一个子域.example.com

# 确认 DNS-01 的临时 TXT 已被清理（正常应为空）
dig _acme-challenge.example.com TXT +short
```

修改 DNS 后约一个 TTL 周期全球生效。本地仍是旧值就清缓存：

```bash
ipconfig /flushdns              # Windows
sudo dscacheutil -flushcache    # macOS
```

### 备份 NPM 数据卷（最高优先级）

整站 HTTPS 全靠证书 + API Token，数据卷丢了就得全部重签——那才是真正会撞 50 张/周限额的场景。

```bash
docker inspect npm | grep -A5 Mounts    # 找 Source 路径

# 打包 data 和 letsencrypt 两个目录
tar czf npm-backup-$(date +%F).tar.gz /path/to/data /path/to/letsencrypt
```

### 定期检查项

| 频率 | 检查内容 |
|---|---|
| 每月 | NPM 证书列表是否全绿 |
| 每次改 DNS 后 | `dig` 验证生效 |
| 每季度 | 确认 80 端口仍对公网开放（续期依赖） |
| 更换密钥后 | 及时删除旧密钥 |

---

## 十六、决策速查表

| 你的情况 | 推荐方案 |
|---|---|
| 只有 1~2 个域名，80 端口可开放 | Let's Encrypt + HTTP-01，零配置 |
| 十几个子域 | Let's Encrypt + DNS-01 通配符 |
| 想套 CDN / 高防 | 必须 DNS-01（CDN 会拦 HTTP-01） |
| 公司商用，需 OV 背书 | 买商业通配符证书 |
| 内部服务，不对外 | 可考虑自签证书或内网 CA |

### 最终推荐架构

```
DNS（DNSPod）
  @ / www / *  →  A记录 → 服务器公网IP
  （可选）img   → CNAME → 对象存储

服务器
  NPM（Docker，80/443/81）
    ├─ *.example.com  →  Let's Encrypt 通配证书（DNS-01 + 腾讯云 API）
    ├─ example.com    →  Let's Encrypt 单域证书（HTTP-01）
    └─ Proxy Hosts  →  172.17.0.1:各端口 → 内部应用

安全
  1Panel 等管理面板加 Access List 或限 IP
  81 端口不对公网开放
```

---

## 附录：核心概念一图流

```
CA（发证方）
├── 商业 CA（TrustAsia / DigiCert）── 腾讯云代售
│     单域名 DV：免费
│     通配符 OV：数千元/年（人工审核 + 保险）
└── Let's Encrypt（非营利）
      全部免费，含通配符
      只有 DV 级，90 天有效期

验证方式（证明域名归你）
├── HTTP-01  访问 http://域名/.well-known/... 取文件
│     需 80 端口开放；不支持通配符
└── DNS-01   加一条 _acme-challenge TXT 记录
      需 DNS API 密钥；支持通配符
```

**记住三句话就够了：**

1. DNS 负责指路，证书负责加密，两者完全独立。
2. 通配符只能走 DNS-01，因为 `*.xxx` 不是一个能访问的地址。
3. 免费的 Let's Encrypt 通配符和商业证书加密强度一样——你花钱买的是审核、保险和服务，不是加密本身。
