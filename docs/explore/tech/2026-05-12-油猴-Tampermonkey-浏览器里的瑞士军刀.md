---
title: "油猴（Tampermonkey）：浏览器里的瑞士军刀"
date: 2026-05-12
description: 从Greasemonkey到Tampermonkey的发展历程、核心能力、元数据规范、GM API权限体系，以及一个完整的B站自动跳过广告脚本实战示例。
tags:
  - 技术
  - 浏览器
  - 前端
---

# 油猴（Tampermonkey）：浏览器里的瑞士军刀

## 一、产生的历史背景

### 1.1 从 Firefox 说起

2004年，Firefox 浏览器向开发者开放了扩展能力。一位 Google 员工 **Aaron Boodman** 受到另一个"精简网页"扩展的启发，在2005年初发布了 **Greasemonkey 0.25**——这是世界上第一个用户脚本管理器。

它的核心思路很简单：**网页是别人的，但浏览器是我的——我用一小段 JavaScript 把别人的网页改成我想要的样子。**

这段 JavaScript 被称为 **UserScript（用户脚本）**，由于 Greasemonkey 太受欢迎，人们习惯性地把"UserScript"称为"油猴脚本"。

### 1.2 Chrome 时代的接力者

随着 Chrome 市场份额不断攀升，Greasemonkey 只支持 Firefox 的问题日益突出。

2010年5月，德国开发者 **Jan Biniok** 编写了一个 Greasemonkey 兼容脚本，用于在 Chrome 上运行用户脚本。后来他将代码独立发布为一款 Chrome 扩展——这就是 **Tampermonkey** 的诞生。

Tampermonkey 不仅兼容 Greasemonkey 标准，还提供了更现代的界面和更丰富的功能，逐渐成为跨浏览器用户脚本管理的事实标准。

### 1.3 发展里程碑

| 时间 | 事件 |
|------|------|
| 2005 | Greasemonkey 发布，奠定用户脚本概念 |
| 2010 | Tampermonkey 诞生 |
| 2011 | 移植到 Android 浏览器 |
| 2013 | 从开源（GPLv3）转为闭源（捐赠ware） |
| 2019 | 超过1000万用户；Google Manifest V3 差点杀死它 |
| 2022 | Chrome 商店超过10万安装量的33个扩展之一 |

---

## 二、解决了什么问题

### 2.1 核心痛点

**网页不是你写的，但你天天要用。**

你无法要求网站改版，无法忍受烦人的广告，无法每次手动填写重复的表单——直到油猴出现。油猴解决的根本问题是：**打破"网页只能长网站规定的样子"的限制**，让用户重新拥有对网页的定制权。

### 2.2 具体场景

- **去除广告**：视频片头广告、弹窗、横幅
- **增强功能**：给网页添加新按钮、自动签到、自动填表
- **绕过限制**：解除复制限制、显示隐藏内容
- **界面定制**：护眼模式、大字体、暗黑主题
- **自动化**：自动翻页、爬取数据、监控价格变动
- **开发者工具**：调试网页、拦截接口、测试前端逻辑

### 2.3 技术优势对比

| 维度 | 普通浏览器扩展 | 油猴脚本 |
|------|------------|--------|
| 开发门槛 | 需要申请权限、复杂构建 | 一段 JS 即插即用 |
| 安装方式 | 应用商店审核 | 脚本链接直接安装 |
| 灵活性 | 固定功能 | 按需启用/禁用每个脚本 |
| 社区生态 | 依赖官方生态 | Greasy Fork 等开放社区 |
| 跨浏览器 | 各浏览器需分别开发 | 一次编写，多浏览器通用 |

---

## 三、使用规范

### 3.1 脚本元数据（必填项）

每个油猴脚本以元数据块开头，声明脚本的身份和权限：

```javascript
// ==UserScript==
// @name         脚本名称（必填）
// @namespace    http://tampermonkey.net/   命名空间，唯一标识脚本
// @version      1.0                        版本号（必填，用于更新检查）
// @description  描述脚本功能（必填）
// @author       作者名
// @icon         https://xxx.com/icon.png   脚本图标
// @match        https://www.example.com/*  匹配网站（最重要）
// @exclude      https://www.example.com/login/*  排除的网址
// @run-at       document-end               执行时机
// @grant        GM_xmlhttpRequest          申请权限
// @require      https://cdn.jsdelivr.net/npm/jquery.min.js  依赖库
// @resource     style https://xxx.com/style.css  预加载资源
// @connect      api.example.com            跨域白名单
// @updateURL    https://xxx.com/script.user.js  更新地址
// ==/UserScript==
```

**@match 匹配规则：**

| 写法 | 含义 |
|------|------|
| `*://*/*` | 所有网站 |
| `https://www.baidu.com/*` | 百度所有页面 |
| `http*://*.github.com/*` | GitHub 及所有子域名 |
| `https://www.bilibili.com/video/*` | B站视频页面 |

**@run-at 执行时机：**

| 值 | 描述 |
|----|------|
| `document-start` | DOM 未加载时就执行，用于拦截原生脚本 |
| `document-end` | DOM 可操作时执行（最常用） |
| `document-idle` | 页面完全加载后执行 |

