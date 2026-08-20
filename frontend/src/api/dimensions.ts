import type {
  Dimension, DimensionOption,
  CreateDimensionInput, UpdateDimensionInput,
  CreateDimensionOptionInput, UpdateDimensionOptionInput,
} from '@time-manage/shared'
import { api } from './client'

export const dimensionsApi = {
  list: () => api.get<Dimension[]>('/dimensions'),
  create: (data: CreateDimensionInput) => api.post<Dimension>('/dimensions', data),
  update: (id: string, data: UpdateDimensionInput) => api.patch<Dimension>(`/dimensions/${id}`, data),
  remove: (id: string) => api.delete<null>(`/dimensions/${id}`),
  reorder: (orders: { id: string; sortOrder: number }[]) =>
    api.patch<null>('/dimensions/reorder', { orders }),
  setColorSource: (id: string) => api.patch<null>(`/dimensions/${id}/set-color-source`, {}),

  listOptions: (dimensionId: string) =>
    api.get<DimensionOption[]>(`/dimension-options?dimensionId=${dimensionId}`),
  createOption: (data: CreateDimensionOptionInput) =>
    api.post<DimensionOption>('/dimension-options', data),
  updateOption: (id: string, data: UpdateDimensionOptionInput) =>
    api.patch<DimensionOption>(`/dimension-options/${id}`, data),
  removeOption: (id: string) => api.delete<null>(`/dimension-options/${id}`),
  reorderOptions: (orders: { id: string; sortOrder: number }[]) =>
    api.patch<null>('/dimension-options/reorder', { orders }),
}
