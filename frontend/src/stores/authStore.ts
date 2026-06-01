import { create } from 'zustand'
import type { AuthUser } from '@time-manage/shared'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

interface AuthStore {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  initialized: boolean
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
  initFromStorage: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  initialized: false,

  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null, isAuthenticated: false })
  },

  initFromStorage: () => {
    const token = localStorage.getItem(TOKEN_KEY)
    const userStr = localStorage.getItem(USER_KEY)
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser
        set({ token, user, isAuthenticated: true, initialized: true })
        return
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    set({ initialized: true })
  },
}))
