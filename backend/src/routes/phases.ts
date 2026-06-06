import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { phases, goals } from '../db/schema.js'
import { CreatePhaseSchema, UpdatePhaseSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const phasesRouter = new Hono<AuthEnv>()

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

// DELETE /phases/:id (软删除)
phasesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [phase] = await db
    .update(phases)
    .set({ deletedAt: new Date() })
    .where(and(eq(phases.id, id), eq(phases.userId, userId)))
    .returning()

  if (!phase) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null }, 200)
})
