<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import FallingLeaves from './FallingLeaves.vue'
import HomeGate from './HomeGate.vue'

/**
 * 首页双主题控制器（挂在 layout-top，全站仅首页生效）：
 *   gate    — 门厅式封面页（树影光斑，全屏覆盖在 home 布局之上）
 *   classic — 落叶动画 + 文学 hero（原 6d6b468 版首页）
 * 选择存 localStorage，左下角文字开关切换。
 */

const STORAGE_KEY = 'fj-home-style'
type HomeStyle = 'gate' | 'classic'

const { frontmatter } = useData()
const isHome = computed(() => frontmatter.value.layout === 'home')

// SSR 与客户端首帧都先渲染默认的「门厅」，挂载后再读本地存储，
// 避免服务端/客户端渲染不一致
const style = ref<HomeStyle>('gate')

onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'gate' || saved === 'classic') style.value = saved
})

function toggle() {
    style.value = style.value === 'gate' ? 'classic' : 'gate'
    localStorage.setItem(STORAGE_KEY, style.value)
}
</script>

<template>
    <template v-if="isHome">
        <!-- 门厅版：整屏覆盖 home 布局 -->
        <HomeGate v-if="style === 'gate'" @switch-home="toggle" />

        <!-- 落叶版：home 布局本身即是页面，只需补上落叶与开关 -->
        <template v-else>
            <FallingLeaves />
            <div class="gate-corner gate-corner--bl">
                <button class="gate-link" type="button" aria-label="切换为门厅版首页" @click="toggle">
                    门厅版
                </button>
            </div>
        </template>
    </template>
</template>
