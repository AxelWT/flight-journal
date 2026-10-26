---
title: "Play Agents App"
date: 2026-05-11
description: 当前热门 AI Agent 应用盘点，包括 Claude Code、OpenClaw/Hermes 等项目介绍
tags:
  - Agent
  - AI
  - 应用
---

# Play Agents App

当前最热门的几个 AI Agent 应用：

- **Claude Code** — 可以自己编写代码、自己纠错，或者帮你纠正代码中的问题
- **OpenClaw / Hermes** — 个人 AI 助手，可以操控电脑完成各种任务，保持心跳机制，并可接入 IM 软件（Telegram、Discord、QQ 等）进行通信

---

## 安装教程

### Claude Code + OpenClaw 安装

- 使用指南：https://help.aliyun.com/zh/model-studio/coding-plan
- 阿里云平台体验地址：https://bailian.console.aliyun.com/cn-beijing
- 智谱平台接入指南：https://docs.bigmodel.cn/cn/coding-plan/tool/claude
- GLM Coding 开发者社区文档：https://zhipu-ai.feishu.cn/wiki/TrlMwahsfihLrKkZsy0cpuTenCz

---

## 使用技巧（Mac）

### Claude Code 配置

| 文件 | 说明 |
|------|------|
| `~/.claude/settings.json` | 全局配置，如使用的模型等 |
| `~/.claude.json` | Agent 自动生成的项目配置，会不断更新，一般无需手动维护 |

### OpenClaw 配置

| 文件 | 说明 |
|------|------|
| `~/.openclaw/openclaw.json` | 全局配置，包括模型、插件、通信组件等 |

### Claude Code 常用命令

| 命令 | 说明 |
|------|------|
| `/plugin` | 插件管理 |
| `/config` | 配置管理（模型等） |
| `/model glm-5` | 切换到 glm-5 模型 |
| `/compact` | 手动压缩上下文（一般自动执行，无需手动） |
| `/clear` | 清除历史对话上下文 |

### OpenClaw 常用命令

| 命令 | 说明 |
|------|------|
| `openclaw config` | 打开设置 |
| `openclaw gateway restart` | 重启网关（偶现不稳定时使用） |
| `openclaw doctor --fix` | 自动修复问题 |
| `openclaw tui` | 终端交互界面 |

---

## Skills 使用技巧

| 命令 | 说明 |
|------|------|
| `/frontend-design` | 设计前端页面，避免 AI 蓝紫色风格的 UI |
| `/brainstorming` | Superpowers 技能系统，让 AI 遵循专业工程实践，更规范、可靠、可预测 |

---

## 实战原则

1. **初始化项目**：使用 `/init` 命令为整个项目生成 `CLAUDE.md` 文件
2. **保持 CLAUDE.md 精简**：不要把所有细则都写入该文件，使用 `@docs` 的方式指向想让 Agent 阅读的文档即可
