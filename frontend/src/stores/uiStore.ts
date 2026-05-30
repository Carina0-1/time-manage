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
  panelPos: { x: number; y: number } | null
  openCreateModal: (defaults: CreateTaskDefaults, pos?: { x: number; y: number }) => void
  openEditModal: (taskId: string, pos?: { x: number; y: number }) => void
  closeTaskModal: () => void
  // 侧边栏标签筛选
  activeTagFilter: string | null
  setTagFilter: (fullPath: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  taskModalOpen: false,
  editingTaskId: null,
  createDefaults: null,
  panelPos: null,

  openCreateModal: (defaults, pos) =>
    set({ taskModalOpen: true, editingTaskId: null, createDefaults: defaults, panelPos: pos ?? null }),

  openEditModal: (taskId, pos) =>
    set({ taskModalOpen: true, editingTaskId: taskId, createDefaults: null, panelPos: pos ?? null }),

  closeTaskModal: () =>
    set({ taskModalOpen: false, editingTaskId: null, createDefaults: null, panelPos: null }),

  activeTagFilter: null,
  setTagFilter: (fullPath) => set({ activeTagFilter: fullPath }),
}))
