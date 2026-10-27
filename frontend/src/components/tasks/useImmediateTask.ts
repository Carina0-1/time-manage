import { useEffect, useReducer, useRef, useState } from 'react'
import type { Task, UpdateTaskInput } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'
import { useTaskStore } from '@/stores/taskStore'
import { encodeTimes, toTimeFields } from './taskForm'
import { TaskSaveQueue } from './taskSaveQueue'

type TextField = 'title' | 'description' | 'expectedOutput'
export type TaskDraft = ReturnType<typeof makeDraft>
type Change = { input: UpdateTaskInput } | { dimensionId: string; optionId: string | null }
function makeDraft(task: Task) {
  return { title: task.title, description: task.description ?? '', expectedOutput: task.expectedOutput ?? '',
    ...toTimeFields(task), isAllDay: task.isAllDay, status: task.status, dimensionValues: { ...task.dimensionValues } }
}

export function useImmediateTask(task: Task) {
  const [draft, setDraft] = useState(() => makeDraft(task))
  const current = useRef(draft)
  const confirmed = useRef(task)
  const mounted = useRef(true)
  const [, rerender] = useReducer(n => n + 1, 0)
  const [validation, setValidation] = useState({ title: '', schedule: '' })
  const timers = useRef(new Map<TextField, ReturnType<typeof setTimeout>>())
  const saver = useRef<TaskSaveQueue<Change, Task> | null>(null)
  if (!saver.current) saver.current = new TaskSaveQueue(
    ({ value }) => 'input' in value ? tasksApi.update(task.id, value.input) : tasksApi.updateDimension(task.id, value.dimensionId, value.optionId),
    (updated, job) => {
      if (job.key === 'status' && !saver.current!.hasQueuedKey('status')) {
        current.current = { ...current.current, status: updated.status }
        if (mounted.current) setDraft(current.current)
      }
      confirmed.current = updated; useTaskStore.getState().updateTask(task.id, updated)
    },
    () => { if (mounted.current) rerender() },
    job => {
      if (job.key === 'status') {
        current.current = { ...current.current, status: confirmed.current.status }
        if (mounted.current) setDraft(current.current)
      }
    },
  )
  const queue = saver.current
  const replace = (next: TaskDraft) => { current.current = next; setDraft(next) }
  const dirty = () => {
    const saved = makeDraft(confirmed.current), value = current.current
    return value.title.trim() !== saved.title || value.description !== saved.description || value.expectedOutput !== saved.expectedOutput
      || value.startTime !== saved.startTime || value.endTime !== saved.endTime || value.isAllDay !== saved.isAllDay || value.status !== saved.status
      || Object.keys({ ...value.dimensionValues, ...saved.dimensionValues }).some(id => value.dimensionValues[id] !== saved.dimensionValues[id])
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // 浏览器返回等卸载路径也提交尚在等待的有效文字，不依赖离开按钮。
      timers.current.forEach((timer, field) => {
        clearTimeout(timer)
        const value = field === 'title' ? current.current.title.trim() : current.current[field]
        if ((field !== 'title' || value) && (value !== (confirmed.current[field] ?? '') || queue.hasKey(field))) {
          queue.enqueue(field, { input: { [field]: value } })
        }
      })
      timers.current.clear()
    }
  }, [])
  useEffect(() => {
    if (!queue.hasPending && !dirty()) { confirmed.current = task; replace(makeDraft(task)) }
  }, [task])

  const saveText = (field: TextField) => {
    clearTimeout(timers.current.get(field)); timers.current.delete(field)
    const value = field === 'title' ? current.current.title.trim() : current.current[field]
    if (field === 'title') {
      setValidation(s => ({ ...s, title: value ? '' : '请填写任务名称' }))
      if (!value) return false
    }
    if (value !== (confirmed.current[field] ?? '') || queue.hasKey(field)) queue.enqueue(field, { input: { [field]: value } })
    return true
  }
  const changeText = (field: TextField, value: string, composing = false) => {
    replace({ ...current.current, [field]: value })
    clearTimeout(timers.current.get(field))
    if (!composing) timers.current.set(field, setTimeout(() => saveText(field), 450))
  }
  const saveSchedule = () => {
    const value = current.current
    try {
      const times = encodeTimes(value.startTime, value.endTime, value.isAllDay)
      setValidation(s => ({ ...s, schedule: '' }))
      const saved = makeDraft(confirmed.current)
      if (value.startTime !== saved.startTime || value.endTime !== saved.endTime || value.isAllDay !== saved.isAllDay || queue.hasKey('schedule')) {
        queue.enqueue('schedule', { input: { ...times, isAllDay: !!times.startTime && value.isAllDay } })
      }
      return true
    } catch (e) { setValidation(s => ({ ...s, schedule: e instanceof Error ? e.message : '排期无效' })); return false }
  }
  const changeSchedule = (patch: Partial<Pick<TaskDraft, 'startTime' | 'endTime' | 'isAllDay'>>) => {
    const next = { ...current.current, ...patch }
    // 首次设置开始时间时补齐默认结束时间，随后可直接改为所需时间。
    if (patch.startTime && !next.endTime) {
      if (next.isAllDay) next.endTime = next.startTime
      else {
        const end = new Date(next.startTime); end.setHours(end.getHours() + 1)
        const local = new Date(end.getTime() - end.getTimezoneOffset() * 60000)
        next.endTime = local.toISOString().slice(0, 16)
      }
    }
    replace(next)
    saveSchedule()
  }
  const changeDimension = (dimensionId: string, optionId: string | null) => {
    const values = { ...current.current.dimensionValues }
    if (optionId) values[dimensionId] = optionId
    else delete values[dimensionId]
    replace({ ...current.current, dimensionValues: values })
    queue.enqueue(`dimension:${dimensionId}`, { dimensionId, optionId })
  }
  const changeStatus = (done: boolean) => {
    const status = done ? 'done' : 'todo'
    replace({ ...current.current, status })
    queue.enqueue('status', { input: { status } })
  }
  const flush = async () => {
    let valid = true
    for (const field of ['title', 'description', 'expectedOutput'] as const) if (!saveText(field)) valid = false
    if (!saveSchedule()) valid = false
    const saved = await queue.flush()
    return valid && saved && !dirty()
  }
  const discard = () => { timers.current.forEach(clearTimeout); timers.current.clear(); queue.discard(); replace(makeDraft(confirmed.current)); setValidation({ title: '', schedule: '' }) }
  const restoreText = (field: TextField) => {
    clearTimeout(timers.current.get(field)); timers.current.delete(field)
    replace({ ...current.current, [field]: confirmed.current[field] ?? '' })
    if (queue.hasKey(field)) saveText(field)
  }
  return { draft, changeText, saveText, changeSchedule, changeDimension, changeStatus, flush, discard, restoreText,
    saving: queue.saving, error: validation.title || validation.schedule || queue.error, hasUnsaved: dirty() || queue.hasPending }
}
