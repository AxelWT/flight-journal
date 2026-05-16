import {defineConfig, createContentLoader} from 'vitepress'
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

export default defineConfig({
    lang: 'zh-CN',
    title: 'Flight Journal',
    description: 'Felix的个人博客',
    base: '/flight-journal/',
    head: [
        ['link', {rel: 'alternate', type: 'application/rss+xml', title: 'Flight Journal RSS', href: '/flight-journal/feed.xml'}],
    ],
    themeConfig: {
        nav: [
            {text: '首页', link: '/'},
            {text: '探索', link: '/explore/getting-started'},
            {text: '笔记', link: '/notes/getting-started'},
            {text: '读书', link: '/read/getting-started'},
            // {text: '指南', link: '/guide/getting-started'},
            {text: '介绍', link: '/about'},
        ],
        sidebar: {
            '/explore/': [
                {
                    text: '',
                    items: [
                        {text: '快速开始', link: '/explore/getting-started'},
                    ],
                },
                {
                    text: '技术',
                    items: [
                        {text: '2026-05-16 零知识证明：证明「我知道」却不用「告诉你」', link: '/explore/tech/2026-05-16-零知识证明-证明我知道却不用告诉你'},
                        {text: '2026-05-14 OLTP VS OLAP', link: '/explore/tech/2026-05-14-oltp-vs-olap'},
                        {text: '2026-05-13 WebAssembly：从浏览器小工具到改变软件世界的"万能运行时"', link: '/explore/tech/2026-05-13-WebAssembly从浏览器小工具到改变软件世界的万能运行时'},
                        {text: '2026-05-13 eBPF（extended Berkeley Packet Filter）——Linux 内核的超能力', link: '/explore/tech/2026-05-13-eBPF-Linux-内核的超能力'},
                        {text: '2026-05-12 WebTransport：Web 实时通信的下一次进化', link: '/explore/tech/2026-05-12-WebTransport-Web-实时通信的下一次进化'},
                        {text: '2026-05-12 油猴（Tampermonkey）：浏览器里的瑞士军刀', link: '/explore/tech/2026-05-12-油猴-Tampermonkey-浏览器里的瑞士军刀'},
                        {text: '2026-05-11 AI Agent：从"问答工具"到"数字员工"的进化', link: '/explore/tech/2026-05-11-AI-Agent-人工智能智能体-从问答工具到数字员工的进化'},
                        {text: '2026-05-11 后量子密码学（PQC）', link: '/explore/tech/2026-05-11-后量子密码学-PQC-Post-Quantum-Cryptography'},
                        {text: '2026-05-11 费曼学习法四步法', link: '/explore/tech/2026-05-11-费曼学习法四步法-Feynman-Technique'},
                        {text: '2026-05-10-CRDT：让多人协作"无冲突"同步的数学魔法', link: '/explore/tech/2026-05-10-CRDT-让多人协作无冲突同步的数学魔法'},
                        {text: '2026-05-10-gRPC — 把远程调用做成"本地函数"', link: '/explore/tech/2026-05-10-gRPC-把远程调用做成本地函数'},
                    ],
                },
                {
                    text: '大佬',
                    items: [
                        {text: '2026-05-15 黄仁勋（Jensen Huang）', link: '/explore/tycoon/2026-05-15-黄仁勋-jensen-huang'},
                        {text: '2026-05-14 硅谷"SPAC之王"——Chamath Palihapitiya', link: '/explore/tycoon/2026-05-14-硅谷spac之王-chamath-palihapitiya'},
                        {text: '2026-05-13 从"最聪明的人"到AGI预言家：Demis Hassabis', link: '/explore/tycoon/2026-05-13-从最聪明的人到AGI预言家DemisHassabis'},
                        {text: '2026-05-13 温斯顿·丘吉尔：坐在火山口上的铁血首相', link: '/explore/tycoon/2026-05-13-温斯顿丘吉尔坐在火山口上的铁血首相'},
                        {text: '2026-05-12 Dario Amodei：AI时代的冷峻预言者', link: '/explore/tycoon/2026-05-12-Dario-Amodei-AI时代的冷峻预言者'},
                        {text: '2026-05-11 理查德·费曼', link: '/explore/tycoon/2026-05-11-理查德费曼-Richard-Feynman'},
                        {text: '2026-05-10 Marc Andreessen', link: '/explore/tycoon/2026-05-10-Marc-Andreessen-马克-安德森'},
                    ],
                },
                {
                    text: '书',
                    items: [
                        {text: '2026-05-14 《思考，快与慢》——你的大脑，其实有两个"你"', link: '/explore/book/2026-05-14-思考快与慢-你的大脑其实有两个你'},
                        {text: '2026-05-12 《被讨厌的勇气》', link: '/explore/book/2026-05-12-被讨厌的勇气'},
                        {text: '2026-05-11 《人类简史：从动物到上帝》', link: '/explore/book/2026-05-11-人类简史从动物到上帝-Sapiens'},
                    ],
                },
            ],
            '/notes/': [
                {
                    text: '',
                    items: [
                        {text: '快速开始', link: '/notes/getting-started'},
                    ],
                },
                {
                    text: '心得',
                    items: [
                        {text: '心得-2026', link: '/notes/self/Insights-2026'},
                    ],
                },
                {
                    text: 'Agent',
                    items: [
                        {text: 'Learn Claude Code 项目总结', link: '/notes/agent/learn-claude-code项目总结'},
                        {text: 'Play Agents App', link: '/notes/agent/play-agents-app'},
                        {text: 'Claude Code 切换模型供应商', link: '/notes/agent/claude-provider-switch'},
                    ],
                },
                {
                    text: 'LLM',
                    items: [
                        {text: '微调课程 Part 1：微调基础', link: '/notes/llm/llm-course-part-1-fine-tuning'},
                        {text: '微调课程 Part 2：数据处理', link: '/notes/llm/llm-course-part-2-data-processing'},
                        {text: '微调课程 Part 3：分词器', link: '/notes/llm/llm-course-part-3-tokenizers'},
                        {text: '微调课程总结', link: '/notes/llm/llm-course微调课程总结'},
                    ],
                },
                {
                    text: 'Python',
                    items: [
                        {text: 'Asyncio 事件循环指南', link: '/notes/python/asyncio-event-loop-guide'},
                        {text: '环境变量作用域与存储', link: '/notes/python/environment-variables-scope-storage'},
                        {text: 'Git Worktree 指南', link: '/notes/python/git-worktree-guide'},
                        {text: 'Monkey Patch 指南', link: '/notes/python/monkey-patch-guide'},
                        {text: 'Psutil 系统监控', link: '/notes/python/psutil-system-monitor'},
                        {text: 'Pydantic 指南', link: '/notes/python/pydantic-guide'},
                        {text: 'Python 经典技巧', link: '/notes/python/python-classic-techniques'},
                        {text: 'Python 语法笔记', link: '/notes/python/python-syntax-notes'},
                        {text: '爬虫指南', link: '/notes/python/scraper-guide'},
                        {text: '爬虫模板/干活', link: '/notes/python/scraper-guide-template'},
                        {text: 'Tmux 指南', link: '/notes/python/tmux-guide'},
                    ],
                },
                {
                    text: 'Java',
                    items: [
                        {text: '网站搭建流程', link: '/notes/java/网站搭建流程'},
                        {text: '加解密服务', link: '/notes/java/加解密服务'},
                        {text: 'Java 服务调优', link: '/notes/java/Java服务调优'},
                        {text: 'JVM 分析工具', link: '/notes/java/JVM分析工具'},
                        {text: 'APM 工具', link: '/notes/java/APM工具'},
                        {text: 'Dubbo 框架', link: '/notes/java/Dubbo框架'},
                        {text: '服务限流组件', link: '/notes/java/服务限流组件'},
                        {text: 'Redis 缓存数据库', link: '/notes/java/Redis缓存数据库'},
                        {text: '12306 系统抢票原理', link: '/notes/java/12306系统抢票原理'},
                        {text: 'Kafka 消息队列', link: '/notes/java/kafka消息队列'},
                        {text: 'MySQL 数据库', link: '/notes/java/mysql数据库'},
                        {text: '实战踩坑', link: '/notes/java/实战踩坑'},
                        {text: '项目构建工具', link: '/notes/java/项目构建工具'},
                        {text: 'K8s管理', link: '/notes/java/K8S管理'},
                    ],
                },
                {
                    text: 'Tool',
                    items: [
                        {text: '网页颜色自定义油猴脚本', link: '/notes/tool/网页颜色自定义油猴脚本'},
                    ],
                },
            ],
            '/read/': [
                {
                    text: '',
                    items: [
                        {text: '快速开始', link: '/read/getting-started'},
                    ],
                },
                {
                    text: '投资',
                    items: [
                        {text: '《经济学原理》', link: '/read/invest/《经济学原理》'},
                        {text: '《聪明的投资者》', link: '/read/invest/《聪明的投资者》'},
                        {text: '《原则：应对变化中的世界秩序》', link: '/read/invest/《原则：应对变化中的世界秩序》'},
                        {text: '《富爸爸穷爸爸》', link: '/read/invest/《富爸爸穷爸爸》'},
                        {text: '《穷查理宝典》', link: '/read/invest/《穷查理宝典》'},
                        {text: '《纳瓦尔宝典》', link: '/read/invest/《纳瓦尔宝典》'},
                        {text: '《非对称风险》', link: '/read/invest/《非对称风险》'},
                        {text: '《段永平投资问答录》', link: '/read/invest/《段永平投资问答录》'},
                        {text: '《炒股的智慧》', link: '/read/invest/《炒股的智慧》'},
                        {text: '《交易心理分析》', link: '/read/invest/《交易心理分析》'},
                        {text: '基金知识笔记', link: '/read/invest/基金知识笔记'},
                        {text: '如何读懂经济和金融指标', link: '/read/invest/如何读懂经济和金融指标'},
                        {text: '利率和汇率变动的影响', link: '/read/invest/利率和汇率变动的影响'},
                        {text: '货币政策和中央银行', link: '/read/invest/货币政策和中央银行'},
                        {text: '如何看懂企业财报', link: '/read/invest/如何看懂企业财报'},
                        {text: '税相关笔记', link: '/read/invest/税相关笔记'},
                        {text: '稳定币学习笔记', link: '/read/invest/稳定币学习笔记'},
                        {text: '登链笔记', link: '/read/invest/登链笔记'},
                    ],
                },
                {
                    text: '沟通',
                    items: [
                        {text: '小菜一碟的心态是好是坏', link: '/read/communication/小菜一碟的心态是好是坏'},
                        {text: '《好好说话》', link: '/read/communication/《好好说话》'},
                        {text: '《蛤蟆先生去看心理医生》', link: '/read/communication/《蛤蟆先生去看心理医生》'},
                    ],
                },
                {
                    text: '摄影',
                    items: [
                        {text: '《美国纽约摄影学院摄影教材》', link: '/read/art/《美国纽约摄影学院摄影教材》'},
                    ],
                },
            ],
            '/guide/': [
                {
                    text: '指南',
                    items: [
                        {text: '快速开始', link: '/guide/getting-started'},
                        {text: 'VitePress 使用指南', link: '/guide/vitepress-guide'},
                        {text: '写作与部署教程', link: '/guide/workflow'},
                    ],
                },
            ],
        },
        socialLinks: [
            // {icon: 'github', link: 'https://github.com/AxelWT/flight-journal'},
            {icon: 'rss', link: '/flight-journal/feed.xml'},
        ],
        footer: {
            message: 'Move fast and break things',
            copyright: 'Copyright © 2026. All Rights Reserved.',
        },
        search: {
            provider: 'local',
        },
    },
    async buildEnd(siteConfig) {
        const posts = await createContentLoader('explore/**/*.md', {
            excerpt: true,
            render: true,
        }).load()

        const articles = posts
            .filter(p => p.frontmatter.date)
            .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
            .slice(0, 20)

        const base = siteConfig.site.base.replace(/\/$/, '')
        const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Flight Journal</title>
    <link>https://axelwt.github.io${base}/</link>
    <description>基于 VitePress 的个人博客</description>
    <language>zh-CN</language>
    <atom:link href="https://axelwt.github.io${base}/feed.xml" rel="self" type="application/rss+xml"/>
${articles.map(p => `    <item>
      <title>${escapeXml(p.frontmatter.title ?? '')}</title>
      <link>https://axelwt.github.io${base}${p.url}</link>
      <pubDate>${new Date(p.frontmatter.date).toUTCString()}</pubDate>
      <description><![CDATA[${p.html ?? ''}]]></description>
    </item>`).join('\n')}
  </channel>
</rss>`

        writeFileSync(resolve(siteConfig.outDir, 'feed.xml'), rss)
    },
})

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

