# 个人时间管理工具 — 设计文档与开发计划

## 一、技术栈选择

### 前端

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | **React 18 + TypeScript** | 生态成熟、组件复用性强、TypeScript 提供类型安全 |
| 构建工具 | **Vite** | 极速 HMR、配置简单、原生 ESM |
| 状态管理 | **Zustand** | 轻量（<1KB）、无样板代码、适合中小型应用 |
| 日历组件 | **FullCalendar v6** | 原生支持日/周/月视图、内置拖拽重排、与 React 集成良好 |
| 拖拽补充 | **@dnd-kit/core** | 用于任务列表内部拖拽排序，无障碍友好 |
| 样式 | **Tailwind CSS v4** | 原子化 CSS、暗色模式支持 |
| UI 组件库 | **shadcn/ui** | 基于 Radix UI、高度可定制、不引入运行时依赖 |
| 图表统计 | **Recharts** | React 原生、声明式 API、支持响应式图表 |
| 时间处理 | **Day.js** | 体积仅 2KB，API 简洁 |
| 表单校验 | **React Hook Form + Zod** | 零依赖、性能极佳，Zod schema 前后端共用 |
| 本地缓存 | **Dexie.js (IndexedDB)** | 离线可用，网络恢复后同步到后端 |

### 后端

| 技术 | 选择 | 理由 |
|------|------|------|
| 运行时 | **Node.js** | 与前端共享 TypeScript 类型定义，全栈一致 |
| 框架 | **Hono** | 轻量（12KB）、Edge-ready、API 设计简洁、性能优秀 |
| 数据库 | **PostgreSQL** | 关系型、可靠、支持复杂统计查询、免费自托管 |
| ORM | **Drizzle ORM** | TypeScript 原生、类型安全、迁移简单、与 Zod 集成好 |
| 认证 | **better-auth** | 支持 GitHub/Google OAuth + 邮件登录，开箱即用 |
| 部署 | **Railway / Render** | 免费层足够个人使用，PostgreSQL 托管一体化 |

### 前后端共用

- **Zod schema** 定义一次，前端表单校验和后端参数校验复用同一套
- **TypeScript 类型** monorepo 或 shared 包共享 `Task`、`Tag` 等接口

---

## 二、高层架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                              浏览器                                   │
│                                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────┐  │
│  │  Views 层    │   │  Store 层     │   │ Service层  │   │ 本地缓存  │  │
│  │             │   │  (Zustand)   │   │           │   │ Dexie.js │  │
│  │CalendarView │◄─►│  taskStore   │◄─►│SyncService│◄─►│IndexedDB │  │
│  │StatsView    │   │  tagStore    │   │TaskService│   └──────────┘  │
│  │TagManager   │   │  uiStore     │   │StatsService│        ▲       │
│  └─────────────┘   └──────────────┘   └─────┬─────┘        │       │
│                                             │         离线时写本地    │
└─────────────────────────────────────────────┼────────────────────────┘
                                              │ HTTPS / REST API
                                              │ (在线时实时同步)
┌─────────────────────────────────────────────▼────────────────────────┐
│                           后端 (Hono + Node.js)                       │
│                                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────────────┐ │
│  │  路由层       │   │  业务逻辑层    │   │         数据层              │ │
│  │             │   │              │   │                            │ │
│  │ /tasks      │──►│ TaskHandler  │──►│  Drizzle ORM               │ │
│  │ /tags       │   │ TagHandler   │   │  PostgreSQL                │ │
│  │ /stats      │   │ StatsHandler │   │                            │ │
│  │ /auth       │   │ AuthHandler  │   │  表: users, tasks, tags,   │ │
│  └─────────────┘   └──────────────┘   │       task_tags            │ │
│                                       └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 同步策略：离线优先 + 增量同步

1. 所有写操作先写本地 IndexedDB，立即响应 UI（乐观更新）
2. 网络在线时，后台将本地变更推送到后端
3. 每条记录携带 `updatedAt` 时间戳，以"最后写入胜出"解决冲突
4. 登录后拉取服务端全量数据覆盖本地（首次同步）

---

## 三、项目结构（Monorepo）

