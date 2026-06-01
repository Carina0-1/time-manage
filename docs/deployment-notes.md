# Vercel + Supabase 部署踩坑记录

> 项目：pnpm monorepo，Hono 后端 + React/Vite 前端 + PostgreSQL

---

## 1. Vercel 项目配置

### 坑：Root Directory 设置错误
Vercel 自动检测到 Hono 框架，将 Root Directory 设为了 `backend`，导致构建命令和输出目录都从 `backend/` 开始解析，找不到前端产物。

**解决：** Project Settings → General → Root Directory 留空。

---

## 2. shared 包没有 tsconfig

### 坑：`pnpm --filter shared build` 执行 `tsc`，但 shared 包没有 tsconfig.json，tsc 打印帮助信息后退出码为 1，导致整个构建失败。

**解决：** 把 shared 的 build 脚本改为空操作：
```json
"build": "echo 'shared uses source directly, no build needed'"
```

---

## 3. TypeScript 版本差异导致类型错误

### 坑：`@vercel/node` 内置旧版 TypeScript（4.9.5），对 drizzle-orm 的类型校验比本地严格，导致后端代码类型报错（`deletedAt`、`sortOrder` 等字段不存在）。

**解决：** 不让 `@vercel/node` 编译后端源码，改用 **esbuild 预先打包**后端为单个 CJS 文件，`@vercel/node` 直接运行打包产物，完全绕过 tsc。

---

## 4. ESM / CJS 模块冲突

### 坑：后端是 ESM（`"type": "module"`），`@vercel/node` 用 CommonJS require 加载，报 `ERR_REQUIRE_ESM`。

**解决：** 用 esbuild 将后端打包为 CJS：
```bash
esbuild api/source.ts --bundle --platform=node --format=cjs --outfile=api/index.js --external:pg-native
```
注意：
- 入口文件命名不能与输出文件同名（`index.ts` 和 `index.js` 会冲突），改为 `source.ts`
- 打包产物 `api/index.js` 需要提交到 git（不能加入 .gitignore）

---

## 5. dotenv 在 Vercel 环境不可用

### 坑：esbuild 打包时找不到 `dotenv/config`（它在 backend 子包的 dependencies 里，根目录不可见）。

**解决：** 移除顶层 `import 'dotenv/config'`，Vercel 通过 Project Settings 的环境变量直接注入 `process.env`，不需要 dotenv。本地开发改为条件加载：
```ts
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}
```

---

## 6. POST/PATCH 请求卡死（body 读取问题）

### 坑：使用 `@hono/node-server` 的 `createAdaptorServer` 时，GET 请求正常，但 POST/PATCH 请求永久挂起（超时 2 分钟以上）。原因是 Serverless 环境下 Node.js `IncomingMessage` 的 body stream 事件机制与长驻进程不同，导致 body 读取卡死。

**解决：** 手动将 `IncomingMessage` 转换为 Web `Request`，显式读取 body：
```ts
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  // 构造 Web Request 传给 app.fetch
}
```

---

## 7. Supabase 网络连接

### 坑1：Direct connection 默认 IPv6，Vercel 是 IPv4，DNS 解析失败（`ENOTFOUND`）。

**解决：** 使用 **Transaction pooler** 连接串（端口 `6543`），它支持 IPv4。

### 坑2：Supabase 迁移数据时外键约束失败。

**解决：** 先插入 users 表记录，再导入 tasks/tags 数据：
```bash
psql $SUPABASE_URL -c "INSERT INTO users (id, email) VALUES ('dev-user-1', 'dev@local.com') ON CONFLICT DO NOTHING;"
pg_dump $LOCAL_URL --data-only -t tasks -t tags | psql $SUPABASE_URL
```

---

## 8. 生产环境 auth 中间件拦截所有请求

### 坑：auth middleware 只在 `NODE_ENV !== 'production'` 时允许 `dev` token，导致云端所有 API 请求返回 401。

**解决：** 单用户项目无需区分环境，直接允许 `dev` token 放行：
```ts
if (token === 'dev') {
  c.set('userId', DEV_USER_ID)
  await next()
  return
}
```

---

## 9. 每次改后端需要重新打包

### 当前做法：本地改完代码后手动执行打包再提交
```bash
node_modules/.bin/esbuild api/source.ts --bundle --platform=node --format=cjs --outfile=api/index.js --external:pg-native
git add api/index.js && git commit && git push
```

**后续优化方向：** 用 git pre-commit hook 或 CI 自动打包，避免忘记手动打包导致线上代码过时。

---

## 总结：Vercel + Hono + pnpm monorepo 最佳实践

| 问题 | 方案 |
|------|------|
| 后端 ESM 与 Vercel CJS 冲突 | esbuild 预打包为 CJS |
| Serverless POST body 卡死 | 手动转换 IncomingMessage → Web Request |
| Supabase IPv4 连接 | 使用 Transaction pooler（端口 6543） |
| 环境变量 | Vercel Dashboard 配置，不依赖 dotenv |
| monorepo 构建 | vercel.json 的 buildCommand 手动指定各包构建顺序 |
