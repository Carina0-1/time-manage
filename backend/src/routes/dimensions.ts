import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { dimensions, dimensionOptions, taskDimensionValues } from '../db/schema.js'
import { CreateDimensionSchema, UpdateDimensionSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const dimensionsRouter = new Hono<AuthEnv>()

// GET /dimensions
dimensionsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(dimensions)
    .where(and(eq(dimensions.userId, userId), isNull(dimensions.deletedAt)))
    .orderBy(dimensions.sortOrder)
  return c.json({ data: rows })
})

// POST /dimensions
dimensionsRouter.post('/', zValidator('json', CreateDimensionSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [dimension] = await db.insert(dimensions).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: dimension }, 201)
})

// PATCH /dimensions/:id
dimensionsRouter.patch('/:id', zValidator('json', UpdateDimensionSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [dimension] = await db
    .update(dimensions)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(dimensions.id, id), eq(dimensions.userId, userId)))
    .returning()

  if (!dimension) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: dimension })
})

// PATCH /dimensions/reorder
const ReorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
dimensionsRouter.patch('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')
  await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db.update(dimensions)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(dimensions.id, id), eq(dimensions.userId, userId)))
    )
  )
  return c.json({ data: null })
})

// PATCH /dimensions/:id/set-color-source — 设为配色维度（应用层保证全局唯一）
dimensionsRouter.patch('/:id/set-color-source', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [target] = await db.select().from(dimensions).where(and(eq(dimensions.id, id), eq(dimensions.userId, userId)))
  if (!target) return c.json({ error: 'Not found' }, 404)

  await db.update(dimensions).set({ isColorSource: false, updatedAt: new Date() }).where(eq(dimensions.userId, userId))
  await db.update(dimensions).set({ isColorSource: true, updatedAt: new Date() }).where(and(eq(dimensions.id, id), eq(dimensions.userId, userId)))

  return c.json({ data: null })
})

// DELETE /dimensions/:id  (软删除维度 + 软删其下所有选项 + 清空引用)
dimensionsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const now = new Date()

  const [dimension] = await db
    .update(dimensions)
    .set({ deletedAt: now })
    .where(and(eq(dimensions.id, id), eq(dimensions.userId, userId)))
    .returning()

  if (!dimension) return c.json({ error: 'Not found' }, 404)

  const options = await db
    .select({ id: dimensionOptions.id })
    .from(dimensionOptions)
    .where(and(eq(dimensionOptions.dimensionId, id), eq(dimensionOptions.userId, userId)))
  const optionIds = options.map((o) => o.id)

  if (optionIds.length > 0) {
    await db.update(dimensionOptions).set({ deletedAt: now }).where(inArray(dimensionOptions.id, optionIds))
    await db.delete(taskDimensionValues).where(inArray(taskDimensionValues.optionId, optionIds))
  }

  return c.json({ data: null }, 200)
})
