import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '我的博客',
  description: '基于 VitePress 的个人博客',
  base: '/my-vitepress-blog/',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
            items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: 'VitePress 使用指南', link: '/guide/vitepress-guide' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com' },
    ],
  },
})
