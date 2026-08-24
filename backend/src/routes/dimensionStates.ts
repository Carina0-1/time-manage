import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { dimensions, dimensionStates } from '../db/schema.js'
import { CreateDimensionStateSchema, UpdateDimensionStateSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const dimensionStatesRouter = new Hono<AuthEnv>()

// GET /dimension-states?dimensionId=xxx
const ListQuerySchema = z.object({ dimensionId: z.string() })
dimensionStatesRouter.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { dimensionId } = c.req.valid('query')
  const rows = await db
    .select()
    .from(dimensionStates)
    .where(and(
      eq(dimensionStates.dimensionId, dimensionId),
      eq(dimensionStates.userId, userId),
      isNull(dimensionStates.deletedAt)
    ))
    .orderBy(dimensionStates.sortOrder)
  return c.json({ data: rows })
})

// POST /dimension-states
dimensionStatesRouter.post('/', zValidator('json', CreateDimensionStateSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const [dimension] = await db
    .select()
    .from(dimensions)
    .where(and(eq(dimensions.id, body.dimensionId), eq(dimensions.userId, userId)))
  if (!dimension) return c.json({ error: 'Not found' }, 404)
  if (dimension.type !== 'entity') return c.json({ error: '只有实体型维度可以配置状态词表' }, 400)

  const now = new Date()
  const [state] = await db.insert(dimensionStates).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: state }, 201)
})

// PATCH /dimension-states/reorder — 必须注册在 /:id 之前，否则会被参数化路由抢先匹配（Hono 按注册顺序匹配）
const ReorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
dimensionStatesRouter.patch('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')
  await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db.update(dimensionStates)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(dimensionStates.id, id), eq(dimensionStates.userId, userId)))
    )
  )
  return c.json({ data: null })
})

// PATCH /dimension-states/:id
dimensionStatesRouter.patch('/:id', zValidator('json', UpdateDimensionStateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [state] = await db
    .update(dimensionStates)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(dimensionStates.id, id), eq(dimensionStates.userId, userId)))
    .returning()

  if (!state) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: state })
})

// DELETE /dimension-states/:id — 软删，已有时间线记录中的引用不受影响（仅不再作为"当前状态"展示）
dimensionStatesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [state] = await db
    .update(dimensionStates)
    .set({ deletedAt: new Date() })
    .where(and(eq(dimensionStates.id, id), eq(dimensionStates.userId, userId)))
    .returning()

  if (!state) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null })
})
