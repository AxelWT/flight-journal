import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import FallingLeaves from './components/FallingLeaves.vue'
import './style.css'

export default {
    extends: DefaultTheme,
    Layout: () => {
        return h(DefaultTheme.Layout, null, {
            'home-hero-info-before': () => h(FallingLeaves),
        })
    },
    enhanceApp({ app }) {
        app.provide('site-data', {})
    },
} satisfies Theme
