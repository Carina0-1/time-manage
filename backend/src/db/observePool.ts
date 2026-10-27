import type { Pool, PoolClient } from 'pg'
import { requestTiming } from '../lib/requestTiming.js'

export function observePool(pool: Pool) {
  const connect = pool.connect.bind(pool)
  pool.connect = ((callback?: (error: Error | undefined, client: PoolClient | undefined, release: (error?: Error | boolean) => void) => void) => {
    const trace = requestTiming.getStore(), started = performance.now()
    const done = () => { if (trace) trace.poolWaitMs += performance.now() - started }
    if (callback) return connect((error, client, release) => { done(); if (trace) requestTiming.run(trace, () => callback(error, client, release)); else callback(error, client, release) })
    return connect().then(client => { done(); return client }, error => { done(); throw error })
  }) as typeof pool.connect
  pool.on('connect', client => {
    // 保持 pg 的 Promise、callback 两种调用方式，事务也会使用同一个计时上下文。
    const query = client.query.bind(client) as (...args: any[]) => any
    client.query = ((...args: any[]) => {
      const trace = requestTiming.getStore(), started = performance.now()
      let recorded = false
      const done = (error?: unknown) => {
        if (trace && !recorded) { recorded = true; trace.dbMs += performance.now() - started; trace.queries++ }
        // 事务池可能忽略服务端超时参数；超时连接直接关闭，不能继续复用仍在执行查询的连接。
        if (error instanceof Error && error.message === 'Query read timeout') void (client as PoolClient & { end: () => Promise<void> }).end().catch(() => {})
      }
      const last = args.length - 1
      if (typeof args[last] === 'function') {
        const callback = args[last]
        args[last] = (...result: any[]) => { done(result[0]); callback(...result) }
      }
      try {
        const result = query(...args)
        if (result?.then) return result.then((value: unknown) => { done(); return value }, (error: unknown) => { done(error); throw error })
        return result
      } catch (error) { done(error); throw error }
    }) as typeof client.query
  })
}
