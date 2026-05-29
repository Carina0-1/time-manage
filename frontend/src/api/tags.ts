import type { Tag, CreateTagInput, UpdateTagInput } from '@time-manage/shared'
import { api } from './client'

export const tagsApi = {
  list: () => api.get<Tag[]>('/tags'),
  create: (data: CreateTagInput) => api.post<Tag>('/tags', data),
  update: (id: string, data: UpdateTagInput) => api.patch<Tag>(`/tags/${id}`, data),
  remove: (id: string) => api.delete<null>(`/tags/${id}`),
}
