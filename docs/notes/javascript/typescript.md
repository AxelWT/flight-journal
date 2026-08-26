---
title: "TypeScript 核心语法与类型系统"
date: 2026-08-26
description: TypeScript 类型系统、泛型、工具类型、声明文件、模块解析与编译配置
tags:
  - TypeScript
  - 前端
  - 类型系统
  - 笔记
---

# TypeScript 核心语法与类型系统

## 一、技术历史

| 时间 | 事件 |
|------|------|
| 2012 | 微软发布 TypeScript 0.8，由 Anders Hejlsberg（C# 之父）主导 |
| 2014 | TS 1.0 发布，引入声明文件 `.d.ts` 概念 |
| 2018 | TS 3.0：项目引用、`unknown` 类型 |
| 2019 | TS 3.7：可选链、空值合并、`asserts` 类型谓词 |
| 2020 | TS 4.0：可变元组、命名元组成员；4.1 模板字面量类型 |
| 2022 | TS 4.9：`satisfies` 操作符；4.7 `node16` 模块解析 |
| 2023 | TS 5.0：装饰器稳定、`const` 类型参数；移植至新编译器内核 |
| 2024 | TS 5.4：`NoInfer`、对象类型字面量优化 |

> 💡 TypeScript 是 JavaScript 的**超集**，编译期移除类型注解后产出标准 JS。它**不在运行时做类型检查**，所有类型信息仅存在于编译期。

---

## 二、基础类型

```ts
let n: number = 42
let s: string = 'hi'
let b: boolean = true
let big: bigint = 100n
let sym: symbol = Symbol('id')
let nu: null = null
let un: undefined = undefined

// 数组
let arr: number[] = [1, 2, 3]
let arr2: Array<number> = [1, 2, 3]
let tuple: [string, number] = ['age', 18]
let readonlyArr: readonly number[] = [1, 2, 3]

// 函数
function add(a: number, b: number): number { return a + b }
const fn = (a: number, b: number): number => a + b

// 函数类型
type Adder = (a: number, b: number) => number
const add2: Adder = (a, b) => a + b

// 可选 / 默认 / 剩余参数
function f(a: string, b?: number, c: number = 10, ...rest: string[]) {
  return [a, b, c, rest]
}

// void / never / unknown / any
function log(): void { console.log('x') }
function fail(): never { throw new Error('boom') }
function loop(): never { while (true) {} }
let u: unknown = JSON.parse('{}')   // 安全的 any，使用前必须收窄
let a: any = 1                       // 关闭类型检查，应避免
```

---

## 三、对象类型与接口

```ts
// 接口（可声明合并）
interface User {
  readonly id: number
  name: string
  age?: number                       // 可选属性
  greet(): void
}

interface User {                     // 自动合并到上面的定义
  email?: string
}

// 类型别名
type Point = { x: number; y: number }
type ID = string | number           // 接口无法表达联合类型

// 索引签名
type Dict = { [k: string]: number }
const d: Dict = { a: 1, b: 2 }

// 调用签名（可调用对象）
type Constructor = new (x: number) => User
type Callable = {
  (x: number): string
  version: string
}
```

### interface vs type

| 维度 | `interface` | `type` |
|------|-------------|--------|
| 描述对象 / 类形状 | ✅ 推荐 | ✅ |
| 联合 / 交叉 / 条件类型 | ❌ | ✅ |
| 声明合并（同名扩展） | ✅ 自动合并 | ❌ 报错 |
| 扩展语法 | `extends` | `&` 交叉 |
| 性能 | 略优（缓存更好） | 略劣 |
| 工具提示 | 显示接口名 | 显示结构 |

> 经验：**对象形状优先用 interface，联合 / 工具类型用 type**。

---

## 四、联合、交叉与字面量类型

```ts
type Status = 'idle' | 'loading' | 'success' | 'error'
type ID = string | number

// 交叉类型：合并属性
type WithTimestamp = { createdAt: Date }
type WithAuthor    = { author: string }
type Article = { title: string } & WithTimestamp & WithAuthor

const a: Article = {
  title: 'x', createdAt: new Date(), author: 'me'
}

// 字面量推断陷阱
const x = 'hello'        // type: 'hello'（const 字面量）
let y = 'hello'          // type: string（let 推断为宽类型）
const obj = { mode: 'r' } // type: { mode: string }，不是 'r'
const obj2 = { mode: 'r' } as const   // { readonly mode: 'r' }
```

---

## 五、类型收窄

