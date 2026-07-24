---
title: GitLab CI/CD 深度调研：与 GitHub Actions 全维度对比
date: 2026-05-22
description: 从Pipeline架构到Runner执行器，从YAML语法到生态集成，全面对比GitLab CI/CD与GitHub Actions的核心能力与选型策略。
tags:
  - 技术
  - CI/CD
  - DevOps
  - GitLab
  - GitHub
---

# GitLab CI/CD 深度调研：与 GitHub Actions 全维度对比

**「CI/CD是DevOps的血管，GitLab和GitHub是这条血管上的两个最重要的枢纽。」**

---

## 一、CI/CD 基础概念：什么是CI/CD

在对比之前，先明确三个核心概念的区别：

| 阶段 | 全称 | 核心目标 | 自动化程度 |
|------|------|---------|-----------|
| **CI** | Continuous Integration（持续集成） | 每次代码提交自动构建+测试，尽早发现bug | 全自动 |
| **CD** | Continuous Delivery（持续交付） | 每次通过CI的代码都可以安全地发布到各环境 | 半自动（需人工审批生产发布） |
| **CD** | Continuous Deployment（持续部署） | 每次通过CI的代码自动部署到生产，无需人工干预 | 全自动 |

```
代码提交 → 触发流水线 → 构建 → 测试 → 质量门禁 → 部署预发布 →
→ 生产部署
  ↑                                    ↑
  CI触发起点                          CD终点（是否自动化取决于CD类型）
```

---

## 二、GitLab CI/CD：全流程内置的DevOps平台

### 2.1 核心架构：Pipeline = Stage + Job + Runner

```
GitLab CI/CD 三大核心组件：

┌──────────────────────────────────────────────────────────┐
│                  Pipeline（流水线）                       │
│                                                          │
│  Stage 1: build    Stage 2: test     Stage 3: deploy     │
│  ┌────────────────┐┌──────────────┐┌──────────────┐     │
│  │ build_app      ││ test_unit    ││ deploy_staging│     │
│  │ build_assets   ││ test_integration││ deploy_production│    │
│  └────────────────┘└──────────────┘└──────────────┘     │
│   (并行)            (并行)         (顺序,生产需审批)      │
│                                                          │
│  Runner 1 ←──→ Runner 2 ←──→ Runner 3 ←──→ ...        │
│  (执行Jobs)     (执行Jobs)     (执行Jobs)                │
└──────────────────────────────────────────────────────────┘
```

**Pipeline的执行逻辑：**

- **Stage按顺序执行**（build → test → deploy）
- **同一Stage内的Job并行执行**（build_app 和 build_assets 同时跑）
- **任何Stage中有Job失败，后续Stage默认不执行**（除非设置 `allow_failure: true`）
- Pipeline可以手动触发、定时触发、API触发或由上游Pipeline触发

### 2.2 `.gitlab-ci.yml`：GitLab CI/CD的"宪法"

所有配置集中在一个YAML文件里，放在项目根目录：

```yaml
# 最简单的三阶段流水线
stages:
  - build
  - test
  - deploy

variables:
  NODE_VERSION: "18"

# Build阶段
build_app:
  stage: build
  image: node:18
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - dist/           # 构建产物传递给后续Job
    expire_in: 1 week

# Test阶段
test_unit:
  stage: test
  image: node:18
  script:
    - npm install
    - npm test
  coverage: '/Coverage: \d+\.\d+%/'

test_integration:
  stage: test
  image: node:18
  script:
    - npm install
    - npm run test:integration

# Deploy阶段
deploy_staging:
  stage: deploy
  script:
    - echo "Deploying to staging..."
    - kubectl apply -f k8s/
  environment:
    name: staging
  only:
    - develop          # 仅develop分支触发

deploy_production:
  stage: deploy
  script:
    - echo "Deploying to production..."
    - kubectl apply -f k8s/
  environment:
    name: production
  when: manual        # ⚠️ 关键：生产部署需手动审批
  only:
    - main             # 仅main分支触发
```

### 2.3 Runner：Job的执行者

Runner是执行CI/CD Jobs的代理程序，可以运行在任何地方：

| Runner类型 | 说明 | 适用场景 |
|-----------|------|---------|
| **Shared Runner** | 所有项目共享，gitlab.com提供免费额度 | 开源项目、多个小项目 |
| **Group Runner** | 组内所有项目共享 | 中大型团队 |
| **Specific Runner** | 专属某1个或N个项目 | 需要特殊环境（如GPU、特定数据库） |

**Executor（执行器）决定Job在哪里跑：**

