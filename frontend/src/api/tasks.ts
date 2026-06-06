import type { Task, CreateTaskInput, UpdateTaskInput } from '@time-manage/shared'
import { api } from './client'

export const tasksApi = {
  list: (start?: string, end?: string) => {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    const qs = params.toString()
    return api.get<Task[]>(`/tasks${qs ? `?${qs}` : ''}`)
  },
  listInbox: (goalId: string) => api.get<Task[]>(`/tasks?inbox=true&goalId=${goalId}`),
  listAllByGoal: (goalId: string) => api.get<Task[]>(`/tasks?all=true&goalId=${goalId}`),
  create: (data: CreateTaskInput) => api.post<Task>('/tasks', data),
  update: (id: string, data: UpdateTaskInput) => api.patch<Task>(`/tasks/${id}`, data),
  remove: (id: string) => api.delete<null>(`/tasks/${id}`),
}
