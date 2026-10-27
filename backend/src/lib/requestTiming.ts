import { AsyncLocalStorage } from 'node:async_hooks'
import { createMiddleware } from 'hono/factory'

export interface RequestTiming { poolWaitMs: number; dbMs: number; queries: number }
export const requestTiming = new AsyncLocalStorage<RequestTiming>()
export const timingMiddleware = createMiddleware(async (c, next) => {
  const timing: RequestTiming = { poolWaitMs: 0, dbMs: 0, queries: 0 }
  const started = performance.now()
  await requestTiming.run(timing, async () => {
    await next()
    const totalMs = performance.now() - started
    c.header('Server-Timing', `app;dur=${totalMs.toFixed(1)}, db;dur=${timing.dbMs.toFixed(1)}, pool;dur=${timing.poolWaitMs.toFixed(1)}, queries;desc="${timing.queries}"`)
    // 只记录分段耗时及路由，不记录 SQL、请求体或用户信息。
    console.info(JSON.stringify({ event: 'request_timing', method: c.req.method, route: c.req.routePath, status: c.res.status,
      totalMs: Math.round(totalMs), dbMs: Math.round(timing.dbMs), poolWaitMs: Math.round(timing.poolWaitMs), queries: timing.queries }))
  })
})
