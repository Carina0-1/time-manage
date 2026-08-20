import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { writeFileSync, mkdirSync } from 'node:fs'
import * as schema from '../src/db/schema.js'
import 'dotenv/config'

const { dimensions, dimensionOptions, taskDimensionValues } = schema

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

const DEFAULT_COLOR = '#6366f1'

function depthOf(name: string) {
  return name.split('/').length
}

// 旧表已在最终 schema.ts 中移除定义，改用原生 SQL 读取，避免依赖已废弃的 Drizzle 表定义
interface RawUser { id: string; username: string }
interface RawGoal { id: string; user_id: string; name: string; color: string; icon: string | null; sort_order: number; background: string | null; success_criteria: string | null; deleted_at: Date | null }
interface RawPhase { id: string; goal_id: string; user_id: string; name: string; sort_order: number; reason: string | null; current_state: string | null; completion_criteria: string | null; deleted_at: Date | null }
interface RawTag { id: string; user_id: string; name: string; color: string; icon: string | null; sort_order: number; deleted_at: Date | null }
interface RawRole { id: string; user_id: string; name: string; color: string; icon: string | null; sort_order: number; deleted_at: Date | null }
interface RawTask { id: string; user_id: string; goal_id: string | null; phase_id: string | null; role_id: string | null }
interface RawTaskTag { task_id: string; tag_id: string }

