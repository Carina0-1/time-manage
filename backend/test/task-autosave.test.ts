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
