import type { StatsResult } from '@time-manage/shared'
import { api } from './client'

export const statsApi = {
  get: (start: string, end: string) =>
    api.get<StatsResult>(`/stats?start=${start}&end=${end}`),
}
