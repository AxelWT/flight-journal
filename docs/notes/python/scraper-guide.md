# Python 网络爬虫完全指南

> **最后更新**: 2026-05-11

---

## 一、爬虫基础

### 1.1 爬虫工作流程

```
1. 发送 HTTP 请求获取网页
2. 解析 HTML 提取目标数据
3. 存储数据（文件/数据库）
4. 处理翻页/跟进链接（如需要）
```

### 1.2 技术选型

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 静态页面 | requests + BeautifulSoup | 简单快速，资源消耗低 |
| 动态渲染页面 | Playwright / Selenium | 需要 JS 执行环境 |
| 大规模爬取 | Scrapy | 内置调度、去重、持久化 |
| API 爬取 | httpx / aiohttp | 直接请求 JSON，效率最高 |

### 1.3 合规与伦理

- 遵守 `robots.txt`：检查目标网站的爬取规则
- 控制请求频率：添加延迟，避免对服务器造成压力
- 不爬取敏感/个人信息
- 遵守网站的服务条款
- 设置正确的 User-Agent 标识自己

```python
import urllib.robotparser

rp = urllib.robotparser.RobotFileParser()
rp.set_url("https://example.com/robots.txt")
rp.read()
rp.can_fetch("MyBot", "https://example.com/page")  # True/False
```

---

## 二、HTTP 请求

### 2.1 requests（同步）

```python
import requests

# GET 请求
response = requests.get(
    "https://httpbin.org/get",
    params={"key": "value"},       # 查询参数
    headers={"User-Agent": "MyBot/1.0"},
    timeout=10,                     # 超时秒数
)

# 检查状态
response.raise_for_status()  # 4xx/5xx 抛异常

# 响应内容
response.text          # 字符串
response.json()        # 解析 JSON
response.content       # 字节
response.status_code   # 状态码
response.headers       # 响应头

# POST 请求
response = requests.post(
    "https://httpbin.org/post",
    json={"key": "value"},         # JSON body
    # 或 data={"key": "value"},    # 表单数据
)

# Session（复用连接，保持 Cookie）
session = requests.Session()
session.headers.update({"User-Agent": "MyBot/1.0"})
session.get("https://example.com/login")  # 获取 cookie
session.post("https://example.com/login", data={"user": "test", "pass": "test"})
session.get("https://example.com/protected")  # 带 cookie 访问
session.close()
```

### 2.2 httpx（同步/异步）

```python
import httpx

# 同步使用（与 requests 几乎相同）
response = httpx.get("https://httpbin.org/get")

# 异步使用
async def fetch_async():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://httpbin.org/get")
        return response.json()

# HTTP/2 支持
async with httpx.AsyncClient(http2=True) as client:
    response = await client.get("https://httpbin.org/get")
```

### 2.3 请求重试与错误处理

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_session(retries=3, backoff=1) -> requests.Session:
    """创建带重试策略的 Session"""
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff,  # 重试间隔：1s, 2s, 4s
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

session = create_session()
try:
    response = session.get("https://example.com", timeout=10)
    response.raise_for_status()
except requests.ConnectionError:
    print("Connection failed")
except requests.Timeout:
    print("Request timed out")
except requests.HTTPError as e:
    print(f"HTTP error: {e.response.status_code}")
```

---

## 三、HTML 解析

### 3.1 BeautifulSoup

```python
from bs4 import BeautifulSoup

html = """
<html>
  <head><title>Test Page</title></head>
  <body>
    <div class="content">
      <h1 id="title">Hello World</h1>
      <ul class="items">
        <li class="item active">Item 1</li>
        <li class="item">Item 2</li>
        <li class="item">Item 3</li>
      </ul>
      <a href="/next" data-type="link">Next Page</a>
    </div>
  </body>
</html>
"""

soup = BeautifulSoup(html, "html.parser")

# 选择元素
soup.title.string              # "Test Page"
soup.find("h1")                # 第一个 h1
soup.find("h1", id="title")    # 带 id 的 h1
soup.find_all("li", class_="item")  # 所有匹配的 li 列表
soup.select(".item.active")    # CSS 选择器
soup.select_one("div.content > h1")  # CSS 选择器（第一个）

# 获取属性和文本
item = soup.find("li")
item.text.strip()              # "Item 1"
item["class"]                  # ["item", "active"]
item.get("class", [])          # 安全获取属性

a_tag = soup.find("a")
a_tag["href"]                  # "/next"
a_tag["data-type"]             # "link"

# 遍历
for li in soup.select("li.item"):
    print(li.text.strip())
