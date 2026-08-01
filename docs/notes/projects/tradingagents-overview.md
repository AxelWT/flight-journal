# TradingAgents 项目技术架构详解

## 1. 项目概述

**TradingAgents** 是由 Tauric Research 开发的多智能体 LLM 金融交易框架（v0.2.5），发表于 arXiv（2412.20138）。它模拟真实世界交易公司的运作模式，部署多个专业化 LLM 驱动的智能体——从基本面分析师、情绪分析师、技术分析师，到交易员、风险管理和投资组合经理——协同评估市场条件并做出交易决策。

- **语言**: Python ≥ 3.10
- **核心依赖**: LangChain + LangGraph（状态图编排）、yfinance、pandas、Pydantic
- **LLM 支持**: OpenAI、Google Gemini、Anthropic Claude、xAI Grok、DeepSeek、Qwen、GLM、MiniMax、OpenRouter、Ollama（本地）、Azure OpenAI、AWS Bedrock 等 15+ 提供商
- **数据源**: Yahoo Finance、Alpha Vantage、FRED（宏观数据）、Polymarket（预测市场）、StockTwits、Reddit
- **部署方式**: pip 安装、Docker、CLI 交互式运行

---

## 2. 整体架构

项目采用 **LangGraph 状态图（StateGraph）** 作为核心编排引擎，将复杂的交易分析任务分解为多个专业角色，按流水线顺序执行，最终产出交易决策。

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                    CLI 层 (cli/)                         │
│  交互式界面 · Rich TUI · 用户选择 · 报告展示与保存       │
├─────────────────────────────────────────────────────────┤
│                 图编排层 (graph/)                         │
│  TradingAgentsGraph · StateGraph · 条件路由 · 信号处理   │
├─────────────────────────────────────────────────────────┤
│                 智能体层 (agents/)                        │
│  分析师 · 研究员 · 交易员 · 风险管理 · 投资组合经理      │
├─────────────────────────────────────────────────────────┤
│                 数据流层 (dataflows/)                     │
│  yfinance · Alpha Vantage · FRED · Polymarket · Reddit   │
├─────────────────────────────────────────────────────────┤
│                 LLM 客户端层 (llm_clients/)               │
│  工厂模式 · 多提供商适配 · 能力检测 · 结构化输出          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 核心工作流（LangGraph 状态图）

整个交易分析流程通过 LangGraph 的 `StateGraph` 编排为一个有向图，节点是各个智能体，边定义了数据流和控制流。

### 3.1 执行流水线

```
START
  │
  ▼
┌──────────────────┐
│  I. 分析师团队    │  （顺序执行，每个分析师带工具调用循环）
│  ├─ 市场分析师    │  → 股价数据 + 技术指标 + 验证快照
│  ├─ 情绪分析师    │  → 新闻 + StockTwits + Reddit（预取注入）
│  ├─ 新闻分析师    │  → 全球新闻 + 内幕交易 + 宏观指标 + 预测市场
│  └─ 基本面分析师  │  → 财务报表 + 资产负债表 + 现金流 + 利润表
└────────┬─────────┘
         ▼
┌──────────────────┐
│  II. 研究员团队   │  （多轮辩论制）
│  ├─ 看多研究员    │◄──┐  交替发言
│  ├─ 看空研究员    │───┘  (max_debate_rounds 轮)
│  └─ 研究经理      │  → 综合辩论 → 投资计划（结构化输出）
└────────┬─────────┘
         ▼
┌──────────────────┐
│  III. 交易员      │  → 将投资计划转化为具体交易提案（结构化输出）
└────────┬─────────┘
         ▼
┌──────────────────┐
│  IV. 风险管理团队 │  （三轮辩论制）
│  ├─ 激进分析师    │◄──┐
│  ├─ 保守分析师    │───┤  三人轮流发言
│  └─ 中性分析师    │───┘  (max_risk_discuss_rounds 轮)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  V. 投资组合经理  │  → 最终交易决策（结构化输出）
└────────┬─────────┘
         ▼
        END
```

### 3.2 状态定义（`AgentState`）