```
time-manage/
├── packages/
│   └── shared/               # 前后端共用类型和 Zod schema
│       ├── types/index.ts
│       └── schemas/index.ts
├── frontend/                 # React 应用
│   └── src/
│       ├── components/
│       │   ├── calendar/
│       │   │   ├── CalendarView.tsx
│       │   │   ├── EventItem.tsx
│       │   │   └── CreateTaskPopover.tsx
│       │   ├── task/
│       │   │   ├── TaskModal.tsx
│       │   │   ├── TaskForm.tsx
│       │   │   └── TaskCard.tsx
│       │   ├── stats/
│       │   │   ├── StatsView.tsx
│       │   │   ├── TagPieChart.tsx
│       │   │   └── TimelineChart.tsx
│       │   └── tags/
│       │       └── TagManager.tsx
│       ├── stores/
│       │   ├── taskStore.ts
│       │   ├── tagStore.ts
│       │   └── uiStore.ts
│       ├── services/
│       │   ├── taskService.ts
│       │   ├── tagService.ts
│       │   ├── statsService.ts
│       │   └── syncService.ts   # 离线队列 + 同步逻辑
│       ├── db/
│       │   └── database.ts      # Dexie 实例（本地缓存）
│       ├── api/
│       │   └── client.ts        # fetch 封装，统一处理 auth token
│       └── types/
│           └── index.ts
└── backend/                  # Hono 应用
    └── src/
        ├── routes/
        │   ├── tasks.ts
        │   ├── tags.ts
        │   ├── stats.ts
        │   └── auth.ts
        ├── handlers/
        │   ├── taskHandler.ts
        │   ├── tagHandler.ts
        │   └── statsHandler.ts
        ├── db/
        │   ├── schema.ts        # Drizzle 表定义
        │   ├── migrations/
        │   └── index.ts
        └── middleware/
            └── auth.ts          # JWT 验证中间件
```

---

## 四、核心数据模型

### 前端 TypeScript 接口（shared/types）

```typescript
interface Task {
  id: string;               // nanoid() 生成，前端创建
  userId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  tagIds: string[];
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  recurrence?: Recurrence;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;           // 最后一次成功同步到服务端的时间
}

interface Tag {
  id: string;
  userId: string;
  name: string;
  color: string;             // HEX 颜色
  icon?: string;             // emoji
  createdAt: Date;
  updatedAt: Date;
}
```

### 后端数据库 Schema（Drizzle ORM）

```typescript
// backend/src/db/schema.ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  isAllDay: boolean('is_all_day').default(false),
  status: text('status').default('todo'),
  priority: text('priority').default('medium'),
  recurrence: jsonb('recurrence'),
  color: text('color'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const taskTags = pgTable('task_tags', {
  taskId: text('task_id').references(() => tasks.id),
  tagId: text('tag_id').references(() => tags.id),
}, (t) => ({ pk: primaryKey({ columns: [t.taskId, t.tagId] }) }));
```

### REST API 设计

```
POST   /auth/login              登录（OAuth / 邮件）
POST   /auth/logout

GET    /tasks?start=&end=       查询时间范围内的任务
POST   /tasks                   创建任务
PATCH  /tasks/:id               更新任务（含拖拽后的时间修改）
DELETE /tasks/:id               删除任务

GET    /tags                    获取所有标签
POST   /tags                    创建标签
PATCH  /tags/:id                更新标签
DELETE /tags/:id                删除标签

GET    /stats?start=&end=       获取统计数据（按标签汇总）

POST   /sync                    批量同步（离线队列上传）
GET    /sync?since=             拉取指定时间后的变更
```

---

## 五、开发计划

### Phase 1 — 项目初始化 + 后端基础

- [ ] Monorepo 初始化
  - [ ] `npm create vite@latest frontend -- --template react-ts`
  - [ ] 创建 `backend/` 目录，初始化 Hono + Node.js 项目
  - [ ] 创建 `packages/shared/`，配置前后端引用共用类型

- [ ] 后端基础搭建
  - [ ] 安装 `hono drizzle-orm pg dotenv`
  - [ ] 配置 PostgreSQL 连接（本地 Docker 或 Railway）
  - [ ] 编写 `db/schema.ts`，运行首次 migration
  - [ ] 实现 `/tasks` 和 `/tags` 的 CRUD 路由
  - [ ] 添加 JWT 验证中间件（暂用 hardcoded token 跳过，后续接 better-auth）

- [ ] 前端基础搭建
  - [ ] 安装并配置 Tailwind CSS v4、shadcn/ui
  - [ ] 配置路径别名 `@/` 指向 `src/`
  - [ ] 实现 `api/client.ts`（fetch 封装，携带 Authorization header）
  - [ ] 安装 `dexie dexie-react-hooks`，创建本地缓存 DB

---

### Phase 2 — 日历视图 + 任务 CRUD

- [ ] 日历视图
  - [ ] 安装 `@fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction`
  - [ ] 实现 `CalendarView.tsx`，配置日/周/月视图切换
  - [ ] 自定义 `EventItem.tsx` 渲染（显示标签颜色）
  - [ ] 从后端拉取任务，转换为 FullCalendar events 格式

- [ ] 任务创建与编辑
  - [ ] 安装 `react-hook-form zod @hookform/resolvers`
  - [ ] 实现 `TaskModal.tsx` + `TaskForm.tsx`
  - [ ] 点击日历空白处触发快速创建弹窗
  - [ ] 点击已有事件触发完整编辑弹窗
  - [ ] 任务删除确认对话框

