# VitePress 使用指南

## 什么是 VitePress

VitePress 是基于 Vite 和 Vue 的静态站点生成器，是 VuePress 的精神继任者。它将 Markdown 文件编译为高性能的静态 HTML 页面，适合构建文档站点、个人博客和技术博客。

核心优势：

- **极速** — 基于 Vite 的即时热更新，毫秒级响应
- **简洁** — 纯 Markdown 编写内容，无需关心构建细节
- **强大** — 内置 Vue 支持，可以在 Markdown 中直接使用 Vue 组件
- **美观** — 开箱即用的默认主题，响应式设计

---

## 快速开始

### 1. 初始化项目

```sh
mkdir flight-journal && cd flight-journal
npm init -y
```

### 2. 安装 VitePress

```sh
npm add -D vitepress
```

### 3. 创建目录结构

```sh
mkdir -p docs/.vitepress
mkdir -p docs/public
```

### 4. 添加 npm 脚本

在 `package.json` 中添加：

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

### 5. 创建首页

创建 `docs/index.md`：

```md
---
layout: home

hero:
  name: 我的博客
  text: 基于 VitePress 的静态站点
  tagline: 简洁、快速、优雅
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
---

## 欢迎使用

这是使用 VitePress 搭建的博客站点。
```

### 6. 启动开发服务器

```sh
npm run docs:dev
```

浏览器访问终端输出的地址（默认 `http://localhost:5173`），即可看到站点。

---

## 项目结构

一个典型的 VitePress 项目结构如下：

```
flight-journal/
├── docs/                        # 站点根目录
│   ├── .vitepress/              # VitePress 配置与缓存（核心目录）
│   │   ├── config.mts           # 站点配置文件
│   │   ├── cache/               # 开发缓存（自动生成，无需关注）
│   │   └── dist/                # 构建产物输出目录
│   ├── public/                  # 静态资源（图片、图标等，原样复制到输出）
│   ├── guide/                   # 路由 /guide/
│   │   ├── getting-started.md   # → /guide/getting-started.html
│   │   └── vitepress-guide.md   # → /guide/vitepress-guide.html
│   └── index.md                 # 首页 → /index.html
├── .gitignore
├── package.json
└── node_modules/
```

### 关键目录说明

| 目录/文件 | 作用 |
|---|---|
| `docs/` | 站点源文件根目录，所有 `.md` 文件都在此目录下 |
| `docs/.vitepress/` | 配置与构建相关文件，VitePress 专属目录 |
| `docs/.vitepress/config.mts` | 站点配置文件，定义导航、侧边栏、标题等 |
| `docs/.vitepress/dist/` | `docs:build` 的输出目录，部署时上传此目录 |
| `docs/.vitepress/cache/` | 开发服务器缓存，应加入 `.gitignore` |
| `docs/public/` | 静态资源目录，文件会被原样复制到输出目录 |

### 文件路由规则

VitePress 使用**基于文件的路由**，`docs/` 下的目录结构直接映射为 URL 路径：

```
docs/index.md                → /
docs/guide/getting-started.md → /guide/getting-started
docs/about.md                → /about
```

---

## 配置文件详解

