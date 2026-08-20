# CLAUDE.md

## 样式
- 全项目使用 CSS Modules + CSS 变量（design token），**不要引入 Tailwind**
- 全局 token 在 `frontend/src/index.css` 的 `:root` 和 `[data-theme="dark"]`
- 热力图变量 `--heat-0` 到 `--heat-4` 在 `index.css`，不在组件文件里

## 功能边界
- 单用户，**无认证**，不要引入 better-auth / OAuth / JWT
- 暂不实现：离线同步、重复任务、数据导出、搜索

## 注意
- `task.color` 字段可为 null，使用时需 `?? undefined` 处理
