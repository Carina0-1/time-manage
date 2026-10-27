# TiGo

任务/时间管理工具

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

## 线上环境
线上网站：https://time-manage-backend.vercel.app   github更新后，vercel自动更新部署
线上网站对应数据库：supabase

## 功能

**维度管理**
- 自定义维度，支持单选、树形（多级）
- 维度和选项支持自定义名称/图标、拖拽排序，选项支持自定义颜色
- 可设置必填、侧边栏展示和配色维度

**任务**
- 全部任务列表，支持新增、删除，双击名称编辑名称/备注/预期产出
- 状态/排期/维度点击对应字段修改
- 关键词搜索、状态/排期/日期/维度组合筛选，支持排序和分页
- 列表支持按维度打标，修改单个维度保留其他取值
- 日/周/月日历视图，点击创建、拖拽调整时间
- 任务可关联多个维度，日历事件卡片显示维度选项、颜色跟随配色维度
- 侧边栏按维度筛选任务，支持多维度组合筛选、树形节点包含下级
- 支持备注、预期产出、复制任务和完成标记，快速创建时支持历史任务名称补全

**统计**
- 本周/本月/自定义时间范围，总时长、任务数、完成率
- 每日总时长、各展示维度时长堆叠柱状图，树形维度按一级节点汇总每日时长
- 各展示维度时间占比饼图 + 明细表（时长、任务数、占比）
- 活跃度热力图（近 15 周）
