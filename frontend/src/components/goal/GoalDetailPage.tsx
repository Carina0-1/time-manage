import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Task } from '@time-manage/shared'
import { goalsApi } from '@/api/goals'
import type { GoalDetail, PhaseWithTasks } from '@/api/goals'
import { useGoalStore } from '@/stores/goalStore'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import styles from './GoalDetailPage.module.css'

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '完成',
  cancelled: '取消',
}

const STATUS_CLASS: Record<string, string> = {
  todo: styles.statusTodo,
  in_progress: styles.statusInProgress,
  done: styles.statusDone,
  cancelled: styles.statusCancelled,
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { updateGoal, updatePhase } = useGoalStore()
  const { tasks: storeTasks, addTask: addToStore } = useTaskStore()
  const { openEditModal, taskModalOpen } = useUiStore()

  const [detail, setDetail] = useState<GoalDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  useEffect(() => {
    fetchDetail()
  }, [id])

  // TaskModal 关闭后刷新任务列表
  const prevModalOpen = useRef(false)
  useEffect(() => {
    if (prevModalOpen.current && !taskModalOpen) fetchDetail()
    prevModalOpen.current = taskModalOpen
  }, [taskModalOpen])

  const handleTaskClick = (task: Task) => {
    if (!storeTasks.find((t) => t.id === task.id)) {
      addToStore(task)
    }
    openEditModal(task.id)
  }

  if (loading) {
    return <div className={styles.page}><div className={styles.loading}>加载中…</div></div>
  }
  if (notFound || !detail) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>目标不存在 <button className={styles.backLink} onClick={() => navigate(-1)}>返回</button></div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
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

      <div className={styles.content}>
        <section className={styles.metaSection}>
          <div className={styles.metaGrid}>
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
            <AutosaveTextarea
              label="成功标准"
              placeholder="达成什么才算完成这个目标？"
              value={detail.successCriteria ?? ''}
              onSave={async (val) => {
                setDetail((d) => d ? { ...d, successCriteria: val } : d)
                updateGoal(detail.id, { successCriteria: val })
                try { await goalsApi.update(detail.id, { successCriteria: val }) }
                catch { setDetail((d) => d ? { ...d, successCriteria: detail.successCriteria } : d) }
              }}
            />
          </div>
        </section>

        <div className={styles.phaseList}>
          {detail.phases.map((phase) => (
            <PhaseSection
              key={phase.id}
              phase={phase}
              goalColor={detail.color}
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
            />
          ))}

          {detail.unassignedTasks.length > 0 && (
            <div className={styles.phaseSection}>
              <div className={styles.phaseSectionHeader}>
                <span className={styles.phaseNameText} style={{ color: 'var(--ink-faint)' }}>未分配阶段的任务</span>
              </div>
              <TaskList tasks={detail.unassignedTasks} onTaskClick={handleTaskClick} />
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
  phase,
  goalColor,
  onSavePhase,
  onTaskClick,
}: {
  phase: PhaseWithTasks
  goalColor: string
  onSavePhase: (field: string, val: string) => void
  onTaskClick: (task: Task) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
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
    <div className={styles.phaseSection} style={{ borderLeftColor: goalColor }}>
      <div className={styles.phaseSectionHeader}>
        <button className={styles.collapseBtn} onClick={() => setCollapsed((v) => !v)}>
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
              label="完成标准"
              placeholder="达成什么才算完成这个阶段？"
              value={phase.completionCriteria ?? ''}
              onSave={(val) => onSavePhase('completionCriteria', val)}
            />
          </div>
          <TaskList tasks={phase.tasks} onTaskClick={onTaskClick} />
        </>
      )}
    </div>
  )
}

function TaskRow({ task, onTaskClick }: { task: Task; onTaskClick: (t: Task) => void }) {
  return (
    <div
      className={`${styles.taskRow} ${task.status === 'done' || task.status === 'cancelled' ? styles.taskRowDone : ''}`}
      onClick={() => onTaskClick(task)}
    >
      <span className={`${styles.statusBadge} ${STATUS_CLASS[task.status] ?? ''}`}>
        {STATUS_LABEL[task.status] ?? task.status}
      </span>
      <span className={styles.taskTitle}>{task.title}</span>
      {task.expectedOutput && (
        <span className={styles.taskOutput}>{task.expectedOutput}</span>
      )}
    </div>
  )
}

function TaskList({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const [showDone, setShowDone] = useState(false)

  const activeTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  if (tasks.length === 0) return <div className={styles.taskEmpty}>暂无任务</div>

  return (
    <div className={styles.taskList}>
      {activeTasks.map((task) => (
        <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} />
      ))}
      {doneTasks.length > 0 && (
        <>
          <div className={styles.doneToggle} onClick={() => setShowDone((v) => !v)}>
            <span className={styles.doneToggleIcon}>{showDone ? '▾' : '▸'}</span>
            <span className={styles.doneToggleLabel}>已完成</span>
            <span className={styles.doneToggleCount}>{doneTasks.length}</span>
          </div>
          {showDone && doneTasks.map((task) => (
            <TaskRow key={task.id} task={task} onTaskClick={onTaskClick} />
          ))}
        </>
      )}
    </div>
  )
}

function AutosaveTextarea({
  label,
  placeholder,
  value,
  onSave,
}: {
  label: string
  placeholder: string
  value: string
  onSave: (val: string) => void
}) {
  const [val, setVal] = useState(value)

  useEffect(() => { setVal(value) }, [value])

  const handleBlur = () => {
    if (val !== value) onSave(val)
  }

  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <textarea
        className={styles.fieldTextarea}
        placeholder={placeholder}
        value={val}
        rows={3}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  )
}
