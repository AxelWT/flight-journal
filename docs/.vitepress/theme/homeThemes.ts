/**
 * 首页主题注册表 —— 新增主题的唯一入口
 *
 * 步骤：
 *   1. 在 components/ 下写一个主题组件（只负责视觉，不含切换逻辑）
 *   2. 在下面数组里加一行
 *
 * 切换标签、localStorage 记忆、SSR 默认渲染都由 HomeHero.vue 统一处理，
 * 现有代码无需再动。
 */

import type { Component } from 'vue'
import { markRaw } from 'vue'
import HomeGate from './components/HomeGate.vue'
import ClassicHome from './components/ClassicHome.vue'

export interface HomeTheme {
    /** 存入 localStorage 的 key，保持稳定不要改 */
    key: string
    /** 左下角切换标签上显示的名字 */
    label: string
    /** 该主题渲染的内容 */
    component: Component
}

export const homeThemes: HomeTheme[] = [
    { key: 'gate', label: '门厅', component: markRaw(HomeGate) },
    { key: 'classic', label: '落叶', component: markRaw(ClassicHome) },
]

/** 首次访问 / localStorage 失效时使用的默认主题 key */
export const defaultHomeThemeKey = 'gate'