```ts
function handle(x: string | number) {
  if (typeof x === 'string') {
    x.toUpperCase()        // 这里是 string
  } else {
    x.toFixed(2)           // 这里是 number
  }
}

class A { a() {} }
class B { b() {} }
function run(inst: A | B) {
  if (inst instanceof A) inst.a()
  else inst.b()
}

// in 操作符
type Cat = { meow(): void }
type Dog = { bark(): void }
function speak(animal: Cat | Dog) {
  if ('meow' in animal) animal.meow()
  else animal.bark()
}

// 自定义类型守卫
function isError(x: unknown): x is Error {
  return x instanceof Error
}
if (isError(e)) e.message   // 此处 e 已收窄为 Error

// 判别式联合（discriminated union）
type Shape =
  | { kind: 'circle';  r: number }
  | { kind: 'square';  s: number }
  | { kind: 'rect';    w: number; h: number }

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle': return Math.PI * shape.r ** 2
    case 'square': return shape.s ** 2
    case 'rect':   return shape.w * shape.h
  }
}
```

---

## 六、泛型

```ts
// 函数泛型
function identity<T>(x: T): T { return x }
identity<string>('a')
identity(42)              // 自动推断 T = number

// 多参数泛型 + 约束
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>[] {
  return keys.map(k => ({ [k]: obj[k] } as Pick<T, K>))
}

// 默认类型参数
function create<T = string>(): T[] { return [] }

// 类泛型
class Stack<T> {
  private items: T[] = []
  push(x: T) { this.items.push(x) }
  pop(): T | undefined { return this.items.pop() }
}

// 接口泛型
interface KV<K, V> { key: K; value: V }

// const 泛型参数（TS 5.0+）：保留字面量类型
function define<const T>(x: T): T { return x }
const v = define(['a', 'b'])   // type: readonly ['a', 'b']
```

---

## 七、工具类型（Utility Types）

```ts
// Partial —— 所有属性可选
type PartialUser = Partial<User>

// Required —— 所有属性必填
type RequiredUser = Required<User>

// Readonly —— 所有属性只读
type ReadonlyUser = Readonly<User>

// Pick —— 选取部分键
type UserBasic = Pick<User, 'id' | 'name'>

// Omit —— 排除部分键
type UserPreview = Omit<User, 'age'>

// Record —— 构造键值映射
type UserMap = Record<string, User>

// ReturnType / Parameters / ConstructorParameters
type R = ReturnType<typeof fetch>      // Promise<Response>
type P = Parameters<typeof fetch>      // [input, init?]

// Awaited —— 拆解 Promise
type Data = Awaited<Promise<Promise<number>>>   // number

// Exclude / Extract —— 联合类型筛选
type T1 = Exclude<'a' | 'b' | 'c', 'a'>         // 'b' | 'c'
type T2 = Extract<string | number | boolean, number | string>  // string | number

// NonNullable —— 排除 null / undefined
type T3 = NonNullable<string | null | undefined>   // string

// keyof / typeof
type UserKeys = keyof User                // 'id' | 'name' | 'age' | ...
const config = { port: 3000, host: 'x' }
type Config = typeof config               // { port: number; host: string }
```

### 内置映射与条件类型

```ts
// 条件类型
type IsString<T> = T extends string ? true : false
type A = IsString<'a'>     // true
type B = IsString<1>       // false

// infer 提取
type Unpack<T> = T extends Promise<infer U> ? U : T
type R2 = Unpack<Promise<number>>   // number

// 映射类型 + 修饰符
type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
}
// { getName: () => string; getAge: () => number }
```

---

## 八、模块与声明文件

### 8.1 导入导出

```ts
// types.ts
export interface User { id: number; name: string }
export type ID = string | number
export const VERSION = '1.0'

// 模块默认导出
export default class Logger { /* ... */ }

// 导入
import Logger, { User, ID, VERSION } from './types'
import type { User } from './types'    // 仅类型导入，编译后删除
import * as types from './types'
```

### 8.2 内置环境声明

```ts
// 全局变量
declare global {
  interface Window {
    __APP_VERSION__: string
  }
}

// 模块声明（无类型的第三方包）
declare module 'some-untyped-lib' {
  export function hello(name: string): string
}

// 扩展已有模块（声明合并）
declare module 'express' {
  interface Request {
    user?: { id: string }
  }
}
```

### 8.3 三斜线指令（仅 .d.ts 中）

```ts
/// <reference types="node" />
/// <reference path="./shared.d.ts" />
```

现代项目应优先使用 `import` / `export`，三斜线指令仅在编写底层声明文件时使用。

---

