import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import { tasks, taskDimensionValues, dimensions, dimensionOptions } from '../db/schema.js'
import { CreateTaskSchema, UpdateTaskSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const tasksRouter = new Hono<AuthEnv>()

const QuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  inbox: z.string().optional(),  // "true" 表示只返回无排期任务
  all: z.string().optional(),    // "true" 表示返回所有任务（含有排期和无排期）
})

// 展开某个 optionId 在其维度树内的所有子孙 optionId（single 类型直接返回自身）
async function expandOptionIds(dimensionId: string, optionId: string, userId: string): Promise<string[]> {
  const [dim] = await db.select().from(dimensions).where(eq(dimensions.id, dimensionId))
  if (!dim || dim.type !== 'tree') return [optionId]

  const allOptions = await db
    .select()
    .from(dimensionOptions)
    .where(and(eq(dimensionOptions.dimensionId, dimensionId), eq(dimensionOptions.userId, userId)))

  const childrenMap = new Map<string, string[]>()
  for (const o of allOptions) {
    if (!o.parentId) continue
    const list = childrenMap.get(o.parentId) ?? []
    list.push(o.id)
    childrenMap.set(o.parentId, list)
  }

  const result: string[] = []
  const queue = [optionId]
  while (queue.length > 0) {
    const id = queue.shift()!
    result.push(id)
    queue.push(...(childrenMap.get(id) ?? []))
  }
  return result
}

// GET /tasks?start=&end=&inbox=true&all=true&filter[<dimensionId>]=<optionId>
tasksRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const rawQuery = c.req.query()
  const parsed = QuerySchema.safeParse(rawQuery)
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)
  const { start, end, inbox, all } = parsed.data

  const dimensionFilters: { dimensionId: string; optionId: string }[] = []
  for (const [key, value] of Object.entries(rawQuery)) {
    const m = key.match(/^filter\[(.+)\]$/)
    if (m) dimensionFilters.push({ dimensionId: m[1], optionId: value })
  }

  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)]

  if (all === 'true') {
    // 全部任务：不过滤时间，维度筛选在下方统一处理
  } else if (inbox === 'true') {
    // Inbox：无排期时间的任务
    conditions.push(isNull(tasks.startTime))
  } else {
    // 日历视图：只返回有时间的任务
    if (end) conditions.push(lte(tasks.startTime, new Date(end)))
    if (start) conditions.push(gte(tasks.endTime, new Date(start)))
  }

  let filteredTaskIds: string[] | null = null
  for (const f of dimensionFilters) {
    const optionIds = await expandOptionIds(f.dimensionId, f.optionId, userId)
    const rows = await db
      .select({ taskId: taskDimensionValues.taskId })
      .from(taskDimensionValues)
      .where(and(eq(taskDimensionValues.dimensionId, f.dimensionId), inArray(taskDimensionValues.optionId, optionIds)))
    const idSet = new Set(rows.map((r) => r.taskId))
    filteredTaskIds = filteredTaskIds === null ? [...idSet] : filteredTaskIds.filter((id) => idSet.has(id))
  }
  if (filteredTaskIds !== null) {
    if (filteredTaskIds.length === 0) return c.json({ data: [] })
    conditions.push(inArray(tasks.id, filteredTaskIds))
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))

  if (rows.length === 0) return c.json({ data: [] })

  const taskIds = rows.map((t) => t.id)
  const dimValueRows = await db
    .select()
    .from(taskDimensionValues)
    .where(inArray(taskDimensionValues.taskId, taskIds))

  const dimValuesByTask = new Map<string, Record<string, string>>()
  for (const rel of dimValueRows) {
    const map = dimValuesByTask.get(rel.taskId) ?? {}
    map[rel.dimensionId] = rel.optionId
    dimValuesByTask.set(rel.taskId, map)
  }

  const result = rows.map((t) => ({ ...t, dimensionValues: dimValuesByTask.get(t.id) ?? {} }))
  return c.json({ data: result })
})

// POST /tasks
tasksRouter.post('/', zValidator('json', CreateTaskSchema), async (c) => {
  const userId = c.get('userId')
  const { dimensionValues, ...body } = c.req.valid('json')
  const now = new Date()

  const [task] = await db.insert(tasks).values({
    ...body,
    userId,
    startTime: body.startTime ? new Date(body.startTime) : null,
    endTime: body.endTime ? new Date(body.endTime) : null,
    createdAt: now,
    updatedAt: now,
  }).returning()

  const entries = Object.entries(dimensionValues ?? {})
  if (entries.length > 0) {
    await db.insert(taskDimensionValues).values(
      entries.map(([dimensionId, optionId]) => ({ id: nanoid(), taskId: task.id, dimensionId, optionId }))
    )
  }

  return c.json({ data: { ...task, dimensionValues: dimensionValues ?? {} } }, 201)
})

// PATCH /tasks/:id
tasksRouter.patch('/:id', zValidator('json', UpdateTaskSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { dimensionValues, ...body } = c.req.valid('json')

  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() }
  if (body.startTime !== undefined) updateData.startTime = body.startTime ? new Date(body.startTime) : null
  if (body.endTime !== undefined) updateData.endTime = body.endTime ? new Date(body.endTime) : null

  const [task] = await db
    .update(tasks)
    .set(updateData)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning()

  if (!task) return c.json({ error: 'Not found' }, 404)

  // 全量替换该任务的维度取值（传了 dimensionValues 就整体覆盖，不传则维持不变）
  if (dimensionValues !== undefined) {
    await db.delete(taskDimensionValues).where(eq(taskDimensionValues.taskId, id))
    const entries = Object.entries(dimensionValues)
    if (entries.length > 0) {
      await db.insert(taskDimensionValues).values(
        entries.map(([dimensionId, optionId]) => ({ id: nanoid(), taskId: id, dimensionId, optionId }))
      )
    }
  }

  const dimValueRows = await db.select().from(taskDimensionValues).where(eq(taskDimensionValues.taskId, id))
  const finalDimensionValues: Record<string, string> = {}
  for (const rel of dimValueRows) finalDimensionValues[rel.dimensionId] = rel.optionId

  return c.json({ data: { ...task, dimensionValues: finalDimensionValues } })
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
