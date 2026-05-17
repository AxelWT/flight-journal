---
title: "tmux 使用指南"
date: 2026-05-11
description: tmux 终端复用器完整使用指南，包括会话管理、窗口操作与配置技巧
tags:
  - 工具
  - tmux
  - 终端
---

# tmux 使用指南

> **版本**: tmux 3.6a
> **安装**: macOS `brew install tmux` / Ubuntu `sudo apt install tmux`
> **最后更新**: 2026-05-11

---

## 一、tmux 是什么？

tmux（Terminal Multiplexer）是一个终端复用器，核心能力：

- **多会话**：一个终端窗口运行多个独立会话
- **持久化**：断开连接后会话继续运行（SSH 掉线也不怕）
- **分屏**：一个窗口内分割多个窗格，同时查看多个任务

**典型场景**：

- SSH 到远程服务器，断开后任务不中断
- 一个屏幕同时看日志、编辑代码、运行测试
- 后台跑长时间构建/训练任务

---

## 二、快速开始

### 2.1 基本操作

```bash
# 创建新会话（命名推荐）
tmux new -s mysession

# 列出所有会话
tmux ls

# 附加到指定会话
tmux attach -t mysession
tmux a -t mysession         # 简写

# 杀掉会话
tmux kill-session -t mysession

# 杀掉所有会话
tmux kill-server
```

### 2.2 最常用的工作流

```bash
# 1. 启动 tmux
tmux

# 2. 分屏
#    Ctrl+b %   垂直分屏（左右）
#    Ctrl+b "   水平分屏（上下）

# 3. 在不同窗格中运行命令

# 4. 分离会话（后台运行）
#    Ctrl+b d

# 5. 重新连接
tmux attach
```

---

## 三、快捷键参考

> 所有快捷键需先按 **前缀键** `Ctrl+b`，松开后再按对应键。

### 3.1 会话管理

| 操作 | 快捷键 / 命令 |
|------|--------------|
| 新建会话 | `tmux new -s name` |
| 列出会话 | `tmux ls` |
| 附加会话 | `tmux a -t name` |
| 分离会话 | `Ctrl+b d` |
| 列出并切换 | `Ctrl+b s` |
| 重命名会话 | `Ctrl+b $` |

### 3.2 窗口管理

| 操作 | 快捷键 |
|------|--------|
| 新建窗口 | `Ctrl+b c` |
| 切换到窗口 N | `Ctrl+b 0-9` |
| 下一个窗口 | `Ctrl+b n` |
| 上一个窗口 | `Ctrl+b p` |
| 列出所有窗口 | `Ctrl+b w` |
| 重命名窗口 | `Ctrl+b ,` |
| 关闭窗口 | `Ctrl+b &` |

### 3.3 窗格管理（分屏）

| 操作 | 快捷键 |
|------|--------|
| 垂直分屏（左右） | `Ctrl+b %` |
| 水平分屏（上下） | `Ctrl+b "` |
| 切换窗格 | `Ctrl+b 方向键` |
| 依次切换窗格 | `Ctrl+b o` |
| 关闭当前窗格 | `Ctrl+b x` |
| 放大/恢复窗格 | `Ctrl+b z` |
| 交换窗格（向前） | `Ctrl+b {` |
| 交换窗格（向后） | `Ctrl+b }` |
| 显示窗格编号 | `Ctrl+b q` |

### 3.4 复制与滚动

| 操作 | 快捷键 |
|------|--------|
| 进入复制模式 | `Ctrl+b [` |
| 粘贴 | `Ctrl+b ]` |
| 显示所有快捷键 | `Ctrl+b ?` |
| 命令模式 | `Ctrl+b :` |

**复制模式操作**（先 `Ctrl+b [` 进入）：

1. 方向键 / Page Up Down 滚动
2. **空格** 开始选择
3. **回车** 复制选中内容
4. **q** 退出复制模式

---

## 四、实用场景

### 场景 1: SSH 远程开发

```bash
# 创建会话
tmux new -s remote-dev

# SSH 到服务器
ssh user@server

# 分屏：左边编辑，右边运行
# Ctrl+b % 垂直分屏

# 如果 SSH 断开，重新连接后
tmux a -t remote-dev   # 一切还在
```

### 场景 2: 多项目并行

```bash
tmux new -s project1   # 项目1 的会话
tmux new -s project2   # 项目2 的会话

# 切换项目
tmux a -t project1
tmux a -t project2

# 或用 Ctrl+b s 可视化选择
```

### 场景 3: 后台运行长时间任务

