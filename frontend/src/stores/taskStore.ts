import { create } from 'zustand'
import type { Task } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'

interface TaskStore {
  // 日历范围与详情缓存分开，列表保留自己的查询结果。
  tasks: Task[]
  taskCache: Record<string, Task>
  loading: boolean
  revision: number
  lastMutation: { type: 'create' | 'update' | 'delete'; id: string; task?: Task } | null
  fetchTasks: (start?: string, end?: string) => Promise<void>
  cacheTasks: (tasks: Task[]) => void
  loadTask: (id: string) => Promise<Task>
  addTask: (task: Task) => void
  updateTask: (id: string, data: Partial<Task>, notify?: boolean) => void
  removeTask: (id: string) => void
  clearDimensionValueForTasks: (dimensionId: string, optionIds: string[]) => void
  reset: () => void
}
let requestVersion = 0
export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [], taskCache: {}, loading: false, revision: 0, lastMutation: null,
  fetchTasks: async (start, end) => {
    const version = ++requestVersion
    set({ loading: true })
    try {
      const tasks = await tasksApi.list(start, end)
      if (version === requestVersion) {
        get().cacheTasks(tasks)
        set({ tasks })
      }
    } finally {
      if (version === requestVersion) set({ loading: false })
    }
  },
  cacheTasks: (tasks) => set(s => ({ taskCache: { ...s.taskCache, ...Object.fromEntries(tasks.map(t => [t.id, t])) } })),
  loadTask: async (id) => {
    const task = await tasksApi.get(id)
    get().cacheTasks([task])
    return task
  },
  addTask: (task) => set(s => ({
    tasks: [...s.tasks, task], taskCache: { ...s.taskCache, [task.id]: task }, revision: s.revision + 1,
    lastMutation: { type: 'create', id: task.id, task },
  })),
  updateTask: (id, data, notify = true) => {
    ++requestVersion
    set(s => {
      const existing = s.taskCache[id] ?? s.tasks.find(t => t.id === id)
      const task = existing ? { ...existing, ...data } : undefined
      return {
        tasks: s.tasks.map(t => t.id === id ? { ...t, ...data } : t),
        taskCache: task ? { ...s.taskCache, [id]: task } : s.taskCache,
        loading: false, revision: notify ? s.revision + 1 : s.revision, lastMutation: notify ? { type: 'update', id, task } : s.lastMutation,
      }
    })
  },
  removeTask: (id) => set(s => {
    const cache = { ...s.taskCache }
    delete cache[id]
    return { tasks: s.tasks.filter(t => t.id !== id), taskCache: cache, revision: s.revision + 1, lastMutation: { type: 'delete', id } }
  }),
  clearDimensionValueForTasks: (dimensionId, optionIds) => set(s => {
    const clean = (t: Task) => {
      if (!optionIds.includes(t.dimensionValues[dimensionId])) return t
      const values = { ...t.dimensionValues }
      delete values[dimensionId]
      return { ...t, dimensionValues: values }
    }
    return { tasks: s.tasks.map(clean), taskCache: Object.fromEntries(Object.entries(s.taskCache).map(([id, t]) => [id, clean(t)])), revision: s.revision + 1, lastMutation: null }
  }),
  reset: () => { ++requestVersion; set({ tasks: [], taskCache: {}, loading: false, revision: 0, lastMutation: null }) },
}))
