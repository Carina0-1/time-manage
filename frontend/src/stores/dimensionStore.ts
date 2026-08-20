import { create } from 'zustand'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { dimensionsApi } from '@/api/dimensions'
import { getDescendantIds, buildOptionTree } from '@/utils/dimensionTree'

interface DimensionStore {
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
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
}

export const useDimensionStore = create<DimensionStore>((set, get) => ({
  dimensions: [],
  optionsByDimension: {},
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
}))