```bash
tmux new -s training

# 启动训练
python train.py --epochs 100

# 分离：Ctrl+b d（训练继续运行）
# 稍后检查
tmux a -t training
```

### 场景 4: 四分屏监控

```bash
tmux new -s monitor

# Ctrl+b "   水平分上下
# Ctrl+b %   上下各垂直分左右

# 四个窗格分别运行：
# 左上: htop
# 右上: tail -f /var/log/app.log
# 左下: watch -n 1 'df -h'
# 右下: watch -n 1 'free -h'
```

---

## 五、配置文件

创建 `~/.tmux.conf`：

```bash
# 默认 shell
set -g default-shell /bin/zsh

# 前缀键改为 Ctrl+a（更顺手，避免与 Vim 冲突）
set -g prefix C-a
unbind C-b
bind C-a send-prefix

# 鼠标支持（点击切换窗格、拖动调整大小、滚动翻页）
set -g mouse on

# 窗口和窗格编号从 1 开始（0 在键盘太远）
set -g base-index 1
setw -g pane-base-index 1

# 自动重命名窗口
setw -g automatic-rename on
set -g set-titles on

# 快捷重载配置
bind r source-file ~/.tmux.conf \; display "Config reloaded!"
```

**配置生效**：

```bash
# 方式一：在 tmux 内按前缀 + : 输入
:source-file ~/.tmux.conf

# 方式二：如果配置了 bind r
Ctrl+b r

# 方式三：重启 tmux
```

---

## 六、高级技巧

### 6.1 同步输入

在所有窗格中同时输入相同命令（适合批量操作多台服务器）：

```bash
# 开启同步
Ctrl+b :
:setw synchronize-panes on

# 在任意窗格输入命令，所有窗格同步执行

# 关闭同步
:setw synchronize-panes off
```

### 6.2 保存/恢复会话（插件）

```bash
# 1. 安装插件管理器
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# 2. 在 ~/.tmux.conf 添加
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

# 3. 安装插件
~/.tmux/plugins/tpm/bin/install_plugins

# 4. 使用
# Ctrl+b Ctrl+s   保存会话
# Ctrl+b Ctrl+r   恢复会话

# 5. tmux-continuum 自动保存（可选）
set -g @continuum-restore 'on'
```

### 6.3 使用 Socket 隔离

```bash
# 创建专用 socket（适合脚本控制）
SOCKET="/tmp/mydaemon.sock"

# 创建会话
tmux -S "$SOCKET" new -d -s worker

# 发送命令
tmux -S "$SOCKET" send-keys -t worker "./run.sh" Enter

# 读取输出
tmux -S "$SOCKET" capture-pane -p -t worker -S -50

# 从终端交互
tmux -S "$SOCKET" attach -t worker
```

---

## 七、常见问题

| 问题 | 解决方案 |
|------|---------|
| 如何退出 tmux？ | 输入 `exit` 或按 `Ctrl+d` 关闭所有窗格/窗口 |
| 如何滚动查看历史？ | `Ctrl+b [` 进入复制模式，方向键/Page Up 滚动 |
| 窗格太多怎么快速切换？ | `Ctrl+b q` 显示编号，按数字跳转 |
| 如何调整窗格大小？ | `Ctrl+b Ctrl+方向键` 微调，或开启鼠标模式直接拖动 |
| macOS 复制到系统剪贴板？ | 见下方配置 |
| 分屏比例不满意？ | `Ctrl+b Ctrl+方向键` 调整，或开启鼠标拖动 |

### macOS 系统剪贴板

```bash
# 在 ~/.tmux.conf 中添加
set -g default-command "reattach-to-user-namespace -l zsh"
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "reattach-to-user-namespace pbcopy"
```

---

## 八、记忆口诀

| 快捷键 | 记忆 |
|--------|------|
| `Ctrl+b c` | **C**reate window |
| `Ctrl+b d` | **D**etach session |
| `Ctrl+b %` | `%` 竖线 → 垂直分屏 |
| `Ctrl+b "` | `"` 上下排列 → 水平分屏 |
| `Ctrl+b n` | **N**ext window |
| `Ctrl+b p` | **P**revious window |
| `Ctrl+b z` | **Z**oom（放大/恢复） |
| `Ctrl+b x` | **X** 关闭窗格 |
| `Ctrl+b ?` | `?` 求助 → 列出快捷键 |

---

## 九、学习资源

- **官方文档**: https://github.com/tmux/tmux/wiki
- **快捷键速查**: https://tmuxcheatsheet.com/
- **Awesome tmux**: https://github.com/rothgar/awesome-tmux

---

*版本: tmux 3.6a | 最后更新: 2026-05-11*