核心状态继承自 LangGraph 的 `MessagesState`，并扩展了以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `company_of_interest` | str | 目标股票代码 |
| `asset_type` | str | 资产类型（stock/crypto） |
| `instrument_context` | str | 确定性解析的工具上下文（公司名、行业等） |
| `trade_date` | str | 分析日期 |
| `market_report` | str | 市场分析师报告 |
| `sentiment_report` | str | 情绪分析师报告 |
| `news_report` | str | 新闻分析师报告 |
| `fundamentals_report` | str | 基本面分析师报告 |
| `investment_debate_state` | InvestDebateState | 多空辩论状态 |
| `investment_plan` | str | 研究经理的投资计划 |
| `trader_investment_plan` | str | 交易员的交易提案 |
| `risk_debate_state` | RiskDebateState | 风险辩论状态 |
| `final_trade_decision` | str | 最终交易决策 |
| `past_context` | str | 历史决策记忆上下文 |

### 3.3 条件路由（`ConditionalLogic`）

- **分析师工具循环**: 当 LLM 返回 `tool_calls` 时路由到对应的 `ToolNode`，否则清除消息进入下一分析师
- **研究辩论**: Bull ↔ Bear 交替发言，达到 `max_debate_rounds × 2` 轮后交给 Research Manager
- **风险辩论**: Aggressive → Conservative → Neutral 三人轮流，达到 `max_risk_discuss_rounds × 3` 轮后交给 Portfolio Manager

---

## 4. 智能体设计

### 4.1 分析师团队

#### 市场分析师（`market_analyst.py`）
- **工具**: `get_stock_data`、`get_indicators`、`get_verified_market_snapshot`
- **职责**: 从预定义的技术指标列表（SMA、EMA、MACD、RSI、布林带、ATR、VWMA）中选择最多 8 个互补指标，生成技术分析报告
- **特殊机制**: 调用 `get_verified_market_snapshot` 获取确定性数据快照，防止 LLM 编造价格数据

#### 情绪分析师（`sentiment_analyst.py`）
- **数据源**: Yahoo Finance 新闻 + StockTwits 消息 + Reddit 帖子（三个来源预取后注入 prompt）
- **输出**: 结构化 `SentimentReport`（Pydantic 模型），包含 `overall_band`（6 级情绪）、`overall_score`（0-10 分）、`confidence`、`narrative`
- **设计决策**: 不使用工具调用，数据预取后直接注入 prompt，避免 LLM 在工具调用过程中编造数据

#### 新闻分析师（`news_analyst.py`）
- **工具**: `get_news`、`get_global_news`、`get_insider_transactions`、`get_macro_indicators`、`get_prediction_markets`
- **职责**: 综合全球新闻、内幕交易、宏观经济指标和预测市场数据

#### 基本面分析师（`fundamentals_analyst.py`）
- **工具**: `get_fundamentals`、`get_balance_sheet`、`get_cashflow`、`get_income_statement`
- **职责**: 分析公司财务报表和基本面数据

### 4.2 研究员团队

#### 看多/看空研究员（`bull_researcher.py` / `bear_researcher.py`）
- 基于四份分析师报告进行多轮辩论
- 每轮更新 `investment_debate_state` 中的历史记录和当前回应

#### 研究经理（`research_manager.py`）
- 使用 `deep_think_llm`（更强的推理模型）
- 综合辩论结果，输出结构化 `ResearchPlan`：
  - `recommendation`: Buy / Overweight / Hold / Underweight / Sell
  - `rationale`: 辩论摘要
  - `strategic_actions`: 具体行动建议

### 4.3 交易员（`trader.py`）
- 将研究经理的投资计划转化为具体交易提案
- 输出结构化 `TraderProposal`：
  - `action`: Buy / Hold / Sell
  - `reasoning`: 推理依据
  - `entry_price`、`stop_loss`、`position_sizing`: 可选的具体参数

### 4.4 风险管理团队

三个辩论者角色（激进/保守/中性），围绕交易员的提案进行风险评估辩论：

