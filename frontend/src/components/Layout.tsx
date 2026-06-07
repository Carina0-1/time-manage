import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import QuickCreatePanel from './task/QuickCreatePanel'
import TaskModal from './task/TaskModal'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { buildTagTree } from '@/utils/tagTree'
import type { TagTreeNode } from '@/utils/tagTree'
import type { Tag } from '@time-manage/shared'
import { useTagStore } from '@/stores/tagStore'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useGoalStore } from '@/stores/goalStore'
import { tagsApi } from '@/api/tags'
import { goalsApi } from '@/api/goals'
import { statsApi } from '@/api/stats'

import styles from './Layout.module.css'

const PRESET_EMOJIS = [
  // 工作 & 学习
  '💼', '📁', '📂', '📋', '📌', '📍', '✏️', '📝', '📖', '📚',
  '🖥️', '💻', '⌨️', '🖨️', '📱', '☎️', '📧', '📨', '📩', '🗂️',
  // 生活 & 健康
  '🏠', '🏡', '🛒', '🍽️', '☕', '🍎', '🥗', '💊', '🏃', '🧘',
  '💪', '🛌', '🚗', '✈️', '🚂', '🚲', '🛵', '⛽', '🗺️', '🏖️',
  // 娱乐 & 兴趣
  '🎮', '🎵', '🎸', '🎨', '📷', '🎬', '📺', '📻', '🎤', '🎭',
  '⚽', '🏀', '🎾', '🏋️', '🎯', '♟️', '🃏', '🎲', '🎪', '🎠',
  // 财务 & 目标
  '💰', '💳', '📈', '📉', '🏦', '💹', '💎', '🏆', '🥇', '⭐',
  '✅', '🔑', '🔒', '🔓', '⚡', '🔥', '💡', '🌟', '🎉', '🎊',
  // 自然 & 情感
  '🌱', '🌿', '🌸', '🌻', '🍀', '🌈', '☀️', '🌙', '⛅', '❄️',
  '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '💕', '😊',
]

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1a1a1a',
]

const TagFormSchema = z.object({
  name: z.string().min(1, '请输入标签名').max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择颜色'),
  icon: z.string().optional(),
})
type TagFormValues = z.infer<typeof TagFormSchema>

export default function Layout() {
  const navigate = useNavigate()
  const { taskModalOpen, panelPos } = useUiStore()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brand} onClick={() => navigate('/calendar')}>
          <span className={styles.brandDot} />
          <span className={styles.brandName}>TiGo</span>
        </div>
        <SidebarStats onClickStats={() => navigate('/stats')} />
        <ActivityHeatmap />
        <GoalTreeNav />
        <TagTreeNav />
        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarUsername}>{user?.username}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>退出</button>
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
      {taskModalOpen && panelPos && <QuickCreatePanel />}
      {taskModalOpen && !panelPos && <TaskModal />}
    </div>
  )
}

function SidebarStats({ onClickStats }: { onClickStats: () => void }) {
  const { tasks } = useTaskStore()
  const { goals } = useGoalStore()
  const [activeDays, setActiveDays] = useState(0)

  const activeGoalCount = goals.filter((g) => g.status !== 'archived').length

  useEffect(() => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 90)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    statsApi.get(fmt(start), fmt(end))
      .then((result) => setActiveDays(result.dailyActivity.length))
      .catch(() => {})
  }, [])

  return (
    <div className={styles.sidebarStats} onClick={onClickStats} title="查看统计">
      <div className={styles.statItem}>
        <span className={styles.statNum}>{tasks.length}</span>
        <span className={styles.statLabel}>任务</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{activeGoalCount}</span>
        <span className={styles.statLabel}>目标</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{activeDays}</span>
        <span className={styles.statLabel}>天</span>
      </div>
    </div>
  )
}

