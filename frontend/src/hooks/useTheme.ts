import { create } from 'zustand'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'time-manage-theme'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set) => ({
  theme: getInitialTheme(),
  toggle: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}))
