import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import HomeGate from './components/HomeGate.vue'
import './style.css'
import './gate.css'

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('HomeGate', HomeGate)
        app.provide('site-data', {})
    },
} satisfies Theme
