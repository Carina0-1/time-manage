import { serve } from '@hono/node-server'
import { createTaskFixtures } from './fixtures.js'
const fixtures = await createTaskFixtures()
process.env.DATABASE_URL = fixtures.url
process.env.NODE_ENV = 'production'
process.env.JWT_SECRET = 'local-task-list-ui-qa'
const { app } = await import('../src/index.js')
const { pool } = await import('../src/db/index.js')
const server = serve({ fetch: app.fetch, port: 3011, hostname: '127.0.0.1' })
console.log('Task list QA API: http://127.0.0.1:3011 · task-list-qa / TaskListQA123!')
const cleanup = () => server.close(async () => { await pool.end(); await fixtures.cleanup(); process.exit() })
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
