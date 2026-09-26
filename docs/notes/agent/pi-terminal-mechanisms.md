# 终端机制与常用命令速查

> 由 pi 源码学习引出：`takeOverStdout()`（output-guard.ts）利用 stdout/stderr 分离保护协议输出，本文以此展开整理终端核心机制。

---

## 1. 三条标准流（Standard Streams）

Unix 进程启动时默认打开三个通道，即"三条标准流"：

| 流 | fd | 默认连接 | 用途 | Node 对应 |
|---|---|---|---|---|
| stdin（标准输入） | 0 | 键盘 | 程序读取输入 | `process.stdin` |
| stdout（标准输出） | 1 | 终端 | 程序的**正经结果**（数据） | `process.stdout` |
| stderr（标准错误） | 2 | 终端 | **诊断信息**（日志、警告、错误） | `process.stderr` |

### stdout vs stderr 的核心区别

- **用途**：stdout 是程序的"答案"，消费者通常是机器/下游程序；stderr 是诊断噪音，消费者通常是人
- **管道行为**：管道（`|`）只接 stdout，**stderr 不进管道**，直接打到终端

```bash
pi -p "list files" | jq .
```

如果 pi 把错误日志写进 stdout，`jq` 收到的是 JSON 混着报错文本，解析直接失败。分通道后：stdout → 干净的 JSON 进管道；stderr → 打到终端给人看。

**判断标准：这段输出是不是程序的"答案"？** 是 → stdout（`console.log`）；否（进度、警告、调试）→ stderr（`console.error`）。

### pi 的应用：takeOverStdout()

pi 在 print/json/rpc 模式下把 `process.stdout.write` 猴子补丁为重定向到 stderr：

- 第三方库乱写的 stdout → 改道 stderr（不污染协议流，人还能看到）
- pi 自己的协议输出 → 走 `writeRawStdout()`（原始 write 引用 + 背压重试 + 串行队列）
- `--help` / `--list-models` 这类"纯文本给人看"的命令不接管，保持直写

**设计思想：数据走 stdout，噪音走 stderr。**

---

## 2. 重定向（Redirection）

```bash
command > out.txt        # stdout → 文件（覆盖）
command >> out.txt       # stdout → 文件（追加）
command 2> err.txt       # stderr → 文件
command 2>> err.txt      # stderr → 文件（追加）
command > out.txt 2>&1   # 两者合并进同一文件（顺序重要：先重定向 stdout，再复制到 stderr）
command &> all.txt       # bash 简写：两者合并
command 2>/dev/null      # 丢弃错误信息（/dev/null 是黑洞设备）
command < in.txt         # 文件 → stdin
command <<< "text"       # 字符串 → stdin（herestring）
command << EOF
多行文本                  # heredoc：直到 EOF 的内容作为 stdin
EOF
```

**`2>&1` 的含义**：`2>` 是"把 fd 2 重定向到"，`&1` 是"fd 1 当前指向的位置"。所以 `> file 2>&1` 表示 stderr 跟随 stdout 去 file；写反（`2>&1 > file`）则 stderr 还是去终端。

---

## 3. 管道（Pipe）

```bash
cmdA | cmdB              # cmdA 的 stdout → cmdB 的 stdin
cmdA |& cmdB             # bash：stdout+stderr 一起管道（= cmdA 2>&1 | cmdB）
```

经典组合：

```bash
ps aux | grep node | grep -v grep
cat log | grep ERROR | wc -l
history | tail -20
```

### 常配管道用的文本处理命令

