import {defineConfig} from 'vitepress'

export default defineConfig({
    lang: 'zh-CN',
    title: 'Flight Journal',
    description: '基于 VitePress 的个人博客',
    base: '/flight-journal/',
    themeConfig: {
        nav: [
            {text: '首页', link: '/'},
            {text: '探索', link: '/explore/getting-started'},
            {text: '笔记', link: '/notes/getting-started'},
            {text: '读书', link: '/read/getting-started'},
            {text: '指南', link: '/guide/getting-started'},
            {text: '介绍', link: '/about'},
        ],
        sidebar: {
            '/explore/': [
                {
                    text: 'AI 探索',
                    items: [
                        {text: '快速开始', link: '/explore/getting-started'},
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
                    text: 'Agent',
                    items: [
                        {text: 'Learn Claude Code 项目总结', link: '/notes/agent/learn-claude-code项目总结'},
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
                    text: '个人',
                    items: [
                        {text: '待办清单', link: '/notes/self/todo'},
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
                        {text: '《好好说话》', link: '/read/communication/《好好说话》'},
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
            {icon: 'github', link: 'https://github.com/AxelWT/flight-journal'},
        ],
    },
})
