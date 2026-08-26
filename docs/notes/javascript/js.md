---
title: "JavaScript 核心语法与历史"
date: 2026-08-26
description: JavaScript 语言核心语法、类型系统、作用域、闭包、原型链、异步模型与版本演进
tags:
  - JavaScript
  - 前端
  - 语法
  - 笔记
---

# JavaScript 核心语法与历史

## 一、技术历史

| 时间 | 事件 |
|------|------|
| 1995 | Brendan Eich 用 10 天在 Netscape 写出 Mocha，后更名 LiveScript，最终定名 JavaScript |
| 1997 | ECMAScript 1 发布，标准化为 ECMA-262 |
| 2005 | AJAX 概念提出，jQuery/Prototype 等库兴起，前端进入动态交互时代 |
| 2009 | ES5 发布，引入严格模式、`JSON`、`Object.create`、`Array` 方法扩展 |
| 2009 | Node.js 诞生，JS 进入服务端领域，CommonJS 模块规范成形 |
| 2015 | ES6（ES2015）发布，是历史上最大的一次升级：`let/const`、箭头函数、类、模块、Promise、Symbol |
| 2016 至今 | 每年发布一个版本（ES2016~ES2024），渐进式演进；ESM（ES Modules）成为标准 |
| 2020+ | Deno、Bun 等新运行时涌现，原生支持 ESM；V8、SpiderMonkey 持续优化 JIT |

> 💡 "JavaScript" 是商标（Oracle 持有），语言规范正式名称为 **ECMAScript**（简称 ES）。

---

## 二、数据类型

### 2.1 八种类型

```js
// 7 种原始类型（Primitive）
let str   = 'hello'        // string
let num   = 42             // number（含整数与浮点，IEEE 754 双精度）
let big   = 9007199254740993n  // bigint（任意精度整数）
let bool  = true           // boolean
let undef = undefined      // undefined（未赋值）
let nul   = null           // null（空指针，typeof 返回 'object'，历史 bug）
let sym   = Symbol('id')   // symbol（唯一标识符）

// 1 种引用类型
let obj   = { a: 1 }       // object（含 Array/Function/Date/RegExp/Map/Set...）
```

### 2.2 类型判断

```js
typeof 'a'           // 'string'
typeof null          // 'object'      ⚠️ 历史 bug
typeof function(){}  // 'function'

// 精确判断
Object.prototype.toString.call([])
// '[object Array]'
Object.prototype.toString.call(null)
// '[object Null]'

// 实例判断
Array.isArray([])    // true
instanceof           // 沿原型链查找
```

### 2.3 类型转换

```js
// 隐式转换（"==" 比较时）——  永远建议用 "==="
Number('')           // 0
Number('123')        // 123
Number('12a')        // NaN
Number(null)         // 0
Number(undefined)    // NaN
Number([])           // 0
Number([1])          // 1
Number([1,2])        // NaN
Number({})           // NaN

// 对象转原始值：依次调用 [Symbol.toPrimitive] → valueOf → toString
const o = { valueOf() { return 42 } }
o + 1                // 43
```

---

## 三、变量与作用域

### 3.1 三种声明方式

| 声明 | 作用域 | 提升 | 重复声明 | 是否可变 |
|------|--------|------|----------|----------|
| `var` | 函数作用域 | 是（值为 `undefined`） | 允许 | 可变 |
| `let` | 块级作用域 | 否（TDZ） | 不允许 | 可变 |
| `const` | 块级作用域 | 否（TDZ） | 不允许 | 不可重新赋值（但对象内部可改） |

```js
// 暂时性死区（TDZ）
console.log(a)  // ReferenceError
let a = 1

// const 引用不可变，内容可变
const arr = []
arr.push(1)     // OK
arr = [1]       // TypeError
```

### 3.2 作用域链

函数在**定义时**就确定了它访问的变量范围（词法作用域 / 静态作用域），与调用位置无关。

```js
let x = 'outer'
function readX() { return x }

function caller() {
  let x = 'inner'
  return readX()
}

caller()  // 'outer'  而非 'inner'
```

### 3.3 闭包

函数携带其定义环境的变量引用，即使外层函数已返回，内层函数仍能访问。

```js
function counter() {
  let n = 0
  return () => ++n   // 闭包捕获 n
}
const c = counter()
c()  // 1
c()  // 2

// 经典陷阱：循环中的 var
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)  // 3 3 3
}
// 修复 1：let
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)  // 0 1 2
}
// 修复 2：IIFE
for (var i = 0; i < 3; i++) {
  ;(i => setTimeout(() => console.log(i), 0))(i)
}
```

---

## 四、原型链与面向对象

