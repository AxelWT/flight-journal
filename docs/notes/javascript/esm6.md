---
title: "ES6+ 与 ESM 模块"
date: 2026-08-26
description: ES2015 至 ES2024 的核心新特性，ES Modules 与 CommonJS 的对比、加载机制与互操作
tags:
  - JavaScript
  - ES6
  - ESM
  - 前端
  - 笔记
---

# ES6+ 与 ESM 模块

## 一、技术历史

| 年份 | 版本 | 关键特性 |
|------|------|---------|
| 2015 | ES2015 (ES6) | `let/const`、箭头函数、`class`、模板字符串、解构、默认参数、`Promise`、`Symbol`、`Map/Set`、模块、迭代器/生成器、`Proxy/Reflect` |
| 2016 | ES2016 | `**` 幂运算、`Array.prototype.includes` |
| 2017 | ES2017 | `async/await`、`Object.values/entries`、`Object.getOwnPropertyDescriptors`、字符串 padStart/padEnd |
| 2018 | ES2018 | 异步迭代器（`for await`）、rest/spread for objects、`Promise.finally`、正则增强 |
| 2019 | ES2019 | `Array.flat/flatMap`、`Object.fromEntries`、可选 catch 绑定、`Symbol.description` |
| 2020 | ES2020 | 可选链 `?.`、空值合并 `??`、`BigInt`、`Promise.allSettled`、`globalThis`、`String.matchAll`、动态 `import()` |
| 2021 | ES2021 | `Promise.any`、逻辑赋值 `||=` `&&=` `??=`、数字分隔符 `1_000_000`、`WeakRef`、`Array.at` |
| 2022 | ES2022 | 顶层 `await`、类字段、私有方法 `#m()`、`Object.hasOwn`、`Array.at`、`Error.cause`、`structuredClone` |
| 2023 | ES2023 | `findLast/findLastIndex`、Hashbang 注释、WeakMap key 支持 Symbol |
| 2024 | ES2024 | `Promise.withResolvers`、`Object.groupBy/Map.groupBy`、`String.isWellFormed`、`Atomics.waitAsync` |

> 💡 ES6 之后，TC39 改为**每年发布一个版本**，特性采用 staged 提案流程（Stage 0~4）逐步进入标准。

---

## 二、ES6 核心特性

### 2.1 let / const / 块级作用域

```js
{
  let a = 1
  const b = 2
  var c = 3
}
// console.log(a)  // ReferenceError
// console.log(b)  // ReferenceError
console.log(c)     // 3   var 泄漏到外层
```

### 2.2 箭头函数

```js
const add = (a, b) => a + b
const square = x => x * x
const log = (...args) => console.log(args)

// 单表达式返回对象需用括号包裹
const maker = name => ({ name })
```

### 2.3 模板字符串

```js
const name = 'world'
const html = `
  <h1>Hello ${name}</h1>
  <p>1 + 1 = ${1 + 1}</p>
`

// 标签模板
const raw = String.raw`\n${name}`   // '\\nworld'
function tag(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '')
}
tag`a=${1}, b=${2}`   // 'a=1, b=2'
```

### 2.4 解构赋值

```js
// 数组
const [a, b, ...rest] = [1, 2, 3, 4]   // a=1, b=2, rest=[3,4]
const [, , c] = [1, 2, 3]              // c=3
const [x = 10] = []                    // x=10  默认值

// 对象
const { name, age = 18, ...others } = { name: 'Tom', age: 20 }
// name='Tom', age=20, others={}

// 重命名 + 默认值
const { name: n = 'anon' } = {}        // n='anon'

// 函数参数解构
function render({ title, items = [] }) {
  return `${title}: ${items.join(', ')}`
}

// 交换变量
let p = 1, q = 2
[p, q] = [q, p]
```

### 2.5 默认参数与 rest/spread

```js
function f(a, b = 10, ...rest) {
  return [a, b, rest]
}
f(1)              // [1, 10, []]
f(1, 2, 3, 4)     // [1, 2, [3,4]]

// spread 展开
const arr = [1, 2, 3]
const copy = [...arr]
const merged = [...arr, 4, 5]

const obj = { a: 1 }
const obj2 = { ...obj, b: 2 }    // { a:1, b:2 }
```

### 2.6 class

```js
class Person {
  constructor(name, age) {
    this.name = name
    this.age = age
  }
  greet() { return `Hi, I'm ${this.name}` }
  static create(name) { return new Person(name, 0) }
}

