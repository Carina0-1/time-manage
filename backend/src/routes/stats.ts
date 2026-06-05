import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tasks, taskTags, tags } from '../db/schema.js'
import { z } from 'zod'
import type { StatsResult } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const statsRouter = new Hono<AuthEnv>()

// GET /stats?start=&end=
const StatsQuerySchema = z.object({
  start: z.string(),
  end: z.string(),
})

statsRouter.get('/', zValidator('query', StatsQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { start, end } = c.req.valid('query')

  const startDate = new Date(start)
  const endDate = new Date(end)

  // 查询时间范围内所有未删除的任务
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      gte(tasks.startTime, startDate),
      lte(tasks.endTime, endDate),
    ))

  // 生成查询范围内所有日期列表（YYYY-MM-DD，按本地时区）
  const allDates: string[] = []
  const cur = new Date(startDate)
  cur.setUTCHours(0, 0, 0, 0)
  const endDay = new Date(endDate)
  endDay.setUTCHours(0, 0, 0, 0)
  while (cur <= endDay) {
    allDates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  if (taskRows.length === 0) {
    const dailyMinutes = allDates.map((date) => ({ date, totalMinutes: 0 }))
    return c.json<{ data: StatsResult }>({
      data: { tags: [], totalMinutes: 0, completedCount: 0, totalCount: 0, dailyActivity: [], dailyMinutes, dailyTagMinutes: [] },
    })
  }

  const taskIds = taskRows.map((t) => t.id)
  const totalCount = taskRows.length
  const completedCount = taskRows.filter((t) => t.status === 'done').length

  // 计算每个任务的时长（分钟）
  const minutesByTaskId = new Map<string, number>()
  for (const task of taskRows) {
    const minutes = Math.round((task.endTime.getTime() - task.startTime.getTime()) / 60000)
    minutesByTaskId.set(task.id, minutes)
  }

  const totalMinutes = Array.from(minutesByTaskId.values()).reduce((a, b) => a + b, 0)

  // 查询 task_tags 关联
  const relations = taskIds.length > 0
    ? await db
        .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
        .from(taskTags)
        .where(inArray(taskTags.taskId, taskIds))
    : []

  // 查询标签信息
  const tagIds = [...new Set(relations.map((r) => r.tagId))]
  const tagRows = tagIds.length > 0
    ? await db.select().from(tags).where(inArray(tags.id, tagIds))
    : []

  const tagMap = new Map(tagRows.map((t) => [t.id, t]))

  // 按标签汇总时长
  const minutesByTag = new Map<string, number>()
  const countByTag = new Map<string, number>()

  for (const rel of relations) {
    const taskMinutes = minutesByTaskId.get(rel.taskId) ?? 0
    minutesByTag.set(rel.tagId, (minutesByTag.get(rel.tagId) ?? 0) + taskMinutes)
    countByTag.set(rel.tagId, (countByTag.get(rel.tagId) ?? 0) + 1)
  }

  const tagStats = tagIds.map((tagId) => {
    const tag = tagMap.get(tagId)!
    const tagMinutes = minutesByTag.get(tagId) ?? 0
    return {
      tagId,
      tagName: tag.name,
      color: tag.color,
      totalMinutes: tagMinutes,
      taskCount: countByTag.get(tagId) ?? 0,
      percentage: totalMinutes > 0 ? Math.round((tagMinutes / totalMinutes) * 100) : 0,
    }
  }).sort((a, b) => b.totalMinutes - a.totalMinutes)

  // 按天分组计算每日任务数
  const activityMap = new Map<string, number>()
  for (const task of taskRows) {
    const dateKey = task.startTime.toISOString().slice(0, 10)
    activityMap.set(dateKey, (activityMap.get(dateKey) ?? 0) + 1)
  }
  const dailyActivity = Array.from(activityMap.entries())
    .map(([date, taskCount]) => ({ date, taskCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 按天分组计算每日总时长，所有日期都填充（无任务的天补 0）
  const dailyMinutesMap = new Map<string, number>(allDates.map((d) => [d, 0]))
  for (const task of taskRows) {
    const dateKey = task.startTime.toISOString().slice(0, 10)
    const minutes = minutesByTaskId.get(task.id) ?? 0
    dailyMinutesMap.set(dateKey, (dailyMinutesMap.get(dateKey) ?? 0) + minutes)
  }
  const dailyMinutes = allDates.map((date) => ({ date, totalMinutes: dailyMinutesMap.get(date) ?? 0 }))

  // 按天 + 一级标签分组计算时长
  // taskId -> dateKey
  const taskDateMap = new Map<string, string>()
  for (const task of taskRows) {
    taskDateMap.set(task.id, task.startTime.toISOString().slice(0, 10))
  }
  // key: "date|rootTagName" -> minutes
  const dailyTagMap = new Map<string, { minutes: number; color: string }>()
  for (const rel of relations) {
    const tag = tagMap.get(rel.tagId)
    if (!tag) continue
    const rootTagName = tag.name.split('/')[0]
    const date = taskDateMap.get(rel.taskId)
    if (!date) continue
    const key = `${date}|${rootTagName}`
    const prev = dailyTagMap.get(key)
    const minutes = minutesByTaskId.get(rel.taskId) ?? 0
    dailyTagMap.set(key, { minutes: (prev?.minutes ?? 0) + minutes, color: tag.color })
  }
  // 收集所有出现过的一级标签（名称+颜色）
  const rootTagMeta = new Map<string, string>() // tagName -> color
  for (const [key, val] of dailyTagMap.entries()) {
    const tagName = key.split('|')[1]
    if (!rootTagMeta.has(tagName)) rootTagMeta.set(tagName, val.color)
  }

  // 所有日期 × 所有一级标签，缺失的补 0
  const dailyTagMinutes = allDates.flatMap((date) =>
    Array.from(rootTagMeta.entries()).map(([tagName, color]) => {
      const key = `${date}|${tagName}`
      const minutes = dailyTagMap.get(key)?.minutes ?? 0
      return { date, tagName, color, minutes }
    })
  ).sort((a, b) => a.date.localeCompare(b.date) || a.tagName.localeCompare(b.tagName))

  return c.json<{ data: StatsResult }>({
    data: { tags: tagStats, totalMinutes, completedCount, totalCount, dailyActivity, dailyMinutes, dailyTagMinutes },
  })
})
