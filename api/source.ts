import type { IncomingMessage, ServerResponse } from 'http'
import { app } from '../backend/src/index'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  const host = req.headers.host ?? 'localhost'
  const url = `${proto}://${host}${req.url}`

  const request = new Request(url, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  })

  const response = await app.fetch(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const responseBody = await response.arrayBuffer()
  res.end(Buffer.from(responseBody))
}
