import type { Goal, Phase, CreateGoalInput, UpdateGoalInput, CreatePhaseInput, UpdatePhaseInput } from '@time-manage/shared'
import { api } from './client'

export interface PhaseWithCount extends Phase {
  taskCount: number
}

export interface GoalWithPhases extends Goal {
  phases: PhaseWithCount[]
}

export const goalsApi = {
  list: (includeArchived = false) =>
    api.get<GoalWithPhases[]>(`/goals${includeArchived ? '?includeArchived=true' : ''}`),
  create: (data: CreateGoalInput) => api.post<GoalWithPhases>('/goals', data),
  update: (id: string, data: UpdateGoalInput) => api.patch<Goal>(`/goals/${id}`, data),
  remove: (id: string) => api.delete<null>(`/goals/${id}`),

  createPhase: (data: CreatePhaseInput) => api.post<Phase>('/phases', data),
  updatePhase: (id: string, data: UpdatePhaseInput) => api.patch<Phase>(`/phases/${id}`, data),
  removePhase: (id: string) => api.delete<null>(`/phases/${id}`),
}