| Executor | 原理 | 并发能力 | 隔离性 |
|---------|------|---------|--------|
| **Shell** | 直接在Runner机器上执行命令 | 高 | 差（共享系统环境） |
| **Docker** | 在Docker容器中执行，每个Job一个容器 | 中 | 好（容器隔离） |
| **Docker Machine** | 按需动态创建/销毁Docker容器 | 高 | 好 |
| **Kubernetes** | 在K8s Pod中执行 | 极高 | 最好 |
| **SSH** | 通过SSH连接到远程服务器执行 | 低 | 中 |
| **Virtual Machine** | 每次Job新建虚拟机 | 低 | 最好 |

### 2.4 GitLab CI/CD 的核心高级特性

#### 特性一：多项目流水线（Multi-Project Pipelines）

```
场景：前端项目和后端项目需要协同发布

上游Pipeline（后端）：
  build_backend → test_backend → deploy_backend
  ↓ 触发（通过pipeline trigger token）
下游Pipeline（前端）：
  build_frontend → deploy_frontend（依赖后端部署成功）
```

#### 特性二：父子流水线（Parent-Child Pipelines）

```
Parent Pipeline（编排层）：
┌──────────────────────────────────────────────────────────┐
│  trigger_job → 生成配置 → 触发Child Pipeline A,B,C      │
└──────────────────────────────────────────────────────────┘
       ↓                  ↓                  ↓
Child Pipeline A    Child Pipeline B    Child Pipeline C
 （认证服务）         （订单服务）         （支付服务）
```

#### 特性三：Directed Acyclic Graph（DAG）流水线

通过 `needs` 关键字，跳过传统Stage的顺序限制，实现更精细的依赖控制：

```yaml
build_app:
  stage: build
  script: echo "build"

build_assets:
  stage: build
  script: echo "build assets"

test_unit:
  stage: test
  needs: [build_app]    # 只需要build_app完成，不需要等build_assets
  script: echo "test unit"

test_e2e:
  stage: test
  needs: [build_app, build_assets]  # 需要两个build都完成
  script: echo "test e2e"

deploy:
  stage: deploy
  needs: [test_unit, test_e2e]      # 等两个测试都通过
  script: echo "deploy"
```

---

## 三、GitHub Actions：代码即协作的CI/CD

### 3.1 核心架构：Workflow = Job + Step + Action

```
GitHub Actions 三大核心组件：

┌──────────────────────────────────────────────────────────┐
│              Workflow（工作流，可多个并存）                │
│                                                          │
│  Job 1: build          Job 2: test                      │
│  ┌────────────────┐    ┌──────────────┐                 │
│  │ Step 1: 检出代码│    │ Step 1: 检出代码│                │
│  │ Step 2: 安装依赖│    │ Step 2: 运行测试│                │
│  │ Step 3: 构建    │    └──────────────┘                 │
│  └────────────────┘         ↓ (needs: job1)             │
│                         Job 3: deploy                   │
│                         ┌────────────────┐              │
│                         │ Step 1: 检出代码│               │
│                         │ Step 2: 部署    │               │
│                         └────────────────┘              │
│                                                          │
│  Runner: GitHub-hosted (ubuntu-latest等) / Self-hosted  │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Workflow YAML：GitHub Actions的"宪法"

```yaml
name: Node.js CI/CD

on:
  push:
  pull_request:
  schedule:
    - cron: '0 2 * * *'  # 每天凌晨2点

env:
  NODE_VERSION: '18'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - uses: actions/download-artifact@v4
        with:
          name: dist
      - run: npm test

  deploy:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v2
        with:
          namespace: 'production'
          manifests: ${{ github.workspace }}/k8s/
