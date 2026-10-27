import dayjs from 'dayjs'
import type { Task, TaskStatus } from '@time-manage/shared'

export const STATUS_LABELS: Record<TaskStatus, string> = { todo: '待办', in_progress: '进行中', done: '已完成', cancelled: '已取消' }

export function toTimeFields(task: Pick<Task, 'startTime' | 'endTime' | 'isAllDay'>) {
  const format = task.isAllDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm'
  return {
    startTime: task.startTime ? dayjs(task.startTime).format(format) : '',
    endTime: task.endTime ? (task.isAllDay ? dayjs(task.endTime).subtract(1, 'day') : dayjs(task.endTime)).format(format) : '',
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
  if (!task.startTime || !task.endTime) return task.startTime || task.endTime ? '时间待补全' : '未排期'
  if (task.isAllDay) {
    const start = dayjs(task.startTime).format('YYYY/MM/DD')
    const end = dayjs(task.endTime).subtract(1, 'day').format('YYYY/MM/DD')
    return `${start}${start === end ? '' : ` – ${end}`} · 全天`
  }
  const start = dayjs(task.startTime)
  const end = dayjs(task.endTime)
  return `${start.format('YYYY/MM/DD HH:mm')} – ${end.format(start.isSame(end, 'day') ? 'HH:mm' : 'YYYY/MM/DD HH:mm')}`
}

export function durationLabel(task: Task) {
  if (!task.startTime || !task.endTime) return '—'
  if (task.isAllDay) return '全天'
  const minutes = Math.round(dayjs(task.endTime).diff(dayjs(task.startTime), 'minute', true))
  if (minutes <= 0) return '—'
  return [minutes >= 60 ? `${Math.floor(minutes / 60)}小时` : '', minutes % 60 ? `${minutes % 60}分钟` : ''].join('')
}
