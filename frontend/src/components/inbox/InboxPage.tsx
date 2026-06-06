import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGoalStore } from '@/stores/goalStore'
import { useUiStore } from '@/stores/uiStore'
import { useTaskStore } from '@/stores/taskStore'
import { tasksApi } from '@/api/tasks'
import type { Task } from '@time-manage/shared'
import styles from './InboxPage.module.css'

type FilterMode = 'inbox' | 'all'

export default function InboxPage() {
  const { goalId } = useParams<{ goalId: string }>()
  const { goals, fetchGoals } = useGoalStore()
  const { openCreateModal, openEditModal, taskModalOpen } = useUiStore()
  const { tasks: storeTasks, addTask: addToStore } = useTaskStore()
  const navigate = useNavigate()

  const [filter, setFilter] = useState<FilterMode>('inbox')
  const [inboxTasks, setInboxTasks] = useState<Task[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const goal = goals.find((g) => g.id === goalId)

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const fetchTasks = () => {
    if (!goalId) return
    setLoading(true)
    Promise.all([
      tasksApi.listInbox(goalId),
      tasksApi.listAllByGoal(goalId),
    ]).then(([inbox, all]) => {
      setInboxTasks(inbox)
      setAllTasks(all)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTasks()
  }, [goalId])

  // 弹窗关闭后刷新列表（新建或编辑可能改变排期状态）
  const prevModalOpen = useRef(false)
  useEffect(() => {
    if (prevModalOpen.current && !taskModalOpen) fetchTasks()
    prevModalOpen.current = taskModalOpen
  }, [taskModalOpen])

  const displayTasks = filter === 'inbox' ? inboxTasks : allTasks

  const handleCreate = () => {
    openCreateModal({ isAllDay: false, goalId: goalId ?? undefined })
  }

  const handleSchedule = (task: Task) => {
    const now = new Date()
    const end = new Date(now.getTime() + 60 * 60_000)
    openCreateModal({ start: now, end, isAllDay: false, prefillTaskId: task.id })
    navigate('/calendar')
  }

  const handleEdit = (task: Task) => {
    if (!storeTasks.find((t) => t.id === task.id)) {
      addToStore(task)
    }
    openEditModal(task.id)
  }

  if (loading) return <div className={styles.page}><div className={styles.loading}>加载中…</div></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          {goal && <span className={styles.headerDot} style={{ background: goal.color }} />}
          <h1>{goal?.name ?? '目标'}</h1>
          <span className={styles.headerCount}>{displayTasks.length}</span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.filterTabs}>
            <button
              className={`${styles.filterTab} ${filter === 'inbox' ? styles.filterTabActive : ''}`}
              onClick={() => setFilter('inbox')}
            >
              未排期
            </button>
            <button
              className={`${styles.filterTab} ${filter === 'all' ? styles.filterTabActive : ''}`}
              onClick={() => setFilter('all')}
            >
              全部任务
            </button>
          </div>
          <button className={styles.createBtn} onClick={handleCreate}>
            ＋ 新建任务
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {displayTasks.map((task) => {
          const phase = goal?.phases.find((p) => p.id === task.phaseId)
          return (
            <TaskCard
              key={task.id}
              task={task}
              phaseLabel={phase?.name}
              goalColor={goal?.color}
              showScheduleBtn={!task.startTime}
              onSchedule={handleSchedule}
              onEdit={handleEdit}
            />
          )
        })}

        {displayTasks.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✓</div>
            <div className={styles.emptyText}>
              {filter === 'inbox' ? '没有未排期任务' : '暂无任务'}
            </div>
          </div>
        )}
      </div>

      {filter === 'inbox' && <div className={styles.footer}>点击「排期」跳转日历安排时间</div>}
    </div>
  )
}

function TaskCard({
  task,
  phaseLabel,
  goalColor,
  showScheduleBtn,
  onSchedule,
  onEdit,
}: {
  task: Task
  phaseLabel?: string
  goalColor?: string
  showScheduleBtn: boolean
  onSchedule: (task: Task) => void
  onEdit: (task: Task) => void
}) {
  return (
    <div className={`${styles.taskCard} ${task.status === 'done' ? styles.taskCardDone : ''}`} onClick={() => onEdit(task)}>
      <div className={styles.taskCardBar} style={{ background: goalColor ?? 'var(--line-strong)' }} />
      <div className={styles.taskCardBody}>
        <span className={styles.taskCardTitle}>{task.title}</span>
        <div className={styles.taskCardMeta}>
          {phaseLabel && (
            <span
              className={styles.taskCardPhase}
              style={{
                background: goalColor ? goalColor + '22' : undefined,
                color: goalColor,
                borderColor: goalColor,
              }}
            >
              {phaseLabel}
            </span>
          )}
          {task.startTime && (
            <span className={styles.taskCardScheduled}>已排期</span>
          )}
          {task.status === 'done' && (
            <span className={styles.taskCardDoneTag}>已完成</span>
          )}
        </div>
      </div>
      {showScheduleBtn && (
        <button
          className={styles.scheduleBtn}
          onClick={(e) => { e.stopPropagation(); onSchedule(task) }}
        >
          排期 →
        </button>
      )}
    </div>
  )
}