- **激进分析师**（`aggressive_debator.py`）: 强调高回报机会，支持冒险策略
- **保守分析师**（`conservative_debator.py`）: 强调风险控制，主张谨慎
- **中性分析师**（`neutral_debator.py`）: 平衡观点，综合考量

### 4.5 投资组合经理（`portfolio_manager.py`）
- 使用 `deep_think_llm`
- 综合风险辩论结果，输出结构化 `PortfolioDecision`：
  - `rating`: Buy / Overweight / Hold / Underweight / Sell（5 级评级）
  - `executive_summary`: 行动摘要
  - `investment_thesis`: 详细投资论点
  - `price_target`、`time_horizon`: 可选参数

---

## 5. LLM 客户端架构

### 5.1 工厂模式（`factory.py`）

```python
create_llm_client(provider, model, base_url, **kwargs) → BaseLLMClient
```

- **原生 API**: Anthropic、Google、Azure、Bedrock 各有独立客户端
- **OpenAI 兼容系列**: 通过 `OPENAI_COMPATIBLE_PROVIDERS` 注册表统一管理，包含 15+ 提供商

### 5.2 OpenAI 兼容提供商注册表（`openai_client.py`）

| 提供商 | 端点 | 特殊处理 |
|--------|------|----------|
| openai | api.openai.com | Responses API |
| xai | api.x.ai | - |
| deepseek | api.deepseek.com | reasoning_content 回传 |
| qwen / qwen-cn | dashscope-intl / dashscope | 双区域 |
| glm / glm-cn | api.z.ai / open.bigmodel.cn | 双区域 |
| minimax / minimax-cn | api.minimax.io / api.minimaxi.com | reasoning_split |
| openrouter | openrouter.ai | - |
| ollama | localhost:11434 | 无密钥 |
| openai_compatible | 用户自定义 | 通用端点 |

### 5.3 模型能力表（`capabilities.py`）

声明式模型能力表，决定每个模型的结构化输出方式：

- `supports_tool_choice`: 是否支持 tool_choice 参数
- `supports_json_mode` / `supports_json_schema`: JSON 输出模式
- `preferred_structured_method`: 首选结构化方法
- `requires_reasoning_content_roundtrip`: DeepSeek 推理模式特有
- `requires_reasoning_split`: MiniMax M2.x 推理模型特有

### 5.4 结构化输出机制

三个决策节点（Research Manager、Trader、Portfolio Manager）和 Sentiment Analyst 使用 Pydantic schema 进行结构化输出：

1. 通过 `bind_structured()` 尝试绑定结构化输出
2. 如果提供商不支持，自动降级为自由文本生成
3. 结构化输出通过 `render_*()` 函数转回 markdown，保持下游兼容

---

## 6. 数据流架构

### 6.1 供应商路由系统（`interface.py`）

采用分层配置的供应商路由：

```
config["data_vendors"][category]  →  类别级默认
config["tool_vendors"][method]    →  工具级覆盖（优先级更高）
```

每个数据类别支持多供应商链式回退（如 `"yfinance,alpha_vantage"`），但不会静默使用未配置的供应商。

### 6.2 数据类别

| 类别 | 默认供应商 | 工具 |
|------|-----------|------|
| core_stock_apis | yfinance | OHLCV 股价数据 |
| technical_indicators | yfinance | 技术指标 |
| fundamental_data | yfinance | 公司基本面 |
| news_data | yfinance | 新闻和内幕数据 |
| macro_data | fred | 宏观经济指标 |
| prediction_markets | polymarket | 预测市场概率 |

### 6.3 符号标准化（`symbol_utils.py`）

自动标准化 ticker 符号（如 `XAUUSD` → `GC=F`），确保价格查询和身份解析使用同一标的。

### 6.4 错误处理

- `VendorRateLimitError`: 速率限制 → 尝试下一供应商
- `VendorNotConfiguredError`: 供应商未配置 → 尝试下一供应商
- `NoMarketDataError`: 无数据 → 返回 `NO_DATA_AVAILABLE` 哨兵值，明确告知 LLM 不要编造数据