```

**解析器选择**：

| 解析器 | 传入参数 | 优势 | 劣势 |
|--------|---------|------|------|
| Python 内置 | `"html.parser"` | 无需安装 | 容错性一般 |
| lxml | `"lxml"` | 最快，容错强 | 需安装 C 扩展 |
| html5lib | `"html5lib"` | 最容错 | 最慢 |

> **推荐**：生产环境用 `"lxml"`，无依赖场景用 `"html.parser"`。

### 3.2 XPath（配合 lxml）

```python
from lxml import html

tree = html.fromstring(html_content)

# XPath 语法
tree.xpath("//h1/text()")                    # 所有 h1 的文本
tree.xpath("//li[@class='item']/text()")     # 带 class 的 li 文本
tree.xpath("//a/@href")                      # 所有 a 的 href 属性
tree.xpath("//div[@class='content']//li[1]") # content 下第一个 li
tree.xpath("count(//li)")                    # li 的数量
```

---

## 四、动态页面处理

当页面内容通过 JavaScript 动态加载时，需要浏览器渲染。

### 4.1 Playwright（推荐）

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 访问页面
    page.goto("https://quotes.toscrape.com/js/")

    # 等待内容加载
    page.wait_for_selector(".quote")

    # 提取数据
    quotes = page.query_selector_all(".quote")
    for quote in quotes:
        text = quote.query_selector(".text").inner_text()
        author = quote.query_selector(".author").inner_text()
        print(f"{author}: {text}")

    # 执行 JavaScript
    scroll_height = page.evaluate("document.body.scrollHeight")

    # 截图 / 生成 PDF
    page.screenshot(path="page.png")
    page.pdf(path="page.pdf")

    browser.close()
```

### 4.2 异步 Playwright

```python
import asyncio
from playwright.async_api import async_playwright

async def scrape():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://example.com")
        await page.wait_for_selector(".content")
        title = await page.title()
        await browser.close()
        return title
```

### 4.3 Playwright 反检测技巧

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",  # 隐藏自动化标志
        ]
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...",
        viewport={"width": 1920, "height": 1080},
        locale="zh-CN",
    )
    page = context.new_page()

    # 注入脚本隐藏 webdriver 标志
    page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    """)

    page.goto("https://example.com")
```

---

## 五、反爬对策

### 5.1 常见反爬手段与应对

| 反爬手段 | 检测方式 | 应对策略 |
|---------|---------|---------|
| User-Agent 检测 | 请求头无/异常 UA | 设置真实浏览器 UA |
| IP 频率限制 | 同 IP 高频请求 | 请求间隔 + 代理池 |
| Cookie/登录验证 | 需要登录态 | Session 保持 / Playwright 模拟登录 |
| JS 加密参数 | 请求含动态签名 | 逆向 JS 或使用 Playwright |
| 验证码 | 检测到异常弹出验证码 | OCR 识别 / 手动处理 / 降低频率 |
| 字体反爬 | CSS 字体映射替换文字 | 解析字体文件还原映射 |

### 5.2 代理池

```python
import random
import requests

proxies = [
    "http://proxy1:8080",
    "http://proxy2:8080",
    "http://proxy3:8080",
]

def request_with_proxy(url, max_retries=3):
    for attempt in range(max_retries):
        proxy = random.choice(proxies)
        try:
            response = requests.get(
                url,
                proxies={"http": proxy, "https": proxy},
                timeout=10,
            )
            response.raise_for_status()
            return response
        except (requests.ProxyError, requests.ConnectionError):
            continue
    raise Exception(f"Failed after {max_retries} retries")

# 免费代理源（可用性不稳定，生产环境建议使用付费服务）
# - https://www.free-proxy-list.net/
# - 付费：Luminati, Oxylabs, SmartProxy
```

### 5.3 请求速率控制

```python
import time
import random

def polite_request(url, min_delay=1.0, max_delay=3.0):
    """带随机延迟的请求，模拟人类行为"""
    response = requests.get(url, timeout=10)
    delay = random.uniform(min_delay, max_delay)
    time.sleep(delay)
    return response
```

---

## 六、数据存储

### 6.1 JSON 文件

```python
import json

data = [{"title": "Article 1", "url": "..."}, {"title": "Article 2", "url": "..."}]

# 写入
with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 读取
with open("data.json", encoding="utf-8") as f:
    data = json.load(f)
```

### 6.2 CSV 文件

```python
import csv

rows = [
    {"name": "Alice", "age": 30},
    {"name": "Bob", "age": 25},
]

# 写入
with open("data.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "age"])
    writer.writeheader()
    writer.writerows(rows)

# 读取
with open("data.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row["name"], row["age"])
```

### 6.3 SQLite 数据库

```python
import sqlite3

conn = sqlite3.connect("scraped.db")
conn.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE,
        content TEXT,
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""")