function ActivityHeatmap() {
  const [activityMap, setActivityMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 104) // ~15 weeks
    statsApi.get(start.toISOString(), end.toISOString())
      .then((result) => {
        const map = new Map<string, number>()
        for (const { date, taskCount } of result.dailyActivity) {
          map.set(date, taskCount)
        }
        setActivityMap(map)
      })
      .catch(() => {})
  }, [])

  // Build 15-week grid ending today, starting from Monday
  const today = new Date()
  const dayOfWeek = (today.getDay() + 6) % 7 // Mon=0 … Sun=6
  const gridEnd = new Date(today)
  // Advance to end of current week (Sunday)
  gridEnd.setDate(gridEnd.getDate() + (6 - dayOfWeek))
  const gridStart = new Date(gridEnd)
  gridStart.setDate(gridStart.getDate() - 15 * 7 + 1)

  const cells: { date: string; count: number }[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    const key = cur.toISOString().slice(0, 10)
    cells.push({ date: key, count: activityMap.get(key) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }

  const heatColor = (count: number) => {
    if (count === 0) return 'var(--heat-0)'
    if (count <= 1) return 'var(--heat-1)'
    if (count <= 3) return 'var(--heat-2)'
    if (count <= 5) return 'var(--heat-3)'
    return 'var(--heat-4)'
  }

  // Rearrange: rows = Mon~Sun (7 rows), columns = weeks
  // cells are already in chronological order (Mon to Sun week by week)
  const numWeeks = Math.ceil(cells.length / 7)
  // Build row-major order: row 0 = all Mondays, row 1 = all Tuesdays, etc.
  const rows: typeof cells[] = Array.from({ length: 7 }, () => [])
  cells.forEach((cell, i) => {
    rows[i % 7].push(cell)
  })

  return (
    <div className={styles.heatmap}>
      <div className={styles.heatmapGrid} style={{ gridTemplateColumns: `repeat(${numWeeks}, 1fr)` }}>
        {rows.map((row) =>
          row.map((cell) => (
            <div
              key={cell.date}
              className={styles.heatmapCell}
              style={{ background: heatColor(cell.count) }}
              title={`${cell.date}${cell.count ? `：${cell.count} 个任务` : ''}`}
            />
          ))
        )}
      </div>
    </div>
  )
}

function GoalTreeNav() {
  const { goals, fetchGoals, addGoal, updateGoal, removeGoal, addPhase, updatePhase } = useGoalStore()
  const { activeGoalFilter, setGoalFilter } = useUiStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())
  const [addingPhaseGoalId, setAddingPhaseGoalId] = useState<string | null>(null)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [goalContextMenu, setGoalContextMenu] = useState<{ goalId: string; x: number; y: number } | null>(null)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const {
    register: goalRegister,
    handleSubmit: goalHandleSubmit,
    reset: goalReset,
    setValue: goalSetValue,
    watch: goalWatch,
    formState: { errors: goalErrors, isSubmitting: goalIsSubmitting },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(GoalFormSchema),
    defaultValues: { color: PRESET_COLORS[0] },
  })
  const selectedGoalColor = goalWatch('color')

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const toggleExpand = (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev)
      next.has(goalId) ? next.delete(goalId) : next.add(goalId)
      return next
    })
  }

  const handleGoalClick = (goalId: string) => {
    if (activeGoalFilter?.type === 'goal' && activeGoalFilter.id === goalId) {
      setGoalFilter(null)
    } else {
      setGoalFilter({ type: 'goal', id: goalId })
    }
    if (location.pathname !== '/calendar') navigate('/calendar')
  }

  const handlePhaseClick = (e: React.MouseEvent, phaseId: string) => {
    e.stopPropagation()
    if (activeGoalFilter?.type === 'phase' && activeGoalFilter.id === phaseId) {
      setGoalFilter(null)
    } else {
      setGoalFilter({ type: 'phase', id: phaseId })
    }
    if (location.pathname !== '/calendar') navigate('/calendar')
  }

  const handlePhaseCheck = async (e: React.MouseEvent, goalId: string, phaseId: string, isDone: boolean) => {
    e.stopPropagation()
    updatePhase(goalId, phaseId, { isDone: !isDone })
    try {
      await goalsApi.updatePhase(phaseId, { isDone: !isDone })
    } catch {
      updatePhase(goalId, phaseId, { isDone })
    }
  }

  const handleAddPhase = async (goalId: string) => {
    const name = newPhaseName.trim()
    if (!name) { setAddingPhaseGoalId(null); return }
    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return
    const id = nanoid()
    const sortOrder = goal.phases.length
    const phase = await goalsApi.createPhase({ id, goalId, name, sortOrder, isDone: false })
    addPhase(goalId, { ...phase, taskCount: 0 })
    setNewPhaseName('')
    setAddingPhaseGoalId(null)
  }

  const openGoalCreate = () => {
    setEditingGoalId(null)
    goalReset({ name: '', color: PRESET_COLORS[0], icon: '' })
    setShowGoalForm(true)
  }

  const openGoalEdit = (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return
    setEditingGoalId(goalId)
    goalReset({ name: goal.name, color: goal.color, icon: goal.icon ?? '' })
    setShowGoalForm(true)
    setGoalContextMenu(null)
  }

  const handleGoalDelete = async (goalId: string) => {
    await goalsApi.remove(goalId)
    removeGoal(goalId)
    if (activeGoalFilter?.id === goalId) setGoalFilter(null)
    setGoalContextMenu(null)
  }

  const handleGoalArchive = async (goalId: string) => {
    const updated = await goalsApi.update(goalId, { status: 'archived' })
    updateGoal(goalId, updated)
    if (activeGoalFilter?.id === goalId) setGoalFilter(null)
    setGoalContextMenu(null)
  }

  const handleGoalUnarchive = async (goalId: string) => {
    const updated = await goalsApi.update(goalId, { status: 'active' })
    updateGoal(goalId, updated)
    setGoalContextMenu(null)
  }

  const onGoalSubmit = async (data: GoalFormValues) => {
    if (editingGoalId) {
      const updated = await goalsApi.update(editingGoalId, data)
      updateGoal(editingGoalId, updated)
    } else {
      const nextOrder = goals.length > 0 ? Math.max(...goals.map((g) => g.sortOrder)) + 1 : 0
      const created = await goalsApi.create({ id: nanoid(), sortOrder: nextOrder, status: 'active', ...data })
      addGoal(created)
      setExpandedGoals((prev) => new Set([...prev, created.id]))
    }
    setShowGoalForm(false)
  }

  const activeGoals = goals.filter((g) => g.status !== 'archived')
  const archivedGoals = goals.filter((g) => g.status === 'archived')

  const renderGoalRow = (goal: typeof goals[0]) => {
    const expanded = expandedGoals.has(goal.id)
    const doneCount = goal.phases.filter((p) => p.isDone).length
    const totalCount = goal.phases.length
    const isActive = activeGoalFilter?.type === 'goal' && activeGoalFilter.id === goal.id
    const isArchived = goal.status === 'archived'

    return (
      <React.Fragment key={goal.id}>
        <div
          className={`${styles.goalRow} ${isActive ? styles.goalRowActive : ''} ${isArchived ? styles.goalRowArchived : ''}`}
          onClick={() => handleGoalClick(goal.id)}
        >
          <span
            className={styles.goalExpandIcon}
            onClick={(e) => { e.stopPropagation(); toggleExpand(goal.id) }}
          >
            {expanded ? '▾' : '▸'}
          </span>
          <span className={styles.goalDot} style={{ background: goal.color, opacity: isArchived ? 0.4 : 1 }} />
          {goal.icon && <span>{goal.icon}</span>}
          <span className={styles.goalName}>{goal.name}</span>
          {totalCount > 0 && (
            <span className={styles.goalProgress}>{doneCount}/{totalCount}</span>
          )}
          <button
            className={styles.goalMenuBtn}
            onClick={(e) => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setGoalContextMenu({ goalId: goal.id, x: rect.right, y: rect.bottom })
            }}
          >…</button>
        </div>

        {expanded && (
          <>
            {goal.phases.map((phase) => {
              const isPhaseActive = activeGoalFilter?.type === 'phase' && activeGoalFilter.id === phase.id
              return (
                <div
                  key={phase.id}
                  className={`${styles.phaseRow} ${isPhaseActive ? styles.phaseRowActive : ''}`}
                  onClick={(e) => handlePhaseClick(e, phase.id)}
                >
                  <span
                    className={`${styles.phaseCheckbox} ${phase.isDone ? styles.phaseCheckboxDone : ''}`}
                    onClick={(e) => handlePhaseCheck(e, goal.id, phase.id, phase.isDone)}
                  >
                    {phase.isDone && '✓'}
                  </span>
                  <span className={`${styles.phaseName} ${phase.isDone ? styles.phaseNameDone : ''}`}>
                    {phase.name}
                  </span>
                  <span className={styles.phaseTaskCount}>{phase.taskCount}</span>
                </div>
              )
            })}

            {!isArchived && (
              <div className={styles.phaseActions}>
                {addingPhaseGoalId === goal.id ? (
                  <div className={styles.addPhaseRow}>
                    <span>+</span>
                    <input
                      className={styles.addPhaseInput}
                      autoFocus
                      value={newPhaseName}
                      onChange={(e) => setNewPhaseName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddPhase(goal.id)
                        if (e.key === 'Escape') { setAddingPhaseGoalId(null); setNewPhaseName('') }
                      }}
                      onBlur={() => handleAddPhase(goal.id)}
                      placeholder="阶段名称，Enter 确认"
                    />
                  </div>
                ) : (
                  <div
                    className={styles.addPhaseBtn}
                    onClick={(e) => { e.stopPropagation(); setAddingPhaseGoalId(goal.id); setNewPhaseName('') }}
                  >
                    <span>+</span>
                    <span>添加阶段</span>
                  </div>
                )}
                <div
                  className={`${styles.goalInboxBtn} ${location.pathname === `/inbox/${goal.id}` ? styles.goalInboxBtnActive : ''}`}
                  onClick={(e) => { e.stopPropagation(); navigate(`/inbox/${goal.id}`) }}
                >
                  📥
                </div>
              </div>
            )}
          </>
        )}
      </React.Fragment>
    )
  }

  return (
    <div className={styles.goalSection}>
      <div className={styles.goalSectionHeader}>
        <span className={styles.goalSectionTitle}>目标</span>
        <button className={styles.goalAddBtn} onClick={openGoalCreate} title="新建目标">＋</button>
      </div>

      {activeGoals.map(renderGoalRow)}

      {archivedGoals.length > 0 && (
        <>
          <div
            className={styles.archivedToggle}
            onClick={() => setShowArchived((v) => !v)}
          >
            <span className={styles.goalExpandIcon}>{showArchived ? '▾' : '▸'}</span>
            <span>已归档 ({archivedGoals.length})</span>
          </div>
          {showArchived && archivedGoals.map(renderGoalRow)}
        </>
      )}

      {goalContextMenu && (
        <GoalContextMenu
          goalId={goalContextMenu.goalId}
          isArchived={goals.find((g) => g.id === goalContextMenu.goalId)?.status === 'archived'}
          x={goalContextMenu.x}
          y={goalContextMenu.y}
          onEdit={openGoalEdit}
          onArchive={handleGoalArchive}
          onUnarchive={handleGoalUnarchive}
          onDelete={handleGoalDelete}
          onClose={() => setGoalContextMenu(null)}
        />
      )}

      {showGoalForm && (
        <GoalFormModal
          editingGoalId={editingGoalId}
          selectedColor={selectedGoalColor}
          errors={goalErrors}
          isSubmitting={goalIsSubmitting}
          register={goalRegister}
          watch={goalWatch}
          setValue={goalSetValue}
          onSubmit={goalHandleSubmit(onGoalSubmit)}
          onClose={() => setShowGoalForm(false)}
        />
      )}
    </div>
  )
}