async function main() {
  console.log('=== 元数据维度迁移脚本 ===')

  // 幂等：清空三张新表（按依赖顺序）
  await db.delete(taskDimensionValues)
  await db.delete(dimensionOptions)
  await db.delete(dimensions)
  console.log('已清空 dimensions / dimension_options / task_dimension_values（幂等重跑准备）')

  const allUsers = (await pool.query<RawUser>('SELECT id, username FROM users')).rows

  const summary = {
    goals: 0, goalsDeleted: 0,
    phases: 0, phasesDeleted: 0,
    tags: 0, tagsDeleted: 0, tagVirtualNodes: 0,
    roles: 0, rolesDeleted: 0,
    tasksTotal: 0,
    taskGoalDimValues: 0,
    taskRoleDimValues: 0,
    taskTagDimValues: 0,
    taskTagsRowsTotal: 0,
  }

  const backupPayload: {
    exportedAt: string
    goals: { id: string; userId: string; name: string; background: string | null; successCriteria: string | null }[]
    phases: { id: string; goalId: string; userId: string; name: string; reason: string | null; currentState: string | null; completionCriteria: string | null }[]
  } = { exportedAt: new Date().toISOString(), goals: [], phases: [] }

  for (const user of allUsers) {
    console.log(`\n--- 用户 ${user.id} (${user.username}) ---`)

    // ---------- 读取旧表数据（原生 SQL） ----------
    const userGoals = (await pool.query<RawGoal>(
      'SELECT id, user_id, name, color, icon, sort_order, background, success_criteria, deleted_at FROM goals WHERE user_id = $1',
      [user.id]
    )).rows
    const userPhases = (await pool.query<RawPhase>(
      'SELECT id, goal_id, user_id, name, sort_order, reason, current_state, completion_criteria, deleted_at FROM phases WHERE user_id = $1',
      [user.id]
    )).rows
    const userTags = (await pool.query<RawTag>(
      'SELECT id, user_id, name, color, icon, sort_order, deleted_at FROM tags WHERE user_id = $1',
      [user.id]
    )).rows
    const userRoles = (await pool.query<RawRole>(
      'SELECT id, user_id, name, color, icon, sort_order, deleted_at FROM roles WHERE user_id = $1',
      [user.id]
    )).rows
    const userTasks = (await pool.query<RawTask>(
      'SELECT id, user_id, goal_id, phase_id, role_id FROM tasks WHERE user_id = $1',
      [user.id]
    )).rows

    // ---------- 备份废弃字段 ----------
    for (const g of userGoals) {
      backupPayload.goals.push({
        id: g.id, userId: g.user_id, name: g.name,
        background: g.background, successCriteria: g.success_criteria,
      })
    }
    for (const p of userPhases) {
      backupPayload.phases.push({
        id: p.id, goalId: p.goal_id, userId: p.user_id, name: p.name,
        reason: p.reason, currentState: p.current_state, completionCriteria: p.completion_criteria,
      })
    }

    // ---------- "目标"维度（tree）----------
    const goalDimensionId = nanoid()
    await db.insert(dimensions).values({
      id: goalDimensionId, userId: user.id, name: '目标', type: 'tree',
      isRequired: false, isColorSource: true, showInSidebar: true, sortOrder: 0,
    })

    const goalIdToOptionId = new Map<string, string>()
    const phaseIdToOptionId = new Map<string, string>()

    const sortedGoals = [...userGoals].sort((a, b) => a.sort_order - b.sort_order)
    for (const g of sortedGoals) {
      const optionId = nanoid()
      await db.insert(dimensionOptions).values({
        id: optionId, dimensionId: goalDimensionId, userId: user.id, parentId: null,
        name: g.name, color: g.color, icon: g.icon, sortOrder: g.sort_order,
        deletedAt: g.deleted_at,
      })
      goalIdToOptionId.set(g.id, optionId)
      summary.goals++
      if (g.deleted_at) summary.goalsDeleted++

      const childPhases = userPhases.filter((p) => p.goal_id === g.id).sort((a, b) => a.sort_order - b.sort_order)
      for (const p of childPhases) {
        const childOptionId = nanoid()
        await db.insert(dimensionOptions).values({
          id: childOptionId, dimensionId: goalDimensionId, userId: user.id, parentId: optionId,
          name: p.name, color: g.color, icon: null, sortOrder: p.sort_order,
          deletedAt: p.deleted_at,
        })
        phaseIdToOptionId.set(p.id, childOptionId)
        summary.phases++
        if (p.deleted_at) summary.phasesDeleted++
      }
    }

    // ---------- "标签"维度（tree，路径字符串转真树）----------
    const tagDimensionId = nanoid()
    await db.insert(dimensions).values({
      id: tagDimensionId, userId: user.id, name: '标签', type: 'tree',
      isRequired: false, isColorSource: false, showInSidebar: true, sortOrder: 1,
    })

    const activeTags = userTags.filter((t) => !t.deleted_at).sort((a, b) => depthOf(a.name) - depthOf(b.name) || a.sort_order - b.sort_order)
    const deletedTagsList = userTags.filter((t) => t.deleted_at)

    const pathToOptionId = new Map<string, string>()
    const tagIdToOptionId = new Map<string, string>()

    function findAncestorColor(path: string): string {
      const match = activeTags.find((t) => t.name === path || t.name.startsWith(path + '/'))
      return match?.color ?? DEFAULT_COLOR
    }

    for (const tag of activeTags) {
      const parts = tag.name.split('/')
      for (let i = 0; i < parts.length; i++) {
        const fullPath = parts.slice(0, i + 1).join('/')
        if (pathToOptionId.has(fullPath)) continue

        const parentPath = i === 0 ? null : parts.slice(0, i).join('/')
        const parentOptionId = parentPath ? pathToOptionId.get(parentPath) ?? null : null

        const matchingTag = activeTags.find((t) => t.name === fullPath)
        const optionId = nanoid()
        await db.insert(dimensionOptions).values({
          id: optionId, dimensionId: tagDimensionId, userId: user.id, parentId: parentOptionId,
          name: parts[i],
          color: matchingTag ? matchingTag.color : findAncestorColor(fullPath),
          icon: matchingTag?.icon ?? null,
          sortOrder: matchingTag?.sort_order ?? 0,
          deletedAt: null,
        })
        pathToOptionId.set(fullPath, optionId)
        if (matchingTag) {
          tagIdToOptionId.set(matchingTag.id, optionId)
          summary.tags++
        } else {
          summary.tagVirtualNodes++
        }
      }
    }

    for (const tag of deletedTagsList) {
      const parts = tag.name.split('/')
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null
      const parentOptionId = parentPath ? pathToOptionId.get(parentPath) ?? null : null
      const optionId = nanoid()
      await db.insert(dimensionOptions).values({
        id: optionId, dimensionId: tagDimensionId, userId: user.id, parentId: parentOptionId,
        name: parts[parts.length - 1], color: tag.color, icon: tag.icon, sortOrder: tag.sort_order,
        deletedAt: tag.deleted_at,
      })
      tagIdToOptionId.set(tag.id, optionId)
      summary.tags++
      summary.tagsDeleted++
    }

    // ---------- "角色"维度（single）----------
    const roleDimensionId = nanoid()
    await db.insert(dimensions).values({
      id: roleDimensionId, userId: user.id, name: '角色', type: 'single',
      isRequired: false, isColorSource: false, showInSidebar: true, sortOrder: 2,
    })

    const roleIdToOptionId = new Map<string, string>()
    for (const r of [...userRoles].sort((a, b) => a.sort_order - b.sort_order)) {
      const optionId = nanoid()
      await db.insert(dimensionOptions).values({
        id: optionId, dimensionId: roleDimensionId, userId: user.id, parentId: null,
        name: r.name, color: r.color, icon: r.icon, sortOrder: r.sort_order,
        deletedAt: r.deleted_at,
      })
      roleIdToOptionId.set(r.id, optionId)
      summary.roles++
      if (r.deleted_at) summary.rolesDeleted++
    }

    // ---------- 任务关联迁移 ----------
    summary.tasksTotal += userTasks.length

    for (const task of userTasks) {
      let goalOptionId: string | null = null
      if (task.phase_id) goalOptionId = phaseIdToOptionId.get(task.phase_id) ?? null
      else if (task.goal_id) goalOptionId = goalIdToOptionId.get(task.goal_id) ?? null

      if (goalOptionId) {
        await db.insert(taskDimensionValues).values({
          id: nanoid(), taskId: task.id, dimensionId: goalDimensionId, optionId: goalOptionId,
        })
        summary.taskGoalDimValues++
      }

      if (task.role_id) {
        const roleOptionId = roleIdToOptionId.get(task.role_id)
        if (roleOptionId) {
          await db.insert(taskDimensionValues).values({
            id: nanoid(), taskId: task.id, dimensionId: roleDimensionId, optionId: roleOptionId,
          })
          summary.taskRoleDimValues++
        }
      }

      const taskTagRows = (await pool.query<RawTaskTag>(
        'SELECT task_id, tag_id FROM task_tags WHERE task_id = $1',
        [task.id]
      )).rows
      summary.taskTagsRowsTotal += taskTagRows.length
      if (taskTagRows.length > 0) {
        const tagOptionId = tagIdToOptionId.get(taskTagRows[0].tag_id)
        if (tagOptionId) {
          await db.insert(taskDimensionValues).values({
            id: nanoid(), taskId: task.id, dimensionId: tagDimensionId, optionId: tagOptionId,
          })
          summary.taskTagDimValues++
        }
      }
    }
  }

  // ---------- 写入备份文件 ----------
  mkdirSync(new URL('./backup/', import.meta.url), { recursive: true })
  const backupPath = new URL(`./backup/deprecated-fields-${Date.now()}.json`, import.meta.url)
  writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2))

  console.log('\n=== 迁移统计对比 ===')
  console.log(`goals: ${summary.goals} 条 (含软删 ${summary.goalsDeleted})  →  目标维度根节点应为 ${summary.goals}`)
  console.log(`phases: ${summary.phases} 条 (含软删 ${summary.phasesDeleted})  →  目标维度子节点应为 ${summary.phases}`)
  console.log(`tags: ${summary.tags} 条 (含软删 ${summary.tagsDeleted})，虚拟中间节点新增 ${summary.tagVirtualNodes} 条`)
  console.log(`roles: ${summary.roles} 条 (含软删 ${summary.rolesDeleted})  →  角色维度节点应为 ${summary.roles}`)
  console.log(`tasks 总数: ${summary.tasksTotal}`)
  console.log(`tasks.goalId/phaseId 关联迁移: ${summary.taskGoalDimValues} 行`)
  console.log(`tasks.roleId 关联迁移: ${summary.taskRoleDimValues} 行`)
  console.log(`task_tags 原始总行数: ${summary.taskTagsRowsTotal}，迁移为标签维度取值: ${summary.taskTagDimValues} 行（每任务只取第一条）`)
  console.log(`\n废弃字段备份已写入: ${backupPath.pathname}`)
  console.log('\n=== 迁移完成 ===')

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
