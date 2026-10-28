import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import type { Dimension, DimensionOption, Task } from '@time-manage/shared'
import { useTaskListStore } from '@/stores/taskListStore'
import DimensionFields from './DimensionFields'
import { durationLabel } from './taskForm'
import TaskQuickFields from './TaskQuickFields'
import { useImmediateTask } from './useImmediateTask'
import styles from './TaskItem.module.css'

export type TaskEditMode = 'inline' | 'detail' | 'fields'
export interface TaskSession { id: string; mode: TaskEditMode; field?: 'title' | 'description' }
interface Props {
  task: Task
  isNew?: boolean
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  session: TaskSession | null
  selected: boolean
  onSelect: () => void
  onActivate: (mode: TaskEditMode, field?: TaskSession['field']) => void
  onClose: () => Promise<void>
  onDelete: () => Promise<void>
}

export default function TaskItem({ task, isNew = false, dimensions, optionsByDimension, session, selected, onSelect, onActivate, onClose, onDelete }: Props) {
  const editor = useImmediateTask(task, isNew)
  const { draft } = editor
  const mode = session?.mode
  const active = !!mode
  const row = useRef<HTMLDivElement>(null)
  const info = useRef<HTMLButtonElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const description = useRef<HTMLTextAreaElement>(null)
  const current = useRef(editor)
  current.current = editor
  const detail = mode === 'detail'
  const inline = mode === 'inline'

  useEffect(() => {
    if (mode === 'inline') {
      const timer = setTimeout(() => {
        const input = session?.field === 'description' ? description.current : title.current
        input?.focus(); input?.select()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [mode, session?.field])
  useEffect(() => {
    if (!active) return
    const guard = async () => {
      if (await current.current.flush()) return true
      if (!window.confirm('部分修改尚未保存，确定放弃这些修改吗？')) return false
      current.current.discard()
      return true
    }
    useTaskListStore.setState({ confirmLeave: guard })
    return () => { if (useTaskListStore.getState().confirmLeave === guard) useTaskListStore.setState({ confirmLeave: null }) }
  }, [active])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (current.current.hasUnsaved) event.preventDefault() }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  const textKey = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, field: 'title' | 'description') => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && (field === 'title' || event.metaKey || event.ctrlKey)) {
      event.preventDefault(); editor.saveText(field); event.currentTarget.blur(); if (!detail) void onClose()
    }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      if (isNew && editor.saving) return
      editor.restoreText(field); event.currentTarget.blur(); if (!detail) void onClose()
    }
  }
  const textInput = (field: 'title' | 'description', label: string) => {
    const props = { 'aria-label': label, value: draft[field], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => editor.changeText(field, e.target.value, (e.nativeEvent as InputEvent).isComposing),
      onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => editor.changeText(field, e.currentTarget.value),
      onBlur: () => { editor.saveText(field); if (isNew && !editor.persisted && !draft.title.trim() && !editor.saving) void onClose() }, onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => textKey(e, field) }
    return field === 'title' ? <input {...props} ref={detail ? undefined : title} className={styles.titleInput} maxLength={200} placeholder={isNew ? '任务名称' : undefined} />
      : <textarea {...props} ref={detail ? undefined : description} rows={2} placeholder={label} />
  }
  const schedule = <div className={styles.scheduleFields}>
    <label className={styles.field}><span>开始{draft.isAllDay ? '日期' : '时间'}</span><input aria-label="开始时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.startTime} onChange={e => editor.changeSchedule({ startTime: e.target.value })} /></label>
    <label className={styles.field}><span>结束{draft.isAllDay ? '日期（含当天）' : '时间'}</span><input aria-label="结束时间" type={draft.isAllDay ? 'date' : 'datetime-local'} value={draft.endTime} onChange={e => editor.changeSchedule({ endTime: e.target.value })} /></label>
    <div className={styles.scheduleActions}><label className={styles.checkLabel}><input type="checkbox" checked={draft.isAllDay} onChange={e => {
      const allDay = e.target.checked
      const start = draft.startTime || dayjs().format('YYYY-MM-DD')
      const end = draft.endTime || start
      editor.changeSchedule({ isAllDay: allDay, startTime: `${start.slice(0, 10)}${allDay ? '' : 'T09:00'}`, endTime: `${end.slice(0, 10)}${allDay ? '' : 'T10:00'}` })
    }} />全天</label><button type="button" className={styles.linkButton} onClick={() => editor.changeSchedule({ startTime: '', endTime: '', isAllDay: false })}>清空排期</button></div>
  </div>
  const tags = <div className={styles.tagsEditor}><DimensionFields dimensions={dimensions} optionsByDimension={optionsByDimension} values={draft.dimensionValues} onChange={editor.changeDimension} /></div>
  const feedback = (editor.saving || editor.error) && <div className={styles.feedback} aria-live="polite">
    {editor.error ? <><span role="alert" className={styles.error}>{editor.error}</span><button className={styles.linkButton} onClick={() => void editor.flush()}>重试</button>{!editor.saving && <button className={styles.linkButton} onClick={editor.discard}>放弃未保存修改</button>}</> : <span>正在保存…</span>}
  </div>

  return <div ref={row} role="listitem" className={`${styles.row} ${selected || active ? styles.selected : ''} ${draft.status === 'done' ? styles.done : ''}`} onClick={onSelect} onDoubleClick={e => {
    if (editor.persisted && !(e.target as HTMLElement).closest('button,input,textarea,select,label,a')) onActivate('detail')
  }}>
    <label className={styles.completion} onDoubleClick={e => e.stopPropagation()}><input type="checkbox" checked={draft.status === 'done'} aria-label={`${draft.status === 'done' ? '标为待办' : '完成任务'}：${draft.title}`} disabled={editor.saving || !editor.persisted} onChange={e => editor.changeStatus(e.target.checked)} /><span aria-hidden="true">{draft.status === 'done' ? '✓' : ''}</span></label>
    <div className={styles.body}>
      {inline ? <div className={styles.inline} onDoubleClick={e => e.stopPropagation()}>
        {session?.field === 'description' ? <>
          <span className={styles.name} onDoubleClick={() => onActivate('inline', 'title')}>{draft.title}</span>
          {textInput('description', '编辑备注')}
        </> : <>
          {textInput('title', '编辑任务名称')}
          {draft.description && <p className={styles.description} onDoubleClick={() => onActivate('inline', 'description')}>{draft.description}</p>}
        </>}
      </div> : <div className={styles.textBlock} onDoubleClick={e => { e.stopPropagation(); onActivate('inline', (e.target as HTMLElement).dataset.field as TaskSession['field'] ?? 'title') }}>
        <span className={styles.name} tabIndex={0} role="button" aria-label={`编辑任务名称：${draft.title}`} title="双击编辑文字" data-field="title" onKeyDown={e => { if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); onActivate('inline', 'title') } }}>{draft.title}</span>
        {draft.description && <p className={styles.description} data-field="description">{draft.description}</p>}
      </div>}
      <TaskQuickFields editor={editor} dimensions={dimensions} optionsByDimension={optionsByDimension} visible={selected || active} detail={detail} onOpen={() => { if (!inline) onActivate('fields') }} />
      {!detail && feedback}
    </div>
    {editor.persisted ? <button ref={info} className={styles.info} title="查看并编辑完整任务信息" aria-label={`任务详情：${draft.title}`} onClick={() => onActivate('detail')} onDoubleClick={e => e.stopPropagation()}>ⓘ</button> : <button className={styles.linkButton} onMouseDown={e => e.preventDefault()} onClick={() => void onClose()} aria-label="结束任务编辑">×</button>}
    {detail && <Details anchor={row} onClose={onClose} returnFocus={() => info.current?.focus()}>
      <div className={styles.panelHeading}><strong>任务详情</strong><span>修改自动保存</span><button aria-label="关闭任务详情" onClick={() => void onClose()}>×</button></div>
      <div className={styles.detailContent}>
        <label className={styles.field}><span>任务名称</span>{textInput('title', '任务名称')}</label>
        <label className={styles.field}><span>备注</span>{textInput('description', '备注')}</label>
        <section className={styles.section}><h3>排期</h3>{schedule}{(task.startTime || task.isAllDay) && <p className={styles.duration}>时长：{durationLabel(task)}</p>}</section>
        <section className={styles.section}><h3>维度信息</h3>{tags}</section>
      </div>
      <div className={styles.detailFooter}>{feedback || <span className={styles.savedHint}>所有修改即时生效</span>}<button className={styles.deleteButton} disabled={editor.saving || !editor.persisted} onClick={async () => { if (await editor.flush()) await onDelete() }}>删除任务</button></div>
    </Details>}
  </div>
}

