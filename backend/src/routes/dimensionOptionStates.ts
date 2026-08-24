import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, inArray, lte, gte, or, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { dimensions, dimensionOptions, dimensionOptionStates, dimensionStates } from '../db/schema.js'
import { CreateDimensionOptionStateSchema, UpdateDimensionOptionStateSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const dimensionOptionStatesRouter = new Hono<AuthEnv>()

// GET /dimension-option-states?optionId=xxx
const ListQuerySchema = z.object({ optionId: z.string() })
dimensionOptionStatesRouter.get('/', zValidator('query', ListQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { optionId } = c.req.valid('query')
  const rows = await db
    .select()
    .from(dimensionOptionStates)
    .where(and(eq(dimensionOptionStates.optionId, optionId), eq(dimensionOptionStates.userId, userId)))
    .orderBy(desc(dimensionOptionStates.startDate))
  return c.json({ data: rows })
})

// GET /dimension-option-states/current?dimensionId=xxx — 每个实体选项当前所处状态（供侧边栏展示）
const CurrentQuerySchema = z.object({ dimensionId: z.string() })
dimensionOptionStatesRouter.get('/current', zValidator('query', CurrentQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { dimensionId } = c.req.valid('query')
  const today = new Date().toISOString().slice(0, 10)

  const options = await db
    .select({ id: dimensionOptions.id })
    .from(dimensionOptions)
    .where(and(
      eq(dimensionOptions.dimensionId, dimensionId),
      eq(dimensionOptions.userId, userId),
      isNull(dimensionOptions.deletedAt)
    ))
  const optionIds = options.map((o) => o.id)
  if (optionIds.length === 0) return c.json({ data: [] })

  const rows = await db
    .select({
      optionId: dimensionOptionStates.optionId,
      stateId: dimensionOptionStates.stateId,
      startDate: dimensionOptionStates.startDate,
      stateName: dimensionStates.name,
      stateColor: dimensionStates.color,
    })
    .from(dimensionOptionStates)
    .innerJoin(dimensionStates, eq(dimensionOptionStates.stateId, dimensionStates.id))
    .where(and(
      inArray(dimensionOptionStates.optionId, optionIds),
      eq(dimensionOptionStates.userId, userId),
      isNull(dimensionStates.deletedAt),
      lte(dimensionOptionStates.startDate, today),
      or(isNull(dimensionOptionStates.endDate), gte(dimensionOptionStates.endDate, today))
    ))

  const latestByOption = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const cur = latestByOption.get(row.optionId)
    if (!cur || row.startDate > cur.startDate) latestByOption.set(row.optionId, row)
  }

  const data = Array.from(latestByOption.values()).map((row) => ({
    optionId: row.optionId,
    stateId: row.stateId,
    name: row.stateName,
    color: row.stateColor ?? undefined,
    startDate: row.startDate,
  }))
  return c.json({ data })
})

// POST /dimension-option-states
dimensionOptionStatesRouter.post('/', zValidator('json', CreateDimensionOptionStateSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const [option] = await db
    .select({ dimensionId: dimensionOptions.dimensionId })
    .from(dimensionOptions)
    .where(and(eq(dimensionOptions.id, body.optionId), eq(dimensionOptions.userId, userId)))
  if (!option) return c.json({ error: 'Not found' }, 404)

  const [dimension] = await db
    .select({ type: dimensions.type })
    .from(dimensions)
    .where(and(eq(dimensions.id, option.dimensionId), eq(dimensions.userId, userId)))
  if (dimension?.type !== 'entity') return c.json({ error: '只有实体型维度的选项可以配置状态时间线' }, 400)

  const now = new Date()
  const [state] = await db.insert(dimensionOptionStates).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: state }, 201)
})

// PATCH /dimension-option-states/:id
dimensionOptionStatesRouter.patch('/:id', zValidator('json', UpdateDimensionOptionStateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [state] = await db
    .update(dimensionOptionStates)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(dimensionOptionStates.id, id), eq(dimensionOptionStates.userId, userId)))
    .returning()

  if (!state) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: state })
})

// DELETE /dimension-option-states/:id — 物理删除
dimensionOptionStatesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [state] = await db
    .delete(dimensionOptionStates)
    .where(and(eq(dimensionOptionStates.id, id), eq(dimensionOptionStates.userId, userId)))
    .returning()

  if (!state) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null })
})