# 插入（自动去重）
conn.execute(
    "INSERT OR IGNORE INTO articles (title, url, content) VALUES (?, ?, ?)",
    ("Article Title", "https://...", "Content...")
)
conn.commit()

# 查询
for row in conn.execute("SELECT title, url FROM articles"):
    print(row)

conn.close()
```

---

## 七、Scrapy 框架

### 7.1 项目结构

```bash
scrapy startproject myproject
cd myproject
scrapy genspider example example.com
```

```
myproject/
├── scrapy.cfg           # 项目配置
└── myproject/
    ├── __init__.py
    ├── items.py         # 数据模型
    ├── middlewares.py   # 中间件
    ├── pipelines.py     # 数据处理管道
    ├── settings.py      # 全局设置
    └── spiders/
        └── example.py   # 爬虫
```

### 7.2 编写爬虫

```python
import scrapy

class QuotesSpider(scrapy.Spider):
    name = "quotes"
    start_urls = ["https://quotes.toscrape.com/"]

    def parse(self, response):
        # 提取数据
        for quote in response.css("div.quote"):
            yield {
                "text": quote.css("span.text::text").get(),
                "author": quote.css("small.author::text").get(),
                "tags": quote.css("div.tags a.tag::text").getall(),
            }

        # 跟进翻页链接
        next_page = response.css("li.next a::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)
```

**运行**：

```bash
# 基本运行
scrapy crawl quotes

# 导出为 JSON
scrapy crawl quotes -O quotes.json

# 导出为 CSV
scrapy crawl quotes -O quotes.csv
```

### 7.3 常用设置（settings.py）

```python
# 并发请求数
CONCURRENT_REQUESTS = 16

# 下载延迟（秒）
DOWNLOAD_DELAY = 1.0

# 随机化延迟（0.5x ~ 1.5x DOWNLOAD_DELAY）
RANDOMIZE_DOWNLOAD_DELAY = True

# User-Agent
USER_AGENT = "MyBot/1.0"

# 遵守 robots.txt
ROBOTSTXT_OBEY = True

# 重试
RETRY_ENABLED = True
RETRY_TIMES = 3

# 自动限速
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0
```

---

## 八、完整示例：多页爬虫

```python
import requests
from bs4 import BeautifulSoup
import csv
import time
import random

BASE_URL = "https://quotes.toscrape.com"

def scrape_all_quotes(max_pages=None):
    """爬取所有页面的名言"""
    all_quotes = []
    page = 1

    while True:
        url = f"{BASE_URL}/page/{page}/"
        print(f"Scraping page {page}...")

        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            break

        soup = BeautifulSoup(response.text, "html.parser")
        quotes = soup.select("div.quote")

        if not quotes:
            break

        for quote in quotes:
            all_quotes.append({
                "text": quote.select_one("span.text").text,
                "author": quote.select_one("small.author").text,
                "tags": ", ".join(t.text for t in quote.select("a.tag")),
            })

        # 检查是否有下一页
        next_btn = soup.select_one("li.next")
        if not next_btn:
            break

        page += 1
        if max_pages and page > max_pages:
            break

        # 礼貌延迟
        time.sleep(random.uniform(1.0, 2.0))

    return all_quotes

def save_to_csv(quotes, filename="quotes.csv"):
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "author", "tags"])
        writer.writeheader()
        writer.writerows(quotes)

if __name__ == "__main__":
    quotes = scrape_all_quotes()
    print(f"Scraped {len(quotes)} quotes")
    save_to_csv(quotes)
```

---

## 九、调试技巧

| 问题 | 排查方法 |
|------|---------|
| 返回空数据 | 浏览器 F12 对比 Network 请求，检查是否需要 Cookie/Header |
| 403 Forbidden | 检查 User-Agent、Referer、Cookie |
| 数据加载慢 | 使用 Playwright `wait_for_selector` 而非固定 sleep |
| 编码乱码 | 检查 `response.encoding`，可能需要设为 `response.apparent_encoding` |
| SSL 错误 | `verify=False`（不推荐生产环境）或更新证书 |

```python
# 编码处理
response = requests.get(url)
response.encoding = response.apparent_encoding  # 自动检测编码
print(response.text)
```

---

*最后更新: 2026-05-11*
