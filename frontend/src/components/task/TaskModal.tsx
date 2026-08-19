import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import type { CreateTaskInput, Tag, Role } from '@time-manage/shared'
import { buildTagTree, flattenTree, isVirtualNode } from '@/utils/tagTree'
import { useTaskStore } from '@/stores/taskStore'
import { useTagStore } from '@/stores/tagStore'
import { useUiStore } from '@/stores/uiStore'
import { useGoalStore } from '@/stores/goalStore'
import { useRoleStore } from '@/stores/roleStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { GoalWithPhases } from '@/stores/goalStore'
import { tasksApi } from '@/api/tasks'
import { tagsApi } from '@/api/tags'
import styles from './TaskModal.module.css'

const TaskFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1, '请填写任务名称').max(200),
  description: z.string().optional(),
  expectedOutput: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isAllDay: z.boolean(),
  tagIds: z.array(z.string()),
  goalId: z.string().optional(),
  phaseId: z.string().optional(),
  roleId: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
  color: z.string().nullish(),
})

type TaskFormValues = z.infer<typeof TaskFormSchema>

export default function TaskModal() {
  const navigate = useNavigate()
  const { taskModalOpen, panelPos, editingTaskId, createDefaults, closeTaskModal } = useUiStore()
  const { tasks, addTask, updateTask, removeTask } = useTaskStore()
  const { tags } = useTagStore()
  const { goals, adjustPhaseTaskCount } = useGoalStore()
  const { roles, fetchRoles } = useRoleStore()
  const { tagTermLabel } = useSettingsStore()

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: {
      title: '',
      tagIds: [],
      isAllDay: false,
      status: 'todo',
    },
  })

  const selectedTagIds = watch('tagIds') ?? []
  const selectedGoalId = watch('goalId')
  const selectedPhaseId = watch('phaseId')
  const selectedRoleId = watch('roleId')

  // # 快速打标签状态
  const [hashQuery, setHashQuery] = useState<string | null>(null)
  const [hashCursor, setHashCursor] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)

  // # 下拉按树序排列并过滤
  const matchedNodes = useMemo(() => {
    const sorted = [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
    const roots = buildTagTree(sorted, true)
    const rootColorMap = new Map<string, string>()
    function walk(nodes: typeof roots, rootColor: string | null) {
      for (const node of nodes) {
        const color = rootColor ?? node.tag.color
        if (node.tag.name === node.fullPath) rootColorMap.set(node.tag.id, color)
        if (node.children.length > 0) walk(node.children, color)
      }
    }
    walk(roots, null)
    const nodes = flattenTree(roots).map((node) => ({
      ...node,
      tag: { ...node.tag, color: rootColorMap.get(node.tag.id) ?? node.tag.color },
    }))
    if (!hashQuery) return nodes
    const q = hashQuery.toLowerCase()
    return nodes.filter((n) => n.tag.name.toLowerCase().includes(q))
  }, [hashQuery, tags])

  const toLocalInput = (iso: string) => dayjs(iso).format('YYYY-MM-DDTHH:mm')

  useEffect(() => {
    if (!taskModalOpen) return
    setHashQuery(null)
    setHashCursor(0)
    if (editingTask) {
      reset({
        id: editingTask.id,
        title: editingTask.title,
        description: editingTask.description ?? undefined,
        expectedOutput: editingTask.expectedOutput ?? undefined,
        startTime: editingTask.startTime ? toLocalInput(editingTask.startTime) : '',
        endTime: editingTask.endTime ? toLocalInput(editingTask.endTime) : '',
        isAllDay: editingTask.isAllDay,
        tagIds: editingTask.tagIds,
        goalId: editingTask.goalId ?? undefined,
        phaseId: editingTask.phaseId ?? undefined,
        roleId: editingTask.roleId ?? undefined,
        status: editingTask.status,
        color: editingTask.color ?? undefined,
      })
    } else if (createDefaults) {
      reset({
        id: nanoid(),
        title: '',
        startTime: createDefaults.start ? toLocalInput(createDefaults.start.toISOString()) : '',
        endTime: createDefaults.end ? toLocalInput(createDefaults.end.toISOString()) : '',
        isAllDay: createDefaults.isAllDay,
        tagIds: [],
        goalId: createDefaults.goalId,
        phaseId: undefined,
        status: 'todo',
      })
    }
  }, [taskModalOpen, editingTaskId, createDefaults, reset])

  const onSubmit = async (data: TaskFormValues) => {
    const input = {
      ...data,
      priority: 'medium',
      tagIds: selectedTagIds.slice(0, 1),
      // 编辑已有任务时用空字符串表达"清空"（undefined 序列化时会被丢弃，后端无法据此清空外键）
      goalId: data.goalId || (editingTask ? '' : undefined),
      phaseId: data.phaseId || (editingTask ? '' : undefined),
      roleId: data.roleId || (editingTask ? '' : undefined),
      startTime: data.startTime ? new Date(data.startTime).toISOString() : undefined,
      endTime: data.endTime ? new Date(data.endTime).toISOString() : undefined,
    } as CreateTaskInput
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
    closeTaskModal()
  }

  const handleDelete = async () => {
    if (!editingTask) return
    await tasksApi.remove(editingTask.id)
    removeTask(editingTask.id)
    if (editingTask.phaseId) adjustPhaseTaskCount(editingTask.phaseId, -1)
    closeTaskModal()
  }

  const toggleTag = (tagId: string) => {
    const next = selectedTagIds[0] === tagId ? [] : [tagId]
    setValue('tagIds', next, { shouldDirty: true })
  }

  const selectHashTag = (tag: Tag) => {
    const el = titleRef.current
    const currentTitle = el?.value ?? ''
    const lastHash = currentTitle.lastIndexOf('#')
    const newTitle = lastHash >= 0 ? currentTitle.slice(0, lastHash) : currentTitle
    setValue('title', newTitle, { shouldDirty: true })
    if (el) el.value = newTitle
    setValue('tagIds', [tag.id], { shouldDirty: true })
    setHashQuery(null)
    setTimeout(() => el?.focus(), 0)
  }

  const { ref: titleRegRef, onBlur: titleOnBlur } = register('title')

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('title', val, { shouldValidate: false, shouldDirty: true })
    const lastHash = val.lastIndexOf('#')
    if (lastHash >= 0) {
      const after = val.slice(lastHash + 1)
      if (!after.includes(' ')) {
        setHashQuery(after)
        setHashCursor(0)
        return
      }
    }
    setHashQuery(null)
  }

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (hashQuery === null || matchedNodes.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHashCursor((c) => Math.min(c + 1, matchedNodes.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHashCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectHashTag(matchedNodes[hashCursor].tag)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setHashQuery(null)
    }
  }

  if (!taskModalOpen || panelPos) return null

  const selectedGoal = goals.find((g) => g.id === selectedGoalId)
  const selectedPhase = selectedGoal?.phases.find((p) => p.id === selectedPhaseId)

  return (
    <div className={styles.overlay} onClick={closeTaskModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{editingTask ? '编辑任务' : '新建任务'}</h2>
          <button className={styles.closeBtn} onClick={closeTaskModal}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          {/* 标题 */}
          <div className={styles.field}>
            <div className={styles.titleWrapper}>
              <input
                name="title"
                ref={(el) => {
                  titleRegRef(el)
                  titleRef.current = el
                }}
                onChange={onTitleChange}
                onBlur={titleOnBlur}
                onKeyDown={onTitleKeyDown}
                placeholder={`任务名称，输入 # 快速打${tagTermLabel}`}
                className={styles.titleInput}
                autoFocus
              />
              {hashQuery !== null && matchedNodes.length > 0 && (
                <div className={styles.hashDropdown}>
                  {matchedNodes.map((node, idx) => (
                    <div
                      key={node.tag.id}
                      className={`${styles.hashItem} ${idx === hashCursor ? styles.hashItemActive : ''}`}
                      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectHashTag(node.tag)
                      }}
                    >
                      <span className={styles.hashDot} style={{ background: node.tag.color }} />
                      {node.tag.icon && <span>{node.tag.icon}</span>}
                      <span>{node.segment}</span>
                      {node.depth > 0 && <span className={styles.hashFullPath}>{node.tag.name}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.title && <span className={styles.error}>{errors.title.message}</span>}
          </div>

          {/* 目标 + 阶段（chip 触发下拉，与标签交互一致） */}
          <div className={styles.chipRow}>
            <GoalSelector
              goals={goals.filter((g) => g.status !== 'archived')}
              selectedGoalId={selectedGoalId}
              selectedPhaseId={selectedPhaseId}
              onSelectGoal={(id) => {
                setValue('goalId', id, { shouldDirty: true })
                setValue('phaseId', undefined, { shouldDirty: true })
              }}
              onSelectPhase={(id) => setValue('phaseId', id, { shouldDirty: true })}
              selectedGoal={selectedGoal}
              selectedPhase={selectedPhase}
            />
            <TagSelector
              tags={tags}
              selectedTagIds={selectedTagIds}
              onToggle={toggleTag}
            />
            <RoleSelector
              roles={roles}
              selectedRoleId={selectedRoleId}
              onSelect={(id) => setValue('roleId', selectedRoleId === id ? undefined : id, { shouldDirty: true })}
            />
          </div>

          {/* 时间 */}
          <div className={styles.timeRow}>
            <div className={styles.field}>
              <label>开始时间</label>
              <input type="datetime-local" {...register('startTime')} />
            </div>
            <div className={styles.field}>
              <label>结束时间</label>
              <input type="datetime-local" {...register('endTime')} />
            </div>
          </div>
          <div className={styles.inboxHint}>不填时间则任务进入 Inbox</div>

          {/* 备注 */}
          <div className={styles.field}>
            <textarea
              {...register('description')}
              placeholder="备注（可选）"
              rows={4}
              className={styles.textarea}
            />
          </div>

          {/* 预期产出 */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>预期产出</label>
            <textarea
              {...register('expectedOutput')}
              placeholder="完成这个任务后，期望产出什么？（可选）"
              rows={3}
              className={styles.textarea}
            />
          </div>

          {/* 操作按钮 */}
          <div className={styles.actions}>
            <div className={styles.leftActions}>
              {editingTask && (
                <button type="button" className={styles.deleteBtn} onClick={handleDelete}>
                  删除
                </button>
              )}
              {editingTask?.goalId && (
                <button
                  type="button"
                  className={styles.contextLinkBtn}
                  onClick={() => { closeTaskModal(); navigate(`/goals/${editingTask.goalId}`) }}
                >
                  查看上层背景 →
                </button>
              )}
            </div>
            <div className={styles.rightActions}>
              <button type="button" className={styles.cancelBtn} onClick={closeTaskModal}>
                取消
              </button>
              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function GoalSelector({
  goals,
  selectedGoalId,
  selectedPhaseId,
  onSelectGoal,
  onSelectPhase,
  selectedGoal,
  selectedPhase,
}: {
  goals: GoalWithPhases[]
  selectedGoalId: string | undefined
  selectedPhaseId: string | undefined
  onSelectGoal: (id: string | undefined) => void
  onSelectPhase: (id: string | undefined) => void
  selectedGoal: GoalWithPhases | undefined
  selectedPhase: { id: string; name: string; isDone: boolean } | undefined
}) {
  const [open, setOpen] = useState(false)
  const lockedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const { goalTermLabel } = useSettingsStore()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        lockedRef.current = false
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const closeAndUnlock = () => {
    setOpen(false)
    lockedRef.current = false
  }

  const handleGoalClick = (goalId: string) => {
    if (selectedGoalId === goalId) {
      onSelectGoal(undefined)
      onSelectPhase(undefined)
      closeAndUnlock()
    } else {
      onSelectGoal(goalId)
      onSelectPhase(undefined)
      // keep open to allow phase selection
    }
  }

  const handlePhaseClick = (phaseId: string) => {
    if (selectedPhaseId === phaseId) {
      onSelectPhase(undefined)
    } else {
      onSelectPhase(phaseId)
    }
    closeAndUnlock()
  }

  return (
    <div
      className={styles.chipSelector}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!lockedRef.current) setOpen(false) }}
    >
      <div
        className={`${styles.chipTrigger} ${selectedGoal ? styles.chipTriggerActive : ''}`}
        style={selectedGoal ? {
          background: selectedGoal.color + '18',
          color: selectedGoal.color,
          borderColor: selectedGoal.color + '88',
        } : {}}
        onClick={() => {
          if (lockedRef.current) {
            closeAndUnlock()
          } else {
            lockedRef.current = true
            setOpen(true)
          }
        }}
      >
        {selectedGoal ? (
          <>
            {selectedGoal.icon && <span>{selectedGoal.icon}</span>}
            <span className={styles.chipLabel}>{selectedGoal.name}</span>
            {selectedPhase && (
              <>
                <span className={styles.chipSep}>/</span>
                <span className={styles.chipLabel}>{selectedPhase.name}</span>
              </>
            )}
            <span
              className={styles.chipRemove}
              onMouseDown={(e) => {
                e.stopPropagation()
                onSelectGoal(undefined)
                onSelectPhase(undefined)
              }}
            >×</span>
          </>
        ) : (
          <span className={styles.chipPlaceholder}>● {goalTermLabel}</span>
        )}
      </div>

      {open && (
        <div className={styles.chipDropdown}>
          {goals.length === 0 ? (
            <div className={styles.chipDropdownEmpty}>暂无{goalTermLabel}</div>
          ) : (
            goals.map((goal) => (
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
                {selectedGoalId === goal.id && goal.phases.length > 0 && goal.phases.map((phase) => (
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
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TagSelector({
  tags,
  selectedTagIds,
  onToggle,
}: {
  tags: Tag[]
  selectedTagIds: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const lockedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const { addTag } = useTagStore()
  const { tagTermLabel } = useSettingsStore()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        lockedRef.current = false
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const sortedNodes = useMemo(() => {
    const sorted = [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
    const roots = buildTagTree(sorted, true)
    const rootColorMap = new Map<string, string>()
    function walk(nodes: typeof roots, rootColor: string | null) {
      for (const node of nodes) {
        const color = rootColor ?? node.tag.color
        if (node.tag.name === node.fullPath) rootColorMap.set(node.tag.id, color)
        if (node.children.length > 0) walk(node.children, color)
      }
    }
    walk(roots, null)
    return flattenTree(roots).map((node) => ({
      ...node,
      tag: { ...node.tag, color: rootColorMap.get(node.tag.id) ?? node.tag.color },
    }))
  }, [tags])

  const selectedTags = sortedNodes.filter((n) => selectedTagIds.includes(n.tag.id)).map((n) => n.tag)

  const handleSelect = async (node: ReturnType<typeof flattenTree>[number]) => {
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
      onToggle(created.id)
    } else {
      onToggle(node.tag.id)
    }
    setOpen(false)
    lockedRef.current = false
  }

  const selectedTag = selectedTags[0]

  return (
    <div
      className={styles.chipSelector}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!lockedRef.current) setOpen(false) }}
    >
      <div
        className={`${styles.chipTrigger} ${selectedTag ? styles.chipTriggerActive : ''}`}
        style={selectedTag ? {
          background: selectedTag.color + '18',
          color: selectedTag.color,
          borderColor: selectedTag.color + '88',
        } : {}}
        onClick={() => {
          if (lockedRef.current) {
            setOpen(false)
            lockedRef.current = false
          } else {
            lockedRef.current = true
            setOpen(true)
          }
        }}
      >
        {selectedTag ? (
          <>
            {selectedTag.icon && <span>{selectedTag.icon}</span>}
            <span className={styles.chipLabel}>{selectedTag.name}</span>
            <span
              className={styles.chipRemove}
              onMouseDown={(e) => { e.stopPropagation(); onToggle(selectedTag.id) }}
            >×</span>
          </>
        ) : (
          <span className={styles.chipPlaceholder}># {tagTermLabel}</span>
        )}
      </div>

      {open && tags.length > 0 && (
        <div className={styles.chipDropdown}>
          {sortedNodes.map((node) => {
            const isVirtual = isVirtualNode(node)
            const selected = !isVirtual && selectedTagIds.includes(node.tag.id)
            return (
              <div
                key={node.fullPath}
                className={`${styles.chipDropdownItem} ${selected ? styles.chipDropdownItemSelected : ''} ${isVirtual ? styles.chipDropdownItemVirtual : ''}`}
                style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(node) }}
              >
                <span className={styles.chipDropdownDot} style={{ background: node.tag.color }} />
                {node.tag.icon && <span>{node.tag.icon}</span>}
                <span className={styles.chipDropdownName}>{node.segment}</span>
                {isVirtual && <span className={styles.chipDropdownVirtual}>自动创建</span>}
                {selected && <span className={styles.chipDropdownCheck}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RoleSelector({
  roles,
  selectedRoleId,
  onSelect,
}: {
  roles: Role[]
  selectedRoleId: string | undefined
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const lockedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        lockedRef.current = false
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const closeAndUnlock = () => {
    setOpen(false)
    lockedRef.current = false
  }

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.sortOrder - b.sortOrder), [roles])
  const selectedRole = sortedRoles.find((r) => r.id === selectedRoleId)

  return (
    <div
      className={styles.chipSelector}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!lockedRef.current) setOpen(false) }}
    >
      <div
        className={`${styles.chipTrigger} ${selectedRole ? styles.chipTriggerActive : ''}`}
        style={selectedRole ? {
          background: selectedRole.color + '18',
          color: selectedRole.color,
          borderColor: selectedRole.color + '88',
        } : {}}
        onClick={() => {
          if (lockedRef.current) {
            closeAndUnlock()
          } else {
            lockedRef.current = true
            setOpen(true)
          }
        }}
      >
        {selectedRole ? (
          <>
            {selectedRole.icon && <span>{selectedRole.icon}</span>}
            <span className={styles.chipLabel}>{selectedRole.name}</span>
            <span
              className={styles.chipRemove}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(selectedRole.id) }}
            >×</span>
          </>
        ) : (
          <span className={styles.chipPlaceholder}>◆ 角色</span>
        )}
      </div>

      {open && (
        <div className={styles.chipDropdown}>
          {sortedRoles.length === 0 ? (
            <div className={styles.chipDropdownEmpty}>暂无角色</div>
          ) : (
            sortedRoles.map((role) => (
              <div
                key={role.id}
                className={`${styles.chipDropdownItem} ${selectedRoleId === role.id ? styles.chipDropdownItemSelected : ''}`}
                onMouseDown={(e) => { e.preventDefault(); onSelect(role.id); closeAndUnlock() }}
              >
                <span className={styles.chipDropdownDot} style={{ background: role.color }} />
                {role.icon && <span>{role.icon}</span>}
                <span className={styles.chipDropdownName}>{role.name}</span>
                {selectedRoleId === role.id && <span className={styles.chipDropdownCheck}>✓</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
