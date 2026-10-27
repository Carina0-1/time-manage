import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { attachDatabasePool } from '@vercel/functions'
import { observePool } from './observePool.js'
import * as schema from './schema.js'

const configuredMax = Number(process.env.DB_POOL_MAX ?? 4)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 8 ? configuredMax : 4,
  min: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
  query_timeout: 12000,
})
observePool(pool)
if (process.env.VERCEL) attachDatabasePool(pool)
pool.on('error', error => console.error(JSON.stringify({ event: 'db_idle_error', code: (error as NodeJS.ErrnoException).code })))

export const db = drizzle(pool, { schema })
export type DB = typeof db
