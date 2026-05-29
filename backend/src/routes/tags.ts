import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { tags } from '../db/schema.js'
import { CreateTagSchema, UpdateTagSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const tagsRouter = new Hono<AuthEnv>()

// GET /tags
tagsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), isNull(tags.deletedAt)))
  return c.json({ data: rows })
})

// POST /tags
tagsRouter.post('/', zValidator('json', CreateTagSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [tag] = await db.insert(tags).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: tag }, 201)
})

// PATCH /tags/:id
tagsRouter.patch('/:id', zValidator('json', UpdateTagSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [tag] = await db
    .update(tags)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()

  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: tag })
})

// DELETE /tags/:id  (软删除)
tagsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [tag] = await db
    .update(tags)
    .set({ deletedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning()

  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: null }, 200)
})
