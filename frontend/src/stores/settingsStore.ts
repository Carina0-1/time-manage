import { create } from 'zustand'
import { settingsApi } from '@/api/settings'

interface SettingsStore {
  goalTermLabel: string
  tagTermLabel: string
  loaded: boolean
  fetchSettings: () => Promise<void>
  setGoalTermLabel: (v: string) => void
  setTagTermLabel: (v: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  goalTermLabel: '目标',
  tagTermLabel: '标签',
  loaded: false,

  fetchSettings: async () => {
    try {
      const data = await settingsApi.get()
      set({ goalTermLabel: data.goalTermLabel, tagTermLabel: data.tagTermLabel, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  setGoalTermLabel: (v) => set({ goalTermLabel: v }),
  setTagTermLabel: (v) => set({ tagTermLabel: v }),
}))
