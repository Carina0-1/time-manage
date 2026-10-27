import type { StatsResult, DailyActivity } from '@time-manage/shared'
import { api } from './client'

export const statsApi = {
  activity: (start: string, end: string, signal?: AbortSignal) => api.get<DailyActivity[]>(`/stats/activity?start=${start}&end=${end}`, signal),
  get: (start: string, end: string) =>
    api.get<StatsResult>(`/stats?start=${start}&end=${end}`),
}
