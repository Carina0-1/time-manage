import { useAuthStore } from '@/stores/authStore'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class RequestTimeoutError extends Error {
  constructor() { super('请求超时，暂时无法确认保存结果，请重试') }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token
  const controller = new AbortController()
  const cancel = () => controller.abort(init?.signal?.reason)
  if (init?.signal?.aborted) cancel()
  else init?.signal?.addEventListener('abort', cancel, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 20000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
    if (res.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new ApiError(res.status >= 500 ? '服务暂时不可用，修改未保存，请重试' : typeof err.error === 'string' ? err.error : '输入内容无效，请检查后重试', res.status)
    }
    const json = await res.json()
    return json.data as T
  } catch (error) {
    if (timedOut && !init?.signal?.aborted) throw new RequestTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
    init?.signal?.removeEventListener('abort', cancel)
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