### 3.2 GM\* API 权限体系

油猴通过 `@grant` 声明需要的高级能力：

```javascript
// ==UserScript==
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_xmlhttpRequest
// @grant GM_addStyle
// @grant GM_registerMenuCommand
// @grant GM_setClipboard
// @grant unsafeWindow
// ==/UserScript==
```

**核心 API 一览：**

| API | 作用 |
|-----|------|
| `GM_setValue(key, value)` | 持久化存储（关浏览器不丢） |
| `GM_getValue(key, default)` | 读取存储的值 |
| `GM_deleteValue(key)` | 删除存储项 |
| `GM_xmlhttpRequest(details)` | 跨域网络请求（最强 API） |
| `GM_addStyle(css)` | 向页面注入 CSS 样式 |
| `GM_registerMenuCommand(name, fn)` | 在油猴菜单中添加快捷命令 |
| `GM_notification(text, title)` | 发送系统通知 |
| `GM_openInTab(url)` | 新标签页打开链接 |
| `GM_setClipboard(data)` | 写入剪贴板 |
| `GM_download(url, name)` | 下载文件到本地 |

### 3.3 安全须知

- ✅ 只安装来自可信来源的脚本（Greasy Fork、OpenUserJS）
- ✅ 安装前查看脚本申请的权限，过多权限需警惕
- ✅ 银行、支付类网站避免使用未知脚本
- ✅ 定期检查已安装脚本是否有更新
- ⚠️ 脚本运行在沙箱中，`unsafeWindow` 会突破沙箱，慎用

---

## 四、详细使用示例：B站视频自动跳过广告

### 4.1 场景说明

在 B 站看视频时，有些视频开头有内置广告。作为用户我们希望：进入视频页面后，自动找到广告时间点并跳过，直接进入正片。

### 4.2 完整脚本代码

```javascript
// ==UserScript==
// @name         B站自动跳过广告
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自动检测并跳过B站视频内置广告，节省时间
// @author       demo
// @match        https://www.bilibili.com/video/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // 注入提示样式
    GM_addStyle(`
        .tm-skip-hint {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: #00d9ff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 99999;
            font-family: sans-serif;
        }
    `);

    function showHint(text) {
        const old = document.querySelector('.tm-skip-hint');
        if (old) old.remove();

        const hint = document.createElement('div');
        hint.className = 'tm-skip-hint';
        hint.textContent = text;
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 3000);
    }

    function findAndSkipAd() {
        const video = document.querySelector('video');
        if (!video) return;

        // 方案1：直接快进到60秒（跳过大部分片头广告）
        if (video.currentTime < 60 && video.duration > 60) {
            video.currentTime = 60;
            showHint('⏩ 已跳过片头广告');
            return;
        }

        // 方案2：检测播放进度条上的广告标记
        const progressBar = document.querySelector('.bilibili-player-video-progress');
        if (progressBar) {
            const adMarker = progressBar.querySelector('.ad-time-progress');
            if (adMarker) {
                const skipBtn = document.querySelector('.bilibili-player-video-skip');
                if (skipBtn) {
                    skipBtn.click();
                    showHint('⏩ 已点击跳过按钮');
                }
            }
        }
    }

    // 监听视频开始播放
    document.querySelector('video')?.addEventListener('play', function(e) {
        if (e.target.currentTime < 2) {
            setTimeout(findAndSkipAd, 500);
        }
    });

    // 监听页面加载完成
    window.addEventListener('load', function() {
        setTimeout(findAndSkipAd, 2000);
    });

    showHint('🎯 B站去广告脚本已启用');
})();
```

### 4.3 安装步骤

1. **安装油猴扩展**：访问 <https://www.tampermonkey.net/> 或浏览器应用商店，搜索并安装 Tampermonkey
2. **打开编辑器**：点击浏览器右上角的猴子图标 → **"创建新脚本"**
3. **粘贴代码**：清空默认内容，将上面的完整代码粘贴进去，按 `Ctrl + S` 保存
4. **访问目标网站**：打开 `https://www.bilibili.com/video/BVxxxxx` 任意视频页面
5. **验证效果**：右下角会出现提示，广告会被自动跳过

### 4.4 效果说明

| 操作 | 说明 |
|------|------|
| 页面加载完成 | 脚本自动检测视频状态 |
| 发现广告 | 自动将进度条拉到60秒或点击跳过按钮 |
| 页面右下角 | 显示浮窗提示操作状态 |
| 关闭页面 | 脚本自动停止，不影响其他网站 |

---

## 五、参考资料

- **官网安装**：<https://www.tampermonkey.net/>
- **官方 API 文档**：<https://tampermonkey.net/documentation.php>
- **脚本库 Greasy Fork**：<https://greasyfork.org/zh-CN> — 全球最大用户脚本社区
- **脚本库 OpenUserJS**：<https://openuserjs.org/>
- **维基百科**：<https://en.m.wikipedia.org/wiki/Tampermonkey>
- **CSDN 油猴入门教程**：<https://blog.csdn.net/WhiteNebula/article/details/145581566>
