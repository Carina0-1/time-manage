import { create } from 'zustand'
import type { TaskListQuery } from '@time-manage/shared'

export interface TaskListFilters {
  q: string
  status: TaskListQuery['status']
  schedule: TaskListQuery['schedule']
  startDate: string
  endDate: string
  sort: TaskListQuery['sort']
  page: number
  dimensionFilters: Record<string, string>
}
const initial: TaskListFilters = { q: '', status: 'all', schedule: 'all', startDate: '', endDate: '', sort: 'created_desc', page: 1, dimensionFilters: {} }

export const useTaskListStore = create<TaskListFilters & {
  setFilters: (patch: Partial<TaskListFilters>) => void
  setDimensionFilter: (id: string, value: string | null) => void
  clearFilters: () => void
  reset: () => void
  confirmLeave: (() => boolean) | null
}>((set) => ({
  ...initial,
  confirmLeave: null,
  setFilters: (patch) => set({ page: 1, ...patch }),
  setDimensionFilter: (id, value) => set(s => {
    const next = { ...s.dimensionFilters }
    if (value) next[id] = value
    else delete next[id]
    return { dimensionFilters: next, page: 1 }
  }),
  clearFilters: () => set(s => ({ ...initial, sort: s.sort })),
  reset: () => set({ ...initial, dimensionFilters: {}, confirmLeave: null }),
}))
