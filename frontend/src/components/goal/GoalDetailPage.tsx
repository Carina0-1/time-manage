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
    const updateTask = (t: Task) => t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t
    setDetail((d) => {
      if (!d) return d
      if (phaseId) {
        return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: p.tasks.map(updateTask) } : p) }
      }
      return { ...d, unassignedTasks: d.unassignedTasks.map(updateTask) }
    })
    try {
      await tasksApi.update(task.id, { status: newStatus })
    } catch {
      setDetail((d) => {
        if (!d) return d
        const revert = (t: Task) => t.id === task.id ? task : t
        if (phaseId) {
          return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: p.tasks.map(revert) } : p) }
        }
        return { ...d, unassignedTasks: d.unassignedTasks.map(revert) }
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
      if (phaseId) {
        return { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, tasks: [...p.tasks, task] } : p) }
      }
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
          <button className={styles.backBtn} onClick={() => navigate(-1)}>← 返回</button>
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
          <span className={styles.headerStat}><span className={styles.headerStatLabel}>阶段</span> {donePhases}/{totalPhases}</span>
          <span className={styles.headerStat}><span className={styles.headerStatLabel}>任务</span> {doneTasks}/{totalTasks}</span>
          <button className={styles.collapseAllBtn} onClick={collapseAll}>收起全部</button>
        </div>
      </div>

      <div className={styles.content}>
        <section className={styles.metaSection}>
          <div className={styles.metaGrid}>
            <div className={styles.metaCell}>
              <AutosaveTextarea
                label="设立背景"
                placeholder="为什么要设立这个目标？背景是什么？"
                value={detail.background ?? ''}
                onSave={async (val) => {
                  setDetail((d) => d ? { ...d, background: val } : d)
                  updateGoal(detail.id, { background: val })
                  try { await goalsApi.update(detail.id, { background: val }) }
                  catch { setDetail((d) => d ? { ...d, background: detail.background } : d) }
                }}
              />
            </div>
            <div className={styles.metaCellSuccess}>
              <AutosaveTextarea
                label="成功标准"
                placeholder="达成什么才算完成这个目标？"
                value={detail.successCriteria ?? ''}
                accent
                onSave={async (val) => {
                  setDetail((d) => d ? { ...d, successCriteria: val } : d)
                  updateGoal(detail.id, { successCriteria: val })
                  try { await goalsApi.update(detail.id, { successCriteria: val }) }
                  catch { setDetail((d) => d ? { ...d, successCriteria: detail.successCriteria } : d) }
                }}
              />
            </div>
          </div>
        </section>

        <div className={styles.phaseList}>
          {detail.phases.map((phase) => (
            <PhaseSection
              key={phase.id}
              phase={phase}
              goalColor={detail.color}
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
            <div className={styles.phaseSection}>
              <div className={styles.phaseSectionHeader}>
                <span className={styles.phaseNameText} style={{ color: 'var(--ink-faint)' }}>未分配阶段的任务</span>
              </div>
              <TaskList
                tasks={detail.unassignedTasks}
                onTaskClick={handleTaskClick}
                onToggleTaskDone={(task) => handleToggleTaskDone(task, null)}
                onAddTask={(title) => handleAddTask(title, detail.id)}
                tags={tags}
              />
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

function GoalNameEditor({ name, color, onSave }: { name: string; color: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  useEffect(() => { setVal(name) }, [name])
  const commit = () => {
    setEditing(false)
    const trimmed = val.trim()
    if (trimmed && trimmed !== name) onSave(trimmed)
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
    <h1 className={styles.goalName} onClick={() => setEditing(true)}>
      <span className={styles.goalDot} style={{ background: color }} />
      {name}
    </h1>
  )
}

function PhaseSection({
  phase, goalColor, collapsed, onToggleCollapse, onSavePhase, onTaskClick, onToggleTaskDone, onAddTask, tags,
}: {
  phase: PhaseWithTasks
  goalColor: string
  collapsed: boolean
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
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== phase.name) onSavePhase('name', trimmed)
    else setNameVal(phase.name)
  }

  return (
    <div className={styles.phaseSection}>
      <div className={styles.phaseSectionHeader}>
        <button className={styles.collapseBtn} onClick={onToggleCollapse} style={{ color: goalColor }}>
          {collapsed ? '▸' : '▾'}
        </button>
        {editingName ? (
          <input
            className={styles.phaseNameInput}
            value={nameVal}
            autoFocus
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(phase.name); setEditingName(false) } }}
          />
        ) : (
          <span
            className={`${styles.phaseNameText} ${phase.isDone ? styles.phaseNameDone : ''}`}
            onClick={() => setEditingName(true)}
          >
            {phase.name}
          </span>
        )}
        {phase.isDone && <span className={styles.phaseDoneBadge}>已完成</span>}
        <span className={styles.phaseTaskCount}>{phase.tasks.length} 个任务</span>
      </div>

      {!collapsed && (
        <>
          <div className={styles.phaseMetaGrid}>
            <AutosaveTextarea
              label="设立理由"
              placeholder="为什么需要这个阶段？"
              value={phase.reason ?? ''}
              onSave={(val) => onSavePhase('reason', val)}
            />
            <AutosaveTextarea
              label="现状"
              placeholder="目前进展如何？"
              value={phase.currentState ?? ''}
              onSave={(val) => onSavePhase('currentState', val)}
            />
            <div className={styles.completionField}>
              <AutosaveTextarea
                label="完成标准"
                placeholder="达成什么才算完成这个阶段？"
                value={phase.completionCriteria ?? ''}
                onSave={(val) => onSavePhase('completionCriteria', val)}
              />
            </div>
          </div>
          <div className={styles.taskSectionLabel}>任务</div>
          <TaskList
            tasks={phase.tasks}
            onTaskClick={onTaskClick}
            onToggleTaskDone={onToggleTaskDone}
            onAddTask={onAddTask}
            tags={tags}
          />
        </>
      )}
    </div>
  )
}

