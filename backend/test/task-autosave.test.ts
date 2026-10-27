import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TaskSaveQueue } from '../../frontend/src/components/tasks/taskSaveQueue.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('快速连续编辑串行保存，合并尚未发出的旧文字，不丢失不同字段', async () => {
  const first = deferred<string>()
  const sent: [string, string][] = [], saved: string[] = []
  const queue = new TaskSaveQueue<string, string>(async ({ key, value }) => {
    sent.push([key, value]); return sent.length === 1 ? first.promise : value
  }, value => saved.push(value), () => {})
  queue.enqueue('title', '旧名称')
  await Promise.resolve()
  queue.enqueue('description', '保留备注')
  queue.enqueue('title', '中间名称')
  queue.enqueue('title', '最终名称')
  assert.equal(sent.length, 1, '上一请求结束前不能发送下一次更新')
  first.resolve('旧名称')
  assert.equal(await queue.flush(), true)
  assert.deepEqual(sent, [['title', '旧名称'], ['description', '保留备注'], ['title', '最终名称']])
  assert.equal(saved.at(-1), '最终名称')
  assert.equal(queue.hasPending, false)
})

test('保存失败保留最新草稿，重试不把旧请求覆盖回去', async () => {
  const first = deferred<string>(), sent: string[] = []
  const queue = new TaskSaveQueue<string, string>(async ({ value }) => {
    sent.push(value); return sent.length === 1 ? first.promise : value
  }, () => {}, () => {})
  queue.enqueue('title', '失败的旧名称')
  await Promise.resolve()
  queue.enqueue('title', '重试应保存的新名称')
  first.reject(new Error('网络不可用'))
  assert.equal(await queue.flush(), false)
  assert.equal(queue.error, '网络不可用')
  assert.equal(queue.hasPending, true)
  assert.equal(await queue.flush(), true)
  assert.deepEqual(sent, ['失败的旧名称', '重试应保存的新名称'])
  assert.equal(queue.error, '')
})

test('关闭编辑必须等待所有字段落库，失败不会报告完成', async () => {
  const final = deferred<string>()
  const queue = new TaskSaveQueue<string, string>(async ({ key, value }) => key === 'schedule' ? final.promise : value, () => {}, () => {})
  queue.enqueue('title', '改名')
  queue.enqueue('schedule', '新的排期')
  let closed = false
  const leave = queue.flush().then(ok => { closed = ok })
  await Promise.resolve()
  assert.equal(closed, false)
  final.reject(new Error('排期未保存'))
  await leave
  assert.equal(closed, false)
  assert.equal(queue.hasPending, true)
})

test('上一轮保存后立即再次编辑，仍会发送新值', async () => {
  const sent: string[] = []
  const queue = new TaskSaveQueue<string, string>(async ({ value }) => { sent.push(value); return value }, () => {}, () => {})
  queue.enqueue('title', 'A')
  await queue.flush()
  queue.enqueue('title', 'B')
  await queue.flush()
  queue.enqueue('title', 'A')
  assert.equal(await queue.flush(), true)
  assert.deepEqual(sent, ['A', 'B', 'A'])
})


test('失焦和关闭反复提交正在保存的相同值，只发送一次请求', async () => {
  const first = deferred<string>(), sent: string[] = []
  const queue = new TaskSaveQueue<string, string>(async ({ value }) => { sent.push(value); return first.promise }, () => {}, () => {})
  queue.enqueue('title', '新名称')
  await Promise.resolve()
  queue.enqueue('title', '新名称')
  queue.enqueue('title', '新名称')
  const closed = queue.flush()
  first.resolve('新名称')
  assert.equal(await closed, true)
  assert.deepEqual(sent, ['新名称'])
  queue.enqueue('title', '新名称')
  assert.equal(await queue.flush(), true)
  assert.equal(sent.length, 1)
})

test('A→B→A 保留真实改回操作，B→C→B 不额外发送 C 或重复 B', async () => {
  const first = deferred<string>(), sent: string[] = []
  const queue = new TaskSaveQueue<string, string>(async ({ value }) => { sent.push(value); return sent.length === 2 ? first.promise : value }, () => {}, () => {})
  queue.enqueue('title', 'A'); await queue.flush()
  queue.enqueue('title', 'B'); await Promise.resolve()
  queue.enqueue('title', 'C'); queue.enqueue('title', 'B'); queue.enqueue('title', 'A')
  first.resolve('B')
  assert.equal(await queue.flush(), true)
  assert.deepEqual(sent, ['A', 'B', 'A'])
})

test('同一轮文字与排期合并为一次请求，维度继续增量提交', async () => {
  type Input = { fields?: Record<string, unknown>; dimension?: string }
  const sent: Input[] = []
  const queue = new TaskSaveQueue<Input, Input>(async ({ value }) => { sent.push(value); return value }, () => {}, () => {}, undefined,
    { merge: (a,b) => a.fields && b.fields ? { fields: { ...a.fields, ...b.fields } } : null })
  queue.enqueue('title', { fields: { title: '名称' } })
  queue.enqueue('description', { fields: { description: '备注' } })
  queue.enqueue('schedule', { fields: { startTime: '开始', endTime: '结束' } })
  queue.enqueue('dimension:tag', { dimension: 'tag' })
  await queue.flush()
  assert.deepEqual(sent, [{ fields: { title: '名称', description: '备注', startTime: '开始', endTime: '结束' } }, { dimension: 'tag' }])
})


test('外部刷新后重新同步已确认基线，不吞掉用户改回的旧值', async () => {
  const sent: string[] = []
  const queue = new TaskSaveQueue<string,string>(async ({ value }) => { sent.push(value); return value }, () => {}, () => {})
  queue.enqueue('title','B'); await queue.flush()
  queue.resetAcknowledged() // 其他入口已将服务器内容改为 C。
  queue.enqueue('title','B'); await queue.flush()
  assert.deepEqual(sent, ['B','B'])
})


test('响应丢失后改回已确认旧值，也必须写入，不能假定服务器未修改', async () => {
  let server = '', loseResponse = false
  const sent: string[] = []
  const queue = new TaskSaveQueue<string,string>(async ({ value }) => {
    sent.push(value); server = value
    if (loseResponse) { loseResponse = false; throw new Error('响应丢失') }
    return value
  }, () => {}, () => {})
  queue.enqueue('title','A'); await queue.flush()
  loseResponse = true
  queue.enqueue('title','B'); assert.equal(await queue.flush(), false)
  queue.enqueue('title','A'); assert.equal(await queue.flush(), true)
  assert.equal(server, 'A')
  assert.deepEqual(sent, ['A','B','A'])
})
