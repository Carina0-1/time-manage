import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { sign } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { verifyPassword } from '../lib/password.js'
import { LoginSchema } from '@time-manage/shared'

export const authRouter = new Hono()

authRouter.post('/login', zValidator('json', LoginSchema), async (c) => {
  const { username, password } = c.req.valid('json')

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    throw new HTTPException(401, { message: 'Invalid credentials' })
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 // 30天
  const token = await sign({ sub: user.id, username: user.username, exp }, process.env.JWT_SECRET!, 'HS256')

  return c.json({
    data: {
      token,
      user: { id: user.id, username: user.username, name: user.name },
    },
  })
})
