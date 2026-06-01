import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { verify } from 'hono/jwt'

export type AuthEnv = {
  Variables: {
    userId: string
  }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verify(token, process.env.JWT_SECRET!, 'HS256')
    if (typeof payload.sub !== 'string') throw new Error('invalid sub')
    c.set('userId', payload.sub)
    await next()
  } catch {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
})
