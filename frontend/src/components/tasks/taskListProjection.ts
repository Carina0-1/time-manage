import type { DimensionOption, Task, TaskListQuery, TaskListResult } from '@time-manage/shared'
import { UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import { getTaskEndTime } from './taskForm'

type Query = Partial<TaskListQuery> & { dimensionFilters?: Record<string, string> }
export interface TaskMutation { type: 'create' | 'update' | 'delete'; id: string; task?: Task; previous?: Task }
export function matchesTask(task: Task, query: Query, options: Record<string, DimensionOption[]>) {
  if (query.q && ![task.title, task.description].some(v => v?.toLowerCase().includes(query.q!.toLowerCase()))) return false
  if (query.status === 'unfinished' && task.status !== 'todo' || query.status === 'done' && task.status !== 'done') return false
  const scheduled = task.isAllDay || !!(task.startTime && task.endTime && new Date(task.endTime) > new Date(task.startTime))
  if (query.schedule === 'scheduled' && !scheduled || query.schedule === 'unscheduled' && scheduled) return false
  if (query.start || query.end) {
    const end = getTaskEndTime(task)
    if (!scheduled || !task.startTime || !end) return false
    if (query.start && new Date(end) <= new Date(query.start) || query.end && new Date(task.startTime) >= new Date(query.end)) return false
  }
  for (const [id, selected] of Object.entries(query.dimensionFilters ?? {})) {
    let value: string | undefined = task.dimensionValues[id]
    if (selected === UNSET_DIMENSION_VALUE) { if (value) return false; continue }
    const seen = new Set<string>()
    while (value && value !== selected && !seen.has(value)) { seen.add(value); value = options[id]?.find(o => o.id === value)?.parentId }
    if (value !== selected) return false
  }
  return true
}

// 使用服务器确认的任务立即投影当前页，后台查询负责补齐分页缺口。
export function projectTaskList(result: TaskListResult, mutation: TaskMutation, query: Query, options: Record<string, DimensionOption[]>, pinnedId?: string) {
  const wasVisible = result.items.some(t => t.id === mutation.id)
  const previous = mutation.previous ?? result.items.find(t => t.id === mutation.id)
  const before = mutation.type === 'create' ? wasVisible : !!previous && matchesTask(previous, query, options)
  const after = mutation.type !== 'delete' && !!mutation.task && matchesTask(mutation.task, query, options)
  let items = result.items.filter(t => t.id !== mutation.id)
  if (mutation.task && ((after && (result.page === 1 || wasVisible)) || mutation.id === pinnedId && wasVisible)) items.push(mutation.task)
  items.sort((a, b) => {
    let order = 0
    if (query.sort?.startsWith('start_')) {
      if (!a.startTime && b.startTime) return 1
      if (a.startTime && !b.startTime) return -1
      if (a.startTime && b.startTime) order = (Date.parse(a.startTime) - Date.parse(b.startTime)) * (query.sort === 'start_desc' ? -1 : 1)
    } else order = (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (query.sort === 'created_asc' ? 1 : -1)
    return order || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)
  })
  return { ...result, total: Math.max(0, result.total + Number(after) - Number(before)), items: items.slice(0, result.pageSize) }
}