const GoalFormSchema = z.object({
  name: z.string().min(1, '请输入目标名').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择颜色'),
  icon: z.string().optional(),
})
type GoalFormValues = z.infer<typeof GoalFormSchema>

function GoalContextMenu({
  goalId,
  isArchived,
  x,
  y,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  onClose,
}: {
  goalId: string
  isArchived?: boolean
  x: number
  y: number
  onEdit: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className={styles.contextMenu} style={{ position: 'fixed', left: x, top: y }}>
      {!isArchived && (
        <button className={styles.contextMenuItem} onClick={() => onEdit(goalId)}>编辑目标</button>
      )}
      {isArchived ? (
        <button className={styles.contextMenuItem} onClick={() => onUnarchive(goalId)}>恢复目标</button>
      ) : (
        <button className={styles.contextMenuItem} onClick={() => onArchive(goalId)}>归档目标</button>
      )}
      <div className={styles.contextMenuDivider} />
      <button
        className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
        onClick={() => onDelete(goalId)}
      >删除目标</button>
    </div>
  )
}

function GoalFormModal({
  editingGoalId,
  selectedColor,
  errors,
  isSubmitting,
  register,
  watch,
  setValue,
  onSubmit,
  onClose,
}: {
  editingGoalId: string | null
  selectedColor: string
  errors: ReturnType<typeof useForm<GoalFormValues>>['formState']['errors']
  isSubmitting: boolean
  register: ReturnType<typeof useForm<GoalFormValues>>['register']
  watch: ReturnType<typeof useForm<GoalFormValues>>['watch']
  setValue: ReturnType<typeof useForm<GoalFormValues>>['setValue']
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className={styles.formModalOverlay}>
      <div ref={ref} className={styles.goalFormModal}>
        <div className={styles.formModalHeader}>
          <span>{editingGoalId ? '编辑目标' : '新建目标'}</span>
          <button className={styles.formModalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={onSubmit} className={styles.formModalBody}>
          <div className={styles.formField}>
            <label>目标名</label>
            <input {...register('name')} placeholder="例如：找到 PM 工作" autoFocus className={styles.formInput} />
            {errors.name && <span className={styles.formError}>{errors.name.message}</span>}
          </div>
          <div className={styles.formField}>
            <label>图标（可选）</label>
            <div className={styles.emojiPickerRow}>
              <span
                className={`${styles.emojiSelected} ${!watch('icon') ? styles.emojiSelectedEmpty : ''}`}
                onClick={() => setValue('icon', '', { shouldDirty: true })}
                title="清除图标"
              >
                {watch('icon') || '—'}
              </span>
              <div className={styles.emojiGrid}>
                {PRESET_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`${styles.emojiBtn} ${watch('icon') === emoji ? styles.emojiBtnSelected : ''}`}
                    onClick={() => setValue('icon', watch('icon') === emoji ? '' : emoji, { shouldDirty: true })}
                  >{emoji}</button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.formField}>
            <label>颜色</label>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorDot} ${selectedColor === color ? styles.colorDotSelected : ''}`}
                  style={{ background: color }}
                  onClick={() => setValue('color', color)}
                />
              ))}
            </div>
            <div className={styles.colorCustomRow}>
              <span className={styles.colorPreview} style={{ background: selectedColor }} />
              <input type="color" value={selectedColor} onChange={(e) => setValue('color', e.target.value)} className={styles.colorPicker} />
              <span className={styles.colorHex}>{selectedColor}</span>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.formCancelBtn} onClick={onClose}>取消</button>
            <button type="submit" className={styles.formSubmitBtn} disabled={isSubmitting}>
              {isSubmitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TagTreeNav() {
  const { tags, reorderTags } = useTagStore()
  const { activeTagFilter, setTagFilter } = useUiStore()

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.sortOrder - b.sortOrder), [tags])
  const tree = useMemo(() => buildTagTree(sortedTags, true), [sortedTags])

  const [showSortModal, setShowSortModal] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ tagId: string; x: number; y: number } | null>(null)

  const { addTag, updateTag, removeTag } = useTagStore()
  const { removeTasksByTagId } = useTaskStore()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TagFormValues>({
    resolver: zodResolver(TagFormSchema),
    defaultValues: { color: PRESET_COLORS[0] },
  })

  const selectedColor = watch('color')

  const openCreate = () => {
    setEditingTagId(null)
    reset({ name: '', color: PRESET_COLORS[0], icon: '' })
    setShowForm(true)
    setContextMenu(null)
  }

  const openEdit = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return
    setEditingTagId(tagId)
    reset({ name: tag.name, color: tag.color, icon: tag.icon ?? '' })
    setShowForm(true)
    setContextMenu(null)
  }

  const onSubmit = async (data: TagFormValues) => {
    if (editingTagId) {
      const updated = await tagsApi.update(editingTagId, data)
      updateTag(editingTagId, updated)
    } else {
      const nextOrder = tags.length > 0 ? Math.max(...tags.map((t) => t.sortOrder)) + 1 : 0
      const created = await tagsApi.create({ id: nanoid(), sortOrder: nextOrder, ...data })
      addTag(created)
    }
    setShowForm(false)
  }

  const handleDelete = async (tagId: string) => {
    await tagsApi.remove(tagId)
    removeTag(tagId)
    setContextMenu(null)
    if (editingTagId === tagId) setShowForm(false)
  }

  const handleDeleteWithTasks = async (tagId: string) => {
    await tagsApi.removeWithTasks(tagId)
    removeTag(tagId)
    removeTasksByTagId(tagId)
    setContextMenu(null)
    if (editingTagId === tagId) setShowForm(false)
  }

  return (
    <div className={styles.tagSection}>
      <div className={styles.tagSectionHeader}>
        <span
          className={`${styles.tagSectionTitle} ${activeTagFilter ? styles.tagSectionTitleActive : ''}`}
          onClick={() => setTagFilter(null)}
          title={activeTagFilter ? '点击显示全部任务' : '标签'}
        >
          标签
        </span>
        <div className={styles.tagHeaderActions}>
          <button
            className={styles.tagSortBtn}
            onClick={() => setShowSortModal(true)}
            title="排序标签"
          >
            排序
          </button>
          <button className={styles.tagAddBtn} onClick={openCreate} title="新建标签">＋</button>
        </div>
      </div>
      {tree.map((node) => (
        <TagNodeItem
          key={node.fullPath}
          node={node}
          activeFilter={activeTagFilter}
          onSelect={(path) => setTagFilter(activeTagFilter === path ? null : path)}
          onContextMenu={(tagId, x, y) => setContextMenu({ tagId, x, y })}
        />
      ))}

      {/* 排序弹窗 */}
      {showSortModal && (
        <TagSortModal
          tags={sortedTags}
          tree={tree}
          onSave={async (reordered) => {
            const withOrder = reordered.map((t, i) => ({ ...t, sortOrder: i }))
            reorderTags(withOrder)
            setShowSortModal(false)
            try {
              await tagsApi.reorder(withOrder.map(({ id, sortOrder }) => ({ id, sortOrder })))
            } catch {
              reorderTags(tags)
            }
          }}
          onClose={() => setShowSortModal(false)}
        />
      )}

      {/* 上下文菜单 */}
      {contextMenu && (
        <TagContextMenu
          tagId={contextMenu.tagId}
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={openEdit}
          onDelete={handleDelete}
          onDeleteWithTasks={handleDeleteWithTasks}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 新建/编辑表单 */}
      {showForm && (
        <TagFormModal
          editingTagId={editingTagId}
          selectedColor={selectedColor}
          errors={errors}
          isSubmitting={isSubmitting}
          register={register}
          watch={watch}
          setValue={setValue}
          onSubmit={handleSubmit(onSubmit)}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function TagNodeItem({
  node,
  activeFilter,
  onSelect,
  onContextMenu,
  draggable = false,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  rootColor,
}: {
  node: TagTreeNode
  activeFilter: string | null
  onSelect: (path: string) => void
  onContextMenu: (tagId: string, x: number, y: number) => void
  draggable?: boolean
  isDragOver?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
  rootColor?: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const hasChildren = node.children.length > 0
  const isActive = activeFilter === node.fullPath
  const isRealTag = node.tag.name === node.fullPath

  const hasActiveDescendant = useMemo(() => {
    if (!activeFilter) return false
    return activeFilter.startsWith(node.fullPath + '/')
  }, [activeFilter, node.fullPath])

  const handleMenuBtn = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onContextMenu(node.tag.id, rect.right, rect.bottom)
  }

  const dragHandlers = draggable ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); onDragStart?.() },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); onDragOver?.() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); onDrop?.() },
    onDragEnd: (e: React.DragEvent) => { e.stopPropagation(); onDragEnd?.() },
  } : {}

  return (
    <>
      <div
        className={`${styles.tagNavItem} ${isActive ? styles.tagNavItemActive : ''} ${hasActiveDescendant && !isActive ? styles.tagNavItemParentActive : ''} ${isDragOver ? styles.tagNavItemDragOver : ''} ${draggable ? styles.tagNavItemDraggable : ''}`}
        style={{ paddingLeft: `${10 + node.depth * 18}px` }}
        onClick={() => onSelect(node.fullPath)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...dragHandlers}
      >
        {draggable && <span className={styles.dragHandle}>⠿</span>}
        <span
          className={`${styles.expandIcon} ${hasChildren && hovered ? styles.expandIconVisible : ''}`}
          onClick={hasChildren ? (e) => { e.stopPropagation(); setExpanded(!expanded) } : undefined}
        >
          {hasChildren && hovered ? (expanded ? '▾' : '▸') : null}
        </span>
        <span className={styles.tagNavDot} style={{ background: rootColor ?? node.tag.color }} />
        {node.tag.icon && <span>{node.tag.icon}</span>}
        <span className={styles.tagNavLabel}>{node.segment}</span>
        {isRealTag && hovered && (
          <button className={styles.tagMenuBtn} onClick={handleMenuBtn} title="标签操作">…</button>
        )}
      </div>
      {hasChildren && expanded && node.children.map((child) => (
        <TagNodeItem
          key={child.fullPath}
          node={child}
          activeFilter={activeFilter}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          rootColor={rootColor ?? node.tag.color}
        />
      ))}
    </>
  )
}

function TagSortModal({
  tags,
  tree,
  onSave,
  onClose,
}: {
  tags: Tag[]
  tree: TagTreeNode[]
  onSave: (reordered: Tag[]) => void
  onClose: () => void
}) {
  // localOrder holds root-level fullPaths in current drag order
  const [rootOrder, setRootOrder] = useState(() => tree.map((n) => n.fullPath))
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(tree.filter((n) => n.children.length > 0).map((n) => n.fullPath))
  )

  const dragSrc = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleDragStart = (path: string) => { dragSrc.current = path }
  const handleDragOver = (path: string) => {
    if (dragSrc.current && dragSrc.current !== path) setDragOver(path)
  }
  const handleDrop = (targetPath: string) => {
    const src = dragSrc.current
    if (!src || src === targetPath) return
    dragSrc.current = null
    setDragOver(null)
    setRootOrder((prev) => {
      const next = [...prev]
      const si = next.indexOf(src)
      const ti = next.indexOf(targetPath)
      if (si === -1 || ti === -1) return prev
      next.splice(si, 1)
      next.splice(ti, 0, src)
      return next
    })
  }
  const handleDragEnd = () => { dragSrc.current = null; setDragOver(null) }

  const handleSave = () => {
    const getTagsForRoot = (rootPath: string) =>
      tags.filter((t) => t.name === rootPath || t.name.startsWith(rootPath + '/'))
    const reordered: Tag[] = []
    for (const path of rootOrder) reordered.push(...getTagsForRoot(path))
    const captured = new Set(reordered.map((t) => t.id))
    for (const t of tags) { if (!captured.has(t.id)) reordered.push(t) }
    onSave(reordered)
  }

  // Build display tree in current rootOrder
  const orderedTree = useMemo(() => {
    const nodeByPath = new Map(tree.map((n) => [n.fullPath, n]))
    return rootOrder.map((p) => nodeByPath.get(p)).filter(Boolean) as TagTreeNode[]
  }, [tree, rootOrder])

  const renderNode = (node: TagTreeNode, depth = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0
    const expanded = expandedPaths.has(node.fullPath)
    const isOver = dragOver === node.fullPath
    return (
      <div key={node.fullPath}>
        <div
          className={`${styles.sortRow} ${isOver ? styles.sortRowDragOver : ''}`}
          style={{ paddingLeft: `${16 + depth * 20}px` }}
          draggable={depth === 0}
          onDragStart={depth === 0 ? () => handleDragStart(node.fullPath) : undefined}
          onDragOver={depth === 0 ? (e) => { e.preventDefault(); handleDragOver(node.fullPath) } : undefined}
          onDrop={depth === 0 ? (e) => { e.preventDefault(); handleDrop(node.fullPath) } : undefined}
          onDragEnd={depth === 0 ? handleDragEnd : undefined}
        >
          {hasChildren ? (
            <span className={styles.sortExpandBtn} onClick={() => toggleExpand(node.fullPath)}>
              {expanded ? '▾' : '▸'}
            </span>
          ) : (
            <span className={styles.sortExpandBtn} />
          )}
          <span className={styles.tagNavDot} style={{ background: node.tag.color }} />
          {node.tag.icon && <span className={styles.sortIcon}>{node.tag.icon}</span>}
          <span className={styles.sortLabel}>{node.segment}</span>
          {depth === 0 && <span className={styles.sortHandle}>☰</span>}
        </div>
        {hasChildren && expanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className={styles.formModalOverlay}>
      <div className={styles.sortModal}>
        <div className={styles.sortModalHeader}>
          <span>标签排序</span>
          <button className={styles.formModalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.sortModalBody}>
          {orderedTree.map((node) => renderNode(node))}
        </div>
        <div className={styles.sortModalFooter}>
          <button className={styles.sortSaveBtn} onClick={handleSave}>保存</button>
          <button className={styles.sortCancelBtn} onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

function TagContextMenu({
  tagId,
  x,
  y,
  onEdit,
  onDelete,
  onDeleteWithTasks,
  onClose,
}: {
  tagId: string
  x: number
  y: number
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onDeleteWithTasks: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ position: 'fixed', left: x, top: y }}
    >
      <button className={styles.contextMenuItem} onClick={() => onEdit(tagId)}>
        编辑标签/图标
      </button>
      <div className={styles.contextMenuDivider} />
      <button className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => onDelete(tagId)}>
        仅删除标签
      </button>
      <button className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => onDeleteWithTasks(tagId)}>
        删除标签和任务
      </button>
    </div>
  )
}

function TagFormModal({
  editingTagId,
  selectedColor,
  errors,
  isSubmitting,
  register,
  watch,
  setValue,
  onSubmit,
  onClose,
}: {
  editingTagId: string | null
  selectedColor: string
  errors: ReturnType<typeof useForm<TagFormValues>>['formState']['errors']
  isSubmitting: boolean
  register: ReturnType<typeof useForm<TagFormValues>>['register']
  watch: ReturnType<typeof useForm<TagFormValues>>['watch']
  setValue: ReturnType<typeof useForm<TagFormValues>>['setValue']
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className={styles.formModalOverlay}>
      <div ref={ref} className={styles.formModal}>
        <div className={styles.formModalHeader}>
          <span>{editingTagId ? '编辑标签' : '新建标签'}</span>
          <button className={styles.formModalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={onSubmit} className={styles.formModalBody}>
          <div className={styles.formField}>
            <label>标签名</label>
            <input
              {...register('name')}
              placeholder="例如：工作/项目A"
              autoFocus
              className={styles.formInput}
            />
            {errors.name && <span className={styles.formError}>{errors.name.message}</span>}
          </div>

          <div className={styles.formField}>
            <label>图标（可选）</label>
            <div className={styles.emojiPickerRow}>
              <span
                className={`${styles.emojiSelected} ${!watch('icon') ? styles.emojiSelectedEmpty : ''}`}
                onClick={() => setValue('icon', '', { shouldDirty: true })}
                title="清除图标"
              >
                {watch('icon') || '—'}
              </span>
              <div className={styles.emojiGrid}>
                {PRESET_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`${styles.emojiBtn} ${watch('icon') === emoji ? styles.emojiBtnSelected : ''}`}
                    onClick={() => setValue('icon', watch('icon') === emoji ? '' : emoji, { shouldDirty: true })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.formField}>
            <label>颜色</label>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorDot} ${selectedColor === color ? styles.colorDotSelected : ''}`}
                  style={{ background: color }}
                  onClick={() => setValue('color', color)}
                />
              ))}
            </div>
            <div className={styles.colorCustomRow}>
              <span className={styles.colorPreview} style={{ background: selectedColor }} />
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setValue('color', e.target.value)}
                className={styles.colorPicker}
              />
              <span className={styles.colorHex}>{selectedColor}</span>
            </div>
          </div>

          <div className={styles.formField}>
            <label>预览</label>
            <span
              className={styles.previewChip}
              style={{ background: selectedColor + '20', color: selectedColor, borderColor: selectedColor }}
            >
              {watch('icon')} {watch('name') || '标签名'}
            </span>
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.formCancelBtn} onClick={onClose}>取消</button>
            <button type="submit" className={styles.formSubmitBtn} disabled={isSubmitting}>
              {isSubmitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
