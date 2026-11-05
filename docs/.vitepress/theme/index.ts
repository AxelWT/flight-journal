import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import HomeHero from './components/HomeHero.vue'
import Lock from './components/Lock.vue'
import './style.css'
import './gate.css'
import 'virtual:fj-lock.css'

export default {
    extends: DefaultTheme,
    Layout: () => {
        return h(DefaultTheme.Layout, null, {
            // 挂 layout-top 而非 hero 插槽：门厅覆盖层需要盖过导航栏
            'layout-top': () => h(HomeHero),
        })
    },
    enhanceApp({ app }) {
        app.provide('site-data', {})
        app.component('Lock', Lock)
    },
} satisfies Theme
