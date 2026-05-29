import { create } from 'zustand'
import type { Tag } from '@time-manage/shared'
import { tagsApi } from '@/api/tags'

interface TagStore {
  tags: Tag[]
  loading: boolean
  fetchTags: () => Promise<void>
  addTag: (tag: Tag) => void
  updateTag: (id: string, data: Partial<Tag>) => void
  removeTag: (id: string) => void
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,

  fetchTags: async () => {
    set({ loading: true })
    try {
      const tags = await tagsApi.list()
      set({ tags })
    } finally {
      set({ loading: false })
    }
  },

  addTag: (tag) =>
    set((s) => ({ tags: [...s.tags, tag] })),

  updateTag: (id, data) =>
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? { ...t, ...data } : t)),
    })),

  removeTag: (id) =>
    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })),
}))
