import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { sign } from 'hono/jwt'
import { createTaskFixtures } from './fixtures.js'

const fixtures = await createTaskFixtures()
process.env.DATABASE_URL = fixtures.url
process.env.NODE_ENV = 'production'
process.env.JWT_SECRET = 'local-task-list-integration-test'
const { app } = await import('../src/index.js')
const { pool } = await import('../src/db/index.js')
const token = await sign({ sub: 'qa-user', exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.JWT_SECRET)
after(async () => { await pool.end(); await fixtures.cleanup() })

async function request(path: string, method = 'GET', body?: unknown) {
  const res = await app.request(`/api/tasks${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: await res.json() as any }
}
const query = (params: Record<string, string>) => request(`/list?${new URLSearchParams(params)}`)

test('列表分页、跨页搜索及日历旧接口兼容', async () => {
  const first = await query({})
  assert.equal(first.status, 200)
  assert.equal(first.body.data.total, 72)
  assert.equal(first.body.data.items.length, 50)
  const second = await query({ page: '2' })
  const all = [...first.body.data.items, ...second.body.data.items]
  assert.equal(new Set(all.map((t: any) => t.id)).size, 72)
  assert(!all.some((t: any) => ['foreign-task', 'deleted-task'].includes(t.id)))
  const search = await query({ q: '整理任务 001' })
  assert.equal(search.body.data.items[0].id, 'task-001')
  const notes = await query({ q: 'mixed case' })
  assert.equal(notes.body.data.items[0].id, 'literal')
  const output = await query({ q: '跨页查找唯一产出' })
  assert.equal(output.body.data.total, 1)
  for (const q of ['100%', '_\\']) {
    const literal = await query({ q })
    assert.equal(literal.body.data.total, 1)
    assert.equal(literal.body.data.items[0].id, 'literal')
  }
  assert(Array.isArray((await request('?all=true')).body.data))
  assert.equal((await query({ pageSize: '999' })).status, 400)
})

test('维度父节点、未设置、跨维度交集和排期日期边界', async () => {
  const tree = await query({ 'filter[tag]': 'work' })
  assert.deepEqual(new Set(tree.body.data.items.map((t: any) => t.id)), new Set(['ui-task', 'scheduled']))
  const unset = await query({ 'filter[project]': '__unset__' })
  assert.deepEqual(unset.body.data.items.map((t: any) => t.id), ['legacy'])
  const combined = await query({ 'filter[tag]': 'work', 'filter[context]': 'home' })
  assert.equal(combined.body.data.items[0].id, 'ui-task')
  assert.equal(combined.body.data.total, 1)
  const date = await query({ start: '2026-10-26T16:00:00.000Z', end: '2026-10-27T16:00:00.000Z' })
  assert.deepEqual(new Set(date.body.data.items.map((t: any) => t.id)), new Set(['scheduled', 'all-day']))
  assert.equal((await query({ schedule: 'unscheduled' })).body.data.total, 69)
  assert.equal((await query({ status: 'unfinished' })).body.data.total, 71)
  assert.equal((await query({ 'filter[foreign]': 'foreign-option' })).status, 400)
  assert.equal((await query({ 'filter[tag]': 'nonexistent' })).status, 400)
  assert.equal((await query({ schedule: 'unscheduled', start: '2026-10-27T00:00:00.000Z' })).status, 400)
})

test('按 ID 查询隔离账号和已删除任务', async () => {
  assert.equal((await request('/ui-task')).status, 200)
  assert.equal((await request('/foreign-task')).status, 404)
  assert.equal((await request('/deleted-task')).status, 404)
  assert.equal((await request('/foreign-task', 'PATCH', { title: '不应修改' })).status, 404)
  assert.equal((await request('/foreign-task', 'DELETE')).status, 404)
})

test('新建校验、维度归属与事务完整性', async () => {
  const countBefore = (await query({})).body.data.total
  for (const body of [
    { id: 'bad-title', title: '   ', dimensionValues: { project: 'project-a' } },
    { id: 'missing-required', title: '缺少必填' },
    { id: 'foreign-option-create', title: '错误选项', dimensionValues: { project: 'foreign-option' } },
    { id: 'bad-time', title: '错误排期', dimensionValues: { project: 'project-a' }, startTime: '2026-10-27T00:00:00.000Z' },
  ]) assert.equal((await request('', 'POST', body)).status, 400)
  assert.equal((await query({})).body.data.total, countBefore)
  const valid = await request('', 'POST', { id: 'created-task', title: '  新建任务  ', dimensionValues: { project: 'project-a', context: 'home' } })
  assert.equal(valid.status, 201)
  assert.equal(valid.body.data.title, '新建任务')
  assert.equal(valid.body.data.startTime, null)
})

test('行内编辑、排期清空与完整维度更新失败回滚', async () => {
  const updated = await request('/created-task', 'PATCH', { title: '行内改名', description: '行内备注', expectedOutput: '验证产出', startTime: '2026-10-27T08:00:00.000Z', endTime: '2026-10-27T09:00:00.000Z' })
  assert.equal(updated.status, 200)
  const bad = await request('/created-task', 'PATCH', { title: '不应保存', dimensionValues: { project: 'foreign-option' } })
  assert.equal(bad.status, 400)
  assert.equal((await request('/created-task')).body.data.title, '行内改名')
  const databaseFailure = await request('/created-task', 'PATCH', { title: '模拟保存失败', description: '不应写入' })
  assert.equal(databaseFailure.status, 500)
  const retained = (await request('/created-task')).body.data
  assert.equal(retained.title, '行内改名')
  assert.equal(retained.description, '行内备注')
  assert.equal((await request('/created-task', 'PATCH', { startTime: null })).status, 400)
  const cleared = await request('/created-task', 'PATCH', { startTime: null, endTime: null })
  assert.equal(cleared.status, 200)
  assert.equal(cleared.body.data.startTime, null)
  assert.equal(cleared.body.data.endTime, null)
  assert.equal(cleared.body.data.dimensionValues.context, 'home')
})

test('单维度增量打标保留其他取值，兼容历史任务并防止越权', async () => {
  const [tag, context] = await Promise.all([
    request('/created-task/dimensions/tag', 'PATCH', { optionId: 'product' }),
    request('/created-task/dimensions/context', 'PATCH', { optionId: 'office' }),
  ])
  assert.equal(tag.status, 200)
  assert.equal(context.status, 200)
  assert.deepEqual((await request('/created-task')).body.data.dimensionValues, { project: 'project-a', context: 'office', tag: 'product' })
  assert.equal((await request('/created-task/dimensions/project', 'PATCH', { optionId: null })).status, 400)
  assert.equal((await request('/created-task/dimensions/context', 'PATCH', { optionId: 'foreign-option' })).status, 400)
  assert.equal((await request('/foreign-task/dimensions/tag', 'PATCH', { optionId: 'product' })).status, 404)
  assert.equal((await request('/legacy/dimensions/tag', 'PATCH', { optionId: 'product' })).status, 200)
  const cleared = await request('/created-task/dimensions/tag', 'PATCH', { optionId: null })
  assert.equal(cleared.status, 200)
  assert(!('tag' in cleared.body.data.dimensionValues))
})

test('删除、状态过滤和最后一页回退', async () => {
  await request('/created-task', 'PATCH', { status: 'done' })
  assert.equal((await query({ id: 'created-task', status: 'done' })).body.data.total, 1)
  assert.equal((await request('/created-task', 'DELETE')).status, 200)
  assert.equal((await request('/created-task')).status, 404)
  assert.equal((await request('/created-task', 'PATCH', { title: '不能复活' })).status, 404)
  assert.equal((await query({ id: 'created-task' })).body.data.total, 0)
  assert.equal((await query({ page: '9999' })).body.data.page, 2)
  assert.equal((await query({ schedule: 'scheduled', sort: 'start_asc' })).body.data.items[0].id, 'boundary')
})


test('按字段修改内容、排期和状态，其他字段保持不变', async () => {
  const before = (await request('/scheduled')).body.data
  const contents = { title: '只修改文字内容', description: '新的备注', expectedOutput: '新的预期产出' }
  const contentResult = await request('/scheduled', 'PATCH', contents)
  assert.equal(contentResult.status, 200)
  for (const key of ['startTime', 'endTime', 'isAllDay', 'status', 'priority', 'dimensionValues']) {
    assert.deepEqual(contentResult.body.data[key], before[key], key)
  }
  const schedule = { startTime: '2026-10-28T08:00:00.000Z', endTime: '2026-10-28T09:30:00.000Z', isAllDay: false }
  const scheduled = await request('/scheduled', 'PATCH', schedule)
  assert.equal(scheduled.status, 200)
  for (const [key, value] of Object.entries(contents)) assert.equal(scheduled.body.data[key], value)
  assert.deepEqual(scheduled.body.data.dimensionValues, before.dimensionValues)
  assert.equal(scheduled.body.data.status, before.status)
  const statusResult = await request('/scheduled', 'PATCH', { status: 'done' })
  for (const [key, value] of Object.entries(schedule)) assert.equal(statusResult.body.data[key], value)
  for (const [key, value] of Object.entries(contents)) assert.equal(statusResult.body.data[key], value)
  // 历史缺少必填维度的任务也可以仅修改文字，不需要补齐不相关字段。
  assert.equal((await request('/legacy', 'PATCH', { description: '仅补充历史任务备注' })).status, 200)
})

test('取消状态不进入新增、编辑或筛选接口', async () => {
  const before = (await query({})).body.data.total
  assert.equal((await request('', 'POST', { id: 'cancelled-input', title: '不支持取消', status: 'cancelled', dimensionValues: { project: 'project-a' } })).status, 400)
  assert.equal((await request('/ui-task', 'PATCH', { status: 'cancelled' })).status, 400)
  assert.equal((await query({ status: 'cancelled' })).status, 400)
  assert.equal((await request('/ui-task')).body.data.status, 'todo')
  assert.equal((await query({})).body.data.total, before)
})
