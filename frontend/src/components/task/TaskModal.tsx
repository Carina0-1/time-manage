import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import type { CreateTaskInput } from '@time-manage/shared'

// 前端表单 schema：时间字段接受 datetime-local 原生格式 "YYYY-MM-DDTHH:mm"
const TaskFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1, '请填写任务名称').max(200),
  description: z.string().optional(),
  startTime: z.string().min(1, '请选择开始时间'),
  endTime: z.string().min(1, '请选择结束时间'),
  isAllDay: z.boolean(),
  tagIds: z.array(z.string()),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high']),
  color: z.string().nullish(),
})

type TaskFormValues = z.infer<typeof TaskFormSchema>
import { useTaskStore } from '@/stores/taskStore'
import { useTagStore } from '@/stores/tagStore'
import { useUiStore } from '@/stores/uiStore'
import { tasksApi } from '@/api/tasks'
import styles from './TaskModal.module.css'

export default function TaskModal() {
  const { taskModalOpen, editingTaskId, createDefaults, closeTaskModal } = useUiStore()
  const { tasks, addTask, updateTask, removeTask } = useTaskStore()
  const { tags } = useTagStore()

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
      tagIds: [],
      isAllDay: false,
      status: 'todo',
      priority: 'medium',
    },
  })

  const selectedTagIds = watch('tagIds') ?? []

  // datetime-local 输入框需要 "YYYY-MM-DDTHH:mm" 格式
  const toLocalInput = (iso: string) => dayjs(iso).format('YYYY-MM-DDTHH:mm')

  useEffect(() => {
    if (!taskModalOpen) return
    if (editingTask) {
      reset({
        id: editingTask.id,
        title: editingTask.title,
        description: editingTask.description ?? undefined,
        startTime: toLocalInput(editingTask.startTime),
        endTime: toLocalInput(editingTask.endTime),
        isAllDay: editingTask.isAllDay,
        tagIds: editingTask.tagIds,
        status: editingTask.status,
        priority: editingTask.priority,
        color: editingTask.color ?? undefined,
      })
    } else if (createDefaults) {
      reset({
        id: nanoid(),
        title: '',
        startTime: toLocalInput(createDefaults.start.toISOString()),
        endTime: toLocalInput(createDefaults.end.toISOString()),
        isAllDay: createDefaults.isAllDay,
        tagIds: [],
        status: 'todo',
        priority: 'medium',
      })
    }
  }, [taskModalOpen, editingTaskId, createDefaults, reset])

  const onSubmit = async (data: TaskFormValues) => {
    const input = {
      ...data,
      tagIds: selectedTagIds,
      startTime: new Date(data.startTime!).toISOString(),
      endTime: new Date(data.endTime!).toISOString(),
    } as CreateTaskInput
    if (editingTask) {
      const updated = await tasksApi.update(editingTask.id, input)
      updateTask(editingTask.id, updated)
    } else {
      const created = await tasksApi.create(input)
      addTask(created)
    }
    closeTaskModal()
  }

  const handleDelete = async () => {
    if (!editingTask) return
    await tasksApi.remove(editingTask.id)
    removeTask(editingTask.id)
    closeTaskModal()
  }

  const toggleTag = (tagId: string) => {
    const current = selectedTagIds
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]
    setValue('tagIds', next, { shouldDirty: true })
  }

  if (!taskModalOpen) return null

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
            <input
              {...register('title')}
              placeholder="任务名称"
              className={styles.titleInput}
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title.message}</span>}
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

          {/* 优先级 & 状态 */}
          <div className={styles.timeRow}>
            <div className={styles.field}>
              <label>优先级</label>
              <select {...register('priority')}>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>完成状态</label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={watch('status') === 'done'}
                  onChange={(e) =>
                    setValue('status', e.target.checked ? 'done' : 'todo', { shouldDirty: true })
                  }
                />
                已完成
              </label>
            </div>
          </div>

          {/* 标签 */}
          {tags.length > 0 && (
            <div className={styles.field}>
              <label>标签</label>
              <div className={styles.tagList}>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`${styles.tagChip} ${selectedTagIds.includes(tag.id) ? styles.tagSelected : ''}`}
                    style={{ '--tag-color': tag.color } as React.CSSProperties}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.icon && <span>{tag.icon}</span>}
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 备注 */}
          <div className={styles.field}>
            <textarea
              {...register('description')}
              placeholder="备注（可选）"
              rows={2}
              className={styles.textarea}
            />
          </div>

          {/* 操作按钮 */}
          <div className={styles.actions}>
            {editingTask && (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={handleDelete}
              >
                删除
              </button>
            )}
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
