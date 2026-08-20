import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import type { CreateTaskInput } from '@time-manage/shared'
import { buildTagTree, flattenTree, isVirtualNode } from '@/utils/tagTree'
import { useTaskStore } from '@/stores/taskStore'
import { useTagStore } from '@/stores/tagStore'
import { useUiStore } from '@/stores/uiStore'
import { useGoalStore } from '@/stores/goalStore'
import { useRoleStore } from '@/stores/roleStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { tasksApi } from '@/api/tasks'
import { tagsApi } from '@/api/tags'
import styles from './QuickCreatePanel.module.css'

const PanelFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  expectedOutput: z.string().optional(),
  tagIds: z.array(z.string()),
  goalId: z.string().optional(),
  phaseId: z.string().optional(),
  roleId: z.string().optional(),
})

type PanelFormValues = z.infer<typeof PanelFormSchema>

function useTitleHistory(tasks: { title: string; updatedAt: string }[]) {
  return useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    const sorted = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    for (const t of sorted) {
      const title = t.title.trim()
      if (!title || seen.has(title)) continue
      seen.add(title)
      list.push(title)
    }
    return list
  }, [tasks])
}

export default function QuickCreatePanel() {
  const { taskModalOpen, editingTaskId, createDefaults, panelPos, closeTaskModal, openEditModal } = useUiStore()
  const { tasks, addTask, updateTask, removeTask } = useTaskStore()
  const { tags, addTag } = useTagStore()
  const { goals, adjustPhaseTaskCount } = useGoalStore()
  const { roles, fetchRoles } = useRoleStore()
  const { goalTermLabel, tagTermLabel } = useSettingsStore()

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  const getValuesRef = useRef<(() => PanelFormValues) | null>(null)
  const doSaveRef = useRef<(data: PanelFormValues) => Promise<void>>(async () => {})
  const isSavingRef = useRef(false)

  const { register, handleSubmit, reset, setValue, watch, getValues } = useForm<PanelFormValues>({
    resolver: zodResolver(PanelFormSchema),
    defaultValues: { id: nanoid(), title: '', tagIds: [] },
  })

  getValuesRef.current = getValues

  const selectedTagIds = watch('tagIds') ?? []
  const selectedGoalId = watch('goalId')
  const selectedPhaseId = watch('phaseId')
  const selectedRoleId = watch('roleId')

  useEffect(() => {
    if (!taskModalOpen) return
    isSavingRef.current = false
    setTitleOpen(false)
    if (editingTask) {
      reset({
        id: editingTask.id,
        title: editingTask.title,
        description: editingTask.description ?? undefined,
        expectedOutput: editingTask.expectedOutput ?? undefined,
        tagIds: editingTask.tagIds,
        goalId: editingTask.goalId ?? undefined,
        phaseId: editingTask.phaseId ?? undefined,
        roleId: editingTask.roleId ?? undefined,
      })
    } else {
      reset({ id: nanoid(), title: '', tagIds: [], goalId: undefined, phaseId: undefined, roleId: undefined })
    }
  }, [taskModalOpen, editingTaskId, createDefaults, reset])

  useLayoutEffect(() => {
    if (!taskModalOpen || !panelPos || !panelRef.current) return
    const el = panelRef.current
    const W = window.innerWidth
    const H = window.innerHeight
    const pw = el.offsetWidth || 320
    const ph = el.offsetHeight || 300
    const OFFSET = 12

    let left = panelPos.x + OFFSET
    let top = panelPos.y + OFFSET

    if (left + pw > W - 8) left = panelPos.x - pw - OFFSET
    if (top + ph > H - 8) top = panelPos.y - ph - OFFSET
    if (left < 8) left = 8
    if (top < 8) top = 8

    setPos({ left, top })
  }, [taskModalOpen, panelPos])

  const doSave: (data: PanelFormValues) => Promise<void> = async (data) => {
    if (isSavingRef.current) return
    isSavingRef.current = true

    const startRaw = editingTask?.startTime ? new Date(editingTask.startTime) : createDefaults?.start
    const endRaw = editingTask?.endTime ? new Date(editingTask.endTime) : createDefaults?.end
    const isAllDay = editingTask ? editingTask.isAllDay : (createDefaults?.isAllDay ?? false)

    const input = {
      ...data,
      tagIds: data.tagIds.slice(0, 1),
      // 编辑已有任务时用空字符串表达"清空"（undefined 序列化时会被丢弃，后端无法据此清空外键）
      goalId: data.goalId || (editingTask ? '' : undefined),
      phaseId: data.phaseId || (editingTask ? '' : undefined),
      roleId: data.roleId || (editingTask ? '' : undefined),
      startTime: startRaw?.toISOString(),
      endTime: endRaw?.toISOString(),
      isAllDay,
      priority: 'medium',
      status: editingTask?.status ?? 'todo',
      color: editingTask?.color ?? undefined,
    } as CreateTaskInput

    try {
      if (editingTask) {
        const updated = await tasksApi.update(editingTask.id, input)
        updateTask(editingTask.id, updated)
        if (editingTask.phaseId !== updated.phaseId) {
          if (editingTask.phaseId) adjustPhaseTaskCount(editingTask.phaseId, -1)
          if (updated.phaseId) adjustPhaseTaskCount(updated.phaseId, 1)
        }
      } else {
        const created = await tasksApi.create(input)
        addTask(created)
        if (created.phaseId) adjustPhaseTaskCount(created.phaseId, 1)
      }
    } finally {
      closeTaskModal()
    }
  }

  doSaveRef.current = doSave

  useEffect(() => {
    if (!taskModalOpen) return
    const handler = (e: MouseEvent) => {
      if (!panelRef.current || panelRef.current.contains(e.target as Node)) return
      const values = getValuesRef.current?.()
      if (values?.title?.trim()) {
        doSaveRef.current!(values)
      } else {
        closeTaskModal()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [taskModalOpen, closeTaskModal])

  useEffect(() => {
    if (!taskModalOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeTaskModal()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [taskModalOpen, closeTaskModal])

  const handleDelete = async () => {
    if (!editingTask) return
    isSavingRef.current = true
    await tasksApi.remove(editingTask.id)
    removeTask(editingTask.id)
    if (editingTask.phaseId) adjustPhaseTaskCount(editingTask.phaseId, -1)
    closeTaskModal()
  }

  const handleDuplicate = async () => {
    if (!editingTask) return
    isSavingRef.current = true
    const input: CreateTaskInput = {
      id: nanoid(),
      title: editingTask.title,
      description: editingTask.description ?? undefined,
      expectedOutput: editingTask.expectedOutput ?? undefined,
      startTime: editingTask.startTime ?? undefined,
      endTime: editingTask.endTime ?? undefined,
      isAllDay: editingTask.isAllDay,
      tagIds: editingTask.tagIds,
      goalId: editingTask.goalId ?? undefined,
      phaseId: editingTask.phaseId ?? undefined,
      roleId: editingTask.roleId ?? undefined,
      status: 'todo',
      priority: editingTask.priority,
      color: editingTask.color ?? undefined,
    }
    const created = await tasksApi.create(input)
    addTask(created)
    if (created.phaseId) adjustPhaseTaskCount(created.phaseId, 1)
    isSavingRef.current = false
    openEditModal(created.id, panelPos ?? undefined)
  }

  const startDate = editingTask?.startTime ? new Date(editingTask.startTime) : createDefaults?.start
  const endDate = editingTask?.endTime ? new Date(editingTask.endTime) : createDefaults?.end
  const isAllDay = editingTask ? editingTask.isAllDay : createDefaults?.isAllDay

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const dateLabel = startDate ? `${dayjs(startDate).format('M月D日')} 周${WEEKDAYS[startDate.getDay()]}` : ''
  const timeLabel = (!isAllDay && startDate && endDate)
    ? `${dayjs(startDate).format('HH:mm')}-${dayjs(endDate).format('HH:mm')}`
    : '全天'

  // Goal selection
  const activeGoals = goals.filter((g) => g.status !== 'archived')
  const selectedGoal = goals.find((g) => g.id === selectedGoalId)
  const selectedPhase = selectedGoal?.phases.find((p) => p.id === selectedPhaseId)
  const [goalOpen, setGoalOpen] = useState(false)
  const goalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!goalOpen) return
    const handler = (e: MouseEvent) => {
      if (goalRef.current && !goalRef.current.contains(e.target as Node)) setGoalOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [goalOpen])

  const handleGoalClick = (goalId: string) => {
    if (selectedGoalId === goalId) {
      setValue('goalId', undefined, { shouldDirty: true })
      setValue('phaseId', undefined, { shouldDirty: true })
      setGoalOpen(false)
    } else {
      setValue('goalId', goalId, { shouldDirty: true })
      setValue('phaseId', undefined, { shouldDirty: true })
      // keep open for phase selection
    }
  }

  const handlePhaseClick = (phaseId: string) => {
    if (selectedPhaseId === phaseId) {
      setValue('phaseId', undefined, { shouldDirty: true })
    } else {
      setValue('phaseId', phaseId, { shouldDirty: true })
    }
    setGoalOpen(false)
  }

  // Tag selection
  const selectedTag = tags.find((t) => t.id === selectedTagIds[0])
  const sortedNodes = useMemo(() => {
    const sorted = [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
    return flattenTree(buildTagTree(sorted, true))
  }, [tags])
  const [tagOpen, setTagOpen] = useState(false)
  const tagRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagOpen) return
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tagOpen])

  const handleTagSelect = async (node: ReturnType<typeof flattenTree>[number]) => {
    if (isVirtualNode(node)) {
      const nextOrder = tags.length > 0 ? Math.max(...tags.map((t) => t.sortOrder)) + 1 : 0
      const created = await tagsApi.create({
        id: nanoid(),
        name: node.fullPath,
        color: node.tag.color,
        icon: node.tag.icon,
        sortOrder: nextOrder,
      })
      addTag(created)
      setValue('tagIds', [created.id], { shouldDirty: true })
    } else {
      const next = selectedTagIds[0] === node.tag.id ? [] : [node.tag.id]
      setValue('tagIds', next, { shouldDirty: true })
    }
    setTagOpen(false)
  }

  // Role selection
  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.sortOrder - b.sortOrder), [roles])
  const selectedRole = sortedRoles.find((r) => r.id === selectedRoleId)
  const [roleOpen, setRoleOpen] = useState(false)
  const roleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!roleOpen) return
    const handler = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [roleOpen])

  const handleRoleClick = (roleId: string) => {
    setValue('roleId', selectedRoleId === roleId ? undefined : roleId, { shouldDirty: true })
    setRoleOpen(false)
  }

  // Title history autocomplete
  const titleHistory = useTitleHistory(tasks)
  const titleValue = watch('title') ?? ''
  const [titleOpen, setTitleOpen] = useState(false)
  const [titleHighlight, setTitleHighlight] = useState(0)
  const titleWrapRef = useRef<HTMLDivElement>(null)
  const titleFieldReg = register('title')

  const titleMatches = useMemo(() => {
    const q = titleValue.trim().toLowerCase()
    if (!q) return []
    return titleHistory
      .filter((t) => t.toLowerCase().startsWith(q) && t.toLowerCase() !== q)
      .slice(0, 8)
  }, [titleHistory, titleValue])

  useEffect(() => {
    setTitleHighlight(0)
  }, [titleMatches.length])

  useEffect(() => {
    if (!titleOpen) return
    const handler = (e: MouseEvent) => {
      if (titleWrapRef.current && !titleWrapRef.current.contains(e.target as Node)) setTitleOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [titleOpen])

  const applyTitleMatch = (t: string) => {
    setValue('title', t, { shouldDirty: true })
    setTitleOpen(false)
  }

  if (!taskModalOpen) return null

  return (
    <div ref={panelRef} className={styles.panel} style={{ left: pos.left, top: pos.top }}>
      {/* 顶部信息行 */}
      <div className={styles.header}>
        <span className={styles.dateTime}>{dateLabel} · {timeLabel}</span>
        {editingTask && (
          <div className={styles.headerActions}>
            <button type="button" className={styles.deleteBtn} onClick={handleDuplicate} title="复制任务">
              ⧉
            </button>
            <button type="button" className={styles.deleteBtn} onClick={handleDelete} title="删除任务">
              🗑
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(doSave)} className={styles.form}>
        <div className={styles.titleWrap} ref={titleWrapRef}>
          <input
            {...titleFieldReg}
            placeholder="准备做什么?"
            className={styles.titleInput}
            autoFocus
            autoComplete="off"
            onChange={(e) => {
              titleFieldReg.onChange(e)
              setTitleOpen(true)
            }}
            onFocus={() => setTitleOpen(true)}
            onKeyDown={(e) => {
              if (!titleOpen || titleMatches.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setTitleHighlight((i) => (i + 1) % titleMatches.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setTitleHighlight((i) => (i - 1 + titleMatches.length) % titleMatches.length)
              } else if (e.key === 'Tab') {
                e.preventDefault()
                applyTitleMatch(titleMatches[titleHighlight])
              } else if (e.key === 'Escape') {
                setTitleOpen(false)
              }
            }}
          />
          {titleOpen && titleMatches.length > 0 && (
            <div className={styles.titleDropdown}>
              {titleMatches.map((t, i) => (
                <div
                  key={t}
                  className={`${styles.chipDropdownItem} ${i === titleHighlight ? styles.chipDropdownItemSelected : ''}`}
                  onMouseEnter={() => setTitleHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); applyTitleMatch(t) }}
                >
                  <span className={styles.chipDropdownName}>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <textarea
          {...register('description')}
          placeholder="备注（可选）"
          rows={3}
          className={styles.textarea}
        />
        <textarea
          {...register('expectedOutput')}
          placeholder="预期产出（可选）"
          rows={2}
          className={styles.textarea}
        />

        {/* 底部：目标 + 标签 */}
        <div className={styles.footer}>
          {/* 目标 chip */}
          <div className={styles.chipArea} ref={goalRef}>
            <button
              type="button"
              className={styles.chipBtn}
              onClick={() => setGoalOpen((o) => !o)}
              style={selectedGoal ? {
                color: selectedGoal.color,
                borderColor: selectedGoal.color + '66',
                background: selectedGoal.color + '12',
              } : {}}
            >
              {selectedGoal ? (
                <>
                  {selectedGoal.icon && <span>{selectedGoal.icon}</span>}
                  <span className={styles.chipBtnLabel}>{selectedGoal.name}</span>
                  {selectedPhase && (
                    <>
                      <span className={styles.chipSep}>/</span>
                      <span className={styles.chipBtnLabel}>{selectedPhase.name}</span>
                    </>
                  )}
                  <span
                    className={styles.chipRemove}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setValue('goalId', undefined, { shouldDirty: true })
                      setValue('phaseId', undefined, { shouldDirty: true })
                    }}
                  >×</span>
                </>
              ) : (
                <span className={styles.chipPlaceholder}>● {goalTermLabel}</span>
              )}
            </button>

            {goalOpen && (
              <div className={styles.chipDropdown}>
                {activeGoals.length === 0 ? (
                  <div className={styles.chipDropdownEmpty}>暂无{goalTermLabel}</div>
                ) : activeGoals.map((goal) => (
                  <div key={goal.id}>
                    <div
                      className={`${styles.chipDropdownItem} ${selectedGoalId === goal.id ? styles.chipDropdownItemSelected : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); handleGoalClick(goal.id) }}
                    >
                      <span className={styles.chipDropdownDot} style={{ background: goal.color }} />
                      {goal.icon && <span>{goal.icon}</span>}
                      <span className={styles.chipDropdownName}>{goal.name}</span>
                      {selectedGoalId === goal.id && <span className={styles.chipDropdownCheck}>✓</span>}
                    </div>
                    {selectedGoalId === goal.id && goal.phases.map((phase) => (
                      <div
                        key={phase.id}
                        className={`${styles.chipDropdownPhase} ${selectedPhaseId === phase.id ? styles.chipDropdownItemSelected : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); handlePhaseClick(phase.id) }}
                      >
                        <span className={styles.chipDropdownPhaseDot} style={{ borderColor: goal.color }} />
                        <span className={`${styles.chipDropdownName} ${phase.isDone ? styles.chipDropdownNameDone : ''}`}>
                          {phase.name}
                        </span>
                        {selectedPhaseId === phase.id && <span className={styles.chipDropdownCheck}>✓</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 标签 chip */}
          <div className={styles.chipArea} ref={tagRef}>
            <button
              type="button"
              className={styles.chipBtn}
              onClick={() => setTagOpen((o) => !o)}
              style={selectedTag ? { color: selectedTag.color, borderColor: selectedTag.color + '66', background: selectedTag.color + '12' } : {}}
            >
              {selectedTag ? (
                <>
                  {selectedTag.icon && <span>{selectedTag.icon}</span>}
                  <span className={styles.chipBtnLabel}>{selectedTag.name}</span>
                  <span
                    className={styles.chipRemove}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setValue('tagIds', [], { shouldDirty: true })
                    }}
                  >×</span>
                </>
              ) : (
                <span className={styles.chipPlaceholder}># {tagTermLabel}</span>
              )}
            </button>

            {tagOpen && tags.length > 0 && (
              <div className={styles.chipDropdown}>
                {sortedNodes.map((node) => {
                  const virt = isVirtualNode(node)
                  const sel = !virt && selectedTagIds.includes(node.tag.id)
                  return (
                    <div
                      key={node.fullPath}
                      className={`${styles.chipDropdownItem} ${sel ? styles.chipDropdownItemSelected : ''} ${virt ? styles.chipDropdownItemVirtual : ''}`}
                      style={{ paddingLeft: `${10 + node.depth * 14}px` }}
                      onMouseDown={(e) => { e.preventDefault(); handleTagSelect(node) }}
                    >
                      <span className={styles.chipDropdownDot} style={{ background: node.tag.color }} />
                      {node.tag.icon && <span>{node.tag.icon}</span>}
                      <span className={styles.chipDropdownName}>{node.segment}</span>
                      {virt && <span className={styles.chipDropdownVirtual}>自动创建</span>}
                      {sel && <span className={styles.chipDropdownCheck}>✓</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 角色 chip */}
          <div className={styles.chipArea} ref={roleRef}>
            <button
              type="button"
              className={styles.chipBtn}
              onClick={() => setRoleOpen((o) => !o)}
              style={selectedRole ? { color: selectedRole.color, borderColor: selectedRole.color + '66', background: selectedRole.color + '12' } : {}}
            >
              {selectedRole ? (
                <>
                  {selectedRole.icon && <span>{selectedRole.icon}</span>}
                  <span className={styles.chipBtnLabel}>{selectedRole.name}</span>
                  <span
                    className={styles.chipRemove}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setValue('roleId', undefined, { shouldDirty: true })
                    }}
                  >×</span>
                </>
              ) : (
                <span className={styles.chipPlaceholder}>◆ 角色</span>
              )}
            </button>

            {roleOpen && (
              <div className={styles.chipDropdown}>
                {sortedRoles.length === 0 ? (
                  <div className={styles.chipDropdownEmpty}>暂无角色</div>
                ) : sortedRoles.map((role) => (
                  <div
                    key={role.id}
                    className={`${styles.chipDropdownItem} ${selectedRoleId === role.id ? styles.chipDropdownItemSelected : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); handleRoleClick(role.id) }}
                  >
                    <span className={styles.chipDropdownDot} style={{ background: role.color }} />
                    {role.icon && <span>{role.icon}</span>}
                    <span className={styles.chipDropdownName}>{role.name}</span>
                    {selectedRoleId === role.id && <span className={styles.chipDropdownCheck}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