---

## 7. 持久化与恢复

### 7.1 决策日志（`memory.py`）

- **位置**: `~/.tradingagents/memory/trading_memory.md`
- **格式**: 追加式 markdown，每条记录包含：`[日期 | Ticker | 评级 | 收益率 | Alpha | 持仓天数]`
- **生命周期**:
  1. `propagate()` 结束时写入 pending 条目（Phase A）
  2. 下次运行同一 ticker 时，获取实际收益率，生成反思，更新条目（Phase B）
- **记忆注入**: Portfolio Manager 的 prompt 中注入最近 5 条同 ticker 决策 + 3 条跨 ticker 经验教训

### 7.2 检查点恢复（`checkpointer.py`）

- **启用方式**: `config["checkpoint_enabled"] = True` 或 CLI `--checkpoint`
- **存储**: 每个 ticker 一个 SQLite 数据库（`~/.tradingagents/cache/checkpoints/<TICKER>.db`）
- **机制**: LangGraph 的 `SqliteSaver` 在每个节点后保存状态，崩溃后可从最后成功的步骤恢复
- **清理**: 成功完成后自动清除检查点

### 7.3 报告保存

CLI 自动将分析报告保存为结构化目录：

```
reports/<TICKER>_<TIMESTAMP>/
├── 1_analysts/
│   ├── market.md
│   ├── sentiment.md
│   ├── news.md
│   └── fundamentals.md
├── 2_research/
│   ├── bull.md
│   ├── bear.md
│   └── manager.md
├── 3_trading/
│   └── trader.md
├── 4_risk/
│   ├── aggressive.md
│   ├── conservative.md
│   └── neutral.md
├── 5_portfolio/
│   └── decision.md
└── complete_report.md
```

---

## 8. CLI 设计（`cli/`）

### 8.1 技术栈
- **Typer**: 命令行框架
- **Rich**: 终端 UI（Live 布局、Panel、Table、Spinner、Markdown 渲染）

### 8.2 交互流程（8 步）
1. 输入 ticker 符号（自动检测资产类型：stock/crypto）
2. 选择分析日期
3. 选择输出语言
4. 选择分析师团队（可选组合）
5. 选择研究深度（控制辩论轮数）
6. 选择 LLM 提供商
7. 选择思考模型（quick_think / deep_think）
8. 配置提供商特定参数（推理努力级别等）

### 8.3 实时显示
- **进度面板**: 各智能体状态（pending/in_progress/completed）
- **消息面板**: 最近的消息和工具调用
- **报告面板**: 当前正在生成的报告内容
- **统计面板**: LLM 调用数、工具调用数、Token 用量、已用时间

---

## 9. 配置系统（`default_config.py`）

### 9.1 环境变量覆盖

所有配置项都支持 `TRADINGAGENTS_*` 环境变量覆盖：

| 环境变量 | 配置键 | 类型 |
|----------|--------|------|
| `TRADINGAGENTS_LLM_PROVIDER` | llm_provider | str |
| `TRADINGAGENTS_DEEP_THINK_LLM` | deep_think_llm | str |
| `TRADINGAGENTS_QUICK_THINK_LLM` | quick_think_llm | str |
| `TRADINGAGENTS_LLM_BACKEND_URL` | backend_url | str |
| `TRADINGAGENTS_OUTPUT_LANGUAGE` | output_language | str |
| `TRADINGAGENTS_MAX_DEBATE_ROUNDS` | max_debate_rounds | int |
| `TRADINGAGENTS_TEMPERATURE` | temperature | float |
| `TRADINGAGENTS_CHECKPOINT_ENABLED` | checkpoint_enabled | bool |

### 9.2 关键配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| llm_provider | "openai" | LLM 提供商 |
| deep_think_llm | "gpt-5.5" | 复杂推理模型 |
| quick_think_llm | "gpt-5.4-mini" | 快速任务模型 |
| max_debate_rounds | 1 | 研究辩论轮数 |
| max_risk_discuss_rounds | 1 | 风险讨论轮数 |
| news_article_limit | 20 | 每个 ticker 最大新闻数 |
| global_news_article_limit | 10 | 全球新闻最大数 |
| output_language | "English" | 输出语言 |
| benchmark_ticker | None（自动检测） | Alpha 计算基准 |

