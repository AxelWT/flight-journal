<script setup lang="ts">
import { buildDapple, LEAF_PATH } from '../dapple'

// 固定种子：预渲染和浏览器端生成一致
const clusters = buildDapple(20260911)

const clusterStyle = (c: {
  x: number
  y: number
  size: number
  opacity: number
  rot: number
  dur: number
  delay: number
  drift: number
}) => ({
  left: `${c.x}%`,
  top: `${c.y}%`,
  width: `${c.size}px`,
  height: `${c.size}px`,
  marginLeft: `${-c.size / 2}px`,
  marginTop: `${-c.size / 2}px`,
  '--op': c.opacity,
  '--rot': `${c.rot}deg`,
  '--dur': `${c.dur}s`,
  '--delay': `${c.delay}s`,
  '--drift': `${c.drift}px`,
})

const leafTransform = (
  leaf: { xPct: number; yPct: number; angle: number; scale: number },
  size: number
) =>
  `translate(${((leaf.xPct / 100) * size).toFixed(1)} ${((leaf.yPct / 100) * size).toFixed(1)}) rotate(${leaf.angle.toFixed(1)}) scale(${leaf.scale.toFixed(3)})`
</script>

<template>
  <div class="gate-dapple" aria-hidden="true">
    <div
      v-for="c in clusters"
      :key="c.key"
      class="dap"
      :style="clusterStyle(c)"
    >
      <!-- 模糊放在静态内层：外层只做 transform / opacity，浏览器可以把它栅格化一次后直接合成 -->
      <div class="dap-blur" :style="{ filter: `blur(${c.blur}px)` }">
        <svg :viewBox="`0 0 ${c.size} ${c.size}`" preserveAspectRatio="none">
          <g
            v-for="(leaf, i) in c.leaves"
            :key="i"
            :transform="leafTransform(leaf, c.size)"
          >
            <path :d="LEAF_PATH" />
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>
