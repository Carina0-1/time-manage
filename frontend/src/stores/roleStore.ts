import { create } from 'zustand'
import type { Role } from '@time-manage/shared'
import { rolesApi } from '@/api/roles'

interface RoleStore {
  roles: Role[]
  loading: boolean
  fetchRoles: () => Promise<void>
  addRole: (role: Role) => void
  updateRole: (id: string, data: Partial<Role>) => void
  removeRole: (id: string) => void
  reorderRoles: (ordered: Role[]) => void
}

export const useRoleStore = create<RoleStore>((set) => ({
  roles: [],
  loading: false,

  fetchRoles: async () => {
    set({ loading: true })
    try {
      const roles = await rolesApi.list()
      set({ roles })
    } finally {
      set({ loading: false })
    }
  },

  addRole: (role) =>
    set((s) => ({ roles: [...s.roles, role] })),

  updateRole: (id, data) =>
    set((s) => ({
      roles: s.roles.map((r) => (r.id === id ? { ...r, ...data } : r)),
    })),

  removeRole: (id) =>
    set((s) => ({ roles: s.roles.filter((r) => r.id !== id) })),

  reorderRoles: (ordered) =>
    set({ roles: ordered }),
}))