- [ ] 状态管理
  - [ ] 安装 `zustand`
  - [ ] 实现 `taskStore`、`tagStore`、`uiStore`

---

### Phase 3 — 标签系统 + 拖拽

- [ ] 标签管理
  - [ ] 实现 `TagManager.tsx`（增删改标签、颜色选择器）
  - [ ] 在 `TaskForm` 中集成多标签 Combobox
  - [ ] 日历事件颜色按第一个标签自动着色

- [ ] 拖拽功能
  - [ ] 实现 `eventDrop` → `PATCH /tasks/:id`（时间修改）
  - [ ] 实现 `eventResize` → `PATCH /tasks/:id`（时长修改）
  - [ ] 拖拽乐观更新本地 Store，失败时回滚

- [ ] 任务状态
  - [ ] 日历事件上添加快速完成切换
  - [ ] 完成任务显示删除线样式
  - [ ] 侧边栏今日任务列表

---

### Phase 4 — 统计功能

- [ ] 后端统计接口
  - [ ] `GET /stats?start=&end=` 返回按标签汇总的时长数据
  - [ ] PostgreSQL 聚合查询：`SUM(end_time - start_time)` GROUP BY tag

- [ ] 前端统计视图
  - [ ] 安装 `recharts`
  - [ ] 实现 `StatsView.tsx` + 日期范围选择器
  - [ ] `TagPieChart.tsx`：标签时间占比饼图
  - [ ] `TimelineChart.tsx`：每日时长堆叠柱状图
  - [ ] 统计卡片：总时长、最多标签、完成率、与上期对比

- [ ] 导航集成
  - [ ] 左侧导航栏（日历 / 统计 / 标签管理）
  - [ ] 安装 `react-router-dom`，配置路由

---

### Phase 5 — 认证 + 离线同步

- [ ] 用户认证
  - [ ] 安装 `better-auth`，配置 GitHub OAuth
  - [ ] 后端接入 better-auth，替换 hardcoded token
  - [ ] 前端登录页、登出、token 自动刷新

- [ ] 离线同步
  - [ ] 实现 `syncService.ts`：本地操作写入 Dexie 离线队列
  - [ ] 网络恢复时自动批量上传（`POST /sync`）
  - [ ] 登录后拉取服务端全量数据（`GET /sync?since=0`）
  - [ ] 冲突解决：`updatedAt` 时间戳，最后写入胜出

---

### Phase 6 — 体验优化

- [ ] 搜索与过滤
  - [ ] 顶部搜索栏，按标题模糊搜索
  - [ ] 日历视图按标签过滤
  - [ ] 键盘快捷键：`N` 新建任务、`/` 打开搜索

- [ ] 暗色模式
  - [ ] Tailwind `dark:` 类覆盖所有组件
  - [ ] 持久化主题偏好

- [ ] 重复任务
  - [ ] `TaskForm` 添加重复规则 UI
  - [ ] 编辑重复任务询问"仅此次/此后/全部"

- [ ] 数据导出
  - [ ] 导出 `.json` 备份
  - [ ] 导出 `.ics` 格式（可导入苹果日历/Google Calendar）

---

## 六、关键依赖汇总

### 前端

```json
{
  "@fullcalendar/react": "^6.1.15",
  "@fullcalendar/daygrid": "^6.1.15",
  "@fullcalendar/timegrid": "^6.1.15",
  "@fullcalendar/interaction": "^6.1.15",
  "dexie": "^4.0.7",
  "zustand": "^4.5.5",
  "react-hook-form": "^7.53.0",
  "zod": "^3.23.0",
  "recharts": "^2.13.0",
  "dayjs": "^1.11.13",
  "react-router-dom": "^6.27.0",
  "nanoid": "^5.0.7",
  "tailwindcss": "^4.0.0"
}
```

### 后端

```json
{
  "hono": "^4.6.0",
  "drizzle-orm": "^0.36.0",
  "drizzle-kit": "^0.28.0",
  "pg": "^8.13.0",
  "better-auth": "^1.0.0",
  "zod": "^3.23.0",
  "nanoid": "^5.0.7"
}
```

---

## 七、风险与注意事项

| 风险点 | 说明 | 应对方案 |
|--------|------|---------|
| 离线同步冲突 | 多设备同时修改同一任务 | 最后写入胜出（`updatedAt` 对比），日历场景冲突较少 |
| FullCalendar 许可 | 部分高级视图需付费 | 仅使用 Standard 免费插件已满足需求 |
| 重复任务复杂度 | 展开存储 vs 按需生成 | 初期展开存储简化逻辑，后期优化 |
| 拖拽跨时区 | Day.js 需统一处理 | 全程使用本地时间，后端存 UTC |
| PostgreSQL 部署 | 需要托管数据库 | 开发用 Docker，生产用 Railway 免费层 |
