import { create } from 'zustand'

interface CreateTaskDefaults {
  start: Date
  end: Date
  isAllDay: boolean
}

interface UiStore {
  // 任务弹窗
  taskModalOpen: boolean
  editingTaskId: string | null
  createDefaults: CreateTaskDefaults | null
  openCreateModal: (defaults: CreateTaskDefaults) => void
  openEditModal: (taskId: string) => void
  closeTaskModal: () => void
  // 侧边栏标签筛选
  activeTagFilter: string | null
  setTagFilter: (fullPath: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  taskModalOpen: false,
  editingTaskId: null,
  createDefaults: null,

  openCreateModal: (defaults) =>
    set({ taskModalOpen: true, editingTaskId: null, createDefaults: defaults }),

  openEditModal: (taskId) =>
    set({ taskModalOpen: true, editingTaskId: taskId, createDefaults: null }),

  closeTaskModal: () =>
    set({ taskModalOpen: false, editingTaskId: null, createDefaults: null }),

  activeTagFilter: null,
  setTagFilter: (fullPath) => set({ activeTagFilter: fullPath }),
}))
