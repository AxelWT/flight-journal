---
title: HTMX：让 HTML 重新成为 Web 开发的主角
date: 2026-05-21
description: HTMX——一个 14KB 的脚本如何让 HTML 重新成为 Web 开发的主角，拒绝"杀鸡用牛刀"的前端工程化。
tags:
  - 技术
  - 前端
  - 架构
---

# HTMX：让 HTML 重新成为 Web 开发的主角

## 一、技术背景：前端越来越重，开发者越来越累

在 Web 开发的世界里，有一个不得不面对的现实：现代前端框架越来越复杂了。

2010 年代，开发者用 jQuery 就能搞定几乎所有交互需求——写几行 JavaScript，操作一下网页元素，简单直接。随着 Web 应用规模越来越大，jQuery 的"直接操作 DOM"模式开始显得力不从心：代码越写越多，维护成本越来越高，不同开发者的代码风格差异巨大。

于是 React、Vue、Angular 这类"现代前端框架"应运而生。它们带来了组件化、虚拟 DOM、单向数据流等新思想，让大型 Web 应用的开发和维护变得有序。但代价是什么呢？

一个典型的 React 项目：
- 需要配置 Webpack/Babel 等构建工具
- 要学习 JSX 语法、Hooks、状态管理、路由……
- npm 安装几十个依赖包，总体积动辄几百 KB
- 前端和后端团队需要专门对接 API，设计数据结构

结果是：很多中小型团队被这些"先进"工具折磨得苦不堪言。尤其是后端开发者，他们本来只需要一个能展示数据、处理表单的简单网页，却被迫去学一套完整的前端工程化体系。

HTMX 就是在这样的背景下诞生的——它的发明者 Carson Gross（Big Sky Software）认为：Web 的本质是超文本（HyperText），为什么我们不能让 HTML 本身就更强大一点呢？

## 二、解决什么问题：拒绝"杀鸡用牛刀"

HTMX 直指三个核心痛点：

### 1. 学习成本过高

做一个"点击按钮加载数据"的简单功能：

- **用 React**：需要理解组件、useState、useEffect、fetch API……
- **用 HTMX**：只需要加几个 HTML 属性

```html
<button hx-get="/api/data" hx-target="#result">加载数据</button>
<div id="result"></div>
```

### 2. 前端工程化过重

React 项目光是搭建开发环境、配置构建流程就让很多人头疼。而 HTMX 呢？一个 **14KB** 的脚本文件，引入就完事，不需要任何构建步骤，不需要 npm install，不需要 package.json。

### 3. 前后端割裂

传统 SPA（单页应用）模式下，后端只返回 JSON，前端负责渲染。这意味着：
- 后端开发者不关心页面长什么样
- 前端开发者不关心数据怎么来的
- 两边要花大量时间对齐 API 接口

HTMX 的核心理念是**"后端重新成为真相来源"**——后端直接返回 HTML 片段，前端只负责把这段 HTML 嵌进去显示。后端开发者用自己熟悉的语言和模板系统，就能做出带交互的动态网页。

## 三、具体实现：用 HTML 属性做现代交互

HTMX 的工作原理可以用一句话概括：**通过在普通 HTML 标签上加特殊属性，告诉浏览器"这里需要动态交互"。**

### 1. 发送请求：像写表单一样简单

传统写 AJAX 请求需要 JavaScript fetch 或 axios，HTMX 只需要在属性里指定：

```html
<!-- HTMX -->
<button hx-get="/api/users">加载用户</button>
```

`hx-get`、`hx-post`、`hx-put`、`hx-delete`——这些属性直接对应 HTTP 方法，不需要任何 JS 代码。

### 2. 指定目标：把响应放到哪里

```html
<button hx-get="/api/users" hx-target="#user-list">
  获取用户列表
</button>
<div id="user-list"></div>
```

点击按钮后，服务器返回的 HTML 内容会自动插入到 `#user-list` 中。

### 3. 触发方式：谁来触发这个请求

```html
<!-- 默认：点击触发 -->
<button hx-get="/search" hx-trigger="click">搜索</button>

<!-- 更智能：输入变化时触发 -->
<input name="query" hx-get="/search" hx-trigger="keyup changed delay:500ms">

<!-- 进入视野时触发（懒加载） -->
<div hx-get="/more" hx-trigger="revealed">加载更多...</div>
```

### 4. 交换策略：怎么把新内容放进去

```html
<button hx-delete="/item/1" hx-swap="delete">删除</button>
```

可选的交换方式包括：
- `innerHTML`：替换内部内容（默认）
- `outerHTML`：替换整个元素
- `beforebegin`：插入到元素之前
- `afterend`：插入到元素之后
- `delete`：删除该元素
- `none`：不交换（用于触发服务端事件）

### 5. 进阶能力：WebSocket 和 SSE

HTMX 还能处理实时通信：

```html
<!-- 连接 WebSocket -->
<div hx-ws="connect:/ws/chat">
  聊天内容...
</div>

<!-- 服务端推送（SSE） -->
<div hx-sse="connect:/events" hx-swap="beforeend">
  实时通知将出现在这里...
</div>
```

## 四、适用场景：不是万能药，但很对症

HTMX 不是要取代 React，它有明确的适用边界：

| 适合用 HTMX | 不适合用 HTMX |
|------------|--------------|
| 内容展示型网站（博客、文档） | 复杂状态管理（在线编辑器） |
| 后端主导的 CRUD 后台系统 | 实时协作工具（如 Figma、Notion） |
| 简单交互（表单、搜索、点赞） | 需要大量客户端计算的应用 |
| 快速 MVP 开发 | 跨平台移动端开发（React Native） |

## 五、HTMX 生态

| 项目 | 说明 |
|------|------|
| **hyperscript** | 同作者开发的轻量脚本语言，补充 HTMX 的客户端逻辑 |
| **Alpine.js** | 常与 HTMX 搭配的轻量 JS 框架，处理 HTMX 力所不及的客户端状态 |
| **hypermedia.dev** | HTMX 的官方指导站点 |
| **htmx.org** | 官方文档与示例 |

## 六、行业反响与趋势

HTMX 在 2023-2026 年间获得了越来越多的关注，尤其在 Python/Django、Ruby on Rails、Go 等"后端主导"的开发者社区中备受推崇。它代表的是一种"反潮流的理性"——当整个行业都在追逐更复杂的前端框架时，HTMX 提醒人们：**Web 的根基是超文本，HTML 本身就是一个功能完备的应用平台。**

这也反映了 2026 年 Web 开发的一个趋势：从"框架崇拜"回归"问题导向"——选工具不是选最炫的，而是选最合适的。

## 七、一句话总结

> **HTMX 的哲学是"返璞归真"——它不追求最新的前端范式，而是把 HTML 本身的能力发挥到极致。对于那些被 React 全家桶压得喘不过气的团队来说，HTMX 就像一阵清风：不用学那么多，不用装那么多依赖，用熟悉的方式就能做出现代化的交互。**

## 八、参考资料

- **HTMX 官网**：https://htmx.org/
- **hyperscript 官网**：https://hyperscript.org/
- **hypermedia.dev（HTMX 核心思想）**：https://hypermedia.dev/
- **Carson Gross（HTMX 作者）GitHub**：https://github.com/bigskysoftware/htmx
- **Wikipedia - HTMX**：https://en.wikipedia.org/wiki/HTMX
- **Hacker News - HTMX 讨论（2023-2026）**：https://news.ycombinator.com/
