import type { Task, CreateTaskInput, UpdateTaskInput, TaskListQuery, TaskListResult } from '@time-manage/shared'
import { api } from './client'

export const tasksApi = {
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
  create: (data: CreateTaskInput) => api.post<Task>('/tasks', data),
  update: (id: string, data: UpdateTaskInput) => api.patch<Task>(`/tasks/${id}`, data),
  remove: (id: string) => api.delete<null>(`/tasks/${id}`),
}
