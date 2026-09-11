/**
 * 树影（dappled light）
 *
 * 页面上没有可见的树叶，只有被窗外枝叶筛过之后落在纸面上的光斑与阴影。
 *
 * 两个关键点：
 * 1. 分远 / 中 / 近三层，模糊半径拉开差距，叶子轮廓从"糊成一团"过渡到"看得清形状"。
 * 2. 每一簇再拆成两组，两组节奏不同，所以影子会一边移动一边变形，
 *    而不是整块平移——这是"晃动"读得出来的关键。
 *
 * 全部用确定性随机，保证预渲染与浏览器端结果一致。
 */

export interface DappleLeaf {
  /** 在簇内的百分比位置 */
  xPct: number
  yPct: number
  /** 朝向（deg，0 = 向右） */
  angle: number
  /** 相对 40×20 叶片原型的缩放 */
  scale: number
}

export interface DappleCluster {
  key: string
  /** 簇中心的百分比位置（允许越界，让影子从画面外伸进来） */
  x: number
  y: number
  /** 簇的边长（px） */
  size: number
  /** 高斯模糊半径：越小轮廓越清楚 */
  blur: number
  opacity: number
  /** 摆动幅度（deg）与周期（s） */
  rot: number
  dur: number
  delay: number
  /** 摆动时的附加位移（px） */
  drift: number
  leaves: DappleLeaf[]
}

/** 叶片原型：基部在 (0,10)，叶尖朝右 */
export const LEAF_PATH = 'M0 10 C 11 1, 27 -1, 40 8 C 31 17, 12 20, 0 10 Z'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface ClusterSpec {
  key: string
  x: number
  y: number
  size: number
  blur: number
  opacity: number
  rot: number
  dur: number
  delay: number
  drift: number
  /** 1 = 向右舒展，-1 = 向左 */
  dir: 1 | -1
  count: number
  /** 单片叶子的基准长度（px） */
  leafSize: number
}

/**
 * 一簇影子：几片叶子沿一条微弯的枝向上排开。
 * 位置刻意铺得开一些，避免糊成一坨。
 */
function makeLeaves(seed: number, spec: ClusterSpec): DappleLeaf[] {
  const rng = mulberry32(seed)
  const leaves: DappleLeaf[] = []

  for (let i = 0; i < spec.count; i++) {
    const t = spec.count === 1 ? 0.5 : i / (spec.count - 1)
    const yPct = 86 - t * 62 + (rng() - 0.5) * 12
    const xPct =
      50 + spec.dir * Math.sin(t * Math.PI * 0.8) * 26 + (rng() - 0.5) * 16
    const angle = -90 + spec.dir * (20 + rng() * 62) + (rng() - 0.5) * 16
    const len = spec.leafSize * (0.66 + rng() * 0.62) * (1 - t * 0.16)

    leaves.push({ xPct, yPct, angle, scale: len / 40 })
  }

  return leaves
}

const LAYOUT: ClusterSpec[] = [
  // ---------- 远景：大、柔、慢 ----------
  { key: 'far-1', x: 12, y: 8, size: 640, blur: 18, opacity: 0.088, rot: 2.2, dur: 34, delay: -6, drift: 18, dir: 1, count: 6, leafSize: 150 },
  { key: 'far-2', x: 60, y: 4, size: 580, blur: 19, opacity: 0.082, rot: 2, dur: 38, delay: -21, drift: 16, dir: -1, count: 6, leafSize: 142 },
  { key: 'far-3', x: 90, y: 36, size: 600, blur: 17, opacity: 0.082, rot: 2.4, dur: 30, delay: -33, drift: 17, dir: -1, count: 5, leafSize: 148 },
  { key: 'far-4', x: 34, y: 78, size: 560, blur: 18, opacity: 0.076, rot: 2.1, dur: 36, delay: -12, drift: 15, dir: 1, count: 5, leafSize: 140 },

  // ---------- 中景 ----------
  { key: 'mid-1', x: 24, y: 28, size: 420, blur: 11, opacity: 0.13, rot: 4, dur: 15, delay: -4, drift: 22, dir: 1, count: 5, leafSize: 98 },
  { key: 'mid-2', x: 78, y: 14, size: 400, blur: 12, opacity: 0.122, rot: 3.6, dur: 17, delay: -15, drift: 20, dir: -1, count: 5, leafSize: 94 },
  { key: 'mid-3', x: 70, y: 64, size: 440, blur: 11, opacity: 0.122, rot: 4.2, dur: 13, delay: -9, drift: 22, dir: -1, count: 6, leafSize: 100 },
  { key: 'mid-4', x: 6, y: 62, size: 380, blur: 12, opacity: 0.112, rot: 3.8, dur: 18, delay: -24, drift: 19, dir: 1, count: 5, leafSize: 92 },

  // ---------- 近景：轮廓清楚、动得明显 ----------
  { key: 'near-1', x: 42, y: 10, size: 300, blur: 5, opacity: 0.172, rot: 6.5, dur: 8, delay: -2, drift: 32, dir: 1, count: 4, leafSize: 68 },
  { key: 'near-2', x: 86, y: 80, size: 320, blur: 5.5, opacity: 0.162, rot: 6, dur: 9, delay: -7, drift: 30, dir: -1, count: 5, leafSize: 72 },
  { key: 'near-3', x: 16, y: 90, size: 280, blur: 4.5, opacity: 0.155, rot: 7, dur: 6.8, delay: -5, drift: 34, dir: 1, count: 4, leafSize: 64 },
  { key: 'near-4', x: 58, y: 42, size: 260, blur: 5, opacity: 0.146, rot: 6.2, dur: 8.5, delay: -11, drift: 28, dir: -1, count: 4, leafSize: 60 },
]

export function buildDapple(seed: number): DappleCluster[] {
  const out: DappleCluster[] = []

  LAYOUT.forEach((spec, i) => {
    const all = makeLeaves(seed + i * 131, spec)

    // 拆成两组：同位置、不同节奏、位移方向相反 →
    // 影子一边移动一边剪切变形，看起来才像枝叶在风里动
    const groups: Array<{ suffix: string; leaves: DappleLeaf[] }> = [
      { suffix: 'a', leaves: all.filter((_, k) => k % 2 === 0) },
      { suffix: 'b', leaves: all.filter((_, k) => k % 2 === 1) },
    ]

    groups.forEach((group, gi) => {
      if (!group.leaves.length) return
      out.push({
        ...spec,
        key: `${spec.key}-${group.suffix}`,
        leaves: group.leaves,
        rot: gi === 0 ? spec.rot : spec.rot * 1.3,
        dur: gi === 0 ? spec.dur : spec.dur * 0.78,
        delay: gi === 0 ? spec.delay : spec.delay - spec.dur * 0.41,
        drift: gi === 0 ? spec.drift : -spec.drift,
      })
    })
  })

  return out
}
