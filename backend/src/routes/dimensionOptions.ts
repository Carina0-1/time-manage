import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { dimensionOptions, taskDimensionValues } from '../db/schema.js'
import { CreateDimensionOptionSchema, UpdateDimensionOptionSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const dimensionOptionsRouter = new Hono<AuthEnv>()

// GET /dimension-options?dimensionId=xxx
const ListQuerySchema = z.object({ dimensionId: z.string() })
dimensionOptionsRouter.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { dimensionId } = c.req.valid('query')
  const rows = await db
    .select()
    .from(dimensionOptions)
    .where(and(
      eq(dimensionOptions.dimensionId, dimensionId),
      eq(dimensionOptions.userId, userId),
      isNull(dimensionOptions.deletedAt)
    ))
    .orderBy(dimensionOptions.sortOrder)
  return c.json({ data: rows })
})

// POST /dimension-options
dimensionOptionsRouter.post('/', zValidator('json', CreateDimensionOptionSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [option] = await db.insert(dimensionOptions).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: option }, 201)
})

// 校验 newParentId 是否会形成环（newParentId 是 optionId 自身的子孙）
async function wouldCreateCycle(optionId: string, newParentId: string, userId: string): Promise<boolean> {
  let cursor: string | null = newParentId
  const visited = new Set<string>()
  while (cursor) {
    if (cursor === optionId) return true
    if (visited.has(cursor)) break
    visited.add(cursor)
    const [row] = await db
      .select({ parentId: dimensionOptions.parentId })
      .from(dimensionOptions)
      .where(and(eq(dimensionOptions.id, cursor), eq(dimensionOptions.userId, userId)))
    cursor = row?.parentId ?? null
  }
  return false
}

// PATCH /dimension-options/:id
dimensionOptionsRouter.patch('/:id', zValidator('json', UpdateDimensionOptionSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  if (body.parentId) {
    const cycle = await wouldCreateCycle(id, body.parentId, userId)
    if (cycle) return c.json({ error: '不能将节点移动到自己的子孙节点下' }, 400)
  }

  const [option] = await db
    .update(dimensionOptions)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(dimensionOptions.id, id), eq(dimensionOptions.userId, userId)))
    .returning()

  if (!option) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: option })
})

// PATCH /dimension-options/reorder
const ReorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
dimensionOptionsRouter.patch('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')
  await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db.update(dimensionOptions)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(dimensionOptions.id, id), eq(dimensionOptions.userId, userId)))
    )
  )
  return c.json({ data: null })
})

// DELETE /dimension-options/:id  (递归软删自己+子孙，清空引用，不删任务)
dimensionOptionsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [start] = await db
    .select()
    .from(dimensionOptions)
    .where(and(eq(dimensionOptions.id, id), eq(dimensionOptions.userId, userId), isNull(dimensionOptions.deletedAt)))
  if (!start) return c.json({ error: 'Not found' }, 404)

  const allInDimension = await db
    .select()
    .from(dimensionOptions)
    .where(and(eq(dimensionOptions.dimensionId, start.dimensionId), eq(dimensionOptions.userId, userId)))

  const childrenMap = new Map<string, string[]>()
  for (const o of allInDimension) {
    if (!o.parentId) continue
    const list = childrenMap.get(o.parentId) ?? []
    list.push(o.id)
    childrenMap.set(o.parentId, list)
  }

  const idsToDelete: string[] = []
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    idsToDelete.push(cur)
    queue.push(...(childrenMap.get(cur) ?? []))
  }

  const now = new Date()
  await db.update(dimensionOptions).set({ deletedAt: now }).where(inArray(dimensionOptions.id, idsToDelete))
  await db.delete(taskDimensionValues).where(inArray(taskDimensionValues.optionId, idsToDelete))

  return c.json({ data: null }, 200)
})
