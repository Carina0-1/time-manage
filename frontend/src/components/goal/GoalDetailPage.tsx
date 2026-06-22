import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import type { Tag, Task } from '@time-manage/shared'
import { goalsApi } from '@/api/goals'
import type { GoalDetail, PhaseWithTasks } from '@/api/goals'
import { tasksApi } from '@/api/tasks'
import { useGoalStore } from '@/stores/goalStore'
import { useTaskStore } from '@/stores/taskStore'
import { useTagStore } from '@/stores/tagStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './GoalDetailPage.module.css'

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '完成',
  cancelled: '取消',
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { updateGoal, updatePhase, adjustPhaseTaskCount } = useGoalStore()
  const { tasks: storeTasks, addTask: addToStore } = useTaskStore()
  const { tags } = useTagStore()
  const { openEditModal, taskModalOpen } = useUiStore()

  const [detail, setDetail] = useState<GoalDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})

  const fetchDetail = async () => {
    if (!id) return
    try {
      const data = await goalsApi.getDetail(id)
      setDetail(data)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDetail() }, [id])

  const prevModalOpen = useRef(false)
  useEffect(() => {
    if (prevModalOpen.current && !taskModalOpen) fetchDetail()
    prevModalOpen.current = taskModalOpen
  }, [taskModalOpen])

  const toggleCollapsed = (phaseId: string) =>
    setCollapsedMap((m) => ({ ...m, [phaseId]: !m[phaseId] }))

  const collapseAll = () => {
    if (!detail) return
    const all: Record<string, boolean> = {}
    for (const p of detail.phases) all[p.id] = true
    setCollapsedMap(all)
  }

  const handleTaskClick = (task: Task) => {
    if (!storeTasks.find((t) => t.id === task.id)) addToStore(task)
    openEditModal(task.id)
  }

  const handleToggleTaskDone = async (task: Task, phaseId: string | null) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    const upd = (t: Task) => t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t
    setDetail((d) => {
      if (!d) return d
      if (phaseId) return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: p.tasks.map(upd) } : p) }
      return { ...d, unassignedTasks: d.unassignedTasks.map(upd) }
    })
    try {
      await tasksApi.update(task.id, { status: newStatus })
    } catch {
      const rev = (t: Task) => t.id === task.id ? task : t
      setDetail((d) => {
        if (!d) return d
        if (phaseId) return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: p.tasks.map(rev) } : p) }
        return { ...d, unassignedTasks: d.unassignedTasks.map(rev) }
      })
    }
  }

  const handleAddTask = async (title: string, goalId: string, phaseId?: string) => {
    const task = await tasksApi.create({
      id: nanoid(), title, goalId, phaseId,
      isAllDay: false, tagIds: [], status: 'todo', priority: 'medium',
    })
    addToStore(task)
    if (phaseId) adjustPhaseTaskCount(phaseId, 1)
    setDetail((d) => {
      if (!d) return d
      if (phaseId) return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: [...p.tasks, task] } : p) }
      return { ...d, unassignedTasks: [...d.unassignedTasks, task] }
    })
  }

  if (loading) return <div className={styles.page}><div className={styles.loading}>加载中…</div></div>
  if (notFound || !detail) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>目标不存在 <button className={styles.backLink} onClick={() => navigate(-1)}>返回</button></div>
      </div>
    )
  }

  const totalPhases = detail.phases.length
  const donePhases = detail.phases.filter((p) => p.isDone).length
  const allTasks = [...detail.phases.flatMap((p) => p.tasks), ...detail.unassignedTasks]
  const totalTasks = allTasks.length
  const doneTasks = allTasks.filter((t) => t.status === 'done' || t.status === 'cancelled').length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>‹ 返回</button>
          <GoalNameEditor
            name={detail.name}
            color={detail.color}
            onSave={async (name) => {
              setDetail((d) => d ? { ...d, name } : d)
              updateGoal(detail.id, { name })
              try { await goalsApi.update(detail.id, { name }) }
              catch { setDetail((d) => d ? { ...d, name: detail.name } : d); updateGoal(detail.id, { name: detail.name }) }
            }}
          />
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerStat}>阶段 <b>{donePhases}/{totalPhases}</b></span>
          <span className={styles.headerStat}>任务 <b>{doneTasks}/{totalTasks}</b></span>
          <button className={styles.ghostBtn} onClick={collapseAll}>收起全部</button>
        </div>
      </div>

      <div className={styles.scrollArea}>
        {/* Goal context bar */}
        <div className={styles.goalContext}>
          <GoalContextCell
            label="设立背景"
            value={detail.background ?? ''}
            placeholder="为什么要设立这个目标？"
            onSave={async (val) => {
              setDetail((d) => d ? { ...d, background: val } : d)
              updateGoal(detail.id, { background: val })
              try { await goalsApi.update(detail.id, { background: val }) }
              catch { setDetail((d) => d ? { ...d, background: detail.background } : d) }
            }}
          />
          <GoalContextCell
            label="成功标准"
            value={detail.successCriteria ?? ''}
            placeholder="达成什么才算完成这个目标？"
            accent
            onSave={async (val) => {
              setDetail((d) => d ? { ...d, successCriteria: val } : d)
              updateGoal(detail.id, { successCriteria: val })
              try { await goalsApi.update(detail.id, { successCriteria: val }) }
              catch { setDetail((d) => d ? { ...d, successCriteria: detail.successCriteria } : d) }
            }}
          />
        </div>

        {/* Phases */}
        <div className={styles.stages}>
          {detail.phases.map((phase, idx) => (
            <PhaseSection
              key={phase.id}
              phase={phase}
              index={idx + 1}
              collapsed={!!collapsedMap[phase.id]}
              onToggleCollapse={() => toggleCollapsed(phase.id)}
              onSavePhase={async (field, val) => {
                setDetail((d) => d ? {
                  ...d,
                  phases: d.phases.map((p) => p.id === phase.id ? { ...p, [field]: val } : p),
                } : d)
                updatePhase(detail.id, phase.id, { [field]: val })
                try { await goalsApi.updatePhase(phase.id, { [field]: val }) }
                catch {
                  const prev = (phase as unknown as Record<string, unknown>)[field]
                  setDetail((d) => d ? {
                    ...d,
                    phases: d.phases.map((p) => p.id === phase.id ? { ...p, [field]: prev } : p),
                  } : d)
                }
              }}
              onTaskClick={handleTaskClick}
              onToggleTaskDone={(task) => handleToggleTaskDone(task, phase.id)}
              onAddTask={(title) => handleAddTask(title, detail.id, phase.id)}
              tags={tags}
            />
          ))}

          {detail.unassignedTasks.length > 0 && (
            <div className={styles.stage}>
              <div className={styles.stageHead}>
                <span className={styles.stageTitle} style={{ color: 'var(--ink-faint)' }}>未分配阶段的任务</span>
              </div>
              <div className={styles.stageBody}>
                <div className={styles.stageBodyInner}>
                  <TaskArea
                    tasks={detail.unassignedTasks}
                    onTaskClick={handleTaskClick}
                    onToggleTaskDone={(task) => handleToggleTaskDone(task, null)}
                    onAddTask={(title) => handleAddTask(title, detail.id)}
                    tags={tags}
                  />
                </div>
              </div>
            </div>
          )}

          {detail.phases.length === 0 && detail.unassignedTasks.length === 0 && (
            <div className={styles.empty}>暂无阶段和任务</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Goal context cell ── */
function GoalContextCell({
  label, value, placeholder, accent, onSave,
}: {
  label: string; value: string; placeholder: string; accent?: boolean; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  useEffect(() => { setVal(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (val !== value) onSave(val)
  }

  return (
    <div className={`${styles.gcCell} ${accent ? styles.gcCellTarget : ''}`} onClick={() => !editing && setEditing(true)}>
      <span className={`${styles.gcLabel} ${accent ? styles.gcLabelTarget : ''}`}>{label}</span>
      {editing ? (
        <textarea
          className={`${styles.gcTextarea} ${accent ? styles.gcTextareaTarget : ''}`}
          value={val}
          autoFocus
          rows={3}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <p className={`${styles.gcVal} ${accent ? styles.gcValTarget : ''}`}>
          {value || <span className={styles.gcPlaceholder}>{placeholder}</span>}
        </p>
      )}
    </div>
  )
}

/* ── Goal name editor ── */
function GoalNameEditor({ name, color, onSave }: { name: string; color: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  useEffect(() => { setVal(name) }, [name])
  const commit = () => {
    setEditing(false)
    const t = val.trim()
    if (t && t !== name) onSave(t)
    else setVal(name)
  }
  return editing ? (
    <input
      className={styles.goalNameInput}
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(name); setEditing(false) } }}
    />
  ) : (
    <div className={styles.goalTitle} onClick={() => setEditing(true)}>
      <span className={styles.goalDot} style={{ background: color }} />
      <h2 className={styles.goalName}>{name}</h2>
    </div>
  )
}

/* ── Phase section ── */
function PhaseSection({
  phase, index, collapsed, onToggleCollapse, onSavePhase, onTaskClick, onToggleTaskDone, onAddTask, tags,
}: {
  phase: PhaseWithTasks; index: number; collapsed: boolean
  onToggleCollapse: () => void
  onSavePhase: (field: string, val: string) => void
  onTaskClick: (task: Task) => void
  onToggleTaskDone: (task: Task) => void
  onAddTask: (title: string) => void
  tags: Tag[]
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(phase.name)
  useEffect(() => { setNameVal(phase.name) }, [phase.name])

  const commitName = () => {
    setEditingName(false)
    const t = nameVal.trim()
    if (t && t !== phase.name) onSavePhase('name', t)
    else setNameVal(phase.name)
  }

  const doneTasks = phase.tasks.filter((t) => t.status === 'done' || t.status === 'cancelled').length
  const totalTasks = phase.tasks.length
  const pct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0

  return (
    <div className={`${styles.stage} ${phase.isDone ? styles.stageDone : ''}`}>
      <div className={styles.stageHead} onClick={onToggleCollapse}>
        <span className={`${styles.chev} ${collapsed ? styles.chevCollapsed : ''}`}>▾</span>
        <span className={`${styles.sidx} ${phase.isDone ? styles.sidxDone : ''}`}>{index}</span>
        {editingName ? (
          <input
            className={styles.stageNameInput}
            value={nameVal}
            autoFocus
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(phase.name); setEditingName(false) } }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`${styles.stageTitle} ${phase.isDone ? styles.stageTitleDone : ''}`}
            onClick={(e) => { e.stopPropagation(); setEditingName(true) }}
          >
            {phase.name}
          </span>
        )}
        <div className={styles.stageProgress}>
          <div className={styles.progressBar}>
            <i className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressRatio}>{doneTasks}/{totalTasks}</span>
        </div>
      </div>

      <div className={`${styles.stageBody} ${collapsed ? styles.stageBodyCollapsed : ''}`}>
        <div className={styles.stageBodyInner}>
          {/* Context grid */}
          <div className={styles.ctxGrid}>
            <div className={styles.ctxSide}>
              <CtxCell kind="reason" label="设立理由" value={phase.reason ?? ''} placeholder="为什么需要这个阶段？" onSave={(v) => onSavePhase('reason', v)} />
              <CtxCell kind="criteria" label="完成标准" value={phase.completionCriteria ?? ''} placeholder="达成什么才算完成？" onSave={(v) => onSavePhase('completionCriteria', v)} />
            </div>
            <CtxCell kind="status" label="现状" value={phase.currentState ?? ''} placeholder="目前进展如何？" onSave={(v) => onSavePhase('currentState', v)} />
          </div>
          <TaskArea tasks={phase.tasks} onTaskClick={onTaskClick} onToggleTaskDone={onToggleTaskDone} onAddTask={onAddTask} tags={tags} />
        </div>
      </div>
    </div>
  )
}

