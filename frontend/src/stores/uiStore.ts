import { create } from 'zustand'

interface CreateTaskDefaults {
  start?: Date
  end?: Date
  isAllDay: boolean
  prefillTaskId?: string
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
  // 侧边栏维度筛选
  activeDimensionFilters: Record<string, string | null>
  setDimensionFilter: (dimensionId: string, optionId: string | null) => void
  clearDimensionFilter: (dimensionId: string) => void
  clearAllDimensionFilters: () => void
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

  activeDimensionFilters: {},
  setDimensionFilter: (dimensionId, optionId) =>
    set((s) => ({ activeDimensionFilters: { ...s.activeDimensionFilters, [dimensionId]: optionId } })),
  clearDimensionFilter: (dimensionId) =>
    set((s) => {
      const next = { ...s.activeDimensionFilters }
      delete next[dimensionId]
      return { activeDimensionFilters: next }
    }),
  clearAllDimensionFilters: () => set({ activeDimensionFilters: {} }),
}))
