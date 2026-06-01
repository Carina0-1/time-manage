import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

// TODO: Phase 5 接入 better-auth，替换为真实 JWT 验证
// 开发阶段使用固定 userId，方便本地调试
const DEV_USER_ID = 'dev-user-1'

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

  // 单用户模式：token 为 "dev" 时直接放行
  if (token === 'dev') {
    c.set('userId', DEV_USER_ID)
    await next()
    return
  }

  throw new HTTPException(401, { message: 'Unauthorized' })
})
