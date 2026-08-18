import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { userSettings } from '../db/schema.js'
import { UpdateSettingsSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const settingsRouter = new Hono<AuthEnv>()

// GET /settings — 返回当前用户的术语配置，不存在时返回默认值（不落库）
settingsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))

  if (row) return c.json({ data: row })
  return c.json({
    data: { userId, goalTermLabel: '目标', tagTermLabel: '标签', updatedAt: new Date().toISOString() },
  })
})

// PATCH /settings — upsert 当前用户的术语配置
settingsRouter.patch('/', zValidator('json', UpdateSettingsSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...body, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...body, updatedAt: now },
    })
    .returning()

  return c.json({ data: row })
})
