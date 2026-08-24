import type {
  DimensionState, DimensionOptionState, CurrentOptionState,
  CreateDimensionStateInput, UpdateDimensionStateInput,
  CreateDimensionOptionStateInput, UpdateDimensionOptionStateInput,
} from '@time-manage/shared'
import { api } from './client'

export const dimensionStatesApi = {
  list: (dimensionId: string) => api.get<DimensionState[]>(`/dimension-states?dimensionId=${dimensionId}`),
  create: (data: CreateDimensionStateInput) => api.post<DimensionState>('/dimension-states', data),
  update: (id: string, data: UpdateDimensionStateInput) => api.patch<DimensionState>(`/dimension-states/${id}`, data),
  remove: (id: string) => api.delete<null>(`/dimension-states/${id}`),
  reorder: (orders: { id: string; sortOrder: number }[]) =>
    api.patch<null>('/dimension-states/reorder', { orders }),
}

export const dimensionOptionStatesApi = {
  list: (optionId: string) => api.get<DimensionOptionState[]>(`/dimension-option-states?optionId=${optionId}`),
  create: (data: CreateDimensionOptionStateInput) => api.post<DimensionOptionState>('/dimension-option-states', data),
  update: (id: string, data: UpdateDimensionOptionStateInput) =>
    api.patch<DimensionOptionState>(`/dimension-option-states/${id}`, data),
  remove: (id: string) => api.delete<null>(`/dimension-option-states/${id}`),
  currentByDimension: (dimensionId: string) =>
    api.get<CurrentOptionState[]>(`/dimension-option-states/current?dimensionId=${dimensionId}`),
}
