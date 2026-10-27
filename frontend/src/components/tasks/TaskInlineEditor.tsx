import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Task, UpdateTaskInput } from '@time-manage/shared'
import { useTaskEditorGuard } from './useTaskEditorGuard'
import styles from './TaskListPage.module.css'

interface Props {
  task: Task
  renderRow: (titleEditor: ReactNode) => ReactNode
  onSave: (input: UpdateTaskInput) => Promise<void>
  onCancel: () => void
}

export default function TaskInlineEditor({ task, renderRow, onSave, onCancel }: Props) {
  const initial = useRef({ title: task.title, description: task.description ?? '', expectedOutput: task.expectedOutput ?? '' })
  const [draft, setDraft] = useState(initial.current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const formId = `task-content-${task.id}`
  useTaskEditorGuard(JSON.stringify(initial.current) !== JSON.stringify(draft), saving)
  useEffect(() => { titleRef.current?.select() }, [])

  const submit = async () => {
    if (saving) return
    setError('')
    try {
      if (!draft.title.trim()) throw new Error('请填写任务名称')
      setSaving(true)
      // 名称编辑只提交这三个字段，不覆盖状态、排期或维度取值。
      await onSave({ title: draft.title.trim(), description: draft.description, expectedOutput: draft.expectedOutput })
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <>
    {renderRow(<input ref={titleRef} form={formId} className={styles.inlineTitleInput} aria-label="编辑任务名称" value={draft.title} maxLength={200} required disabled={saving} onChange={e => setDraft({ ...draft, title: e.target.value })} onKeyDown={e => {
      if (e.key === 'Escape' && !saving) { e.preventDefault(); onCancel() }
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); formRef.current?.requestSubmit() }
    }} />)}
    <tr className={styles.editingRow}><td colSpan={6}>
      <form id={formId} ref={formRef} className={styles.inlineEditor} aria-label={`编辑任务内容：${task.title}`} onSubmit={e => { e.preventDefault(); void submit() }} onKeyDown={e => {
        if (e.key === 'Escape' && !saving) { e.preventDefault(); onCancel() }
      }}>
        <fieldset disabled={saving}>
          <div className={styles.descriptionFields}>
            <label className={styles.field}><span>备注</span><textarea aria-label="编辑备注" rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
            <label className={styles.field}><span>预期产出</span><textarea aria-label="编辑预期产出" rows={2} value={draft.expectedOutput} onChange={e => setDraft({ ...draft, expectedOutput: e.target.value })} /></label>
          </div>
        </fieldset>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.editFooter}><span className={styles.hint}>编辑名称、备注与预期产出 · Enter 保存 · Esc 取消</span><button type="button" className={styles.secondaryButton} disabled={saving} onClick={onCancel}>取消</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? '保存中…' : '保存内容'}</button></div>
      </form>
    </td></tr>
  </>
}