## 九、tsconfig 关键配置

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",                  // 编译目标 JS 版本
    "module": "NodeNext",                // 模块系统
    "moduleResolution": "NodeNext",      // 模块解析策略
    "lib": ["ES2022", "DOM"],            // 可用的类型库
    "strict": true,                      // 严格模式总开关
    "noUncheckedIndexedAccess": true,    // arr[0] 类型为 T | undefined
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,

    "esModuleInterop": true,             // 允许 default import CJS 模块
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,                // 跳过 .d.ts 检查（加速）
    "resolveJsonModule": true,           // 可 import .json
    "isolatedModules": true,             // 兼容 esbuild / Vite 单文件转译
    "verbatimModuleSyntax": true,        // 严格区分 type / value 导入

    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },

    "declaration": true,                 // 生成 .d.ts
    "sourceMap": true,
    "outDir": "dist"
  },
  "include": ["src", "types"],
  "exclude": ["node_modules", "dist"]
}
```

### strict 包含的子项

- `noImplicitAny`：参数 / 变量隐式 any 报错
- `strictNullChecks`：`null` / `undefined` 不再赋值给任意类型
- `strictFunctionTypes`：函数参数双向检查改逆检查
- `strictBindCallApply`：`bind/call/apply` 严格签名
- `strictPropertyInitialization`：类字段必须在构造器中初始化
- `noImplicitThis`：函数中 `this` 隐式 any 报错
- `alwaysStrict`：输出 `'use strict'`

---

## 十、装饰器（TS 5.0 标准）

```ts
// 类装饰器
function logged<T extends new (...args: any[]) => any>(Base: T, ctx: ClassDecoratorContext) {
  return class extends Base {
    constructor(...args: any[]) {
      super(...args)
      console.log('instantiated', ctx.name)
    }
  }
}

// 方法装饰器
function logCall(method: Function, ctx: ClassMethodDecoratorContext) {
  return function (this: any, ...args: any[]) {
    console.log(`calling ${String(ctx.name)}`, args)
    return method.apply(this, args)
  }
}

@logged
class Service {
  @logCall
  fetch(id: number) { return id }
}
```

---

## 十一、常见技巧

### 11.1 satisfies 操作符

```ts
type Colors = 'red' | 'green' | 'blue'
const palette = {
  primary: 'red',
  secondary: 'blue'
} satisfies Record<string, Colors>

// 既校验符合类型，又保留具体字面量推断
palette.primary   // type: 'red' 而非 Colors
```

### 11.2 const 断言

```ts
const arr = [1, 2, 3] as const          // readonly [1, 2, 3]
const obj = { a: 1 } as const            // { readonly a: 1 }
```

### 11.3 模板字面量类型

```ts
type Domain = 'user' | 'post'
type Action = 'get' | 'create' | 'delete'
type API = `${Action}${Capitalize<Domain>}`
// 'getUser' | 'createUser' | 'deleteUser' | 'getPost' | ...

type Getter<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
}
```

### 11.4 类型递归与尾递归

```ts
type Join<T extends string[], D extends string> =
  T extends [infer F extends string, ...infer R extends string[]]
    ? R extends [] ? F : `${F}${D}${Join<R, D>}`
    : never

type R = Join<['a', 'b', 'c'], '-'>   // 'a-b-c'
```

### 11.5 类型体操常见操作

```ts
// DeepPartial
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

// DeepReadonly
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]
}

// PathOf —— 提取对象所有路径
type PathOf<T, P extends string = ''> = T extends object
  ? { [K in keyof T]: PathOf<T[K], `${P}.${string & K}`> }[keyof T]
  : P
```

---

## 十二、TypeScript vs JavaScript

| 维度 | TypeScript | JavaScript |
|------|-----------|------------|
| 类型系统 | 静态强类型 | 动态弱类型 |
| 类型检查时机 | 编译期 | 运行时 |
| 是否需编译 | 需要 `tsc` / `vite` 等 | 浏览器直接运行 |
| IDE 体验 | 强大补全、跳转、重构 | 较弱 |
| 学习曲线 | 较陡（泛型、条件类型） | 平缓 |
| 适合项目 | 中大型、长生命周期、团队协作 | 小型脚本、原型 |
| 生态 | NPM 包大多附带 `.d.ts` | 原生 |

---

## 十三、参考

- [TypeScript 官方手册](https://www.typescriptlang.org/docs/handbook/)
- [TypeScript 中文文档](https://typescript.bootcss.com/)
- [Type Challenges 类型体操](https://github.com/type-challenges/type-challenges)
- [tsconfig 解析](https://www.typescriptlang.org/tsconfig)