function Details({ anchor, onClose, returnFocus, children }: { anchor: React.RefObject<HTMLDivElement | null>; onClose: () => Promise<void>; returnFocus: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 16 })
  const closing = useRef(false)
  const close = async () => { if (closing.current) return; closing.current = true; try { await onClose() } finally { closing.current = false } }
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(380, window.innerWidth - 24)
      const height = panel.current?.getBoundingClientRect().height ?? 600
      const right = rect.right + 12
      const left = right + width <= window.innerWidth - 12 ? right : rect.left - width - 12 >= 12 ? rect.left - width - 12 : window.innerWidth - width - 12
      setPosition({ left, top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)) })
    }
    place(); panel.current?.querySelector<HTMLInputElement>('input')?.focus()
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); returnFocus() }
  }, [])
  return createPortal(<div className={styles.scrim} onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) void close() }} onDoubleClick={e => e.stopPropagation()}>
    <div ref={panel} className={styles.details} style={position} role="dialog" aria-modal="true" aria-label="任务详情" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void close() }
      if (e.key === 'Tab') {
        const controls = Array.from(panel.current!.querySelectorAll<HTMLElement>('input,textarea,select,button,a[href]')).filter(el => !el.hasAttribute('disabled'))
        const first = controls[0], last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }}>{children}</div>
  </div>, document.body)
}
