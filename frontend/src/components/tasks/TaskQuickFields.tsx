import { useEffect, useRef, useState, type MouseEvent } from 'react'
import dayjs from 'dayjs'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { getOptionPath, getOrderedOptionNodes } from '@/utils/dimensionTree'
import type { useImmediateTask } from './useImmediateTask'
import TaskFieldPopover from './TaskFieldPopover'
import { clearScheduleTime, setScheduleDate, setScheduleTime } from './taskSchedule'
import styles from './TaskQuickFields.module.css'

interface Props {
  editor: ReturnType<typeof useImmediateTask>
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  visible: boolean
  detail: boolean
  onOpen: () => void
}
type OpenField = { id: string; anchor: HTMLElement }

export default function TaskQuickFields({ editor, dimensions, optionsByDimension, visible, detail, onOpen }: Props) {
  const { draft } = editor
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const [open, setOpen] = useState<OpenField | null>(null)
  useEffect(() => { if (!visible || detail) setOpen(null) }, [visible, detail])
  const openField = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    setOpen({ id, anchor: event.currentTarget }); onOpen()
  }
  const dismiss = () => setOpen(null)
  const close = () => { dismiss(); open?.anchor.focus({ preventScroll: true }) }
  const hasDate = !!draft.startTime
  const dateLabel = hasDate ? `${dayjs(draft.startTime).format('YYYY/MM/DD')}${draft.endTime.slice(0, 10) !== draft.startTime.slice(0, 10) ? ` – ${dayjs(draft.endTime).format('MM/DD')}` : ''}` : ''
  const timeLabel = hasDate && !draft.isAllDay ? `${draft.startTime.slice(11)} – ${draft.endTime.slice(11)}${draft.endTime.slice(0, 10) !== draft.startTime.slice(0, 10) ? '（跨日）' : ''}` : ''
  const chips = [
    { id: 'date', label: '日期', icon: '▦', value: dateLabel, clear: () => editor.changeSchedule({ startTime: '', endTime: '', isAllDay: false }), required: false },
    { id: 'time', label: '时间', icon: '◷', value: timeLabel, clear: () => editor.changeSchedule(clearScheduleTime(draft)), required: false },
    ...dimensions.map(dim => ({ id: dim.id, label: dim.name, icon: dim.icon || '#', value: getOptionPath(optionsByDimension[dim.id] ?? [], draft.dimensionValues[dim.id]), clear: () => editor.changeDimension(dim.id, null), required: dim.isRequired })),
  ]
  const dim = dimensions.find(dim => dim.id === open?.id)
  const choose = (change: () => void) => { change(); close() }
  return <>
    {!visible && <div className={styles.metadata}>
      {chips.filter(chip => chip.value).map(chip => <button key={chip.id} title={`${chip.label}：${chip.value}`} onClick={() => { onOpen(); requestAnimationFrame(() => { const anchor = triggers.current.get(chip.id); if (anchor) setOpen({ id: chip.id, anchor }) }) }}>{chip.value}{chip.id === 'date' && draft.isAllDay ? ' · 全天' : ''}</button>)}
    </div>}
    {editor.persisted && visible && !detail && <div className={styles.bar} onDoubleClick={e => e.stopPropagation()}>
      {chips.map(chip => <div className={`${styles.chip} ${chip.value ? styles.hasValue : ''}`} key={chip.id}>
        <button ref={element => { if (element) triggers.current.set(chip.id, element); else triggers.current.delete(chip.id) }} type="button" title={`${chip.label}${chip.value ? `：${chip.value}` : ''}`} aria-label={`修改${chip.label}${chip.value ? `：${chip.value}` : ''}`} aria-haspopup="dialog" aria-expanded={open?.id === chip.id} onClick={event => openField(chip.id, event)}><span aria-hidden="true" className={styles.icon}>{chip.icon}</span><span className={styles.value}>{chip.value || chip.label}</span></button>
        {chip.value && <button type="button" className={styles.clear} aria-label={`清空${chip.label}`} disabled={chip.required} title={chip.required ? `${chip.label}为必填，请选择其他选项` : `清空${chip.label}`} onClick={() => { chip.clear(); setOpen(null) }}>×</button>}
      </div>)}
    </div>}
    {open && !detail && <TaskFieldPopover anchor={open.anchor} label={`修改${chips.find(chip => chip.id === open.id)?.label ?? ''}`} onClose={dismiss}>
      {open.id === 'date' && <DatePicker start={draft.startTime.slice(0, 10)} end={draft.endTime.slice(0, 10)} onChange={(date, edge) => choose(() => editor.changeSchedule(setScheduleDate(draft, date, edge)))} />}
      {open.id === 'time' && <TimePicker start={draft.isAllDay ? '' : draft.startTime.slice(11)} end={draft.isAllDay ? '' : draft.endTime.slice(11)} onChange={(time, edge) => choose(() => editor.changeSchedule(setScheduleTime(draft, time, edge)))} onEdit={(time, edge) => editor.changeSchedule(setScheduleTime(draft, time, edge))} onDone={close} />}
      {dim && <><div className={styles.heading}>{dim.icon} {dim.name}</div><div className={styles.choices} role="group" aria-label={`${dim.name}选项`}>
        <button disabled={dim.isRequired && !!draft.dimensionValues[dim.id]} onClick={() => choose(() => editor.changeDimension(dim.id, null))}>未设置</button>
        {getOrderedOptionNodes(optionsByDimension[dim.id] ?? [], dim.type).map(({ option, depth }) => <button key={option.id} title={getOptionPath(optionsByDimension[dim.id] ?? [], option.id)} aria-label={getOptionPath(optionsByDimension[dim.id] ?? [], option.id)} aria-pressed={draft.dimensionValues[dim.id] === option.id} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => choose(() => editor.changeDimension(dim.id, option.id))}>{option.icon && <span>{option.icon}</span>}{option.name}{draft.dimensionValues[dim.id] === option.id && <span className={styles.tick}>✓</span>}</button>)}
        {!optionsByDimension[dim.id]?.length && <p className={styles.hint}>暂无选项，请在设置中添加</p>}
      </div></>}
    </TaskFieldPopover>}
  </>
}