class Student extends Person {
  constructor(name, age, grade) {
    super(name, age)
    this.grade = grade
  }
  greet() { return `${super.greet()} (grade ${this.grade})` }
}
```

### 2.7 Promise

```js
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve('done'), 100)
})

p.then(v => console.log(v))
 .catch(e => console.error(e))
 .finally(() => console.log('cleanup'))

// 链式
fetch(url)
  .then(r => r.json())
  .then(data => render(data))
```

### 2.8 Symbol / Map / Set

```js
// Symbol —— 唯一且不可枚举
const KEY = Symbol('key')
const obj = { [KEY]: 'hidden' }
Object.keys(obj)        // []
Object.getOwnPropertySymbols(obj)  // [Symbol(key)]

// Map —— 任意类型键，保持插入顺序
const m = new Map()
m.set('a', 1).set(2, 'two')
m.get(2)        // 'two'
m.size          // 2
for (const [k, v] of m) console.log(k, v)

// Set —— 唯一值集合
const s = new Set([1, 2, 2, 3])
;[...s]         // [1,2,3]

// WeakMap / WeakSet —— 键为对象，弱引用，不阻止 GC
const wm = new WeakMap()
wm.set(document.body, { meta: 'x' })
```

### 2.9 Proxy / Reflect

```js
const handler = {
  get(target, key, receiver) {
    console.log('get', key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    console.log('set', key, value)
    return Reflect.set(target, key, value, receiver)
  }
}

const proxy = new Proxy({ a: 1 }, handler)
proxy.a        // 'get a' → 1
proxy.b = 2    // 'set b 2'
```

### 2.10 迭代器与生成器

```js
// 自定义可迭代对象
const range = {
  from: 1, to: 3,
  [Symbol.iterator]() {
    let cur = this.from
    return {
      next: () => cur <= this.to
        ? { value: cur++, done: false }
        : { done: true }
    }
  }
}
;[...range]    // [1,2,3]

// 生成器
function* counter() {
  let i = 0
  while (true) yield i++
}
const g = counter()
g.next().value   // 0
g.next().value   // 1
```

---

## 三、ES2017+ 高频特性

### 3.1 async / await

```js
async function loadUser(id) {
  const r = await fetch(`/api/user/${id}`)
  if (!r.ok) throw new Error('http ' + r.status)
  return r.json()
}

// 错误处理
async function safe() {
  try {
    return await loadUser(1)
  } catch (e) {
    console.error(e)
    return null
  }
}

// 并发
const [u, p] = await Promise.all([loadUser(1), loadPost(1)])
```

### 3.2 可选链 ?.

```js
const city = user?.address?.city
const name = user?.profile?.getName?.() ?? 'anonymous'
const first = arr?.[0]
```

### 3.3 空值合并 ??

```js
// 仅当左侧为 null/undefined 才取右侧（区别于 || 会过滤 0、''、false）
const count = data.count ?? 10
const text  = config.text ?? 'default'

// 与 || 的差异
0  || 1     // 1
0  ?? 1     // 0
'' || 'd'   // 'd'
'' ?? 'd'   // ''
```

### 3.4 逻辑赋值

```js
a ||= b     // a = a || b（仅当 a 为假值时赋值）
a &&= b     // a = a && b（仅当 a 为真值时赋值）
a ??= b     // a = a ?? b（仅当 a 为 null/undefined 时赋值）
```

### 3.5 私有字段与方法

```js
class BankAccount {
  #balance = 0              // 私有字段
  #log(msg) { console.log(msg) }  // 私有方法
  deposit(n) { this.#balance += n; this.#log(`+${n}`) }
  get balance() { return this.#balance }
}

const acc = new BankAccount()
acc.#balance   // SyntaxError  外部不可访问
```

### 3.6 顶层 await

```js
// config.mjs —— 顶层直接 await，仅 ESM 支持
export const db = await connectDB()
```

### 3.7 structuredClone

```js
const original = { date: new Date(), arr: [{ x: 1 }] }
const copy = structuredClone(original)   // 深拷贝，支持 Date/Map/Set/循环引用
// 不支持的：Function、Symbol、DOM 节点
```

### 3.8 数字分隔符

```js
const million  = 1_000_000
const bytes    = 0xff_ff
const fraction = 1.000_001
```

---

## 四、ES Modules

### 4.1 基本语法

```js
// —— math.mjs ——
export const PI = 3.14159
export function add(a, b) { return a + b }
export default function multiply(a, b) { return a * b }

// —— main.mjs ——
import multiply, { add, PI } from './math.mjs'
import * as math from './math.mjs'
import('./math.mjs').then(m => m.add(1, 2))   // 动态 import
```

### 4.2 ESM vs CommonJS

| 维度 | ESM | CommonJS |
|------|-----|----------|
| 语法 | `import/export` | `require/module.exports` |
| 加载方式 | **异步**，编译期确定依赖图 | **同步**，运行时加载 |
| 输出 | **引用绑定**（live binding） | **值的拷贝** |
| 是否支持顶层 `await` | ✅ | ❌ |
| `this` 顶层 | `undefined` | `module.exports` |
| 是否严格模式 | 默认开启 | 否 |
| 是否支持循环依赖 | 是（live binding 缓解） | 是（但易拿到空对象） |
| 适用于 | 浏览器、现代 Node、Deno、Bun | Node 服务端、NPM 老库 |

```js
// CommonJS：值拷贝
// —— a.cjs ——
let count = 0
setTimeout(() => count = 1, 100)
module.exports = { get count() { return count } }

// —— b.cjs ——
const { count } = require('./a.cjs')   // 此刻被求值并固定
setTimeout(() => console.log(count), 200)   // 0

// ESM：live binding
// —— a.mjs ——
export let count = 0
setTimeout(() => count = 1, 100)

// —— b.mjs ——
import { count } from './a.mjs'
setTimeout(() => console.log(count), 200)   // 1
```

### 4.3 加载机制

ESM 加载分三个阶段：

1. **Construction**：解析模块文件，构建模块依赖图（不执行代码）
2. **Instantiation**：在内存中创建模块实例，建立 `import`/`export` 的 live binding（不赋值）
3. **Evaluation**：自底向上执行模块代码，完成绑定赋值

> 因此 `import` 必须放在文件顶层、字符串必须是静态路径，无法在 `if` 中条件 import（动态 `import()` 例外）。

### 4.4 浏览器中使用

```html
<!-- 默认 defer 行为，异步加载且在 DOM 解析完后执行 -->
<script type="module" src="/app.mjs"></script>

<!-- 内联模块 -->
<script type="module">
  import { greet } from '/utils.mjs'
  greet()
</script>

<!-- 旧浏览器降级 -->
<script nomodule src="/legacy.js"></script>
```

### 4.5 Node.js 中的 ESM

- 后缀 `.mjs` 默认按 ESM 解析
- `package.json` 设置 `"type": "module"` 后 `.js` 也按 ESM 解析
- CJS 中可用 `require('esm')` 加载 ESM 的具名导出（Node 22+ 支持），但纯 ESM 项目应避免混用
- 一些 CJS 内置变量在 ESM 中不可用：`__dirname`、`__filename`、`require`

```js
// ESM 中模拟 __dirname
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// import.meta 携带模块元信息
import.meta.url       // file:///path/to/file.mjs
import.meta.dirname   // Node 20.11+ 直接提供
```

### 4.6 包导出（package.json exports）

```json
{
  "name": "my-lib",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": {
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs"
    }
  }
}
```

### 4.7 循环依赖

```js
// —— a.mjs ——
import { b } from './b.mjs'
export const a = 'A'
console.log('a sees b =', b)   // 此时 b 可能还是 undefined（执行顺序依赖）

// —— b.mjs ——
import { a } from './a.mjs'
export const b = 'B'
console.log('b sees a =', a)
```

由于 live binding，循环引用下不会拿到"拷贝的旧值"，但若在初始化时使用对方导出，仍可能拿到 `undefined`。应尽量避免在模块顶层立即使用对方导出。

---

## 五、与构建工具的关系

| 工具 | 默认模块 | 是否需要打包 | 备注 |
|------|----------|--------------|------|
| Webpack | CJS / ESM | 是 | 转译为兼容代码 |
| Vite / Rollup | ESM | 开发期按需编译，生产期打包 | 推荐 ESM 优先 |
| esbuild | ESM / CJS | 可选 | 极快的转译 |
| Babel | 任意 | 否 | 仅语法降级，不解决模块解析 |
| TypeScript | ESM / CJS | 否 | `tsc` 仅做语法编译 |

> 现代前端项目应优先采用 **ESM + Vite/Rollup** 体系，配合 `browserslist` 自动决定是否降级。

---

## 六、参考

- [TC39 提案仓库](https://github.com/tc39/proposals)
- [MDN import](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Statements/import)
- [Node.js ESM 文档](https://nodejs.org/api/esm.html)
- [exploringjs.com](https://exploringjs.com/)