/* ── Context cell (inline editable) ── */
function CtxCell({
  kind, label, value, placeholder, onSave,
}: {
  kind: 'reason' | 'criteria' | 'status'; label: string; value: string; placeholder: string; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  useEffect(() => { setVal(value) }, [value])

  const commit = () => {
    setEditing(false)
    if (val !== value) onSave(val)
  }

  const kindClass = kind === 'reason' ? styles.ctxReason : kind === 'criteria' ? styles.ctxCriteria : styles.ctxStatus

  return (
    <div className={`${styles.ctxCell} ${kindClass}`} onClick={() => !editing && setEditing(true)}>
      <div className={styles.ctxLabel}>{label}</div>
      {editing ? (
        <textarea
          className={styles.ctxTextarea}
          value={val}
          autoFocus
          rows={kind === 'status' ? 5 : 3}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className={styles.ctxVal}>
          {value || <span className={styles.ctxPlaceholder}>{placeholder}</span>}
        </div>
      )}
    </div>
  )
}

/* ── Task area ── */
function TaskArea({
  tasks, onTaskClick, onToggleTaskDone, onAddTask, tags,
}: {
  tasks: Task[]; onTaskClick: (t: Task) => void; onToggleTaskDone: (t: Task) => void; onAddTask: (title: string) => void; tags: Tag[]
}) {
  const [showDone, setShowDone] = useState(false)
  const activeTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  return (
    <div className={styles.tasks}>
      <div className={styles.tasksBar}>
        <span className={styles.tasksLabel}>任务</span>
      </div>
      {activeTasks.map((task) => (
        <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} onToggleDone={onToggleTaskDone} tags={tags} />
      ))}
      {tasks.length === 0 && <div className={styles.taskEmpty}>暂无任务</div>}
      {doneTasks.length > 0 && (
        <div className={styles.doneGroup}>
          <div className={styles.doneToggle} onClick={() => setShowDone((v) => !v)}>
            <span className={`${styles.doneChev} ${showDone ? styles.doneChevOpen : ''}`}>›</span>
            <span>已完成</span>
            <span className={styles.doneCnt}>{doneTasks.length}</span>
          </div>
          {showDone && doneTasks.map((task) => (
            <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} onToggleDone={onToggleTaskDone} tags={tags} />
          ))}
        </div>
      )}
      <AddTaskRow onAdd={onAddTask} />
    </div>
  )
}

