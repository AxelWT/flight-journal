---
title: "Git Worktree 使用指南"
date: 2026-05-11
description: Git Worktree 的创建、管理与多分支并行开发工作流详解
tags:
  - Git
  - 工具
  - Worktree
---

# Git Worktree 使用指南

> **最后更新**: 2026-05-11

---

## 一、什么是 Git Worktree？

Git Worktree 允许你同时检出同一个仓库的多个分支到不同目录，无需克隆多个副本。

**核心优势**：

- **并行开发**：同时在不同分支上工作，无需 `git stash` 来回切换
- **无需重新克隆**：共享 `.git` 目录，节省磁盘空间和克隆时间
- **快速上下文切换**：不同工作目录对应不同分支，IDE 各自独立

**典型场景**：

- 在 feature 分支开发时，需要紧急修复 main 上的 bug
- 同时进行代码审查和功能开发
- 在一个分支运行长时间测试，同时在另一个分支继续工作

---

## 二、基本操作

### 2.1 创建 Worktree

```bash
# 从已有分支创建 worktree
git worktree add ../hotfix-dir hotfix-branch

# 创建新分支并关联到 worktree
git worktree add -b new-feature ../feature-dir main
# -b new-feature: 创建并切换到新分支
# ../feature-dir: worktree 存放目录
# main: 新分支基于 main 创建

# 查看所有 worktree
git worktree list
# 输出示例：
# /home/user/project        abc1234 [main]
# /home/user/hotfix-dir     def5678 [hotfix-branch]
# /home/user/feature-dir    ghi9012 [new-feature]
```

### 2.2 在 Worktree 中工作

```bash
# 进入 worktree 目录
cd ../hotfix-dir

# 正常的 git 操作都可用
git status
git add .
git commit -m "fix: urgent bug fix"
git push origin hotfix-branch
```

### 2.3 删除 Worktree

```bash
# 先移除 worktree
git worktree remove ../hotfix-dir

# 如果目录有未提交的修改，需要强制删除
git worktree remove --force ../hotfix-dir

# 如果手动删除了目录，清理残留记录
git worktree prune
```

---

## 三、完整工作流示例

### 场景：紧急修复中断 feature 开发

```bash
# 1. 正在 feature 分支开发
cd ~/project
git branch  # * feature-login

# 2. 收到紧急 bug 报告，创建 hotfix worktree
git worktree add ../hotfix-critical -b hotfix/critical-bug main

# 3. 在 hotfix worktree 中修复
cd ../hotfix-critical
vim src/auth.py
git add src/auth.py
git commit -m "fix: critical auth bypass"
git push origin hotfix/critical-bug

# 4. 合并到 main 并推送
git checkout main  # 注意：这里在 worktree 内切换
git merge hotfix/critical-bug
git push origin main

# 5. 回到 feature 继续开发（无需 stash 或 rebase）
cd ~/project
# 代码状态和之前完全一样，没有被打断

# 6. 清理 worktree
git worktree remove ../hotfix-critical
```

---

## 四、注意事项

| 规则 | 说明 |
|------|------|
| 同一分支不能同时检出 | 同一分支只能存在于一个 worktree 中，否则会冲突 |
| worktree 共享 .git | 所有 worktree 共享同一个仓库对象，提交历史同步 |
| 子模块需独立初始化 | 新 worktree 中的子模块需要单独 `git submodule update --init` |
| IDE 配置独立 | 每个 worktree 目录有独立的 IDE 工作区配置 |

### 常见问题

**Q: `git worktree add` 报错 "branch already checked out"？**
A: 该分支已在其他 worktree 中检出。需要先从那个 worktree 切换到别的分支，或者用 `-b` 创建新分支。

**Q: 删除 worktree 目录后 `git worktree list` 还有记录？**
A: 运行 `git worktree prune` 清理过时的记录。

**Q: worktree 之间可以共享 stash 吗？**
A: 可以。`git stash` 是仓库级的，所有 worktree 共享同一个 stash 列表，可以在任意 worktree 中 `git stash pop`。

---

## 五、与 Git Submodule 对比

| 特性 | Git Worktree | Git Submodule |
|------|-------------|---------------|
| 目的 | 同仓库多分支并行 | 嵌入其他仓库 |
| 仓库数量 | 1 个 | 多个 |
| 提交同步 | 自动同步 | 需手动更新引用 |
| 适用场景 | 并行开发/紧急修复 | 依赖管理/代码复用 |

---

*最后更新: 2026-05-11*
