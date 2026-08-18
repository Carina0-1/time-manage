import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, ne, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { goals, phases, tasks, taskTags } from '../db/schema.js'
import { CreateGoalSchema, UpdateGoalSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const goalsRouter = new Hono<AuthEnv>()

const ReorderGoalsSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})

// PATCH /goals/reorder — 批量更新 sortOrder
goalsRouter.patch('/reorder', zValidator('json', ReorderGoalsSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')

  const ids = orders.map((o) => o.id)
  const owned = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(inArray(goals.id, ids), eq(goals.userId, userId)))
  const ownedIds = new Set(owned.map((g) => g.id))

  await Promise.all(
    orders
      .filter((o) => ownedIds.has(o.id))
      .map((o) => db.update(goals).set({ sortOrder: o.sortOrder, updatedAt: new Date() }).where(eq(goals.id, o.id)))
  )

  return c.json({ data: null })
})

// GET /goals?includeArchived=true — 返回所有 goals，含 phases 和每个 phase 的 taskCount
// 默认不返回 archived 目标，传 includeArchived=true 时全部返回
goalsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const includeArchived = c.req.query('includeArchived') === 'true'

  const baseConditions = and(eq(goals.userId, userId), isNull(goals.deletedAt))
  const whereClause = includeArchived
    ? baseConditions
    : and(eq(goals.userId, userId), isNull(goals.deletedAt), ne(goals.status, 'archived'))

  const goalRows = await db
    .select()
    .from(goals)
    .where(whereClause)
    .orderBy(goals.sortOrder)

  if (goalRows.length === 0) return c.json({ data: [] })

  const goalIds = goalRows.map((g) => g.id)

  const phaseRows = await db
    .select()
    .from(phases)
    .where(and(inArray(phases.goalId, goalIds), isNull(phases.deletedAt)))
    .orderBy(phases.sortOrder)

  // 统计每个 phase 下的任务数
  const phaseIds = phaseRows.map((p) => p.id)
  const taskCountMap = new Map<string, number>()
  if (phaseIds.length > 0) {
    const taskRows = await db
      .select({ phaseId: tasks.phaseId })
      .from(tasks)
      .where(and(inArray(tasks.phaseId, phaseIds), isNull(tasks.deletedAt)))
    for (const row of taskRows) {
      if (row.phaseId) {
        taskCountMap.set(row.phaseId, (taskCountMap.get(row.phaseId) ?? 0) + 1)
      }
    }
  }

  const phasesByGoal = new Map<string, typeof phaseRows>()
  for (const phase of phaseRows) {
    const list = phasesByGoal.get(phase.goalId) ?? []
    list.push(phase)
    phasesByGoal.set(phase.goalId, list)
  }

  const data = goalRows.map((g) => ({
    ...g,
    phases: (phasesByGoal.get(g.id) ?? []).map((p) => ({
      ...p,
      taskCount: taskCountMap.get(p.id) ?? 0,
    })),
  }))

  return c.json({ data })
})

// GET /goals/:id — 详情页，含 phases 和每个 phase 下的完整任务列表
goalsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId), isNull(goals.deletedAt)))
  if (!goal) return c.json({ error: 'Not found' }, 404)

  const phaseRows = await db
    .select()
    .from(phases)
    .where(and(eq(phases.goalId, id), isNull(phases.deletedAt)))
    .orderBy(phases.sortOrder)

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.goalId, id), isNull(tasks.deletedAt)))

  // 聚合 tagIds
  const taskIds = taskRows.map((t) => t.id)
  const tagMap = new Map<string, string[]>()
  if (taskIds.length > 0) {
    const tagRows = await db
      .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
      .from(taskTags)
      .where(inArray(taskTags.taskId, taskIds))
    for (const row of tagRows) {
      const list = tagMap.get(row.taskId) ?? []
      list.push(row.tagId)
      tagMap.set(row.taskId, list)
    }
  }

  const tasksWithTags = taskRows.map((t) => ({ ...t, tagIds: tagMap.get(t.id) ?? [] }))
  const tasksByPhase = new Map<string | null, typeof tasksWithTags>()
  for (const task of tasksWithTags) {
    const key = task.phaseId ?? null
    const list = tasksByPhase.get(key) ?? []
    list.push(task)
    tasksByPhase.set(key, list)
  }

  const data = {
    ...goal,
    phases: phaseRows.map((p) => ({
      ...p,
      tasks: tasksByPhase.get(p.id) ?? [],
    })),
    unassignedTasks: tasksByPhase.get(null) ?? [],
  }

  return c.json({ data })
})

// POST /goals
goalsRouter.post('/', zValidator('json', CreateGoalSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [goal] = await db.insert(goals).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: { ...goal, phases: [] } }, 201)
})

// PATCH /goals/:id
goalsRouter.patch('/:id', zValidator('json', UpdateGoalSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [goal] = await db
    .update(goals)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning()

  if (!goal) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: goal })
})

// DELETE /goals/:id (软删除)
goalsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const now = new Date()

  const [goal] = await db
    .update(goals)
    .set({ deletedAt: now })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning()

  if (!goal) return c.json({ error: 'Not found' }, 404)

  // 软删除关联的 phases
  await db
    .update(phases)
    .set({ deletedAt: now })
    .where(eq(phases.goalId, id))

  return c.json({ data: null }, 200)
})