function DatePicker({ start, end, onChange }: { start: string; end: string; onChange: (date: string, edge: 'start' | 'end') => void }) {
  const [edge, setEdge] = useState<'start' | 'end'>('start')
  const [month, setMonth] = useState(() => dayjs(start || undefined).startOf('month'))
  const selected = edge === 'start' ? start : end
  const first = month.startOf('month').subtract((month.day() + 6) % 7, 'day')
  return <div className={styles.calendar}>
    <div className={styles.tabs}>{(['start', 'end'] as const).map(key => <button key={key} aria-pressed={edge === key} onClick={() => { setEdge(key); setMonth(dayjs((key === 'start' ? start : end) || undefined).startOf('month')) }}>{key === 'start' ? '开始日期' : '结束日期'}<span>{(key === 'start' ? start : end) || '未设置'}</span></button>)}</div>
    <div className={styles.month}><button aria-label="上个月" onClick={() => setMonth(month.subtract(1, 'month'))}>‹</button><strong>{month.format('YYYY年M月')}</strong><button aria-label="下个月" onClick={() => setMonth(month.add(1, 'month'))}>›</button></div>
    <div className={styles.days}>{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day} className={styles.weekday}>{day}</span>)}
      {Array.from({ length: 42 }, (_, i) => {
        const day = first.add(i, 'day'), date = day.format('YYYY-MM-DD')
        return <button key={date} aria-label={date} aria-pressed={date === selected} aria-current={day.isSame(dayjs(), 'day') ? 'date' : undefined} className={day.month() !== month.month() ? styles.otherMonth : ''} disabled={edge === 'end' && !!start && date < start} onClick={() => onChange(date, edge)}>{day.date()}</button>
      })}
    </div>
  </div>
}

function TimePicker({ start, end, onChange, onEdit, onDone }: { start: string; end: string; onChange: (time: string, edge: 'start' | 'end') => void; onEdit: (time: string, edge: 'start' | 'end') => void; onDone: () => void }) {
  const [edge, setEdge] = useState<'start' | 'end'>('start')
  const selected = edge === 'start' ? start : end
  return <><div className={styles.tabs}>{(['start', 'end'] as const).map(key => <button key={key} aria-pressed={edge === key} onClick={() => setEdge(key)}>{key === 'start' ? '开始时间' : '结束时间'}<span>{(key === 'start' ? start : end) || '未设置'}</span></button>)}</div>
    <label className={styles.precise}>自定义时间<input type="time" aria-label="自定义时间" value={selected} onChange={e => { if (e.target.value) onEdit(e.target.value, edge) }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onDone() } }} /></label>
    <div className={styles.timeChoices} role="group" aria-label="时间选项">{Array.from({ length: 48 }, (_, i) => {
      const time = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
      return <button key={time} aria-pressed={selected === time} onClick={() => onChange(time, edge)}>{time}{selected === time && <span className={styles.tick}>✓</span>}</button>
    })}</div>
  </>
}
