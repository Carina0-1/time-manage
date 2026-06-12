import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { phases, goals, tasks } from '../db/schema.js'
import { CreatePhaseSchema, UpdatePhaseSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const phasesRouter = new Hono<AuthEnv>()

const ReorderPhasesSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})

// PATCH /phases/reorder — 批量更新 sortOrder
phasesRouter.patch('/reorder', zValidator('json', ReorderPhasesSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')

  const ids = orders.map((o) => o.id)
  const owned = await db
    .select({ id: phases.id })
    .from(phases)
    .where(and(inArray(phases.id, ids), eq(phases.userId, userId)))
  const ownedIds = new Set(owned.map((p) => p.id))

  await Promise.all(
    orders
      .filter((o) => ownedIds.has(o.id))
      .map((o) => db.update(phases).set({ sortOrder: o.sortOrder }).where(eq(phases.id, o.id)))
  )

  return c.json({ data: null })
})

// POST /phases
phasesRouter.post('/', zValidator('json', CreatePhaseSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')

  // 验证 goal 归属当前用户
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, body.goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
  if (!goal) return c.json({ error: 'Goal not found' }, 404)

  const now = new Date()
  const [phase] = await db.insert(phases).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: phase }, 201)
})

// PATCH /phases/:id
phasesRouter.patch('/:id', zValidator('json', UpdatePhaseSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [phase] = await db
    .update(phases)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(phases.id, id), eq(phases.userId, userId), isNull(phases.deletedAt)))
    .returning()

  if (!phase) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: phase })
})

const DeletePhaseQuerySchema = z.object({
  withTasks: z.string().optional(),
})

// DELETE /phases/:id?withTasks=true (软删除，可选级联删除任务)
phasesRouter.delete('/:id', zValidator('query', DeletePhaseQuerySchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { withTasks } = c.req.valid('query')

  const [phase] = await db
    .update(phases)
    .set({ deletedAt: new Date() })
    .where(and(eq(phases.id, id), eq(phases.userId, userId)))
    .returning()

  if (!phase) return c.json({ error: 'Not found' }, 404)

  if (withTasks === 'true') {
    await db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.phaseId, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
  }

  return c.json({ data: null }, 200)
})
