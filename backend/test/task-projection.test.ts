import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Task, TaskListResult, DimensionOption } from '@time-manage/shared'
import { taskChangeImpact } from '../../frontend/src/stores/taskImpact.js'
import { matchesTask, projectTaskList } from '../../frontend/src/components/tasks/taskListProjection.js'
const task: Task = { id: 'one', userId: 'user', title: '原名称', status: 'todo', priority: 'medium', isAllDay: false, dimensionValues: { tag: 'child' }, createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z' }
const options = { tag: [{ id: 'root' }, { id: 'child', parentId: 'root' }] as DimensionOption[] }
const result: TaskListResult = { items: [task], total: 1, page: 1, pageSize: 50 }

test('文字修改不刷新统计，状态和维度不刷新活动，排期才更新活动', () => {
  assert.deepEqual(taskChangeImpact(task, { ...task, title: '新名称', description: '备注', expectedOutput: '产出' }), { activity: false, stats: false })
  assert.deepEqual(taskChangeImpact(task, { ...task, status: 'done' }), { activity: false, stats: true })
  assert.deepEqual(taskChangeImpact(task, { ...task, dimensionValues: {} }), { activity: false, stats: true })
  assert.deepEqual(taskChangeImpact(task, { ...task, startTime: '2026-10-27T08:00:00Z', endTime: '2026-10-27T09:00:00Z' }), { activity: true, stats: true })
})

test('新建返回后可直接展示，排序和分页保持正确，不等待列表请求', () => {
  const created = { ...task, id: 'new', title: '新任务', createdAt: '2026-10-27T01:00:00.000Z' }
  const next = projectTaskList(result, { type: 'create', id: 'new', task: created }, { sort: 'created_desc' }, options)
  assert.deepEqual(next.items.map(t => t.id), ['new', 'one'])
  assert.equal(next.total, 2)
  const firstPage = projectTaskList({ ...result, pageSize: 1 }, { type: 'create', id: 'new', task: created }, { sort: 'created_asc' }, options)
  assert.deepEqual(firstPage.items.map(t => t.id), ['one'])
  assert.equal(firstPage.total, 2)
  const notMatching = projectTaskList(result, { type: 'create', id: 'new', task: created }, { q: '原名称' }, options)
  assert.equal(notMatching.total, 1)
})

test('完成或清除标签后立即更新筛选结果，编辑中的任务保留上下文', () => {
  const saved = { ...task, status: 'done' as const }
  const mutation = { type: 'update' as const, id: task.id, previous: task, task: saved }
  const next = projectTaskList(result, mutation, { status: 'unfinished' }, options)
  assert.equal(next.total, 0); assert.equal(next.items.length, 0)
  const pinned = projectTaskList(result, mutation, { status: 'unfinished' }, options, task.id)
  assert.equal(pinned.total, 0); assert.equal(pinned.items[0].status, 'done')
  const untagged = projectTaskList(result, { ...mutation, task: { ...task, dimensionValues: {} } }, { dimensionFilters: { tag: 'root' } }, options)
  assert.equal(untagged.total, 0)
  const removed = projectTaskList(result, { type: 'delete', id: task.id, previous: task }, {}, options)
  assert.equal(removed.total, 0); assert.equal(removed.items.length, 0)
})

test('本地筛选兼容历史全天排期、日期边界、树形上级及未设置', () => {
  const allDay = { ...task, isAllDay: true, startTime: '2026-10-26T16:00:00.000Z', endTime: '2026-10-26T16:00:00.000Z' }
  assert(matchesTask(allDay, { schedule: 'scheduled', start: '2026-10-26T16:00:00Z', end: '2026-10-27T16:00:00Z' }, options))
  assert(!matchesTask(allDay, { schedule: 'unscheduled' }, options))
  assert(!matchesTask(allDay, { start: '2026-10-27T16:00:00Z' }, options))
  assert(matchesTask(task, { dimensionFilters: { tag: 'root' } }, options))
  assert(!matchesTask(task, { dimensionFilters: { tag: '__unset__' } }, options))
  assert(matchesTask({ ...task, dimensionValues: {} }, { dimensionFilters: { tag: '__unset__' } }, options))
})

test('多个组件读取同一维度只请求一次，显式刷新可绕过缓存', async () => {
  const { RequestCache } = await import('../../frontend/src/stores/requestCache.js')
  const cache = new RequestCache()
  let count = 0
  const load = async () => { count++; await new Promise(resolve => setTimeout(resolve, 5)) }
  await Promise.all([cache.run('dimensions', load), cache.run('dimensions', load), cache.run('dimensions', load)])
  await cache.run('dimensions', load)
  assert.equal(count, 1)
  await cache.run('dimensions', load, true)
  assert.equal(count, 2)
})

test('退出账号清缓存后，旧请求不能将上一账号的维度写回', async () => {
  const { RequestCache } = await import('../../frontend/src/stores/requestCache.js')
  const cache = new RequestCache()
  let finish!: () => void
  let state = ''
  const old = cache.run('dimensions', async isCurrent => {
    await new Promise<void>(resolve => { finish = resolve })
    if (isCurrent()) state = '旧账号'
  })
  cache.reset()
  await cache.run('dimensions', async isCurrent => { if (isCurrent()) state = '新账号' })
  finish(); await old
  assert.equal(state, '新账号')
})
