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

  if (taskRows.length === 0) {
    return c.json<{ data: StatsResult }>({
      data: { tags: [], totalMinutes: 0, completedCount: 0, totalCount: 0 },
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

  return c.json<{ data: StatsResult }>({
    data: { tags: tagStats, totalMinutes, completedCount, totalCount },
  })
})
