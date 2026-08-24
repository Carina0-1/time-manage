import { create } from 'zustand'
import type { Dimension, DimensionOption, DimensionState, CurrentOptionState } from '@time-manage/shared'
import { dimensionsApi } from '@/api/dimensions'
import { dimensionStatesApi, dimensionOptionStatesApi } from '@/api/dimensionStates'
import { getDescendantIds, buildOptionTree } from '@/utils/dimensionTree'

interface DimensionStore {
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  statesByDimension: Record<string, DimensionState[]>
  currentStateByOption: Record<string, CurrentOptionState>
  loading: boolean
  fetchDimensions: () => Promise<void>
  fetchOptions: (dimensionId: string) => Promise<void>
  addDimension: (d: Dimension) => void
  updateDimension: (id: string, data: Partial<Dimension>) => void
  removeDimension: (id: string) => void
  reorderDimensions: (ordered: Dimension[]) => void
  addOption: (dimensionId: string, o: DimensionOption) => void
  updateOption: (dimensionId: string, optionId: string, data: Partial<DimensionOption>) => void
  removeOption: (dimensionId: string, optionId: string) => void
  reorderOptions: (dimensionId: string, ordered: DimensionOption[]) => void
  fetchStates: (dimensionId: string) => Promise<void>
  addState: (dimensionId: string, s: DimensionState) => void
  updateState: (dimensionId: string, stateId: string, data: Partial<DimensionState>) => void
  removeState: (dimensionId: string, stateId: string) => void
  reorderStates: (dimensionId: string, ordered: DimensionState[]) => void
  fetchCurrentStates: (dimensionId: string) => Promise<void>
}

export const useDimensionStore = create<DimensionStore>((set, get) => ({
  dimensions: [],
  optionsByDimension: {},
  statesByDimension: {},
  currentStateByOption: {},
  loading: false,

  fetchDimensions: async () => {
    set({ loading: true })
    try {
      const dimensions = await dimensionsApi.list()
      set({ dimensions })
    } finally {
      set({ loading: false })
    }
  },

  fetchOptions: async (dimensionId) => {
    const options = await dimensionsApi.listOptions(dimensionId)
    set((s) => ({ optionsByDimension: { ...s.optionsByDimension, [dimensionId]: options } }))
  },

  addDimension: (d) => set((s) => ({ dimensions: [...s.dimensions, d] })),

  updateDimension: (id, data) =>
    set((s) => ({
      dimensions: s.dimensions.map((d) => (d.id === id ? { ...d, ...data } : d)),
    })),

  removeDimension: (id) =>
    set((s) => ({
      dimensions: s.dimensions.filter((d) => d.id !== id),
      optionsByDimension: Object.fromEntries(Object.entries(s.optionsByDimension).filter(([k]) => k !== id)),
      statesByDimension: Object.fromEntries(Object.entries(s.statesByDimension).filter(([k]) => k !== id)),
    })),

  reorderDimensions: (ordered) => set({ dimensions: ordered }),

  addOption: (dimensionId, o) =>
    set((s) => ({
      optionsByDimension: {
        ...s.optionsByDimension,
        [dimensionId]: [...(s.optionsByDimension[dimensionId] ?? []), o],
      },
    })),

  updateOption: (dimensionId, optionId, data) =>
    set((s) => ({
      optionsByDimension: {
        ...s.optionsByDimension,
        [dimensionId]: (s.optionsByDimension[dimensionId] ?? []).map((o) =>
          o.id === optionId ? { ...o, ...data } : o
        ),
      },
    })),

  removeOption: (dimensionId, optionId) => {
    const options = get().optionsByDimension[dimensionId] ?? []
    const tree = buildOptionTree(options)
    function findNode(nodes: ReturnType<typeof buildOptionTree>): ReturnType<typeof buildOptionTree>[number] | null {
      for (const n of nodes) {
        if (n.option.id === optionId) return n
        const found = findNode(n.children)
        if (found) return found
      }
      return null
    }
    const node = findNode(tree)
    const idsToRemove = node ? new Set(getDescendantIds(node)) : new Set([optionId])
    set((s) => ({
      optionsByDimension: {
        ...s.optionsByDimension,
        [dimensionId]: (s.optionsByDimension[dimensionId] ?? []).filter((o) => !idsToRemove.has(o.id)),
      },
    }))
  },

  reorderOptions: (dimensionId, ordered) =>
    set((s) => ({
      optionsByDimension: { ...s.optionsByDimension, [dimensionId]: ordered },
    })),

  fetchStates: async (dimensionId) => {
    const states = await dimensionStatesApi.list(dimensionId)
    set((s) => ({ statesByDimension: { ...s.statesByDimension, [dimensionId]: states } }))
  },

  addState: (dimensionId, st) =>
    set((s) => ({
      statesByDimension: {
        ...s.statesByDimension,
        [dimensionId]: [...(s.statesByDimension[dimensionId] ?? []), st],
      },
    })),

  updateState: (dimensionId, stateId, data) =>
    set((s) => ({
      statesByDimension: {
        ...s.statesByDimension,
        [dimensionId]: (s.statesByDimension[dimensionId] ?? []).map((st) =>
          st.id === stateId ? { ...st, ...data } : st
        ),
      },
    })),

  removeState: (dimensionId, stateId) =>
    set((s) => ({
      statesByDimension: {
        ...s.statesByDimension,
        [dimensionId]: (s.statesByDimension[dimensionId] ?? []).filter((st) => st.id !== stateId),
      },
    })),

  reorderStates: (dimensionId, ordered) =>
    set((s) => ({
      statesByDimension: { ...s.statesByDimension, [dimensionId]: ordered },
    })),

  fetchCurrentStates: async (dimensionId) => {
    const current = await dimensionOptionStatesApi.currentByDimension(dimensionId)
    set((s) => ({
      currentStateByOption: {
        ...s.currentStateByOption,
        ...Object.fromEntries(current.map((c) => [c.optionId, c])),
      },
    }))
  },
}))
