import dayjs from 'dayjs'
import type { Task, TaskStatus } from '@time-manage/shared'

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: '待办', done: '已完成' }

// 兼容历史全天记录：开始、结束相同或未保存结束时间时，按单日全天处理。
export function getTaskEndTime(task: Pick<Task, 'startTime' | 'endTime' | 'isAllDay'>) {
  if (task.isAllDay && task.startTime && (!task.endTime || task.endTime === task.startTime || dayjs(task.endTime).isSame(dayjs(task.startTime)))) {
    return dayjs(task.startTime).add(1, 'day').toISOString()
  }
  return task.endTime ?? null
}

export function toTimeFields(task: Pick<Task, 'startTime' | 'endTime' | 'isAllDay'>) {
  const endTime = getTaskEndTime(task)
  const format = task.isAllDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm'
  return {
    startTime: task.startTime ? dayjs(task.startTime).format(format) : '',
    endTime: endTime ? (task.isAllDay ? dayjs(endTime).subtract(1, 'day') : dayjs(endTime)).format(format) : '',
  }
}

export function encodeTimes(start: string, end: string, isAllDay: boolean) {
  if (!start && !end) return { startTime: null, endTime: null }
  if (!start || !end) throw new Error('请同时填写开始和结束时间，或同时留空')
  const startDate = new Date(isAllDay ? `${start}T00:00:00` : start)
  const endDate = new Date(isAllDay ? `${end}T00:00:00` : end)
  if (isAllDay) endDate.setDate(endDate.getDate() + 1)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) throw new Error('结束时间须晚于开始时间')
  return { startTime: startDate.toISOString(), endTime: endDate.toISOString() }
}

export function scheduleLabel(task: Task) {
  if (task.isAllDay) {
    if (!task.startTime) return '全天（日期待补全）'
    const start = dayjs(task.startTime).format('YYYY/MM/DD')
    const end = dayjs(getTaskEndTime(task)).subtract(1, 'day').format('YYYY/MM/DD')
    return `${start}${start === end ? '' : ` – ${end}`} · 全天`
  }
  if (!task.startTime || !task.endTime) return task.startTime || task.endTime ? '时间待补全' : '未排期'
  const start = dayjs(task.startTime)
  const end = dayjs(task.endTime)
  return `${start.format('YYYY/MM/DD HH:mm')} – ${end.format(start.isSame(end, 'day') ? 'HH:mm' : 'YYYY/MM/DD HH:mm')}`
}

export function durationLabel(task: Task) {
  if (task.isAllDay) return '全天'
  if (!task.startTime || !task.endTime) return '—'
  const minutes = Math.round(dayjs(task.endTime).diff(dayjs(task.startTime), 'minute', true))
  if (minutes <= 0) return '—'
  return [minutes >= 60 ? `${Math.floor(minutes / 60)}小时` : '', minutes % 60 ? `${minutes % 60}分钟` : ''].join('')
}
