# 博客写作与部署教程

本教程将按顺序介绍从创建文章到线上发布的完整流程。

---

## 第一步：创建文章

VitePress 使用 Markdown 文件作为文章源文件，放在 `docs/` 目录下。

### 1.1 新建 Markdown 文件

在 `docs/` 下创建 `.md` 文件，文件路径即为访问路径：

```sh
# 创建一篇随笔（访问地址 /notes/my-first-post）
touch docs/notes/my-first-post.md
```

路径与 URL 的映射关系：

| 文件路径 | 访问地址 |
|---|---|
| `docs/index.md` | `/` |
| `docs/notes/my-first-post.md` | `/notes/my-first-post` |
| `docs/guide/workflow.md` | `/guide/workflow` |

### 1.2 编写 Frontmatter

文件开头用 `---` 包裹的 YAML 块是 frontmatter，用于配置当前页面：

```md
---
title: 我的第一篇博客
layout: doc
sidebar: true
---

# 我的第一篇博客

正文内容从这里开始...
```

常用 frontmatter 选项：

| 选项 | 默认值 | 说明 |
|---|---|---|
| `title` | 文件名 | 页面标题，显示在标签页和大纲 |
| `layout` | `doc` | 页面布局：`doc`（文档）、`home`（首页）、`page`（简洁页） |
| `sidebar` | `true` | 是否显示侧边栏 |
| `navbar` | `true` | 是否显示顶部导航栏 |
| `outline` | `[2,3]` | 右侧大纲标题层级，如 `[2,4]` 或 `deep` |
| `lastUpdated` | `false` | 是否显示最后更新时间 |

### 1.3 使用 Markdown 写作

VitePress 支持标准 Markdown 语法，以及一些实用扩展：

**代码块（支持语法高亮）**

````md
```js
console.log('Hello VitePress!')
```
````

**代码块行高亮**

```md
```js{2,4-5}
function greet() {
  const msg = 'Hello'   // 高亮
  console.log(msg)
  console.log('VitePress')  // 高亮
  console.log('!')          // 高亮
}
```
```

**自定义容器**

```md
::: tip 提示
这是一条有用的提示信息。
:::

::: warning 注意
请注意这个重要事项。
:::

::: details 点击展开
折叠的详细内容写在这里。
:::
```

**插入图片**

将图片放到 `docs/public/` 目录，使用绝对路径引用：

```md
![图片描述](/my-image.png)
```

或者放在 Markdown 文件同目录，使用相对路径：

```md
![截图](./screenshot.png)
```

### 1.4 在 Markdown 中使用 Vue 组件

VitePress 支持 Vue 语法，可以在 Markdown 中直接使用：

```md
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

当前计数：{{ count }}

<button @click="count++">点击 +1</button>
```

---

## 第二步：将文章加入导航

创建文件后，页面已有对应路由，但侧边栏和导航栏不会自动显示。需要在配置文件中手动添加。

### 2.1 添加侧边栏

编辑 `docs/.vitepress/config.mts`，在 `sidebar` 中添加：

```ts
sidebar: {
  '/guide/': [
    {
      text: '指南',
      items: [
        { text: '快速开始', link: '/guide/getting-started' },
        { text: '使用指南', link: '/guide/vitepress-guide' },
        { text: '写作与部署', link: '/guide/workflow' },
      ],
    },
  ],
  '/notes/': [
    {
      text: '随笔',
      items: [
        { text: '第一篇文章', link: '/notes/my-first-post' },
      ],
    },
  ],
},
```

### 2.2 添加导航栏

在 `nav` 中添加新分组：

```ts
nav: [
  { text: '首页', link: '/' },
  { text: '指南', link: '/guide/getting-started' },
  { text: '随笔', link: '/notes/my-first-post' },
],
```

多个链接可以用下拉菜单分组：

```ts
nav: [
  { text: '首页', link: '/' },
  {
    text: '指南',
    items: [
      { text: '快速开始', link: '/guide/getting-started' },
      { text: '写作与部署', link: '/guide/workflow' },
    ],
  },
],
```

---

## 第三步：本地预览

推送到 GitHub 之前，先在本地确认效果。

### 3.1 启动开发服务器

```sh
npm run docs:dev
```

终端输出访问地址，默认 `http://localhost:5173`。修改 Markdown 文件后浏览器自动刷新。

### 3.2 预览构建结果

开发服务器的效果与生产环境可能有细微差异。构建并预览可以模拟真实部署：

```sh
npm run docs:build
npm run docs:preview
```

`docs:build` 生成静态文件到 `docs/.vitepress/dist/`，`docs:preview` 在 `http://localhost:4173` 启动一个本地静态服务器 serving 产物。

### 3.3 常用开发命令一览

| 命令 | 用途 |
|---|---|
| `npm run docs:dev` | 启动开发服务器（支持热更新） |
| `npm run docs:build` | 构建静态文件 |
| `npm run docs:preview` | 预览构建结果（模拟生产环境） |

---

## 第四步：推送到 GitHub 触发自动部署

### 4.1 提交更改

```sh
# 查看改动
git status

# 添加所有改动
git add .

# 提交（替换为有意义的提交信息）
git commit -m "feat: 添加第一篇博客文章"
```

可以只添加特定文件，避免误提交：

```sh
git add docs/notes/my-first-post.md docs/.vitepress/config.mts
git commit -m "feat: 添加第一篇博客文章"
```

### 4.2 推送触发部署

```sh
git push
```

推送到 `main` 分支后，GitHub Actions 会自动开始构建和部署。

### 4.3 查看部署进度

1. 打开 `https://github.com/AxelWT/my-vitepress-blog/actions`
2. 可以看到最新的工作流运行记录
3. 点击进入可查看每一步的日志

也可以手动触发部署：在 Actions 页面选择工作流 → **Run workflow**。

### 4.4 部署完成

通常 1-2 分钟后部署完成，访问 **https://axelwt.github.io/my-vitepress-blog/** 即可看到更新。

---

## 完整流程总结

```
创建 .md 文件 → 编写内容 → 更新 config.mts 导航 → 本地预览 → git commit → git push → 自动部署
```

一个典型的写作会话：

```sh
# 1. 创建文章
mkdir -p docs/notes
vim docs/notes/my-first-post.md

# 2. 更新侧边栏配置
vim docs/.vitepress/config.mts

# 3. 本地预览
npm run docs:dev

# 4. 确认无误后提交
git add .
git commit -m "feat: 添加第一篇博客"
git push

# 5. 等 1-2 分钟，访问线上站点确认
```

---

## 常见问题

### 修改后线上没有更新？

检查 Actions 页面确认工作流是否运行成功。如果失败，点击进入查看失败步骤的日志。

### 本地预览正常但线上样式错乱？

确认 `config.mts` 中 `base` 设置为 `/my-vitepress-blog/`。缺少此配置会导致资源路径错误。

### 想撤销刚推送的内容？

```sh
# 回退本地到上一个提交
git revert HEAD
git push
```

这会创建一个新提交来撤销改动，比 `git reset` 更安全。

### 端口被占用？

开发服务器会自动尝试下一个可用端口，也可手动指定：

```sh
npx vitepress dev docs --port 8080
```
