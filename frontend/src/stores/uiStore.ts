import { create } from 'zustand'

interface CreateTaskDefaults {
  start?: Date
  end?: Date
  isAllDay: boolean
  prefillTaskId?: string
  goalId?: string
}

export type GoalFilter = { type: 'goal'; id: string } | { type: 'phase'; id: string }

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
  // 侧边栏目标筛选
  activeGoalFilter: GoalFilter | null
  setGoalFilter: (filter: GoalFilter | null) => void
  // 侧边栏角色筛选
  activeRoleFilter: string | null
  setRoleFilter: (roleId: string | null) => void
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

  activeGoalFilter: null,
  setGoalFilter: (filter) => set({ activeGoalFilter: filter }),

  activeRoleFilter: null,
  setRoleFilter: (roleId) => set({ activeRoleFilter: roleId }),
}))