| 命令 | 作用 | 常用示例 |
|---|---|---|
| `grep` | 按模式过滤 | `grep -i error`（忽略大小写）、`grep -v pattern`（反选）、`grep -r pattern dir/`（递归） |
| `sed` | 流式替换 | `sed 's/foo/bar/g'`、`sed -n '10,20p' file`（打印 10-20 行） |
| `awk` | 按列处理 | `awk '{print $1}'`（第一列）、`awk -F: '{print $1}'`（冒号分隔） |
| `sort` | 排序 | `sort -n`（数值）、`sort -u`（去重）、`sort -rn`（数值倒序） |
| `uniq` | 去重相邻行 | `uniq -c`（计数），通常 `sort | uniq -c` 连用 |
| `head` / `tail` | 取头/尾 | `head -n 20`、`tail -f log`（**持续跟踪文件新增内容**） |
| `wc` | 计数 | `wc -l`（行数）、`wc -c`（字节） |
| `cut` | 按分隔符切列 | `cut -d: -f1 /etc/passwd` |
| `tr` | 字符替换/删除 | `tr 'a-z' 'A-Z'`、`tr -d '\r'` |
| `xargs` | 把 stdin 变成参数 | `find . -name '*.ts' | xargs grep TODO` |
| `tee` | 分流：同时写文件和 stdout | `cmd | tee log.txt`（配合 `| tee /dev/tty` 可边看边存） |

### 管道的本质与缓冲

- 管道是内核提供的有界缓冲区（通常 64KB），写满后写端**阻塞**（背压）
- 这就是 Node 里处理 `EAGAIN`/`ENOBUFS`、以及 pi `writeRawStdout()` 重试逻辑的来源：下游消费慢时，写方必须等待

---

## 4. TTY 判断（isTTY）

TTY = 终端。Node 中：

```javascript
process.stdin.isTTY    // 输入是否来自终端（管道/文件时为 undefined）
process.stdout.isTTY   // 输出是否写到终端
```

| 命令 | stdin.isTTY | stdout.isTTY |
|---|---|---|
| `pi`（终端直接跑） | true | true |
| `echo "hi" \| pi` | false | true |
| `pi -p "hi" \| cat` | true | false |

典型用法——**自动降级**：

```typescript
if (process.stdin.isTTY && process.stdout.isTTY) {
  // 终端 → 交互式 TUI
} else {
  // 管道/脚本 → 非交互 print 模式
}
```

其他相关机制：

- **颜色自动开关**：`chalk` 等库在 `isTTY === false` 时自动禁用 ANSI 颜色码，避免 `pi | tee log` 的日志文件里出现 `\x1b[31m` 乱码
- 可用 `FORCE_COLOR=1` / `NO_COLOR=1` 强制开关
- `test -t 1`（shell 判断 stdout 是否 TTY）、`[ -t 0 ]`（stdin）
- `script` 命令可伪终端录制会话；`unbuffer`/`stdbuf` 可强制行缓冲

---

## 5. 退出码（Exit Code）

进程退出时返回 0-255 的状态码，**0 = 成功，非 0 = 失败**：

```bash
command; echo $?        # 查看上一命令的退出码
command && next         # 前者成功(0)才执行
command || next         # 前者失败(非0)才执行
command && ok || fail   # 三元式（注意：ok 失败也会触发 fail）
```

常见约定：`1` 通用错误、`2` 用法错误（如 grep）、`126` 不可执行、`127` 命令不存在、`130` 被 Ctrl+C 终止（128+SIGINT）。

脚本中的意义：CI/管道靠退出码判断成败，所以 CLI 工具（包括 pi）必须在失败路径设置 `process.exitCode = 1`。

---

## 6. 信号（Signals）

进程间异步通知机制，`Ctrl+C` 等按键本质是终端向前台进程组发信号：

| 信号 | 触发 | 默认行为 | 可捕获 |
|---|---|---|---|
| `SIGINT` | Ctrl+C | 终止 | 是（Node: `process.on('SIGINT', ...)`，pi 用它做优雅退出） |
| `SIGTERM` | `kill <pid>` | 终止 | 是（Docker/K8s 停容器先发它，给清理机会） |
| `SIGKILL` | `kill -9 <pid>` | 立即终止 | **否**（无法捕获/忽略，最后手段） |
| `SIGHUP` | 终端关闭/挂断 | 终止 | 是（守护进程常用它重载配置） |
| `SIGQUIT` | Ctrl+\ | 终止+core dump | 是 |
| `SIGSTOP`/`SIGCONT` | Ctrl+S/Ctrl+Q 或 kill | 暂停/继续 | SIGSTOP 不可捕获 |

