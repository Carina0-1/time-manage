import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tags, tasks, taskTags } from '../db/schema.js'
import { CreateTagSchema, UpdateTagSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const tagsRouter = new Hono<AuthEnv>()

// GET /tags
tagsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), isNull(tags.deletedAt)))
    .orderBy(tags.sortOrder)
  return c.json({ data: rows })
})

// POST /tags
tagsRouter.post('/', zValidator('json', CreateTagSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [tag] = await db.insert(tags).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: tag }, 201)
})

// PATCH /tags/:id
tagsRouter.patch('/:id', zValidator('json', UpdateTagSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [tag] = await db
    .update(tags)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()

  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: tag })
})

// POST /tags/reorder — 批量更新 sortOrder
const ReorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
tagsRouter.post('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')
  await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db.update(tags)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    )
  )
  return c.json({ data: null })
})

// DELETE /tags/:id  (软删除，仅删除标签)
tagsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [tag] = await db
    .update(tags)
    .set({ deletedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()

  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null }, 200)
})

// DELETE /tags/:id/with-tasks  (删除标签及其关联任务)
tagsRouter.delete('/:id/with-tasks', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  // 先确认标签属于当前用户
  const [tag] = await db
    .update(tags)
    .set({ deletedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()

  if (!tag) return c.json({ error: 'Not found' }, 404)

  // 找出关联该标签的所有任务 id
  const relations = await db.select().from(taskTags).where(eq(taskTags.tagId, id))
  if (relations.length > 0) {
    const taskIds = relations.map((r) => r.taskId)
    // 软删除这些任务（只删属于当前用户的）
    await db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(inArray(tasks.id, taskIds), eq(tasks.userId, userId)))
  }

  return c.json({ data: null }, 200)
})
