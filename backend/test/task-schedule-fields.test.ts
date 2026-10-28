import assert from 'node:assert/strict'
import test from 'node:test'
import { clearScheduleTime, setScheduleDate, setScheduleTime } from '../../frontend/src/components/tasks/taskSchedule.js'
import { encodeTimes } from '../../frontend/src/components/tasks/taskForm.js'

test('首次选择日期保存为全天，修改日期保留已有时间与有效的日期范围', () => {
  const allDay = setScheduleDate({ startTime: '', endTime: '', isAllDay: false }, '2026-10-28', 'start')
  assert.deepEqual(allDay, { startTime: '2026-10-28', endTime: '2026-10-28', isAllDay: true })
  assert.doesNotThrow(() => encodeTimes(allDay.startTime, allDay.endTime, allDay.isAllDay))
  assert.deepEqual(setScheduleDate({ startTime: '2026-10-28T14:00', endTime: '2026-10-30T15:00', isAllDay: false }, '2026-10-29', 'start'), {
    startTime: '2026-10-29T14:00', endTime: '2026-10-30T15:00', isAllDay: false,
  })
})

test('设置开始时间自动维持有效结束时间，跨午夜和结束时间早于开始时可正常保存', () => {
  const initial = { startTime: '2026-10-28', endTime: '2026-10-28', isAllDay: true }
  const late = setScheduleTime(initial, '23:30', 'start')
  assert.deepEqual(late, { startTime: '2026-10-28T23:30', endTime: '2026-10-29T00:30', isAllDay: false })
  const overnight = setScheduleTime({ startTime: '2026-10-28T22:00', endTime: '2026-10-28T23:00', isAllDay: false }, '01:00', 'end')
  assert.deepEqual(overnight, { startTime: '2026-10-28T22:00', endTime: '2026-10-29T01:00', isAllDay: false })
  for (const value of [late, overnight]) assert.doesNotThrow(() => encodeTimes(value.startTime, value.endTime, value.isAllDay))
})

test('清空时间仅转换为全天并保留日期范围；已有多日排期修改结束日期后仍有效', () => {
  const value = { startTime: '2026-10-28T14:00', endTime: '2026-10-30T12:00', isAllDay: false }
  assert.deepEqual(clearScheduleTime(value), { startTime: '2026-10-28', endTime: '2026-10-30', isAllDay: true })
  const shortened = setScheduleDate(value, '2026-10-28', 'end')
  assert.equal(shortened.endTime, '2026-10-28T15:00')
  assert.doesNotThrow(() => encodeTimes(shortened.startTime, shortened.endTime, shortened.isAllDay))
  assert.deepEqual(clearScheduleTime({ startTime: '', endTime: '', isAllDay: false }), { startTime: '', endTime: '', isAllDay: false })
})
