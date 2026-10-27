import { useEffect, useRef, useState } from 'react'
import type { Dimension, DimensionOption, Task, TaskStatus, UpdateTaskInput } from '@time-manage/shared'
import { useTaskListStore } from '@/stores/taskListStore'
import DimensionFields from './DimensionFields'
import { encodeTimes, STATUS_LABELS, toTimeFields } from './taskForm'
import styles from './TaskListPage.module.css'

interface Props {
  task: Task
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  onSave: (input: UpdateTaskInput) => Promise<void>
  onCancel: () => void
}

export default function TaskInlineEditor({ task, dimensions, optionsByDimension, onSave, onCancel }: Props) {
  const initial = useRef({ title: task.title, description: task.description ?? '', expectedOutput: task.expectedOutput ?? '', ...toTimeFields(task), isAllDay: task.isAllDay, status: task.status, dimensionValues: { ...task.dimensionValues } })
  const [draft, setDraft] = useState(initial.current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(initial.current) !== JSON.stringify(draft)
  useEffect(() => { titleRef.current?.select() }, [])
  useEffect(() => {
    useTaskListStore.setState({ confirmLeave: () => !saving && (!dirty || window.confirm('当前任务有未保存的修改，确定放弃吗？')) })
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty || saving) e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => { useTaskListStore.setState({ confirmLeave: null }); window.removeEventListener('beforeunload', onBeforeUnload) }
  }, [dirty, saving])
  const submit = async () => {
    if (saving) return
    setError('')
    try {
      if (!draft.title.trim()) throw new Error('请填写任务名称')
      const missing = dimensions.filter(d => d.isRequired && !draft.dimensionValues[d.id])
      if (missing.length) throw new Error(`请选择：${missing.map(d => d.name).join('、')}`)
      const times = encodeTimes(draft.startTime, draft.endTime, draft.isAllDay)
      setSaving(true)
      await onSave({ ...draft, title: draft.title.trim(), ...times, isAllDay: !!times.startTime && draft.isAllDay })
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <tr className={styles.editingRow}><td colSpan={6}>
    <form ref={formRef} className={styles.inlineEditor} aria-label={`编辑任务：${task.title}`} onSubmit={e => { e.preventDefault(); void submit() }} onKeyDown={e => {
      if (e.key === 'Escape' && !saving) { e.preventDefault(); onCancel() }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') { e.preventDefault(); formRef.current?.requestSubmit() }
    }}>
      <fieldset disabled={saving}>
        <div className={styles.editTop}>
          <label className={styles.field}><span>任务名称</span><input ref={titleRef} aria-label="编辑任务名称" value={draft.title} maxLength={200} required onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className={styles.field}><span>状态</span><select aria-label="编辑任务状态" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as TaskStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className={styles.timeFields}>
          <label className={styles.field}><span>开始{draft.isAllDay ? '日期' : '时间'}</span><input aria-label="编辑开始时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
          <label className={styles.field}><span>结束{draft.isAllDay ? '日期（含当天）' : '时间'}</span><input aria-label="编辑结束时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></label>
          <label className={styles.checkLabel}><input type="checkbox" checked={draft.isAllDay} onChange={e => {
            const allDay = e.target.checked
            setDraft({ ...draft, isAllDay: allDay, startTime: draft.startTime ? `${draft.startTime.slice(0, 10)}${allDay ? '' : 'T09:00'}` : '', endTime: draft.endTime ? `${draft.endTime.slice(0, 10)}${allDay ? '' : 'T10:00'}` : '' })
          }} />全天</label>
          <button type="button" className={styles.textButton} onClick={() => setDraft({ ...draft, startTime: '', endTime: '', isAllDay: false })}>清空排期</button>
        </div>
        <div className={styles.descriptionFields}>
          <label className={styles.field}><span>备注</span><textarea aria-label="编辑备注" rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className={styles.field}><span>预期产出</span><textarea aria-label="编辑预期产出" rows={2} value={draft.expectedOutput} onChange={e => setDraft({ ...draft, expectedOutput: e.target.value })} /></label>
        </div>
        <DimensionFields dimensions={dimensions} optionsByDimension={optionsByDimension} values={draft.dimensionValues} onChange={(id, value) => {
          const next = { ...draft.dimensionValues }
          if (value) next[id] = value
          else delete next[id]
          setDraft({ ...draft, dimensionValues: next })
        }} />
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.editFooter}><span className={styles.hint}>Enter 保存 · Esc 取消</span><button type="button" className={styles.secondaryButton} disabled={saving} onClick={onCancel}>取消</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? '保存中…' : '保存修改'}</button></div>
    </form>
  </td></tr>
}
