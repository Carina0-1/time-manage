import { create } from 'zustand'
import type { Goal, Phase } from '@time-manage/shared'
import type { GoalWithPhases, PhaseWithCount } from '@/api/goals'

export type { GoalWithPhases, PhaseWithCount }

interface GoalStore {
  goals: GoalWithPhases[]
  loading: boolean
  fetchGoals: () => Promise<void>
  addGoal: (goal: GoalWithPhases) => void
  updateGoal: (id: string, data: Partial<Goal>) => void
  removeGoal: (id: string) => void
  addPhase: (goalId: string, phase: PhaseWithCount) => void
  updatePhase: (goalId: string, phaseId: string, data: Partial<Phase>) => void
  removePhase: (goalId: string, phaseId: string) => void
  adjustPhaseTaskCount: (phaseId: string, delta: number) => void
}

import { goalsApi } from '@/api/goals'

export const useGoalStore = create<GoalStore>((set) => ({
  goals: [],
  loading: false,

  fetchGoals: async () => {
    set({ loading: true })
    try {
      const data = await goalsApi.list(true)  // 始终拉取含 archived，渲染层过滤
      set({ goals: data })
    } finally {
      set({ loading: false })
    }
  },

  addGoal: (goal) => set((s) => ({ goals: [...s.goals, goal] })),

  updateGoal: (id, data) =>
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...data } : g)),
    })),

  removeGoal: (id) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

  addPhase: (goalId, phase) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId ? { ...g, phases: [...g.phases, phase] } : g
      ),
    })),

  updatePhase: (goalId, phaseId, data) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              phases: g.phases.map((p) => (p.id === phaseId ? { ...p, ...data } : p)),
            }
          : g
      ),
    })),

  removePhase: (goalId, phaseId) =>
    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? { ...g, phases: g.phases.filter((p) => p.id !== phaseId) }
          : g
      ),
    })),

  adjustPhaseTaskCount: (phaseId, delta) =>
    set((s) => ({
      goals: s.goals.map((g) => ({
        ...g,
        phases: g.phases.map((p) =>
          p.id === phaseId ? { ...p, taskCount: Math.max(0, p.taskCount + delta) } : p
        ),
      })),
    })),
}))
