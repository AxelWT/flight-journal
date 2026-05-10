import {defineConfig} from 'vitepress'

export default defineConfig({
    lang: 'zh-CN',
    title: '我的博客',
    description: '基于 VitePress 的个人博客',
    base: '/flight-journal/',
    themeConfig: {
        nav: [
            {text: '首页', link: '/'},
            {text: '笔记', link: '/notes/getting-started'},
            {text: '读书', link: '/read/getting-started'},
            {text: '指南', link: '/guide/getting-started'},
            {text: '介绍', link: '/about'},
        ],
        sidebar: {
            '/notes/': [
                {
                    text: '笔记',
                    items: [
                        {text: '快速开始', link: '/notes/getting-started'},
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
                        {text: '投资入门笔记', link: '/read/invest/invest-101'},
                    ],
                },
                {
                    text: '沟通',
                    items: [
                        {text: '沟通技巧笔记', link: '/read/communication/talk-like-ted'},
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
