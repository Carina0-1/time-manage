import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { CreateTaskInput } from '@time-manage/shared'
import { buildOptionTree, flattenOptionTree } from '@/utils/dimensionTree'
import { useTaskStore } from '@/stores/taskStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useUiStore } from '@/stores/uiStore'
import { tasksApi } from '@/api/tasks'
import DimensionSelector from '@/components/dimension/DimensionSelector'
import { encodeTimes, toTimeFields } from '../tasks/taskForm'
import styles from './TaskModal.module.css'

const TaskFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1, '请填写任务名称').max(200),
  description: z.string().optional(),
  expectedOutput: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isAllDay: z.boolean(),
  dimensionValues: z.record(z.string(), z.string()),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
})

type TaskFormValues = z.infer<typeof TaskFormSchema>

export default function TaskModal() {
  const { taskModalOpen, panelPos, editingTaskId, createDefaults, closeTaskModal, openEditModal } = useUiStore()
  const { tasks, taskCache, loadTask, addTask, updateTask, removeTask } = useTaskStore()
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => fetchOptions(d.id))
  }, [dimensions, fetchOptions])

  const editingTask = editingTaskId ? (taskCache[editingTaskId] ?? tasks.find((t) => t.id === editingTaskId)) : null

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: {
      title: '',
      dimensionValues: {},
      isAllDay: false,
      status: 'todo',
    },
  })

  const dimensionValues = watch('dimensionValues') ?? {}
  const isAllDay = watch('isAllDay')
  const [detailError, setDetailError] = useState('')
  const requestClose = () => { if (!isSubmitting && (!isDirty || window.confirm('有未保存的任务内容，确定放弃吗？'))) closeTaskModal() }

  // # 快速打标签：只对第一个 tree 类型且展示中的维度生效
  const hashDimension = useMemo(
    () => [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder).find((d) => d.type === 'tree' && d.showInSidebar),
    [dimensions]
  )
  const [hashQuery, setHashQuery] = useState<string | null>(null)
  const [hashCursor, setHashCursor] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)

  const hashOptions = useMemo(() => {
    if (!hashDimension) return []
    const options = optionsByDimension[hashDimension.id] ?? []
    const flat = flattenOptionTree(buildOptionTree(options))
    if (!hashQuery) return flat
    const q = hashQuery.toLowerCase()
    return flat.filter((n) => n.option.name.toLowerCase().includes(q))
  }, [hashDimension, optionsByDimension, hashQuery])

  useEffect(() => {
    if (editingTaskId && !editingTask) {
      setDetailError('')
      loadTask(editingTaskId).catch(e => setDetailError(e instanceof Error ? e.message : '任务加载失败'))
    }
  }, [editingTaskId, editingTask?.id, loadTask])

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
        ...toTimeFields(editingTask),
        isAllDay: editingTask.isAllDay,
        dimensionValues: editingTask.dimensionValues,
        status: editingTask.status,
      })
    } else if (!editingTaskId) {
      reset({
        id: nanoid(),
        title: '',
        ...toTimeFields({ startTime: createDefaults?.start?.toISOString(), endTime: createDefaults?.end?.toISOString(), isAllDay: createDefaults?.isAllDay ?? false }),
        isAllDay: createDefaults?.isAllDay ?? false,
        dimensionValues: {},
        status: 'todo',
      })
    }
  }, [taskModalOpen, editingTaskId, editingTask?.id, createDefaults, reset])

  const onSubmit = async (data: TaskFormValues) => {
    const requiredMissing = dimensions.filter((d) => d.isRequired && !data.dimensionValues[d.id])
    if (requiredMissing.length > 0) {
      setError('root', { message: `请选择：${requiredMissing.map((d) => d.name).join('、')}` })
      return
    }

    try {
      const times = encodeTimes(data.startTime ?? '', data.endTime ?? '', data.isAllDay)
      const input = { ...data, title: data.title.trim(), priority: editingTask?.priority ?? 'medium', isAllDay: !!times.startTime && data.isAllDay }
      if (editingTask) {
        const updated = await tasksApi.update(editingTask.id, { ...input, ...times })
        updateTask(editingTask.id, updated)
      } else {
        const created = await tasksApi.create({ ...input, startTime: times.startTime ?? undefined, endTime: times.endTime ?? undefined })
        addTask(created)
      }
      closeTaskModal()
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : '保存失败，请重试' })
    }
  }

  const handleDelete = async () => {
    if (!editingTask) return
    if (!window.confirm(`删除「${editingTask.title}」？`)) return
    try {
      await tasksApi.remove(editingTask.id)
      removeTask(editingTask.id)
      closeTaskModal()
    } catch (e) { setError('root', { message: e instanceof Error ? e.message : '删除失败' }) }
  }

  const handleDuplicate = async () => {
    if (!editingTask) return
    const input: CreateTaskInput = {
      id: nanoid(),
      title: editingTask.title,
      description: editingTask.description ?? undefined,
      expectedOutput: editingTask.expectedOutput ?? undefined,
      startTime: editingTask.startTime ?? undefined,
      endTime: editingTask.endTime ?? undefined,
      isAllDay: editingTask.isAllDay,
      dimensionValues: editingTask.dimensionValues,
      status: 'todo',
      priority: editingTask.priority,
    }
    try {
      const created = await tasksApi.create(input)
      addTask(created)
      openEditModal(created.id)
    } catch (e) { setError('root', { message: e instanceof Error ? e.message : '复制失败' }) }
  }

  const selectHashOption = (option: { id: string; name: string }) => {
    if (!hashDimension) return
    const el = titleRef.current
    const currentTitle = el?.value ?? ''
    const lastHash = currentTitle.lastIndexOf('#')
    const newTitle = lastHash >= 0 ? currentTitle.slice(0, lastHash) : currentTitle
    setValue('title', newTitle, { shouldDirty: true })
    if (el) el.value = newTitle
    setValue('dimensionValues', { ...dimensionValues, [hashDimension.id]: option.id }, { shouldDirty: true })
    setHashQuery(null)
    setTimeout(() => el?.focus(), 0)
  }

  const { ref: titleRegRef, onBlur: titleOnBlur } = register('title')

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('title', val, { shouldValidate: false, shouldDirty: true })
    if (!hashDimension) return
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
    if (hashQuery === null || hashOptions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHashCursor((c) => Math.min(c + 1, hashOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHashCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectHashOption(hashOptions[hashCursor].option)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setHashQuery(null)
    }
  }

  if (!taskModalOpen || panelPos) return null

  if (editingTaskId && !editingTask) return <div className={styles.overlay} onClick={closeTaskModal}><div className={styles.modal} onClick={e => e.stopPropagation()}><div className={styles.form}>{detailError || '正在加载任务…'}<button onClick={closeTaskModal}>关闭</button></div></div></div>

  const sortedDimensions = [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className={styles.overlay} onClick={requestClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{editingTask ? '编辑任务' : '新建任务'}</h2>
          <button className={styles.closeBtn} onClick={requestClose}>✕</button>
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
                placeholder={hashDimension ? `任务名称，输入 # 快速打${hashDimension.name}` : '任务名称'}
                className={styles.titleInput}
                autoFocus
              />
              {hashQuery !== null && hashOptions.length > 0 && (
                <div className={styles.hashDropdown}>
                  {hashOptions.map(({ option, depth }, idx) => (
                    <div
                      key={option.id}
                      className={`${styles.hashItem} ${idx === hashCursor ? styles.hashItemActive : ''}`}
                      style={{ paddingLeft: `${12 + depth * 16}px` }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selectHashOption(option)
                      }}
                    >
                      <span className={styles.hashDot} style={{ background: option.color }} />
                      {option.icon && <span>{option.icon}</span>}
                      <span>{option.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.title && <span className={styles.error}>{errors.title.message}</span>}
            {errors.root && <span className={styles.error}>{errors.root.message}</span>}
          </div>

          {/* 维度选择器（动态遍历所有维度） */}
          <div className={styles.chipRow}>
            {sortedDimensions.map((dim) => (
              <DimensionSelector
                key={dim.id}
                dimension={dim}
                options={optionsByDimension[dim.id] ?? []}
                selectedOptionId={dimensionValues[dim.id]}
                onSelect={(optionId) => {
                  const next = { ...dimensionValues }
                  if (optionId) next[dim.id] = optionId
                  else delete next[dim.id]
                  setValue('dimensionValues', next, { shouldDirty: true })
                }}
              />
            ))}
          </div>

          {/* 时间 */}
          <div className={styles.timeRow}>
            <div className={styles.field}>
              <label>开始{isAllDay ? '日期' : '时间'}</label>
              <input aria-label="开始时间" type={isAllDay ? 'date' : 'datetime-local'} {...register('startTime')} />
            </div>
            <div className={styles.field}>
              <label>结束{isAllDay ? '日期（含当天）' : '时间'}</label>
              <input aria-label="结束时间" type={isAllDay ? 'date' : 'datetime-local'} {...register('endTime')} />
            </div>
          </div>
          <label className={styles.allDayToggle}><input type="checkbox" checked={isAllDay} onChange={e => {
            const allDay = e.target.checked
            for (const key of ['startTime', 'endTime'] as const) {
              const value = watch(key)
              if (value) setValue(key, `${value.slice(0, 10)}${allDay ? '' : key === 'startTime' ? 'T09:00' : 'T10:00'}`, { shouldDirty: true })
            }
            setValue('isAllDay', allDay, { shouldDirty: true })
          }} />全天任务</label>
          <div className={styles.inboxHint}>不填时间可先保存为未排期任务</div>

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
              {editingTask && (
                <button type="button" className={styles.contextLinkBtn} onClick={handleDuplicate}>
                  复制任务
                </button>
              )}
            </div>
            <div className={styles.rightActions}>
              <button type="button" className={styles.cancelBtn} onClick={requestClose}>
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
