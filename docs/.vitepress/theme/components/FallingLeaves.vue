<template>
    <div ref="container" class="falling-leaves" aria-hidden="true">
        <canvas ref="canvas"></canvas>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

const canvas = ref<HTMLCanvasElement | null>(null)
const container = ref<HTMLDivElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let leaves: Leaf[] = []
let width = 0
let height = 0
let dpr = 1
let t = 0
let wind = 0
let gust = 0

interface LeafColor {
    front: string
    back: string
    vein: string
}

const PALETTE: LeafColor[] = [
    { front: '#b03826', back: '#6e1d12', vein: '#3a0f08' },
    { front: '#c0511f', back: '#7a2f12', vein: '#3d170a' },
    { front: '#d4a017', back: '#8a6a0e', vein: '#4d3a08' },
    { front: '#9c4a1a', back: '#5e2c0f', vein: '#341707' },
    { front: '#b87333', back: '#6f4420', vein: '#3a2310' },
    { front: '#7a5c2a', back: '#4a3818', vein: '#281d0c' },
    { front: '#c4682a', back: '#7a3f17', vein: '#3d1f0b' },
    { front: '#a8431b', back: '#682712', vein: '#341409' },
]

interface Leaf {
    x: number
    y: number
    size: number
    speedY: number
    swayAmp: number
    swayFreq: number
    swayPhase: number
    rotation: number
    rotationSpeed: number
    color: LeafColor
    opacity: number
    depth: number
    flipPhase: number
    flipSpeed: number
}

function rand(min: number, max: number) {
    return Math.random() * (max - min) + min
}

function createLeaf(initial = false): Leaf {
    const depth = rand(0.12, 1)
    const size = rand(9, 15) + depth * rand(10, 24)
    return {
        x: rand(-60, width + 60),
        y: initial ? rand(0, height) : rand(-80, -20),
        size,
        speedY: rand(0.2, 0.45) + depth * rand(0.6, 1.5),
        swayAmp: rand(12, 45) * (0.5 + depth),
        swayFreq: rand(0.004, 0.012),
        swayPhase: rand(0, Math.PI * 2),
        rotation: rand(0, Math.PI * 2),
        rotationSpeed: rand(-0.022, 0.022) * (0.4 + depth),
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        opacity: rand(0.28, 0.45) + depth * rand(0.35, 0.55),
        depth,
        flipPhase: rand(0, Math.PI * 2),
        flipSpeed: rand(0.01, 0.028),
    }
}

function drawLeaf(leaf: Leaf) {
    if (!ctx) return
    const s = leaf.size
    const flip = Math.cos(t * leaf.flipSpeed + leaf.flipPhase)
    const showBack = flip < 0
    ctx.save()
    ctx.translate(leaf.x, leaf.y)
    ctx.rotate(leaf.rotation)
    ctx.scale(flip, 1)
    ctx.globalAlpha = leaf.opacity * (0.55 + 0.45 * Math.abs(flip))
    ctx.fillStyle = showBack ? leaf.color.back : leaf.color.front

    // stem
    ctx.strokeStyle = leaf.color.vein
    ctx.lineWidth = Math.max(0.6, s * 0.05)
    ctx.beginPath()
    ctx.moveTo(0, s)
    ctx.lineTo(0, s * 1.18)
    ctx.stroke()

    // leaf body via bezier curves
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.bezierCurveTo(s * 0.72, -s * 0.7, s * 0.72, s * 0.7, 0, s)
    ctx.bezierCurveTo(-s * 0.72, s * 0.7, -s * 0.72, -s * 0.7, 0, -s)
    ctx.closePath()
    ctx.fill()

    // central vein
    ctx.globalAlpha = leaf.opacity * 0.45
    ctx.strokeStyle = leaf.color.vein
    ctx.lineWidth = Math.max(0.5, s * 0.045)
    ctx.beginPath()
    ctx.moveTo(0, -s * 0.92)
    ctx.lineTo(0, s * 0.92)
    ctx.stroke()

    // side veins
    ctx.lineWidth = Math.max(0.3, s * 0.025)
    for (let i = 1; i <= 2; i++) {
        const yy = -s + (s * 2 * i) / 3
        ctx.beginPath()
        ctx.moveTo(0, yy)
        ctx.lineTo(s * 0.46, yy + s * 0.22)
        ctx.moveTo(0, yy)
        ctx.lineTo(-s * 0.46, yy + s * 0.22)
        ctx.stroke()
    }

    ctx.restore()
}

function update() {
    if (!ctx) return
    t += 1
    ctx.clearRect(0, 0, width, height)

    // global wind: slow drift + decaying gusts
    wind = Math.sin(t * 0.0015) * 0.45 + Math.sin(t * 0.0006 + 1.3) * 0.28
    gust *= 0.985
    if (Math.random() < 0.0014) gust += rand(-1.3, 1.3)
    const windEffect = wind + gust

    for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i]
        leaf.y += leaf.speedY
        leaf.x += Math.sin(t * leaf.swayFreq + leaf.swayPhase) * 0.6
        leaf.x += windEffect * (0.25 + leaf.depth * 0.85) * 0.5
        leaf.rotation += leaf.rotationSpeed

        drawLeaf(leaf)

        if (leaf.y > height + 50) {
            leaves[i] = createLeaf(false)
        } else if (leaf.x < -80) {
            leaf.x = width + 60
        } else if (leaf.x > width + 80) {
            leaf.x = -60
        }
    }
    raf = requestAnimationFrame(update)
}

function resize() {
    if (!canvas.value || !container.value) return
    const rect = container.value.getBoundingClientRect()
    dpr = window.devicePixelRatio || 1
    width = rect.width
    height = rect.height
    canvas.value.width = width * dpr
    canvas.value.height = height * dpr
    canvas.value.style.width = width + 'px'
    canvas.value.style.height = height + 'px'
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const count = Math.min(62, Math.max(22, Math.floor((width * height) / 22000)))
    leaves = []
    for (let i = 0; i < count; i++) {
        leaves.push(createLeaf(true))
    }
}

onMounted(() => {
    if (!canvas.value) return
    ctx = canvas.value.getContext('2d')
    if (!ctx) return
    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(update)
})

onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
})
</script>

<style scoped>
.falling-leaves {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
}
.falling-leaves canvas {
    display: block;
}
</style>