```

### 3.3 GitHub Actions的核心概念

#### Runner（执行器）

| 类型 | 说明 | 费用 |
|------|------|------|
| **GitHub-hosted Runners** | GitHub提供托管机器，开箱即用 | Free账户每月2000分钟（公开仓库），私有仓库500分钟 |
| **Self-hosted Runners** | 自建Runner，可自定义环境 | 自己承担机器成本 |
| **Larger Runners** | 高性能托管Runner（4核/8核/16核/32核） | 按分钟计费，更贵 |

#### Action：GitHub Actions的"插件市场"

Action是GitHub Actions最大的差异化优势——**Actions MarketPlace**里有超过2万个现成组件：

| Action | 用途 |
|--------|------|
| `actions/checkout@v4` | 检出代码 |
| `actions/setup-node@v4` | 配置Node.js环境（含缓存） |
| `actions/upload-artifact@v4` | 上传构建产物 |
| `actions/download-artifact@v4` | 下载构建产物 |
| `azure/k8s-deploy@v2` | 部署到Kubernetes |
| `aws-actions/configure-aws-credentials@v4` | 配置AWS凭证 |
| `peaceiris/actions-gh-pages@v4` | 发布GitHub Pages |

---

## 四、GitLab CI/CD vs GitHub Actions：深度逐项对比

### 4.1 核心架构对比

| 维度 | GitLab CI/CD | GitHub Actions |
|------|-------------|---------------|
| **配置文件** | `.gitlab-ci.yml`（项目根目录） | `.github/workflows/*.yml`（专门目录） |
| **核心单位** | Pipeline → Stage → Job | Workflow → Job → Step |
| **执行单元** | Runner（独立进程） | Runner（托管或自托管） |
| **依赖传递** | `artifacts`（可跨Stage传递） | `actions/upload-artifact` + `actions/download-artifact` |
| **Stage vs Job依赖** | Stage顺序 + `needs`（DAG） | `needs`（Job级依赖） |
| **触发条件** | push/PR/MR/schedule/API/tag/pipeline trigger | push/PR/dispatch/schedule/workflow_dispatch |
| **并发控制** | `parallel:matrix` | `strategy: matrix` |
| **缓存机制** | `cache`（K-V缓存） | Actions Cache + `actions/cache` |
| **Secret管理** | CI/CD Variables（Settings → CI/CD） | GitHub Secrets（Settings → Secrets） |

### 4.2 YAML配置语法对比

| 功能 | GitLab语法 | GitHub Actions语法 |
|------|-----------|-----------------|
| **定义阶段** | `stages: [build, test, deploy]` | `jobs.<job_id>.steps`（隐式顺序） |
| **Job并行** | 同Stage内Job自动并行 | `strategy: {parallel: {matrix: }}` |
| **Job顺序** | Stage顺序或`needs` | `needs: [job1]` |
| **条件执行** | `rules: [...]` | `if: conditions` |
| **手动触发** | `when: manual` | `workflow_dispatch` |
| **环境变量** | `variables: {...}`（Job级或全局） | `env:` 或 <code v-pre>${{ env.VAR }}</code> |
| **超时控制** | `timeout: 1h` | `timeout-minutes: 60` |
| **重试机制** | `retry: {max: 2, when: ...}` | `retries: 2`（最新语法） |
| **矩阵策略** | `parallel:matrix: {...}` | `strategy: {matrix: {...}}` |

### 4.3 生态与集成对比

| 维度 | GitLab | GitHub |
|------|--------|--------|
| **生态定位** | 从代码到DevOps的全家桶（代码托管+CI/CD+Container Registry+K8s集成+监控+安全） | 代码托管 + Actions，通过Marketplace扩展 |
| **Registry** | 内置Container Registry（每项目独立） | Container Registry（ghcr.io）+ Marketplace Actions |
| **K8s集成** | 原生Auto DevOps + Cluster管理面板 | Actions + 第三方Action |
| **集成数量** | ~800个集成 | ~25000个Actions + 数千个Marketplace应用 |
| **安全扫描** | 内置SAST/DAST/Dependency Scanning（付费版） | 依赖项审查（Dependabot）+ 三方Action |
| **费用模型** | SaaS免费500分钟/月，Self-Managed自托管无限制 | SaaS按分钟计费，私有仓库2000分钟/月（公开仓库免费无限） |

### 4.4 高级功能对比

| 功能 | GitLab | GitHub Actions |
|------|--------|--------------|
| **DAG流水线** | ✅ `needs` + `resource_group` | ✅ `needs` |
| **父子流水线** | ✅ 父子/多项目Pipeline | ✅ `workflow_run` 触发子Workflow |
| **定时触发** | ✅ `schedule`（cron） | ✅ `schedule`（cron） |
| **手动审批** | ✅ `when: manual` + Approval Gates | ✅ `environment` + `required_reviewers` |
| **并行矩阵** | ✅ `parallel:matrix` | ✅ `strategy: {matrix: {}}` |
| **缓存** | ✅ `cache` + LFS | ✅ `actions/cache` |
| **OIDC（云凭证免密）** | ✅ JWT Token | ✅ OIDC + `aws-actions/configure-aws-credentials` |
| **可观测性** | 内置Pipeline图+MR Widget | Actions Tab + 三方工具 |
| **Terraform集成** | 内置Terraform State管理 | Terraform Actions（HashiCorp官方） |
| **Review Apps** | ✅ 动态环境预览 | ✅ 通过Actions部署预览环境 |
| **Kubernetes部署** | Auto DevOps一键K8s | 第三方Action（azure/k8s-deploy等） |

---

## 五、使用场景选型建议

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     CI/CD平台选型决策树                              ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  你已经在用GitLab或GitHub了吗？                                      ║
║  │                                                                   ║
║  ├── 是 → 继续用同一个平台（避免双平台维护成本）                      ║
║  │                                                                   ║
║  └── 否 → 往下判断                                                   ║
║                                                                      ║
║  你们需要完整的DevOps平台吗？                                        ║
║  │                                                                   ║
║  ├── 是 → GitLab（代码托管+CI/CD+Registry+安全扫描，一条龙）         ║
║  │                                                                   ║
║  └── 否（只用CI/CD，其他工具已固定）→ GitHub Actions                 ║
║      │                                                               ║
║      ├── 你们需要重度K8s部署吗？                                     ║
║      │   ├── 是 → GitLab Auto DevOps（更成熟）                       ║
║      │   └── 否 → GitHub Actions（Action市场更丰富）                 ║
║      │                                                               ║
║      ├── 你们的代码在哪里托管？                                      ║
║      │   ├── GitHub → GitHub Actions（原生集成，最简单）              ║
║      │   └── GitLab → GitLab CI/CD（原生集成，最简单）               ║
║      │                                                               ║
║      └── 你们的技术栈需要什么Action/Runner？                         ║
║          ├── 苹果开发（iOS/macOS）→ GitHub Actions（macOS Runner）   ║
║          ├── Windows开发 → GitHub Actions（windows-latest）          ║
║          └── Linux + K8s → 两者皆可，GitLab对K8s集成更深            ║
║                                                                      ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### 选GitLab CI/CD的场景

- 追求**平台统一**：代码、CI/CD、安全扫描、容器Registry、监控都用GitLab
- 需要**Auto DevOps**：一键构建+测试+部署到Kubernetes
- 大型组织：Group/Subgroup的权限体系更细致
- **私有化部署**需求：GitLab Self-Managed完全自主可控

### 选GitHub Actions的场景

- 代码已在**GitHub**：天然集成，无需额外配置
- 依赖**Marketplace Actions**：有大量现成的第三方集成
- **苹果开发**：GitHub提供macOS Runner，GitLab不提供
- 需要**更大的生态**：超过25000个Actions，覆盖几乎所有场景
- 快速原型：Marketplace找现成Action，5分钟搭好流水线

---

## 六、精华总结

### 两条路线的根本哲学差异

> **GitLab**：倡导"One Platform, One Experience"——所有DevOps工具都应该在一个平台内，用同一套逻辑运维。好处是集成深度高，坏处是平台绑定深。

> **GitHub**：倡导"Best-in-Class"——每个环节都用业界最好的工具，通过Actions松耦合集成。好处是灵活，坏处是需要自己维护跨工具的一致性。

### 三条实操建议

> **建议一**：如果你的代码在GitHub，就用GitHub Actions；如果在GitLab，就用GitLab CI/CD。跨平台迁移CI/CD配置虽然不复杂，但运维负担翻倍，没必要。

> **建议二**：GitHub Actions的Marketplace是真正的差异化优势——当你需要集成一个不常见的工具时，先去Marketplace搜一下，大概率有现成的Action比自己写省90%的时间。

> **建议三**：GitLab CI/CD的父子流水线+多项目流水线，在微服务场景下极其强大——一个父Pipeline统一编排几十个服务的部署顺序，这在GitHub Actions里需要借助`workflow_run`触发器，链路会更复杂。

---

**参考资料**

- [CI/CD Pipelines](https://docs.gitlab.com/ci/pipelines) — GitLab官方文档，2026年1月
- [Getting started with GitLab: Understanding CI/CD](https://about.gitlab.com/blog/getting-started-with-gitlab-understanding-ci-cd) — GitLab官方博客，2025年4月25日
- [Understanding GitHub Actions](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions) — GitHub官方文档，2026年5月
- [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions) — GitHub官方文档，2026年5月
- [GitLab Runner](https://docs.gitlab.com/runner/) — GitLab Runner官方文档
- [GitHub Actions MarketPlace](https://github.com/marketplace?type=actions)
- [Auto DevOps](https://docs.gitlab.com/topics/autodevops) — GitLab Auto DevOps文档
- [GitLab CI/CD vs GitHub Actions: Which is Better?](https://atlassian.com/blog/gitlab-ci-cd-vs-github-actions) — Atlassian官方博客，2025年
- [GitLab CI/CD YAML syntax reference](https://docs.gitlab.com/ci/yaml) — GitLab官方文档，2026年