```bash
kill <pid>              # 发 SIGTERM
kill -9 <pid>           # 发 SIGKILL（强杀）
kill -l                 # 列出所有信号
pkill -f "pi -e"        # 按命令行模式杀进程
```

---

## 7. 任务控制（Job Control）

让命令在后台跑、或暂时挂起：

| 按键/命令 | 作用 |
|---|---|
| `cmd &` | 后台启动（但注意：现代实践用 `nohup`/`tmux`，且 logoscode 等工具推荐显式 background 参数而非 shell `&`） |
| Ctrl+Z | 挂起当前前台任务（发 SIGTSTP） |
| `bg` / `fg` | 让挂起的任务在后台继续 / 调回前台 |
| `jobs` | 列出当前 shell 的任务 |
| `nohup cmd &` | 后台运行且免疫 SIGHUP（终端关闭不死） |
| `disown` | 把已运行任务从 shell 移除，关闭 shell 不受影响 |

```bash
# 经典场景：SSH 到服务器跑长任务，断线不死
nohup ./build.sh > build.log 2>&1 &
# 或者直接用 tmux（推荐，可随时重连）
tmux new -s build && ./build.sh
# Ctrl+B D 脱离；tmux attach -t build 重连
```

---

## 8. 进程与文件描述符查看

```bash
ps aux | grep <name>        # 找进程
lsof -i :3000               # 谁占用了 3000 端口
lsof -p <pid>               # 进程打开的所有 fd（0/1/2 指向哪）
ls -l /proc/<pid>/fd        # Linux：直接看 fd 符号链接
pgrep -fl <pattern>         # 按名字找 pid
```

`lsof -p <pid>` 里可以看到 `0u`、`1u`、`2u` 分别指向哪——重定向后就不是 `/dev/tty` 而是文件或 pipe 了，这是理解三条流最直观的方式。

---

## 9. 终端转义与 ANSI 码

- **ANSI 转义序列**：`\x1b[31m`（红）、`\x1b[1m`（粗体）、`\x1b[0m`（重置）、`\x1b[2J`（清屏）
- TUI 程序（包括 pi 的 TUI 模式）靠这些序列画界面：光标定位、清行、前景/背景色
- 终端能力由 `TERM` 环境变量描述（`xterm-256color` 等），`tput` 可查询（`tput cols`、`tput colors`）
- 输出不是 TTY 时应禁用（见第 4 节），否则管道下游收到乱码

---

## 10. 快速对照：最常用的一行命令

```bash
# 查找与文本
grep -rn "TODO" src/                        # 递归找 TODO
find . -name "*.ts" -not -path "*/node_modules/*"
rg pattern                                  # ripgrep（更快，pi 内置 grep 工具用它）

# 日志排查
tail -f app.log | grep --line-buffered ERROR
journalctl -u service -f                    # systemd 服务日志

# 进程/端口
lsof -i :3000 && kill -9 $(lsof -t -i :3000)

# 组合统计
history | awk '{print $2}' | sort | uniq -c | sort -rn | head   # 最常用命令 Top10
```

---

## 相关源码索引

| 文件 | 内容 |
|---|---|
| `packages/coding-agent/src/core/output-guard.ts` | stdout 接管、原始写、背压重试 |
| `packages/coding-agent/src/main.ts:111` | `resolveAppMode`：基于 isTTY 决定 print/interactive 模式 |
| `packages/coding-agent/src/main.ts:128` | `isPlainRuntimeMetadataCommand`：--help/--list-models 不接管 |