配置文件位于 `docs/.vitepress/config.mts`（也支持 `.js`、`.ts`、`.mjs`）：

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  // ---- 站点级配置 ----
  lang: 'zh-CN',                   // 站点语言
  title: '我的博客',                // 浏览器标签页标题
  description: '基于 VitePress',    // 站点描述（SEO）
  base: '/',                        // 部署基础路径，GitHub Pages 需设为 /repo-name/
  head: [],                         // 额外 <head> 标签

  // ---- 主题配置 ----
  themeConfig: {
    logo: '/logo.svg',              // 导航栏 Logo
    siteTitle: '博客',              // 导航栏标题（默认使用 title）

    // 导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: '关于', link: '/about' },
    ],

    // 侧边栏（按路径分组）
    sidebar: {
      '/guide/': [
        {
          text: '基础',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '配置', link: '/guide/configuration' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '部署', link: '/guide/deployment' },
          ],
        },
      ],
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/your-repo' },
    ],

    // 页脚
    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2024',
    },

    // 搜索（内置本地搜索）
    search: {
      provider: 'local',
    },
  },
})
```

---

## Frontmatter

每个 Markdown 文件可以通过 frontmatter 配置页面行为。Frontmatter 是文件开头的 `---` 之间的 YAML 块：

```md
---
title: 自定义页面标题
layout: doc                   # doc | home | page
navbar: true                  # 是否显示导航栏
sidebar: true                 # 是否显示侧边栏
aside: true                   # 是否显示右侧大纲
outline: [2, 4]               # 大纲标题层级范围
lastUpdated: true             # 显示最后更新时间
---
```

### 三种布局

| 布局 | 用途 | 特点 |
|---|---|---|
| `doc` | 文档页面（默认） | 带侧边栏、导航栏、右侧大纲 |
| `home` | 首页 | 使用 `hero` + `features` 组件，无侧边栏 |
| `page` | 简单页面 | 无侧边栏，类似独立页面 |

---

## Markdown 扩展

VitePress 在标准 Markdown 基础上提供了丰富的扩展能力。

### GitHub 风格表格

```md
| 属性 | 类型 | 说明 |
|---|---|---|
| name | string | 名称 |
| age | number | 年龄 |
```

### Emoji

```md
:smile: :rocket: :check_mark:
```

### 目录

```md
[[toc]]
```

### 代码块语法高亮

VitePress 使用 Shiki 进行代码高亮，支持行高亮：

```md
```js{2,4-6}
function foo() {
  return 'bar'      // 高亮
}
// 高亮区域
// 高亮区域
// 高亮区域
```
```

### 代码组

在多个文件/语言间切换：

```md
::: code-group

```bash
npm install vitepress
```

```bash
yarn add vitepress
```

```bash
pnpm add -D vitepress
```

:::
```

### 自定义容器

```md
::: info
信息提示
:::

::: tip
小贴士
:::

::: warning
注意事项
:::

::: danger
危险警告
:::

::: details 点击展开
折叠内容
:::
```

自定义标题：

```md
::: danger 停止
危险操作，请勿继续
:::
```

### 在 Markdown 中使用 Vue

可以直接在 Markdown 中使用 Vue 语法：

```md
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

当前计数：{{ count }}

<button @click="count++">+1</button>
```

---

## 静态资源处理

### 引用图片

放在 `docs/public/` 下的资源使用绝对路径引用：

```md
![Logo](/logo.png)
```

与 Markdown 文件同目录的图片使用相对路径：

```md
![截图](./screenshot.png)
```

### 在 Frontmatter 中引用资源

```md
---
hero:
  image:
    src: /hero.png
    alt: Hero Image
---
```

---

## 开发流程

### 日常开发

```sh
# 1. 启动开发服务器
npm run docs:dev

# 2. 编辑 docs/ 下的 Markdown 文件，浏览器自动热更新
# 3. 新增页面只需创建 .md 文件，路由自动生成
```

### 构建与预览

```sh
# 构建
npm run docs:build

# 预览构建结果（模拟生产环境）
npm run docs:preview
```

### 添加新页面的流程

1. 在 `docs/` 下创建 `.md` 文件
2. 在 `config.mts` 中添加导航栏和侧边栏配置（可选）
3. 开发服务器自动识别新文件，刷新即可访问

---

## 部署

构建产物在 `docs/.vitepress/dist` 目录下，可部署到任何静态托管平台。

### GitHub Pages

在仓库中创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy VitePress site to Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run docs:build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

如果站点部署在 `https://<username>.github.io/<repo-name>/`，需在 `config.mts` 中设置 `base`：

```ts
export default defineConfig({
  base: '/<repo-name>/',
})
```

### Netlify / Vercel / Cloudflare Pages

| 配置项 | 值 |
|---|---|
| 构建命令 | `npm run docs:build` |
| 输出目录 | `docs/.vitepress/dist` |
| Node 版本 | >= 20 |

---

## 常见问题

### 端口被占用

VitePress 会自动尝试下一个可用端口。也可以手动指定：

```sh
npx vitepress dev docs --port 8080
```

### 页面 404

检查 `.md` 文件路径是否与 URL 匹配，注意文件名大小写。

### 构建报错

确保所有 Markdown 文件的 frontmatter 格式正确，YAML 语法无误。

### 搜索不生效

确认 `themeConfig.search.provider` 已配置为 `'local'`，开发服务器需要重启。