---

## 10. 项目目录结构

```
TradingAgents/
├── main.py                      # Python API 入口
├── pyproject.toml               # 项目元数据和依赖
├── Dockerfile                   # Docker 多阶段构建
├── docker-compose.yml           # Docker Compose 配置
├── cli/                         # CLI 层
│   ├── main.py                  # Typer 应用主入口
│   ├── config.py                # CLI 配置
│   ├── models.py                # CLI 数据模型
│   ├── utils.py                 # 用户交互工具函数
│   ├── stats_handler.py         # LLM/工具调用统计
│   ├── announcements.py         # 公告获取与展示
│   └── static/                  # 静态资源（欢迎文本等）
├── tradingagents/               # 核心包
│   ├── __init__.py              # 包初始化（dotenv 加载、警告过滤）
│   ├── default_config.py        # 默认配置和环境变量覆盖
│   ├── agents/                  # 智能体层
│   │   ├── __init__.py          # 智能体工厂函数导出
│   │   ├── schemas.py           # Pydantic 结构化输出 schema
│   │   ├── analysts/            # 分析师智能体
│   │   │   ├── market_analyst.py
│   │   │   ├── sentiment_analyst.py
│   │   │   ├── news_analyst.py
│   │   │   ├── fundamentals_analyst.py
│   │   │   └── social_media_analyst.py  # 已废弃别名
│   │   ├── researchers/         # 研究员智能体
│   │   │   ├── bull_researcher.py
│   │   │   └── bear_researcher.py
│   │   ├── managers/            # 管理者智能体
│   │   │   ├── research_manager.py
│   │   │   └── portfolio_manager.py
│   │   ├── risk_mgmt/           # 风险管理智能体
│   │   │   ├── aggressive_debator.py
│   │   │   ├── conservative_debator.py
│   │   │   └── neutral_debator.py
│   │   ├── trader/              # 交易员智能体
│   │   │   └── trader.py
│   │   └── utils/               # 智能体工具函数
│   │       ├── agent_states.py  # 状态定义（AgentState 等）
│   │       ├── agent_utils.py   # 通用工具（身份解析、消息删除等）
│   │       ├── core_stock_tools.py
│   │       ├── fundamental_data_tools.py
│   │       ├── macro_data_tools.py
│   │       ├── market_data_validation_tools.py
│   │       ├── news_data_tools.py
│   │       ├── prediction_markets_tools.py
│   │       ├── technical_indicators_tools.py
│   │       ├── memory.py        # 决策日志系统
│   │       ├── rating.py        # 5 级评级解析
│   │       └── structured.py    # 结构化输出辅助
│   ├── graph/                   # 图编排层
│   │   ├── trading_graph.py     # TradingAgentsGraph 主类
│   │   ├── setup.py             # StateGraph 构建
│   │   ├── propagation.py       # 状态初始化和传播
│   │   ├── conditional_logic.py # 条件路由逻辑
│   │   ├── signal_processing.py # 信号提取（评级解析）
│   │   ├── reflection.py        # 决策反思
│   │   ├── checkpointer.py      # 检查点恢复
│   │   └── analyst_execution.py # 分析师执行计划
│   ├── llm_clients/             # LLM 客户端层
│   │   ├── factory.py           # 工厂函数
│   │   ├── base_client.py       # 抽象基类
│   │   ├── openai_client.py     # OpenAI 兼容客户端 + 提供商注册表
│   │   ├── anthropic_client.py  # Anthropic 客户端
│   │   ├── google_client.py     # Google Gemini 客户端
│   │   ├── azure_client.py      # Azure OpenAI 客户端
│   │   ├── bedrock_client.py    # AWS Bedrock 客户端
│   │   ├── capabilities.py      # 模型能力声明表
│   │   ├── model_catalog.py     # 模型目录
│   │   ├── validators.py        # 模型验证
│   │   └── api_key_env.py       # API Key 环境变量映射
│   └── dataflows/               # 数据流层
│       ├── interface.py         # 供应商路由接口
│       ├── config.py            # 数据流配置
│       ├── errors.py            # 自定义错误类型
│       ├── y_finance.py         # Yahoo Finance 适配
│       ├── yfinance_news.py     # Yahoo Finance 新闻
│       ├── alpha_vantage*.py    # Alpha Vantage 适配（多个模块）
│       ├── fred.py              # FRED 宏观数据
│       ├── polymarket.py        # Polymarket 预测市场
│       ├── reddit.py            # Reddit 数据获取
│       ├── stocktwits.py        # StockTwits 数据获取
│       ├── stockstats_utils.py  # 技术指标计算
│       ├── symbol_utils.py      # 符号标准化
│       ├── market_data_validator.py  # 市场数据验证
│       └── utils.py             # 工具函数（安全 ticker 等）
├── tests/                       # 测试套件（46 个测试文件）
├── scripts/                     # 辅助脚本
└── reports/                     # 示例分析报告
```

