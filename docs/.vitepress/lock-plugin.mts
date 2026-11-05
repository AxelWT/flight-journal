import type { Plugin } from 'vite'
import { createMarkdownRenderer, type MarkdownRenderer } from 'vitepress'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, join } from 'node:path'

const ITERATIONS = 150000

const VIRTUAL_ID = 'virtual:fj-lock.css'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

const LOCK_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='11' x='3' y='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/></svg>"

let root = ''
let base = '/'
let isBuild = false
let password = ''
let mdRenderer: MarkdownRenderer | null = null

const toB64 = (data: ArrayBuffer | Uint8Array): string => Buffer.from(data).toString('base64')

async function deriveKey(pwd: string, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pwd),
        'PBKDF2',
        false,
        ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    )
}

/** 扫描所有声明 lock: true 的文章，返回其站点路径（如 /read/dialogue/xxx） */
function scanLockedPages(dir: string): string[] {
    const urls: string[] = []
    const walk = (d: string) => {
        for (const entry of readdirSync(d, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
            const full = join(d, entry.name)
            if (entry.isDirectory()) {
                walk(full)
            } else if (entry.name.endsWith('.md')) {
                const raw = readFileSync(full, 'utf8')
                const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
                if (fm && /^lock:[ \t]*true[ \t]*$/m.test(fm[1])) {
                    urls.push('/' + relative(dir, full).replace(/\.md$/, '').replace(/\\/g, '/'))
                }
            }
        }
    }
    walk(dir)
    return urls
}

/** 生成侧边栏锁图标 CSS（mask 方式，自动跟随主题色与深色模式） */
function buildLockCss(): string {
    const urls = scanLockedPages(root)
    if (!urls.length) return '/* no locked pages */'

    const svgData = `data:image/svg+xml,${encodeURIComponent(LOCK_SVG)}`
    // VitePress 渲染的 href 为逐段 encodeURIComponent + .html，同时提供未编码变体兜底
    const hrefs = urls.flatMap((u) => [
        u.split('/').map(encodeURIComponent).join('/') + '.html',
        u + '.html',
    ])
    const links = hrefs.map((href) => `.VPSidebarItem a.link[href$="${href}"]`)
    // ::before 伪元素选择器必须逐个拼接，不能只挂在最后一个选择器后面
    const before = links.map((s) => `${s} .text::before`)
    const hover = links.map((s) => `${s}:hover .text::before`)
    const active = hrefs.flatMap((href) => [
        `.VPSidebarItem.is-active a.link[href$="${href}"] .text::before`,
        `.VPSidebarItem.active a.link[href$="${href}"] .text::before`,
    ])

    return `${before.join(',\n')} {
  content: "";
  display: inline-block;
  width: 13px;
  height: 13px;
  margin-right: 5px;
  vertical-align: -2px;
  background-color: var(--vp-c-text-3);
  -webkit-mask: url("${svgData}") no-repeat center / contain;
  mask: url("${svgData}") no-repeat center / contain;
  transition: background-color 0.2s ease;
}
${hover.join(',\n')},
${active.join(',\n')} {
  background-color: var(--vp-c-brand-1);
}
`
}

export function lockPlugin(): Plugin {
    return {
        name: 'flight-journal-lock',
        enforce: 'pre',
        configResolved(config) {
            root = config.root
            base = config.base
            isBuild = config.command === 'build'
            password = process.env.ENCRYPT_PASSWORD ?? ''
        },
        resolveId(id) {
            if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
        },
        load(id) {
            if (id === RESOLVED_VIRTUAL_ID) return buildLockCss()
        },
        async transform(code, id) {
            const file = id.split('?')[0]
            if (!file.endsWith('.md') || file.includes('node_modules')) return null

            const fm = code.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
            if (!fm) return null
            if (!/^lock:[ \t]*true[ \t]*$/m.test(fm[1])) return null

            if (!password) {
                const msg = `[lock] ${file} 声明了 lock: true，但未设置 ENCRYPT_PASSWORD`
                if (isBuild) {
                    throw new Error(`${msg}。为防明文泄露，构建已中止`)
                }
                this.warn(`${msg}。本地开发将以明文渲染`)
                return null
            }

            mdRenderer ??= await createMarkdownRenderer(root, {}, base)
            const html = mdRenderer.render(code.slice(fm[0].length))

            const salt = crypto.getRandomValues(new Uint8Array(16))
            const iv = crypto.getRandomValues(new Uint8Array(12))
            const key = await deriveKey(password, salt)
            const ct = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                new TextEncoder().encode(html),
            )

            const payload = Buffer.from(
                JSON.stringify({
                    v: 1,
                    iter: ITERATIONS,
                    salt: toB64(salt),
                    iv: toB64(iv),
                    ct: toB64(ct),
                }),
            ).toString('base64')

            return { code: `${fm[0]}\n<Lock cipher="${payload}" />\n`, map: null }
        },
    }
}
