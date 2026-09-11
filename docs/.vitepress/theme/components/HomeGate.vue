<script setup lang="ts">
import { useData, withBase } from 'vitepress'
import GateDapple from './GateDapple.vue'

/**
 * 首页 = 门厅，版式对齐 flight-space（lefos.com）：
 *   居中 wordmark → 下方一行「进入」 → 四角固定的小标签
 * 入场节奏：logo 0.5s、进入 1.5s、四角 2.9s，各自淡入 1 秒。
 */

const { isDark } = useData()

function toggleTheme() {
  isDark.value = !isDark.value
}
</script>

<template>
  <div class="gate">
    <!-- 光与暗角 -->
    <div class="gate-shade" aria-hidden="true"></div>

    <!-- 会缓慢晃动的树叶影子 -->
    <GateDapple />

    <!-- 居中 wordmark -->
    <div class="gate-layer">
      <a class="gate-logo" :href="withBase('/')" aria-label="Flight Journal">
        Flight Journal
      </a>
      <p class="gate-tagline">于代码与文字间，记录时代的回响</p>
    </div>

    <!-- 居中后整体下移：和参考站同一个 clamp -->
    <div class="gate-layer gate-layer--enter">
      <a class="gate-enter" :href="withBase('/explore/')">
        进入
      </a>
    </div>

    <!-- 四角 -->
    <div class="gate-corner gate-corner--tr">
      <a class="gate-link" :href="withBase('/about.html')">介绍</a>
    </div>

    <div class="gate-corner gate-corner--bl">
      <a
        class="gate-link"
        :href="withBase('/feed.xml')"
        target="_blank"
        rel="noreferrer"
      >
        RSS
      </a>
    </div>

    <div class="gate-corner gate-corner--br">
      <button
        class="gate-link"
        type="button"
        aria-label="切换深浅色"
        @click="toggleTheme"
      >
        {{ isDark ? '亮色' : '暗色' }}
      </button>
    </div>
  </div>
</template>
