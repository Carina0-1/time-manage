import type { UserSettings, UpdateSettingsInput } from '@time-manage/shared'
import { api } from './client'

export const settingsApi = {
  get: () => api.get<UserSettings>('/settings'),
  update: (data: UpdateSettingsInput) => api.patch<UserSettings>('/settings', data),
}
