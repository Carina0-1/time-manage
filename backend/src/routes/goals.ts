import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { goals, phases, tasks } from '../db/schema.js'
import { CreateGoalSchema, UpdateGoalSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const goalsRouter = new Hono<AuthEnv>()

// GET /goals — 返回所有 goals，含 phases 和每个 phase 的 taskCount
goalsRouter.get('/', async (c) => {
  const userId = c.get('userId')

  const goalRows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), isNull(goals.deletedAt)))
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
