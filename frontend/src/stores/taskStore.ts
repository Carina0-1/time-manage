import { create } from 'zustand'
import type { Task } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'
import { taskChangeImpact } from './taskImpact'

interface TaskStore {
  // 日历范围与详情缓存分开，列表保留自己的查询结果。
  tasks: Task[]
  taskCache: Record<string, Task>
  loading: boolean
  revision: number
  countRevision: number
  activityRevision: number
  statsRevision: number
  lastMutation: { type: 'create' | 'update' | 'delete'; id: string; task?: Task; previous?: Task } | null
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
const optimisticOriginals = new Map<string, Task>()
export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [], taskCache: {}, loading: false, revision: 0, countRevision: 0, activityRevision: 0, statsRevision: 0, lastMutation: null,
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
  addTask: (task) => { ++requestVersion; set(s => ({
    tasks: [...s.tasks.filter(t => t.id !== task.id), task], taskCache: { ...s.taskCache, [task.id]: task }, loading: false, revision: s.revision + 1,
    countRevision: s.countRevision + (s.taskCache[task.id] ? 0 : 1), activityRevision: s.activityRevision + 1, statsRevision: s.statsRevision + 1,
    lastMutation: { type: 'create', id: task.id, task },
  })) },
  updateTask: (id, data, notify = true) => {
    ++requestVersion
    set(s => {
      const existing = s.taskCache[id] ?? s.tasks.find(t => t.id === id)
      const task = existing ? { ...existing, ...data } : undefined
      if (!notify && existing && !optimisticOriginals.has(id)) optimisticOriginals.set(id, existing)
      const previous = optimisticOriginals.get(id) ?? existing
      if (notify) optimisticOriginals.delete(id)
      const impact = task ? taskChangeImpact(previous, task) : { activity: true, stats: true }
      return {
        tasks: s.tasks.map(t => t.id === id ? { ...t, ...data } : t),
        taskCache: task ? { ...s.taskCache, [id]: task } : s.taskCache,
        loading: false, revision: notify ? s.revision + 1 : s.revision,
        activityRevision: s.activityRevision + (notify && impact.activity ? 1 : 0), statsRevision: s.statsRevision + (notify && impact.stats ? 1 : 0),
        lastMutation: notify ? { type: 'update', id, task, previous } : s.lastMutation,
      }
    })
  },
  removeTask: (id) => { ++requestVersion; optimisticOriginals.delete(id); set(s => {
    const cache = { ...s.taskCache }
    delete cache[id]
    return { tasks: s.tasks.filter(t => t.id !== id), taskCache: cache, loading: false, revision: s.revision + 1, countRevision: s.countRevision + 1, activityRevision: s.activityRevision + 1, statsRevision: s.statsRevision + 1, lastMutation: { type: 'delete', id, previous: s.taskCache[id] } }
  }) },
  clearDimensionValueForTasks: (dimensionId, optionIds) => set(s => {
    const clean = (t: Task) => {
      if (!optionIds.includes(t.dimensionValues[dimensionId])) return t
      const values = { ...t.dimensionValues }
      delete values[dimensionId]
      return { ...t, dimensionValues: values }
    }
    return { tasks: s.tasks.map(clean), taskCache: Object.fromEntries(Object.entries(s.taskCache).map(([id, t]) => [id, clean(t)])), revision: s.revision + 1, statsRevision: s.statsRevision + 1, lastMutation: null }
  }),
  reset: () => { ++requestVersion; optimisticOriginals.clear(); set({ tasks: [], taskCache: {}, loading: false, revision: 0, countRevision: 0, activityRevision: 0, statsRevision: 0, lastMutation: null }) },
}))
