import { createAdaptorServer } from '@hono/node-server'
import { app } from '../backend/src/index'
import type { IncomingMessage, ServerResponse } from 'node:http'

const server = createAdaptorServer(app)

export default function handler(req: IncomingMessage, res: ServerResponse) {
  server.emit('request', req, res)
}