---

## 11. 关键设计模式

### 11.1 双 LLM 策略
- **quick_think_llm**: 用于分析师、研究员、交易员等日常任务（默认 gpt-5.4-mini）
- **deep_think_llm**: 用于需要深度推理的研究经理和投资组合经理（默认 gpt-5.5）

### 11.2 工具调用循环
分析师使用 LangGraph 的 `ToolNode` 实现 ReAct 模式：LLM 决定调用哪些工具 → 执行工具 → 将结果返回 LLM → LLM 继续分析或生成报告。

### 11.3 多轮辩论机制
- 研究团队：Bull ↔ Bear 交替辩论，Research Manager 裁决
- 风险团队：Aggressive → Conservative → Neutral 三人轮流，Portfolio Manager 裁决
- 辩论轮数可配置（`max_debate_rounds`、`max_risk_discuss_rounds`）

### 11.4 结构化输出 + 降级
关键决策节点使用 Pydantic schema 进行结构化输出，不支持的提供商自动降级为自由文本，确保最大兼容性。

### 11.5 确定性身份解析
在分析开始前通过 yfinance 确定性地解析 ticker 的公司名称、行业、交易所等信息，注入所有智能体的 prompt，防止 LLM 根据价格图表模式错误推断公司身份。

### 11.6 记忆与反思系统
- 每次决策记录到追加式日志
- 下次运行同一 ticker 时获取实际收益，生成反思
- 反思内容注入 Portfolio Manager 的 prompt，实现经验学习

### 11.7 多市场支持
通过 `benchmark_map` 自动检测 ticker 的交易所后缀，选择对应的区域基准指数进行 Alpha 计算（如 `.T` → Nikkei 225，`.HK` → Hang Seng）。

---

## 12. 测试架构

- **框架**: pytest + pytest-subtests
- **标记**: `unit`（快速隔离）、`integration`（需外部服务）、`smoke`（快速检查）
- **覆盖**: 46 个测试文件，覆盖 LLM 客户端、数据流、符号处理、CLI、检查点恢复、结构化输出等
- **Linting**: ruff（pyflakes + pycodestyle + isort + bugbear + pyupgrade + comprehensions）

---

## 13. 部署

### pip 安装
```bash
pip install .
```

### Docker
```bash
docker compose run --rm tradingagents
# 本地 Ollama 模型
docker compose --profile ollama run --rm tradingagents-ollama
```

### CLI 使用
```bash
tradingagents              # 交互式 CLI
tradingagents analyze      # 分析命令
tradingagents analyze --checkpoint  # 启用检查点恢复
```

### Python API
```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

config = DEFAULT_CONFIG.copy()
config["llm_provider"] = "openai"
config["deep_think_llm"] = "gpt-5.5"
config["quick_think_llm"] = "gpt-5.4-mini"

ta = TradingAgentsGraph(debug=True, config=config)
_, decision = ta.propagate("NVDA", "2026-01-15")
print(decision)
```
