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
  return { status: res.status, timing: res.headers.get('server-timing'), body: await res.json() as any }
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
  const updated = await request('/created-task', 'PATCH', { title: '行内改名', description: '行内备注', startTime: '2026-10-27T08:00:00.000Z', endTime: '2026-10-27T09:00:00.000Z' })
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
  const contents = { title: '只修改文字内容', description: '新的备注' }
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

test('任务状态只允许待办和已完成', async () => {
  const before = (await query({})).body.data.total
  for (const status of ['cancelled', 'in_progress']) {
    assert.equal((await request('', 'POST', { id: `unsupported-${status}`, title: '不支持的状态', status, dimensionValues: { project: 'project-a' } })).status, 400)
    assert.equal((await request('/ui-task', 'PATCH', { status })).status, 400)
    assert.equal((await query({ status })).status, 400)
  }
  assert.equal((await request('/ui-task')).body.data.status, 'todo')
  assert.equal((await query({})).body.data.total, before)
})


test('全天记录属于已排期，兼容相同起止时间和缺少结束时间的历史数据', async () => {
  const legacy = (await request('/all-day')).body.data
  assert.equal(legacy.startTime, legacy.endTime)
  assert.equal((await query({ id: 'all-day', schedule: 'scheduled' })).body.data.total, 1)
  assert.equal((await query({ id: 'all-day', schedule: 'unscheduled' })).body.data.total, 0)
  assert(!(await request('?inbox=true')).body.data.some((t: any) => t.id === 'all-day'))
  const calendar = await request('?start=2026-10-26T16:00:00.000Z&end=2026-10-27T16:00:00.000Z')
  assert(calendar.body.data.some((t: any) => t.id === 'all-day'))
  const { scheduleLabel, durationLabel, toTimeFields, getTaskEndTime } = await import('../../frontend/src/components/tasks/taskForm.js')
  assert.equal(toTimeFields(legacy).startTime, toTimeFields(legacy).endTime)
  assert(scheduleLabel(legacy).includes('全天'))
  assert.equal(durationLabel(legacy), '全天')
  assert(new Date(getTaskEndTime(legacy)!) > new Date(legacy.startTime))
  await fixtures.client.query(`INSERT INTO tasks (id,user_id,title,is_all_day,start_time) VALUES
    ('legacy-all-day-no-end','qa-user','历史全天缺少结束时间',true,'2026-10-28T00:00:00Z'),
    ('legacy-all-day-no-dates','qa-user','历史全天未保存日期',true,null)`)
  for (const id of ['legacy-all-day-no-end', 'legacy-all-day-no-dates']) {
    assert.equal((await query({ id, schedule: 'scheduled' })).body.data.total, 1)
    assert.equal((await query({ id, schedule: 'unscheduled' })).body.data.total, 0)
    const row = (await request(`/${id}`)).body.data
    assert(scheduleLabel(row).includes('全天'))
    assert.equal(durationLabel(row), '全天')
  }
  assert.equal((await query({ id: 'legacy-all-day-no-end', start: '2026-10-28T00:00:00.000Z', end: '2026-10-29T00:00:00.000Z' })).body.data.total, 1)
  const canonical = await request('', 'POST', { id: 'canonical-all-day', title: '保存全天排期', isAllDay: true, startTime: '2026-10-29T00:00:00.000Z', endTime: '2026-10-29T00:00:00.000Z', dimensionValues: { project: 'project-a' } })
  assert.equal(canonical.status, 201)
  assert.equal(canonical.body.data.endTime, '2026-10-30T00:00:00.000Z')
  assert.equal((await query({ id: 'canonical-all-day', schedule: 'unscheduled' })).body.data.total, 0)
  const unplanned = await request('/canonical-all-day', 'PATCH', { isAllDay: false, startTime: null, endTime: null })
  assert.equal(unplanned.status, 200)
  assert.equal((await query({ id: 'canonical-all-day', schedule: 'unscheduled' })).body.data.total, 1)
})