### 4.1 原型链结构

```
实例 ──► 构造函数.prototype ──► Object.prototype ──► null
```

```js
function Animal(name) { this.name = name }
Animal.prototype.speak = function() { return `${this.name} speaks` }

const a = new Animal('cat')
a.speak()                  // 'cat speaks'
a.__proto__ === Animal.prototype        // true
Animal.prototype.__proto__ === Object.prototype  // true
Object.prototype.__proto__             // null
```

### 4.2 class 语法（ES6+，本质是语法糖）

```js
class Animal {
  #age = 0                  // 私有字段（ES2022）
  static count = 0          // 静态字段

  constructor(name) {
    this.name = name
    Animal.count++
  }

  speak() { return `${this.name} speaks` }
  get age() { return this.#age }
  set age(v) { this.#age = v }
}

class Dog extends Animal {
  constructor(name) {
    super(name)             // 必须在使用 this 之前调用
  }
  speak() { return `${this.name} barks` }
}

const d = new Dog('Rex')
d.speak()      // 'Rex barks'
d instanceof Animal   // true
Dog.__proto__ === Animal              // true（子类继承父类）
Dog.prototype.__proto__ === Animal.prototype  // true（子类原型继承父类原型）
```

### 4.3 new 的执行过程

1. 创建一个空对象 `obj`
2. 设置 `obj.__proto__ = Constructor.prototype`
3. 以 `obj` 为 `this` 执行构造函数
4. 若构造函数返回对象则用之，否则返回 `obj`

```js
function myNew(Ctor, ...args) {
  const obj = Object.create(Ctor.prototype)
  const ret = Ctor.apply(obj, args)
  return (ret && typeof ret === 'object') ? ret : obj
}
```

---

## 五、this 指向

`this` 在函数**调用时**确定，与定义位置无关。

| 调用方式 | `this` |
|----------|--------|
| 普通函数 `fn()` | 严格模式 `undefined`，非严格 `globalThis` |
| 方法 `obj.fn()` | `obj` |
| `new Fn()` | 新创建的对象 |
| `fn.call/apply/bind(obj, ...)` | 显式绑定的 `obj` |
| 箭头函数 | 继承外层作用域的 `this`，无法被改变 |

```js
const obj = {
  name: 'A',
  arrow: () => console.log(this.name),       // 继承外层 this
  normal() { console.log(this.name) }        // 谁调用指向谁
}
obj.arrow()     // undefined
obj.normal()    // 'A'

const detached = obj.normal
detached()      // undefined / 报错（严格模式）
```

---

## 六、异步编程

### 6.1 事件循环模型

```
调用栈  ←─  微任务队列（Promise、queueMicrotask、MutationObserver）
        ←─  宏任务队列（setTimeout、setInterval、I/O、UI 事件）
```

每轮循环：执行一个宏任务 → 清空所有微任务 → 渲染 UI → 进入下一轮。

```js
console.log(1)
setTimeout(() => console.log(2), 0)
Promise.resolve().then(() => console.log(3))
console.log(4)
// 输出：1 4 3 2
```

### 6.2 三种异步写法

```js
// 1. 回调（callback hell）
getUser(id, user => getPosts(user, posts => ...))

// 2. Promise
getUser(id)
  .then(user => getPosts(user))
  .then(posts => render(posts))
  .catch(err => console.error(err))
  .finally(() => loading = false)

// 3. async/await（ES2017，基于 Promise 的语法糖）
async function load() {
  try {
    const user  = await getUser(id)
    const posts = await getPosts(user)
    render(posts)
  } catch (err) {
    console.error(err)
  } finally {
    loading = false
  }
}
```

### 6.3 并发控制

```js
// 全部完成（有一个失败则整体失败）
const [a, b, c] = await Promise.all([fa(), fb(), fc()])

// 全部完成并保留每个结果（无论成功失败）
const results = await Promise.allSettled([fa(), fb(), fc()])
// [{status:'fulfilled', value:1}, {status:'rejected', reason:Error}]

// 任一完成即返回
const first = await Promise.race([fa(), fb()])

// 任一成功即返回（ES2021）
const ok = await Promise.any([fa(), fb()])
```

---

## 七、数组与对象常用 API

### 7.1 数组

