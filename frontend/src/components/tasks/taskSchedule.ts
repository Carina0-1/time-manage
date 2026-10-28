import dayjs from 'dayjs'

export interface ScheduleFields { startTime: string; endTime: string; isAllDay: boolean }

export function setScheduleDate(value: ScheduleFields, date: string, edge: 'start' | 'end'): ScheduleFields {
  let start = value.startTime.slice(0, 10) || date
  let end = value.endTime.slice(0, 10) || start
  if (edge === 'start') { start = date; if (end < start) end = start }
  else { end = date; if (start > end) start = end }
  if (value.isAllDay || !value.startTime) return { startTime: start, endTime: end, isAllDay: true }
  const startTime = `${start}T${value.startTime.slice(11)}`
  let endTime = `${end}T${value.endTime.slice(11) || '10:00'}`
  if (endTime <= startTime) endTime = dayjs(startTime).add(1, 'hour').format('YYYY-MM-DDTHH:mm')
  return { startTime, endTime, isAllDay: false }
}

export function setScheduleTime(value: ScheduleFields, time: string, edge: 'start' | 'end'): ScheduleFields {
  const date = value.startTime.slice(0, 10) || dayjs().format('YYYY-MM-DD')
  let startTime = `${date}T${!value.isAllDay && value.startTime.slice(11) || '09:00'}`
  let endTime = `${value.endTime.slice(0, 10) || date}T${!value.isAllDay && value.endTime.slice(11) || '10:00'}`
  if (edge === 'start') {
    startTime = `${date}T${time}`
    if (endTime <= startTime) endTime = dayjs(startTime).add(1, 'hour').format('YYYY-MM-DDTHH:mm')
  } else {
    endTime = `${value.endTime.slice(0, 10) || date}T${time}`
    if (endTime <= startTime) endTime = dayjs(`${date}T${time}`).add(1, 'day').format('YYYY-MM-DDTHH:mm')
  }
  return { startTime, endTime, isAllDay: false }
}

export function clearScheduleTime(value: ScheduleFields): ScheduleFields {
  return { startTime: value.startTime.slice(0, 10), endTime: value.endTime.slice(0, 10), isAllDay: !!value.startTime }
}
