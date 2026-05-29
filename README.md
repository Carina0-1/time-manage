# Time Manage

个人时间管理工具，支持日历视图、任务管理、标签分类和时间统计。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + FullCalendar
- **后端**：Node.js + Hono + Drizzle ORM
- **数据库**：PostgreSQL

## 本地运行

**前置条件**：Node.js、pnpm、PostgreSQL

```bash
# 安装依赖
pnpm install

# 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写数据库连接信息

# 运行数据库迁移
cd backend && pnpm db:migrate

# 启动（根目录）
pnpm dev
```

前端：http://localhost:5173  
后端：http://localhost:3000

## 功能

- 日/周/月视图日历
- 拖拽调整任务时间
- 标签分类与颜色管理
- 时间统计图表
