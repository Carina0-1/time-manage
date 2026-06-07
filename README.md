# TiGo

目标驱动的个人时间管理工具。

## 技术栈

- **前端**：React + TypeScript + Vite + FullCalendar
- **后端**：Hono + Drizzle ORM + PostgreSQL（Supabase）
- **部署**：Vercel
- **monorepo**：pnpm workspaces

## 本地运行

**前置条件**：Node.js、pnpm、PostgreSQL

```bash
pnpm install

# 配置数据库
cp backend/.env.example backend/.env
# 编辑 backend/.env 填写 DATABASE_URL

pnpm --filter backend db:migrate
pnpm dev
```

前端 http://localhost:5173 · 后端 http://localhost:3000

## 功能

**目标管理**
- 两级目标体系：目标 → 阶段，支持自定义颜色/图标
- 阶段可标记完成，目标显示完成进度
- 点击目标/阶段筛选日历视图
- 归档目标：隐藏于主列表，历史数据保留

**任务**
- 日/周/月日历视图，点击创建、拖拽调整时间
- 任务可关联目标和阶段，日历事件颜色跟随目标
- 无排期任务进入 Inbox，每个目标有独立 Inbox 视图
- 层级标签（`/` 分隔），支持颜色/图标/排序

**统计**
- 每日总时长、每日各目标时长、每日各标签时长
- 标签时间占比饼图 + 明细表
- 活跃度热力图（近 15 周）

**其他**
- 深色模式