/* ── Task row ── */
function TaskRow({
  task, onTaskClick, onToggleDone, tags,
}: {
  task: Task; onTaskClick: (t: Task) => void; onToggleDone: (t: Task) => void; tags: Tag[]
}) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  const taskTags = tags.filter((tg) => task.tagIds.includes(tg.id))

  return (
    <div className={`${styles.task} ${isDone ? styles.taskDone : ''}`}>
      <button
        className={`${styles.taskCheck} ${isDone ? styles.taskCheckDone : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleDone(task) }}
        aria-label={isDone ? '标记未完成' : '标记完成'}
      >
        {isDone && '✓'}
      </button>
      <span className={styles.taskTitle} onClick={() => onTaskClick(task)}>{task.title}</span>
      <div className={styles.taskRight}>
        {taskTags.map((tg) => (
          <span key={tg.id} className={styles.tagChip} style={{ color: tg.color }}>
            <span className={styles.tagDot} style={{ background: tg.color }} />
            {tg.name}
          </span>
        ))}
        {task.status !== 'todo' && task.status !== 'done' && task.status !== 'cancelled' && (
          <span className={styles.taskBadgeInProgress}>{STATUS_LABEL[task.status]}</span>
        )}
        {task.status === 'todo' && (
          <span className={styles.taskBadgeTodo}>{STATUS_LABEL.todo}</span>
        )}
      </div>
    </div>
  )
}

/* ── Add task row ── */
function AddTaskRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const t = val.trim()
    if (t) { onAdd(t); setVal('') }
    setActive(false)
  }

  return (
    <div
      className={`${styles.addTask} ${active ? styles.addTaskActive : ''}`}
      onClick={() => { if (!active) { setActive(true); setTimeout(() => inputRef.current?.focus(), 0) } }}
    >
      <span className={styles.addTaskPlus}>＋</span>
      {active ? (
        <input
          ref={inputRef}
          className={styles.addTaskInput}
          placeholder="输入任务名称，回车创建"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') { setVal(''); setActive(false) } }}
          onBlur={submit}
          autoFocus
        />
      ) : (
        <span>添加任务</span>
      )}
    </div>
  )
}
