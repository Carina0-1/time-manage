import type { Task } from '@time-manage/shared'

export function taskChangeImpact(before: Task | undefined, after: Task) {
  const activity = !before || ['startTime', 'endTime', 'isAllDay'].some(key => before[key as keyof Task] !== after[key as keyof Task])
  const dimensions = !before || Object.keys({ ...before.dimensionValues, ...after.dimensionValues }).some(id => before.dimensionValues[id] !== after.dimensionValues[id])
  return { activity, stats: activity || dimensions || before?.status !== after.status }
}
