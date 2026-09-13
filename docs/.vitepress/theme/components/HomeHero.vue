<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import { homeThemes, defaultHomeThemeKey } from '../homeThemes'

/**
 * 首页主题控制器（挂在 layout-top，全站仅首页生效）。
 * 主题列表见 homeThemes.ts，新增主题只需在那边注册，
 * 本组件与各主题组件互不感知。
 */

const STORAGE_KEY = 'fj-home-style'

const { frontmatter } = useData()
const isHome = computed(() => frontmatter.value.layout === 'home')

// SSR 与客户端首帧都先渲染默认主题，挂载后再读本地存储，
// 避免服务端/客户端渲染不一致
const current = ref(defaultHomeThemeKey)

onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && homeThemes.some(t => t.key === saved)) current.value = saved
})

const activeTheme = computed(
    () => homeThemes.find(t => t.key === current.value) ?? homeThemes[0]
)

function select(key: string) {
    if (key === current.value) return
    current.value = key
    localStorage.setItem(STORAGE_KEY, key)
}
</script>

<template>
    <template v-if="isHome">
        <!-- 当前主题 -->
        <component :is="activeTheme.component" />

        <!-- 左下角：平铺主题标签，当前项高亮 -->
        <nav class="gate-corner gate-corner--bl home-theme-tabs" aria-label="首页样式">
            <template v-for="(t, i) in homeThemes" :key="t.key">
                <span v-if="i > 0" class="home-theme-tabs-sep" aria-hidden="true">·</span>
                <span
                    v-if="t.key === current"
                    class="home-theme-tab home-theme-tab--active"
                    aria-current="true"
                >
                    {{ t.label }}
                </span>
                <button
                    v-else
                    class="gate-link home-theme-tab"
                    type="button"
                    @click="select(t.key)"
                >
                    {{ t.label }}
                </button>
            </template>
        </nav>
    </template>
</template>
