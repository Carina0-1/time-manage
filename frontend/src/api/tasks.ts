import type { Task, CreateTaskInput, UpdateTaskInput, TaskListQuery, TaskListResult } from '@time-manage/shared'
import { api, ApiError } from './client'

export const tasksApi = {
  count: (signal?: AbortSignal) => api.get<number>('/tasks/count', signal),
  get: (id: string) => api.get<Task>(`/tasks/${encodeURIComponent(id)}`),
  query: (query: Partial<TaskListQuery> & { dimensionFilters?: Record<string, string> }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (key === 'dimensionFilters') continue
      if (value !== undefined && value !== '') params.set(key, String(value))
    }
    for (const [id, value] of Object.entries(query.dimensionFilters ?? {})) params.set(`filter[${id}]`, value)
    return api.get<TaskListResult>(`/tasks/list?${params}`, signal)
  },
  updateDimension: (id: string, dimensionId: string, optionId: string | null) =>
    api.patch<Task>(`/tasks/${encodeURIComponent(id)}/dimensions/${encodeURIComponent(dimensionId)}`, { optionId }),
  list: (start?: string, end?: string) => {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    const qs = params.toString()
    return api.get<Task[]>(`/tasks${qs ? `?${qs}` : ''}`)
  },
  listAll: () => api.get<Task[]>('/tasks?all=true'),
  create: (data: CreateTaskInput) => createTask(data),
  capture: (id: string, title: string) => createTask({ id, title, isAllDay: false, dimensionValues: {}, status: 'todo', priority: 'medium' }, true),
  update: (id: string, data: UpdateTaskInput) => api.patch<Task>(`/tasks/${id}`, data),
  remove: (id: string) => api.delete<null>(`/tasks/${id}`),
}

async function createTask(data: CreateTaskInput, capture = false) {
  let saved: Task
  try { saved = await api.post<Task>(capture ? '/tasks/capture' : '/tasks', capture ? { id: data.id, title: data.title } : data) }
  catch (error) {
    if (error instanceof ApiError && error.status < 500 && error.status !== 409) throw error
    // 网络超时可能发生在事务提交之后；用客户端生成的同一个 ID 核实结果。
    try { saved = await api.get<Task>(`/tasks/${encodeURIComponent(data.id)}`) }
    catch { throw error }
  }
  // 重试期间用户也可能修正了输入，只提交与已创建任务不同的明确字段。
  const patch: UpdateTaskInput = {}
  for (const key of (capture ? ['title'] as const : ['title', 'description', 'startTime', 'endTime', 'isAllDay', 'status', 'priority', 'recurrence', 'dimensionValues'] as const)) {
    if (data[key] === undefined) continue
    const left = data[key], right = saved[key]
    const same = key === 'dimensionValues'
      ? Object.keys({ ...(left as Record<string, string>), ...(right as Record<string, string>) }).every(id => (left as Record<string, string>)[id] === (right as Record<string, string>)[id])
      : key === 'description' ? (left ?? '') === (right ?? '')
      : key === 'title' ? String(left).trim() === right
      : JSON.stringify(left) === JSON.stringify(right)
    if (!same) Object.assign(patch, { [key]: left })
  }
  return Object.keys(patch).length ? api.patch<Task>(`/tasks/${encodeURIComponent(data.id)}`, patch) : saved
}
