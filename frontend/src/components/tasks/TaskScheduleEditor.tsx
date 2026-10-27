import { useRef, useState } from 'react'
import type { Task, UpdateTaskInput } from '@time-manage/shared'
import { encodeTimes, toTimeFields } from './taskForm'
import { useTaskEditorGuard } from './useTaskEditorGuard'
import styles from './TaskListPage.module.css'

interface Props {
  task: Task
  onSave: (input: UpdateTaskInput) => Promise<void>
  onCancel: () => void
}

export default function TaskScheduleEditor({ task, onSave, onCancel }: Props) {
  const initial = useRef({ ...toTimeFields(task), isAllDay: task.isAllDay })
  const [draft, setDraft] = useState(initial.current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useTaskEditorGuard(JSON.stringify(initial.current) !== JSON.stringify(draft), saving)
  const submit = async () => {
    if (saving) return
    setError('')
    try {
      const times = encodeTimes(draft.startTime, draft.endTime, draft.isAllDay)
      setSaving(true)
      await onSave({ ...times, isAllDay: !!times.startTime && draft.isAllDay })
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <tr className={styles.editingRow}><td colSpan={6}>
    <form className={styles.inlineEditor} aria-label={`编辑任务排期：${task.title}`} onSubmit={e => { e.preventDefault(); void submit() }} onKeyDown={e => {
      if (e.key === 'Escape' && !saving) { e.preventDefault(); onCancel() }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') { e.preventDefault(); e.currentTarget.requestSubmit() }
    }}>
      <fieldset disabled={saving}>
        <div className={styles.timeFields}>
          <label className={styles.field}><span>开始{draft.isAllDay ? '日期' : '时间'}</span><input autoFocus aria-label="编辑开始时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
          <label className={styles.field}><span>结束{draft.isAllDay ? '日期（含当天）' : '时间'}</span><input aria-label="编辑结束时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></label>
          <label className={styles.checkLabel}><input type="checkbox" checked={draft.isAllDay} onChange={e => {
            const allDay = e.target.checked
            setDraft({ ...draft, isAllDay: allDay, startTime: draft.startTime ? `${draft.startTime.slice(0, 10)}${allDay ? '' : 'T09:00'}` : '', endTime: draft.endTime ? `${draft.endTime.slice(0, 10)}${allDay ? '' : 'T10:00'}` : '' })
          }} />全天</label>
          <button type="button" className={styles.textButton} onClick={() => setDraft({ startTime: '', endTime: '', isAllDay: false })}>清空排期</button>
        </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.editFooter}><span className={styles.hint}>仅修改排期 · Esc 取消</span><button type="button" className={styles.secondaryButton} disabled={saving} onClick={onCancel}>取消</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? '保存中…' : '保存排期'}</button></div>
    </form>
  </td></tr>
}
