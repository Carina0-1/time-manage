import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import { roles, tasks } from '../db/schema.js'
import { CreateRoleSchema, UpdateRoleSchema } from '@time-manage/shared'
import type { AuthEnv } from '../middleware/auth.js'

export const rolesRouter = new Hono<AuthEnv>()

const DEFAULT_ROLES = [
  { name: '主导', color: '#6366f1' },
  { name: '参与方', color: '#22c55e' },
  { name: '独立', color: '#f59e0b' },
]

// GET /roles
rolesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  let rows = await db
    .select()
    .from(roles)
    .where(and(eq(roles.userId, userId), isNull(roles.deletedAt)))
    .orderBy(roles.sortOrder)

  if (rows.length === 0) {
    const now = new Date()
    await db.insert(roles).values(
      DEFAULT_ROLES.map((r, i) => ({
        id: nanoid(),
        userId,
        name: r.name,
        color: r.color,
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      }))
    )
    rows = await db
      .select()
      .from(roles)
      .where(and(eq(roles.userId, userId), isNull(roles.deletedAt)))
      .orderBy(roles.sortOrder)
  }

  return c.json({ data: rows })
})

// POST /roles
rolesRouter.post('/', zValidator('json', CreateRoleSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const now = new Date()

  const [role] = await db.insert(roles).values({
    ...body,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning()

  return c.json({ data: role }, 201)
})

// PATCH /roles/:id
rolesRouter.patch('/:id', zValidator('json', UpdateRoleSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const [role] = await db
    .update(roles)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(roles.id, id), eq(roles.userId, userId)))
    .returning()

  if (!role) return c.json({ error: 'Not found' }, 404)
  return c.json({ data: role })
})

// POST /roles/reorder — 批量更新 sortOrder
const ReorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})
rolesRouter.post('/reorder', zValidator('json', ReorderSchema), async (c) => {
  const userId = c.get('userId')
  const { orders } = c.req.valid('json')
  await Promise.all(
    orders.map(({ id, sortOrder }) =>
      db.update(roles)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(roles.id, id), eq(roles.userId, userId)))
    )
  )
  return c.json({ data: null })
})

// DELETE /roles/:id  (软删除)
rolesRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [role] = await db
    .update(roles)
    .set({ deletedAt: new Date() })
    .where(and(eq(roles.id, id), eq(roles.userId, userId)))
    .returning()

  if (!role) return c.json({ error: 'Not found' }, 404)

  // 清空关联任务的角色引用（软删除不会触发数据库外键的 onDelete: set null）
  await db
    .update(tasks)
    .set({ roleId: null, updatedAt: new Date() })
    .where(and(eq(tasks.roleId, id), eq(tasks.userId, userId)))

  return c.json({ data: null }, 200)
})