test('重复或并发重试新建使用相同 ID，只产生一个任务且不泄露其他账号', async () => {
  const before = (await query({})).body.data.total
  const input = { id: 'retry-create', title: '重试创建验收', dimensionValues: { project: 'project-a' } }
  const [first, retried] = await Promise.all([request('', 'POST', input), request('', 'POST', input)])
  assert.equal(first.status, 201); assert.equal(retried.status, 201)
  assert.equal((await query({})).body.data.total, before + 1)
  assert.equal(first.body.data.id, retried.body.data.id)
  assert.equal((await request('', 'POST', { ...input, id: 'foreign-task' })).status, 409)
  assert.equal((await request('', 'POST', { ...input, id: 'deleted-task' })).status, 409)
})

test('轻量计数和活动接口保持统计口径及账号隔离，每次只查询一次数据库', async () => {
  const total = await request('/count')
  assert.equal(total.status, 200)
  assert.equal(total.body.data, (await query({})).body.data.total)
  assert.match(total.timing!, /queries;desc="1"/)
  const headers = { Authorization: `Bearer ${token}` }
  const full = await app.request('/api/stats?start=2026-01-01&end=2026-12-31', { headers })
  const fullData = (await full.json() as any).data
  const activity = await app.request('/api/stats/activity?start=2026-01-01&end=2026-12-31', { headers })
  assert.equal(activity.status, 200)
  assert.deepEqual((await activity.json() as any).data, fullData.dailyActivity)
  assert.match(activity.headers.get('server-timing')!, /queries;desc="1"/)
  assert.equal((await app.request('/api/stats/activity?start=invalid&end=2026-12-31', { headers })).status, 400)
})

test('连接池可并发且能单独记录等待时间，请求计时互不混入', async () => {
  const held = await Promise.all(Array.from({ length: pool.options.max! }, () => pool.connect()))
  const pending = request('/count')
  setTimeout(() => held.forEach(client => client.release()), 30)
  const result = await pending
  assert.equal(result.status, 200)
  const wait = Number(result.timing!.match(/pool;dur=([\d.]+)/)![1])
  assert(wait >= 10, result.timing!)
  assert.match(result.timing!, /queries;desc="1"/)
  const reads = await Promise.all([request('/count'), request('/count')])
  for (const item of reads) assert.match(item.timing!, /queries;desc="1"/)
})


test('查询超时后丢弃连接，后续请求可以正常获取新连接', async () => {
  const { Pool } = await import('pg')
  const { observePool } = await import('../src/db/observePool.js')
  const limited = new Pool({ connectionString: fixtures.url, max: 1, query_timeout: 30, connectionTimeoutMillis: 1000 })
  observePool(limited)
  try {
    await assert.rejects(limited.query('SELECT pg_sleep(0.2)'), /Query read timeout/)
    assert.equal((await limited.query('SELECT 1 AS ok')).rows[0].ok, 1)
  } finally { await limited.end() }
})


test('行内快捷新建只填名称，支持补充维度、状态与相同 ID 重试', async () => {
  const before = (await request('/count')).body.data
  assert.equal((await request('/capture', 'POST', { id: 'blank-capture', title: '   ' })).status, 400)
  assert.equal((await request('/capture', 'POST', { id: 'bad-capture', title: '不接受额外信息', dimensionValues: { project: 'foreign-option' } })).status, 400)
  const input = { id: 'captured-task', title: '  先记下一件事  ' }
  const created = await request('/capture', 'POST', input)
  assert.equal(created.status, 201)
  assert.equal(created.body.data.title, '先记下一件事')
  assert.deepEqual(created.body.data.dimensionValues, {})
  assert.equal(created.body.data.startTime, null)
  assert(!('expectedOutput' in created.body.data))
  assert.equal((await request('/count')).body.data, before + 1)
  assert.equal((await request('/capture', 'POST', input)).body.data.id, 'captured-task')
  assert.equal((await request('/count')).body.data, before + 1)
  assert.equal((await request('/captured-task/dimensions/project', 'PATCH', { optionId: 'project-a' })).status, 200)
  assert.equal((await request('/captured-task', 'PATCH', { status: 'done', description: '之后补充备注' })).status, 200)
  assert.equal((await query({ id: 'captured-task', status: 'done' })).body.data.total, 1)
  for (const id of ['foreign-task', 'deleted-task']) assert.equal((await request('/capture', 'POST', { ...input, id })).status, 409)
})
