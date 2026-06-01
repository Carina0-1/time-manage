import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { tasksRouter } from './routes/tasks.js'
import { tagsRouter } from './routes/tags.js'
import { statsRouter } from './routes/stats.js'

export const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))

app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/auth', authRouter)

// 所有 /api/* 路由需要认证
app.use('/api/*', authMiddleware)
app.route('/api/tasks', tasksRouter)
app.route('/api/tags', tagsRouter)
app.route('/api/stats', statsRouter)

// 统一错误处理
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// 本地开发启动
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT ?? 3000)
  console.log(`Server running on http://localhost:${port}`)
  serve({ fetch: app.fetch, port })
}
