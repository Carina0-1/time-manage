import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, isNotNull, gte, lte, lt, gt, inArray, or, sql, asc, desc, count, type SQL } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import { tasks, taskDimensionValues, dimensions, dimensionOptions } from '../db/schema.js'
import { CreateTaskSchema, UpdateTaskSchema, TaskListQuerySchema, UpdateTaskDimensionSchema, UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

type TaskDb = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
type TaskRow = typeof tasks.$inferSelect
const badRequest = (message: string): never => { throw new HTTPException(400, { message }) }
const notFound = (): never => { throw new HTTPException(404, { message: '任务不存在或已被删除' }) }

export const tasksRouter = new Hono<AuthEnv>()

async function attachDimensions(rows: TaskRow[], conn: TaskDb = db) {
  if (!rows.length) return []
  const values = await conn.select().from(taskDimensionValues).where(inArray(taskDimensionValues.taskId, rows.map(t => t.id)))
  const byTask = new Map<string, Record<string, string>>()
  for (const row of values) {
    const map = byTask.get(row.taskId) ?? {}
    map[row.dimensionId] = row.optionId
    byTask.set(row.taskId, map)
  }
  return rows.map(row => ({ ...row, dimensionValues: byTask.get(row.id) ?? {} }))
}

async function expandOptionIds(dimensionId: string, optionId: string, userId: string) {
  const [dim] = await db.select().from(dimensions).where(and(eq(dimensions.id, dimensionId), eq(dimensions.userId, userId), isNull(dimensions.deletedAt)))
  if (!dim) return badRequest('筛选维度已失效，请重新选择')
  if (optionId === UNSET_DIMENSION_VALUE) return []
  const options = await db.select().from(dimensionOptions).where(and(eq(dimensionOptions.dimensionId, dimensionId), eq(dimensionOptions.userId, userId), isNull(dimensionOptions.deletedAt)))
  if (!options.some(o => o.id === optionId)) return badRequest('筛选选项已失效，请重新选择')
  if (dim.type !== 'tree') return [optionId]
  const result = new Set<string>()
  const queue = [optionId]
  while (queue.length) {
    const id = queue.shift()!
    if (result.has(id)) continue
    result.add(id)
    queue.push(...options.filter(o => o.parentId === id).map(o => o.id))
  }
  return [...result]
}

async function dimensionConditions(raw: Record<string, string>, userId: string) {
  const conditions: SQL[] = []
  for (const [key, optionId] of Object.entries(raw)) {
    const match = key.match(/^filter\[(.+)\]$/)
    if (!match) continue
    const dimensionId = match[1]
    const ids = await expandOptionIds(dimensionId, optionId, userId)
    const relation = sql`select 1 from ${taskDimensionValues}
      where ${taskDimensionValues.taskId} = ${tasks.id} and ${taskDimensionValues.dimensionId} = ${dimensionId}`
    conditions.push(optionId === UNSET_DIMENSION_VALUE
      ? sql`not exists (${relation})`
      : sql`exists (${relation} and ${inArray(taskDimensionValues.optionId, ids)})`)
  }
  return conditions
}

const isScheduled = and(isNotNull(tasks.startTime), isNotNull(tasks.endTime), gt(tasks.endTime, tasks.startTime))!

// 独立分页接口，保留旧的日历 /tasks 数组响应。
tasksRouter.get('/list', zValidator('query', TaskListQuerySchema), async c => {
  const userId = c.get('userId')
  const query = c.req.valid('query')
  const conditions: SQL[] = [eq(tasks.userId, userId), isNull(tasks.deletedAt), ...await dimensionConditions(c.req.query(), userId)]
  if (query.id) conditions.push(eq(tasks.id, query.id))
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
    conditions.push(sql`(${tasks.title} ilike ${pattern} or ${tasks.description} ilike ${pattern} or ${tasks.expectedOutput} ilike ${pattern})`)
  }
  if (query.status === 'unfinished') conditions.push(inArray(tasks.status, ['todo', 'in_progress']))
  else if (query.status !== 'all') conditions.push(eq(tasks.status, query.status))
  if (query.schedule === 'scheduled' || query.start || query.end) conditions.push(isScheduled)
  if (query.schedule === 'unscheduled') conditions.push(or(isNull(tasks.startTime), isNull(tasks.endTime), lte(tasks.endTime, tasks.startTime))!)
  // 结束日期由客户端转为次日零点，按半开区间匹配，避免相邻任务误入日期范围。
  if (query.start) conditions.push(gt(tasks.endTime, new Date(query.start)))
  if (query.end) conditions.push(lt(tasks.startTime, new Date(query.end)))
  const order = query.sort === 'created_asc' ? asc(tasks.createdAt)
    : query.sort === 'start_asc' ? sql`${tasks.startTime} asc nulls last`
    : query.sort === 'start_desc' ? sql`${tasks.startTime} desc nulls last`
    : desc(tasks.createdAt)
  // 同一快照读取总数和当前页，分页边界不因并发写入出现矛盾。
  const result = await db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`)
    const [{ total }] = await tx.select({ total: count() }).from(tasks).where(and(...conditions))
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
    const rows = await tx.select().from(tasks).where(and(...conditions)).orderBy(order, desc(tasks.createdAt), asc(tasks.id)).limit(query.pageSize).offset((page - 1) * query.pageSize)
    return { items: await attachDimensions(rows, tx), total, page, pageSize: query.pageSize }
  })
  return c.json({ data: result })
})

tasksRouter.get('/', async c => {
  const userId = c.get('userId')
  const query = c.req.query()
  const conditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt), ...await dimensionConditions(query, userId)]
  if (query.all !== 'true') {
    if (query.inbox === 'true') conditions.push(isNull(tasks.startTime))
    else {
      for (const key of ['start', 'end']) {
        if (query[key] && Number.isNaN(new Date(query[key]).getTime())) return badRequest('日期格式无效')
      }
      if (query.end) conditions.push(lte(tasks.startTime, new Date(query.end)))
      if (query.start) conditions.push(gte(tasks.endTime, new Date(query.start)))
    }
  }
  const rows = await db.select().from(tasks).where(and(...conditions))
  return c.json({ data: await attachDimensions(rows) })
})

tasksRouter.get('/:id', async c => {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, c.get('userId')), isNull(tasks.deletedAt)))
  if (!task) return notFound()
  const [result] = await attachDimensions([task])
  return c.json({ data: result })
})

function validateTimes(start: Date | null, end: Date | null) {
  if (!start && !end) return
  if (!start || !end) return badRequest('请同时填写开始和结束时间，或同时留空')
  if (end <= start) return badRequest('结束时间须晚于开始时间')
}

async function validateDimensions(conn: TaskDb, userId: string, values: Record<string, string>) {
  const dims = await conn.select().from(dimensions).where(and(eq(dimensions.userId, userId), isNull(dimensions.deletedAt)))
  const missing = dims.filter(d => d.isRequired && !values[d.id])
  if (missing.length) return badRequest(`请选择：${missing.map(d => d.name).join('、')}`)
  const entries = Object.entries(values)
  if (!entries.length) return
  const options = await conn.select().from(dimensionOptions).where(and(eq(dimensionOptions.userId, userId), isNull(dimensionOptions.deletedAt), inArray(dimensionOptions.id, entries.map(([, id]) => id))))
  for (const [dimensionId, optionId] of entries) {
    if (!dims.some(d => d.id === dimensionId) || !options.some(o => o.id === optionId && o.dimensionId === dimensionId)) return badRequest('维度或选项无效，请重新选择')
  }
}

tasksRouter.post('/', zValidator('json', CreateTaskSchema), async c => {
  const userId = c.get('userId')
  const { dimensionValues, ...body } = c.req.valid('json')
  const startTime = body.startTime ? new Date(body.startTime) : null
  const endTime = body.endTime ? new Date(body.endTime) : null
  validateTimes(startTime, endTime)
  const result = await db.transaction(async tx => {
    await validateDimensions(tx, userId, dimensionValues)
    const now = new Date()
    const [task] = await tx.insert(tasks).values({ ...body, userId, startTime, endTime, createdAt: now, updatedAt: now }).returning()
    const entries = Object.entries(dimensionValues)
    if (entries.length) await tx.insert(taskDimensionValues).values(entries.map(([dimensionId, optionId]) => ({ id: nanoid(), taskId: task.id, dimensionId, optionId })))
    return { ...task, dimensionValues }
  })
  return c.json({ data: result }, 201)
})

tasksRouter.patch('/:id', zValidator('json', UpdateTaskSchema), async c => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { dimensionValues, ...body } = c.req.valid('json')
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt))).for('update')
    if (!existing) return notFound()
    const startTime = body.startTime === undefined ? existing.startTime : body.startTime === null ? null : new Date(body.startTime)
    const endTime = body.endTime === undefined ? existing.endTime : body.endTime === null ? null : new Date(body.endTime)
    if (body.startTime !== undefined || body.endTime !== undefined) validateTimes(startTime, endTime)
    if (dimensionValues !== undefined) await validateDimensions(tx, userId, dimensionValues)
    const [task] = await tx.update(tasks).set({ ...body, startTime, endTime, updatedAt: new Date() }).where(eq(tasks.id, id)).returning()
    if (dimensionValues !== undefined) {
      await tx.delete(taskDimensionValues).where(eq(taskDimensionValues.taskId, id))
      const entries = Object.entries(dimensionValues)
      if (entries.length) await tx.insert(taskDimensionValues).values(entries.map(([dimensionId, optionId]) => ({ id: nanoid(), taskId: id, dimensionId, optionId })))
    }
    const [updated] = await attachDimensions([task], tx)
    return updated
  })
  return c.json({ data: result })
})

// 增量修改一个维度；行锁串行化同一任务的写入，避免覆盖其他维度。
tasksRouter.patch('/:id/dimensions/:dimensionId', zValidator('json', UpdateTaskDimensionSchema), async c => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const dimensionId = c.req.param('dimensionId')
  const { optionId } = c.req.valid('json')
  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt))).for('update')
    if (!existing) return notFound()
    const [dim] = await tx.select().from(dimensions).where(and(eq(dimensions.id, dimensionId), eq(dimensions.userId, userId), isNull(dimensions.deletedAt)))
    if (!dim) return badRequest('维度已失效，请重新选择')
    if (optionId === null) {
      if (dim.isRequired) return badRequest(`${dim.name}为必填，不能移除`)
      await tx.delete(taskDimensionValues).where(and(eq(taskDimensionValues.taskId, id), eq(taskDimensionValues.dimensionId, dimensionId)))
    } else {
      const [option] = await tx.select().from(dimensionOptions).where(and(eq(dimensionOptions.id, optionId), eq(dimensionOptions.dimensionId, dimensionId), eq(dimensionOptions.userId, userId), isNull(dimensionOptions.deletedAt)))
      if (!option) return badRequest('选项已失效，请重新选择')
      await tx.insert(taskDimensionValues).values({ id: nanoid(), taskId: id, dimensionId, optionId }).onConflictDoUpdate({ target: [taskDimensionValues.taskId, taskDimensionValues.dimensionId], set: { optionId } })
    }
    const [task] = await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, id)).returning()
    const [updated] = await attachDimensions([task], tx)
    return updated
  })
  return c.json({ data: result })
})

tasksRouter.delete('/:id', async c => {
  const [task] = await db.update(tasks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(tasks.id, c.req.param('id')), eq(tasks.userId, c.get('userId')), isNull(tasks.deletedAt))).returning()
  if (!task) return notFound()
  return c.json({ data: null })
})
