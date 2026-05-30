import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tasks, taskTags, tags } from '../db/schema.js'
import { CreateTaskSchema, UpdateTaskSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const tasksRouter = new Hono<AuthEnv>()

const QuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
})

// GET /tasks?start=&end=
tasksRouter.get('/', zValidator('query', QuerySchema), async (c) => {
  const userId = c.get('userId')
  const { start, end } = c.req.valid('query')

  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)]
  // 任务与查询范围有交集：task.start < end AND task.end > start
  if (end) conditions.push(lte(tasks.startTime, new Date(end)))
  if (start) conditions.push(gte(tasks.endTime, new Date(start)))

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))

  // 批量查询关联的 tagIds
  if (rows.length === 0) return c.json({ data: [] })

  const taskIds = rows.map((t) => t.id)
  const tagRelations = await db
    .select()
    .from(taskTags)
    .where(inArray(taskTags.taskId, taskIds))

  const tagIdsByTask = new Map<string, string[]>()
  for (const rel of tagRelations) {
    const list = tagIdsByTask.get(rel.taskId) ?? []
    list.push(rel.tagId)
    tagIdsByTask.set(rel.taskId, list)
  }

  const result = rows.map((t) => ({ ...t, tagIds: tagIdsByTask.get(t.id) ?? [] }))
  return c.json({ data: result })
})

// POST /tasks
tasksRouter.post('/', zValidator('json', CreateTaskSchema), async (c) => {
  const userId = c.get('userId')
  const { tagIds, ...body } = c.req.valid('json')
  const now = new Date()

  const [task] = await db.insert(tasks).values({
    ...body,
    userId,
    startTime: new Date(body.startTime),
    endTime: new Date(body.endTime),
    createdAt: now,
    updatedAt: now,
  }).returning()

  if (tagIds.length > 0) {
    await db.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: task.id, tagId })))
  }

  return c.json({ data: { ...task, tagIds } }, 201)
})

// PATCH /tasks/:id
tasksRouter.patch('/:id', zValidator('json', UpdateTaskSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { tagIds, ...body } = c.req.valid('json')

  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() }
  if (body.startTime) updateData.startTime = new Date(body.startTime)
  if (body.endTime) updateData.endTime = new Date(body.endTime)

  const [task] = await db
    .update(tasks)
    .set(updateData)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()

  if (!task) return c.json({ error: 'Not found' }, 404)

  // 更新标签关联（只保留第一个）
  if (tagIds !== undefined) {
    await db.delete(taskTags).where(eq(taskTags.taskId, id))
    const singleTag = tagIds.slice(0, 1)
    if (singleTag.length > 0) {
      await db.insert(taskTags).values([{ taskId: id, tagId: singleTag[0] }])
    }
  }

  // 重新从数据库查最新的 tagIds
  const tagRelations = await db.select().from(taskTags).where(eq(taskTags.taskId, id))
  const finalTagIds = tagRelations.map((r) => r.tagId)
  return c.json({ data: { ...task, tagIds: finalTagIds } })
})

// DELETE /tasks/:id  (软删除)
tasksRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [task] = await db
    .update(tasks)
    .set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()

  if (!task) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null }, 200)
})
