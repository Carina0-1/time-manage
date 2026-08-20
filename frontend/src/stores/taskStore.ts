import { create } from 'zustand'
import type { Task } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'

interface TaskStore {
  tasks: Task[]
  loading: boolean
  fetchTasks: (start?: string, end?: string) => Promise<void>
  addTask: (task: Task) => void
  updateTask: (id: string, data: Partial<Task>) => void
  removeTask: (id: string) => void
  clearDimensionValueForTasks: (dimensionId: string, optionIds: string[]) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  loading: false,

  fetchTasks: async (start, end) => {
    set({ loading: true })
    try {
      const tasks = await tasksApi.list(start, end)
      set({ tasks })
    } finally {
      set({ loading: false })
    }
  },

  addTask: (task) =>
    set((s) => ({ tasks: [...s.tasks, task] })),

  updateTask: (id, data) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)),
    })),

  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  // 删除维度选项不删除任务，只清空任务在该维度上的取值
  clearDimensionValueForTasks: (dimensionId, optionIds) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (!optionIds.includes(t.dimensionValues[dimensionId])) return t
        const { [dimensionId]: _removed, ...rest } = t.dimensionValues
        return { ...t, dimensionValues: rest }
      }),
    })),
}))
