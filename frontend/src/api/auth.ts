import type { LoginResponse } from '@time-manage/shared'

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '登录失败')
    return json.data as LoginResponse
  },
}
