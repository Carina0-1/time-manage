# TiGo

个人时间管理工具，日历视图 + 标签系统 + 时间统计。

## 技术栈

- **前端**：React + TypeScript + Vite + FullCalendar
- **后端**：Hono + Drizzle ORM + PostgreSQL
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

- 日/周/月日历，点击创建任务，拖拽调整时间，加载自动定位当前时间
- 悬浮面板编辑，点击外部自动保存
- 层级标签（`/` 分隔），支持自定义颜色/图标/排序，侧边栏按标签筛选
- 侧边栏活跃度热力图 + 统计数字
- 统计页：每日时长、每日各目标时长、标签时间分布图表
- 深色模式，跟随系统或手动切换