```js
const arr = [1, 2, 3, 4, 5]

// 不修改原数组
arr.map(x => x * 2)             // [2,4,6,8,10]
arr.filter(x => x > 2)          // [3,4,5]
arr.reduce((s, x) => s + x, 0)  // 15
arr.find(x => x > 3)            // 4
arr.findLast(x => x > 3)        // 5（ES2023）
arr.findIndex(x => x > 3)       // 2
arr.some(x => x > 4)            // true
arr.every(x => x > 0)           // true
arr.flat()                      // 拍平一层
arr.flatMap(x => [x, x*2])      // map + flat
arr.slice(1, 3)                 // [2,3]
arr.concat([6])                 // [1,2,3,4,5,6]
arr.at(-1)                      // 5（支持负索引，ES2022）

// 修改原数组
arr.push(6); arr.pop()
arr.unshift(0); arr.shift()
arr.splice(1, 2)                // 删除 [2,3]
arr.sort((a, b) => a - b)
arr.reverse()

// 遍历
arr.forEach((v, i) => console.log(i, v))
for (const [i, v] of arr.entries()) console.log(i, v)
```

### 7.2 对象

```js
const obj = { a: 1, b: 2, c: 3 }

// 解构
const { a, b: bb, ...rest } = obj   // a=1, bb=2, rest={c:3}

// 拷贝
const shallow = { ...obj }              // 浅拷贝
const deep = structuredClone(obj)       // 深拷贝（内置，ES2022）

// 合并
const merged = { ...obj, d: 4 }

// 遍历
Object.keys(obj)      // ['a','b','c']
Object.values(obj)    // [1,2,3]
Object.entries(obj)   // [['a',1],['b',2],['c',3]]

// 计算属性名
const key = 'dyn'
const o = { [key]: 42 }    // { dyn: 42 }

// 可选链 + 空值合并
const city = user?.address?.city ?? 'unknown'
```

---

## 八、函数进阶

### 8.1 箭头函数

```js
// 没有自己的 this / arguments / super / new.target
const add = (a, b) => a + b
const log = (...args) => console.log(...args)  // 用 rest 收集

// 不能用作构造器
const F = () => {}
new F()  // TypeError
```

### 8.2 参数处理

```js
// 默认值
function f(a, b = 10) { return a + b }

// rest 参数
function sum(...nums) { return nums.reduce((a, b) => a + b, 0) }

// 类数组转真数组
const args = Array.from(arguments)
const args2 = [...arguments]
```

### 8.3 柯里化与偏应用

```js
const curry = fn => {
  const curried = (...args) =>
    args.length >= fn.length
      ? fn(...args)
      : (...next) => curried(...args, ...next)
  return curried
}

const sum3 = curry((a, b, c) => a + b + c)
sum3(1)(2)(3)    // 6
sum3(1, 2)(3)    // 6
```

---

## 九、迭代器与生成器

```js
// 可迭代协议：实现 [Symbol.iterator]()
// 迭代器协议：实现 next()，返回 {value, done}

const range = {
  from: 1, to: 5,
  [Symbol.iterator]() {
    let cur = this.from
    const last = this.to
    return {
      next() {
        return cur <= last
          ? { value: cur++, done: false }
          : { value: undefined, done: true }
      }
    }
  }
}
;[...range]               // [1,2,3,4,5]
for (const x of range) {} // 1 2 3 4 5

// 生成器函数：用 yield 暂停
function* gen() {
  yield 1
  yield 2
  return 3
}
const g = gen()
g.next()  // {value:1, done:false}
g.next()  // {value:2, done:false}
g.next()  // {value:3, done:true}

// 异步生成器
async function* fetchPages(url) {
  let page = 1
  while (true) {
    const data = await fetch(`${url}?page=${page++}`).then(r => r.json())
    if (!data.length) return
    yield data
  }
}
```

---

## 十、错误处理

```js
try {
  throw new Error('boom')
} catch (err) {
  console.error(err.message)
} finally {
  // 总会执行
}

// 自定义错误
class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

// Promise 错误
Promise.reject('x')
  .catch(e => console.error(e))

// 未捕获异常兜底
window.addEventListener('unhandledrejection', e => {
  console.warn('Unhandled:', e.reason)
})
process.on('uncaughtException', err => {
  console.error(err); process.exit(1)
})
```

---

## 十一、严格模式 `'use strict'`

启用严格模式的副作用：

- 未声明变量赋值 → ReferenceError
- 静默失败的操作改为抛错（如给不可写属性赋值）
- 函数中的 `this` 默认为 `undefined` 而非 `globalThis`
- 禁用 `with`、`arguments.callee`、`caller`
- 删除不可配置属性 → TypeError
- 函数参数不能同名、对象字面量不能有同名键

ES Module 与 class 默认开启严格模式。

---

## 十二、参考

- [MDN JavaScript Guide](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide)
- [ECMAScript 规范](https://tc39.es/ecma262/)
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS)

---

> 本文整理自 JavaScript 核心知识点，重点覆盖面试与日常高频内容。
