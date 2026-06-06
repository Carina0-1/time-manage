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
import { tasksApi } from '@/api/tasks'
import { tagsApi } from '@/api/tags'
import styles from './QuickCreatePanel.module.css'

const PanelFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  tagIds: z.array(z.string()),
  goalId: z.string().optional(),
  phaseId: z.string().optional(),
})

type PanelFormValues = z.infer<typeof PanelFormSchema>

export default function QuickCreatePanel() {
  const { taskModalOpen, editingTaskId, createDefaults, panelPos, closeTaskModal } = useUiStore()
  const { tasks, addTask, updateTask, removeTask } = useTaskStore()
  const { tags, addTag } = useTagStore()
  const { goals } = useGoalStore()

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

  useEffect(() => {
    if (!taskModalOpen) return
    isSavingRef.current = false
    if (editingTask) {
      reset({
        id: editingTask.id,
        title: editingTask.title,
        description: editingTask.description ?? undefined,
        tagIds: editingTask.tagIds,
        goalId: editingTask.goalId ?? undefined,
        phaseId: editingTask.phaseId ?? undefined,
      })
    } else {
      reset({ id: nanoid(), title: '', tagIds: [], goalId: undefined, phaseId: undefined })
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
      goalId: data.goalId || undefined,
      phaseId: data.phaseId || undefined,
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
      } else {
        const created = await tasksApi.create(input)
        addTask(created)
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
    closeTaskModal()
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
  const sortedNodes = useMemo(() => flattenTree(buildTagTree(tags)), [tags])
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
      const created = await tagsApi.create({
        id: nanoid(),
        name: node.fullPath,
        color: node.tag.color,
        icon: node.tag.icon,
        sortOrder: 0,
      })
      addTag(created)
      setValue('tagIds', [created.id], { shouldDirty: true })
    } else {
      const next = selectedTagIds[0] === node.tag.id ? [] : [node.tag.id]
      setValue('tagIds', next, { shouldDirty: true })
    }
    setTagOpen(false)
  }

  if (!taskModalOpen) return null

  return (
    <div ref={panelRef} className={styles.panel} style={{ left: pos.left, top: pos.top }}>
      {/* 顶部信息行 */}
      <div className={styles.header}>
        <span className={styles.dateTime}>{dateLabel} · {timeLabel}</span>
        {editingTask && (
          <button type="button" className={styles.deleteBtn} onClick={handleDelete} title="删除任务">
            🗑
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit(doSave)} className={styles.form}>
        <input
          {...register('title')}
          placeholder="准备做什么?"
          className={styles.titleInput}
          autoFocus
        />
        <textarea
          {...register('description')}
          placeholder="备注（可选）"
          rows={5}
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
                <span className={styles.chipPlaceholder}>● 目标</span>
              )}
            </button>

            {goalOpen && (
              <div className={styles.chipDropdown}>
                {goals.length === 0 ? (
                  <div className={styles.chipDropdownEmpty}>暂无目标</div>
                ) : goals.map((goal) => (
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
                <span className={styles.chipPlaceholder}># 标签</span>
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
        </div>
      </form>
    </div>
  )
}
