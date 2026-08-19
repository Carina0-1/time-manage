import type { Role, CreateRoleInput, UpdateRoleInput } from '@time-manage/shared'
import { api } from './client'

export const rolesApi = {
  list: () => api.get<Role[]>('/roles'),
  create: (data: CreateRoleInput) => api.post<Role>('/roles', data),
  update: (id: string, data: UpdateRoleInput) => api.patch<Role>(`/roles/${id}`, data),
  remove: (id: string) => api.delete<null>(`/roles/${id}`),
  reorder: (orders: { id: string; sortOrder: number }[]) =>
    api.post<null>('/roles/reorder', { orders }),
}