function TaskRow({
  task, onTaskClick, onToggleDone, tags,
}: {
  task: Task
  onTaskClick: (t: Task) => void
  onToggleDone: (t: Task) => void
  tags: Tag[]
}) {
  const isDone = task.status === 'done' || task.status === 'cancelled'
  const taskTags = tags.filter((tg) => task.tagIds.includes(tg.id))

  return (
    <div className={`${styles.taskRow} ${isDone ? styles.taskRowDone : ''}`}>
      <button
        className={`${styles.taskCheckbox} ${isDone ? styles.taskCheckboxDone : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleDone(task) }}
        aria-label={isDone ? '标记未完成' : '标记完成'}
      />
      <span className={styles.taskTitle} onClick={() => onTaskClick(task)}>
        {task.title}
      </span>
      <div className={styles.taskMeta}>
        {taskTags.map((tg) => (
          <span key={tg.id} className={styles.taskTag}>
            <span className={styles.taskTagDot} style={{ background: tg.color }} />
            {tg.name}
          </span>
        ))}
        {task.status !== 'todo' && (
          <span className={`${styles.taskStatus} ${task.status === 'in_progress' ? styles.taskStatusInProgress : task.status === 'cancelled' ? styles.taskStatusCancelled : ''}`}>
            {STATUS_LABEL[task.status]}
          </span>
        )}
      </div>
    </div>
  )
}

function AddTaskRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const trimmed = val.trim()
    if (trimmed) { onAdd(trimmed); setVal('') }
    setActive(false)
  }

  return (
    <div
      className={`${styles.addTaskRow} ${active ? styles.addTaskRowActive : ''}`}
      onClick={() => { if (!active) { setActive(true); setTimeout(() => inputRef.current?.focus(), 0) } }}
    >
      <span className={styles.addTaskPlus}>+</span>
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
        <span className={styles.addTaskLabel}>添加任务</span>
      )}
    </div>
  )
}

function TaskList({
  tasks, onTaskClick, onToggleTaskDone, onAddTask, tags,
}: {
  tasks: Task[]
  onTaskClick: (t: Task) => void
  onToggleTaskDone: (t: Task) => void
  onAddTask: (title: string) => void
  tags: Tag[]
}) {
  const [showDone, setShowDone] = useState(false)
  const activeTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  return (
    <div className={styles.taskList}>
      {activeTasks.map((task) => (
        <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} onToggleDone={onToggleTaskDone} tags={tags} />
      ))}
      {tasks.length === 0 && <div className={styles.taskEmpty}>暂无任务</div>}
      {doneTasks.length > 0 && (
        <>
          <div className={styles.doneToggle} onClick={() => setShowDone((v) => !v)}>
            <span className={styles.doneToggleIcon}>{showDone ? '▾' : '▸'}</span>
            <span className={styles.doneToggleLabel}>已完成</span>
            <span className={styles.doneToggleCount}>{doneTasks.length}</span>
          </div>
          {showDone && doneTasks.map((task) => (
            <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} onToggleDone={onToggleTaskDone} tags={tags} />
          ))}
        </>
      )}
      <AddTaskRow onAdd={onAddTask} />
    </div>
  )
}

function AutosaveTextarea({
  label, placeholder, value, onSave, accent,
}: {
  label: string
  placeholder: string
  value: string
  onSave: (val: string) => void
  accent?: boolean
}) {
  const [val, setVal] = useState(value)
  useEffect(() => { setVal(value) }, [value])
  const handleBlur = () => { if (val !== value) onSave(val) }

  return (
    <div className={`${styles.field} ${accent ? styles.fieldAccent : ''}`}>
      <div className={`${styles.fieldLabel} ${accent ? styles.fieldLabelAccent : ''}`}>
        <span className={styles.fieldDot} />
        {label}
      </div>
      <textarea
        className={`${styles.fieldTextarea} ${accent ? styles.fieldTextareaAccent : ''}`}
        placeholder={placeholder}
        value={val}
        rows={2}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}
