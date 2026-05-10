# Flight Journal

基于 [VitePress](https://vitepress.dev) 的个人博客，部署在 GitHub Pages。

线上地址：[https://axelwt.github.io/flight-journal/](https://axelwt.github.io/flight-journal/)

## 项目结构

```
flight-journal/
├── docs/                        # 站点根目录
│   ├── .vitepress/              # VitePress 配置
│   │   └── config.mts           # 站点配置文件
│   ├── guide/                   # 建站指南
│   ├── notes/                   # 笔记
│   ├── read/                    # 阅读
│   ├── about.md                 # 关于
│   └── index.md                 # 首页
├── .github/workflows/deploy.yml # GitHub Actions 部署流程
├── package.json
└── package-lock.json
```

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 安装依赖

```sh
npm install
```

### 开发调试

启动本地开发服务器，支持热更新：

```sh
npm run docs:dev
```

启动后访问 [http://localhost:5173](http://localhost:5173)，修改文件后页面会自动刷新。

### 构建预览

构建静态文件并本地预览最终效果：

```sh
npm run docs:build
npm run docs:preview
```

- `docs:build` — 生成静态文件到 `docs/.vitepress/dist/`
- `docs:preview` — 启动本地服务器预览构建产物

### 部署到自己的 GitHub Pages

如果你想把这个项目部署到你自己的仓库，按以下步骤操作：

#### 1. Fork 或创建仓库

在 GitHub 上 Fork 本仓库，或者新建一个仓库后将代码推上去。

#### 2. 修改站点配置

编辑 `docs/.vitepress/config.mts`，将 `base` 改为你的仓库路径：

```ts
// 将 <你的用户名> 和 <仓库名> 替换为实际值
base: '/<仓库名>/'
```

例如你的仓库是 `https://github.com/zhangsan/my-blog`，则：

```ts
base: '/my-blog/'
```

> 如果使用 `<用户名>.github.io` 作为仓库名（即 `zhangsan.github.io`），则 `base` 设为 `'/'`。

#### 3. 配置 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 **GitHub Actions**
3. **Save**

#### 4. 推送代码触发部署

将代码推送到 `main` 分支，GitHub Actions 会自动执行构建和部署：

```sh
git push origin main
```

可以在仓库的 **Actions** 标签页查看部署进度。

#### 5. 访问站点

部署完成后访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

#### 自定义域名（可选）

1. 在 `docs/.vitepress/config.mts` 中添加 `head` 配置指定 CNAME：

```ts
head: [['link', { rel: 'canonical', href: 'https://your-domain.com/' }]]
```

2. 在 `docs/public/` 目录下创建 `CNAME` 文件，内容为你的域名：

```
your-domain.com
```

3. 在仓库 **Settings → Pages → Custom domain** 中填入你的域名，并开启 **Enforce HTTPS**。

4. 在域名服务商处将域名 CNAME 指向 `<你的用户名>.github.io`。

## 写作

在 `docs/` 目录下新建 `.md` 文件即可添加内容。新增页面后需在 `docs/.vitepress/config.mts` 的 `sidebar` 中添加对应条目。
