import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, isNotNull, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tasks, taskDimensionValues, dimensions, dimensionOptions } from '../db/schema.js'
import { z } from 'zod'
import type { StatsResult, DimensionStats, DailyDimensionMinutes } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const statsRouter = new Hono<AuthEnv>()

const StatsQuerySchema = z.object({
  start: z.string(),
  end: z.string(),
})

// 沿 parentId 链向上找根节点（无 parentId 的祖先）
function findRootOption(optionId: string, optionsById: Map<string, { id: string; parentId: string | null; name: string; color: string }>) {
  let cur = optionsById.get(optionId)
  if (!cur) return null
  const visited = new Set<string>()
  while (cur.parentId && !visited.has(cur.id)) {
    visited.add(cur.id)
    const parent = optionsById.get(cur.parentId)
    if (!parent) break
    cur = parent
  }
  return cur
}

// GET /stats?start=&end=
statsRouter.get('/', zValidator('query', StatsQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { start, end } = c.req.valid('query')

  const startDate = new Date(start + 'T00:00:00.000Z')
  const endDate = new Date(end + 'T23:59:59.999Z')

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNotNull(tasks.startTime),
      isNotNull(tasks.endTime),
      gte(tasks.startTime, startDate),
      lte(tasks.endTime, endDate),
    ))

  const allDates: string[] = []
  const cur = new Date(startDate)
  const endDay = new Date(endDate)
  endDay.setUTCHours(0, 0, 0, 0)
  while (cur <= endDay) {
    allDates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  const emptyResult: StatsResult = {
    totalMinutes: 0, completedCount: 0, totalCount: 0,
    dailyActivity: [], dailyMinutes: allDates.map((date) => ({ date, totalMinutes: 0 })),
    dimensionStats: {}, dailyDimensionMinutes: {},
  }
  if (taskRows.length === 0) return c.json<{ data: StatsResult }>({ data: emptyResult })

  const taskIds = taskRows.map((t) => t.id)
  const totalCount = taskRows.length
  const completedCount = taskRows.filter((t) => t.status === 'done').length

  const minutesByTaskId = new Map<string, number>()
  for (const task of taskRows) {
    if (!task.startTime || !task.endTime) continue
    minutesByTaskId.set(task.id, Math.round((task.endTime.getTime() - task.startTime.getTime()) / 60000))
  }
  const totalMinutes = Array.from(minutesByTaskId.values()).reduce((a, b) => a + b, 0)

  const activityMap = new Map<string, number>()
  for (const task of taskRows) {
    if (!task.startTime) continue
    const dateKey = task.startTime.toISOString().slice(0, 10)
    activityMap.set(dateKey, (activityMap.get(dateKey) ?? 0) + 1)
  }
  const dailyActivity = Array.from(activityMap.entries())
    .map(([date, taskCount]) => ({ date, taskCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const dailyMinutesMap = new Map<string, number>(allDates.map((d) => [d, 0]))
  for (const task of taskRows) {
    if (!task.startTime) continue
    const dateKey = task.startTime.toISOString().slice(0, 10)
    dailyMinutesMap.set(dateKey, (dailyMinutesMap.get(dateKey) ?? 0) + (minutesByTaskId.get(task.id) ?? 0))
  }
  const dailyMinutes = allDates.map((date) => ({ date, totalMinutes: dailyMinutesMap.get(date) ?? 0 }))

  const taskDateMap = new Map<string, string>()
  for (const task of taskRows) {
    if (!task.startTime) continue
    taskDateMap.set(task.id, task.startTime.toISOString().slice(0, 10))
  }

  // 遍历所有展示中的维度，分别聚合
  const dimRows = await db
    .select()
    .from(dimensions)
    .where(and(eq(dimensions.userId, userId), isNull(dimensions.deletedAt), eq(dimensions.showInSidebar, true)))

  const dimensionStats: Record<string, DimensionStats[]> = {}
  const dailyDimensionMinutes: Record<string, DailyDimensionMinutes[]> = {}

  for (const dim of dimRows) {
    const dimValueRows = await db
      .select()
      .from(taskDimensionValues)
      .where(and(eq(taskDimensionValues.dimensionId, dim.id), inArray(taskDimensionValues.taskId, taskIds)))

    if (dimValueRows.length === 0) continue

    const optionIds = [...new Set(dimValueRows.map((r) => r.optionId))]
    const optionRows = await db.select().from(dimensionOptions).where(inArray(dimensionOptions.id, optionIds))
    const optionMap = new Map(optionRows.map((o) => [o.id, o]))

    // dimensionStats：按 optionId 直接聚合（不做根节点合并，保留具体节点粒度）
    const minutesByOption = new Map<string, number>()
    const countByOption = new Map<string, number>()
    for (const rel of dimValueRows) {
      const m = minutesByTaskId.get(rel.taskId) ?? 0
      minutesByOption.set(rel.optionId, (minutesByOption.get(rel.optionId) ?? 0) + m)
      countByOption.set(rel.optionId, (countByOption.get(rel.optionId) ?? 0) + 1)
    }
    dimensionStats[dim.id] = optionIds.map((optionId) => {
      const option = optionMap.get(optionId)!
      const mins = minutesByOption.get(optionId) ?? 0
      return {
        dimensionId: dim.id,
        optionId,
        optionName: option.name,
        color: option.color,
        totalMinutes: mins,
        taskCount: countByOption.get(optionId) ?? 0,
        percentage: totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0,
      }
    }).sort((a, b) => b.totalMinutes - a.totalMinutes)

    // dailyDimensionMinutes：树形按根节点聚合（与现有 dailyTagMinutes 按一级标签聚合的逻辑一致）
    if (dim.type === 'tree') {
      const allOptionsInDim = await db.select().from(dimensionOptions).where(eq(dimensionOptions.dimensionId, dim.id))
      const optionsById = new Map(allOptionsInDim.map((o) => [o.id, o]))

      const dailyRootMap = new Map<string, { minutes: number; color: string; name: string }>()
      for (const rel of dimValueRows) {
        const date = taskDateMap.get(rel.taskId)
        if (!date) continue
        const root = findRootOption(rel.optionId, optionsById)
        if (!root) continue
        const key = `${date}|${root.id}`
        const m = minutesByTaskId.get(rel.taskId) ?? 0
        const prev = dailyRootMap.get(key)
        dailyRootMap.set(key, { minutes: (prev?.minutes ?? 0) + m, color: root.color, name: root.name })
      }
      const rootMeta = new Map<string, { color: string; name: string }>()
      for (const [key, val] of dailyRootMap.entries()) {
        const rootId = key.split('|')[1]
        if (!rootMeta.has(rootId)) rootMeta.set(rootId, { color: val.color, name: val.name })
      }
      dailyDimensionMinutes[dim.id] = allDates.flatMap((date) =>
        Array.from(rootMeta.entries()).map(([rootId, meta]) => ({
          date, dimensionId: dim.id, optionName: meta.name, color: meta.color,
          minutes: dailyRootMap.get(`${date}|${rootId}`)?.minutes ?? 0,
        }))
      ).sort((a, b) => a.date.localeCompare(b.date) || a.optionName.localeCompare(b.optionName))
    } else {
      const dailyMap = new Map<string, number>()
      for (const rel of dimValueRows) {
        const date = taskDateMap.get(rel.taskId)
        if (!date) continue
        const key = `${date}|${rel.optionId}`
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + (minutesByTaskId.get(rel.taskId) ?? 0))
      }
      dailyDimensionMinutes[dim.id] = allDates.flatMap((date) =>
        optionIds.map((optionId) => {
          const option = optionMap.get(optionId)!
          return {
            date, dimensionId: dim.id, optionName: option.name, color: option.color,
            minutes: dailyMap.get(`${date}|${optionId}`) ?? 0,
          }
        })
      ).sort((a, b) => a.date.localeCompare(b.date) || a.optionName.localeCompare(b.optionName))
    }
  }

  return c.json<{ data: StatsResult }>({
    data: { totalMinutes, completedCount, totalCount, dailyActivity, dailyMinutes, dimensionStats, dailyDimensionMinutes },
  })
})
