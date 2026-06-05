import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import type { CreateTaskInput, Tag } from '@time-manage/shared'
import { buildTagTree, flattenTree, isVirtualNode } from '@/utils/tagTree'

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
import { tagsApi } from '@/api/tags'
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
      title: '',
      tagIds: [],
      isAllDay: false,
      status: 'todo',
      priority: 'medium',
    },
  })

  const selectedTagIds = watch('tagIds') ?? []

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

  // datetime-local 输入框需要 "YYYY-MM-DDTHH:mm" 格式
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
      tagIds: selectedTagIds.slice(0, 1),
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
    // 单标签：已选则取消，未选则替换
    const next = selectedTagIds[0] === tagId ? [] : [tagId]
    setValue('tagIds', next, { shouldDirty: true })
  }

  // # 打标签：选中后清除标题里的 #query，写入 tagId
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

  // title input 的 onChange，检测 # 触发下拉
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
                placeholder="任务名称，输入 # 快速打标签"
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

          {/* 优先级 */}
          <div className={styles.field}>
            <label>优先级</label>
            <select {...register('priority')}>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </div>

          {/* 标签 */}
          {tags.length > 0 && (
            <TagSelector
              tags={tags}
              selectedTagIds={selectedTagIds}
              onToggle={toggleTag}
            />
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
  const ref = useRef<HTMLDivElement>(null)
  const { addTag } = useTagStore()

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const sortedNodes = useMemo(() => {
    const sorted = [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
    const roots = buildTagTree(sorted, true)
    // 构建 tagId -> 根标签颜色的映射
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

  // 选中节点：虚拟节点先自动创建真实标签，再 toggle
  const handleSelect = async (node: ReturnType<typeof flattenTree>[number]) => {
    if (isVirtualNode(node)) {
      // 继承子标签的颜色
      const created = await tagsApi.create({
        id: nanoid(),
        name: node.fullPath,
        color: node.tag.color,
        icon: node.tag.icon,
        sortOrder: 0,
      })
      addTag(created)
      onToggle(created.id)
    } else {
      onToggle(node.tag.id)
    }
  }

  return (
    <div className={styles.field}>
      <label>标签</label>
      <div className={styles.tagSelector} ref={ref}>
        {/* 触发按钮 */}
        <div
          className={styles.tagSelectorTrigger}
          onClick={() => setOpen((o) => !o)}
        >
          {selectedTags.length === 0 ? (
            <span className={styles.tagSelectorPlaceholder}>选择标签…</span>
          ) : (
            <span
              className={styles.tagSelectorChip}
              style={{ background: selectedTags[0].color + '22', color: selectedTags[0].color, borderColor: selectedTags[0].color }}
            >
              {selectedTags[0].icon && <span>{selectedTags[0].icon}</span>}
              {selectedTags[0].name}
              <span
                className={styles.tagSelectorChipRemove}
                onMouseDown={(e) => { e.stopPropagation(); onToggle(selectedTags[0].id) }}
              >×</span>
            </span>
          )}
          <span className={styles.tagSelectorArrow}>{open ? '▴' : '▾'}</span>
        </div>

        {/* 下拉列表（树序 + 缩进，含虚拟节点） */}
        {open && (
          <div className={styles.tagSelectorDropdown}>
            {sortedNodes.map((node) => {
              const isVirtual = isVirtualNode(node)
              const selected = !isVirtual && selectedTagIds.includes(node.tag.id)
              return (
                <div
                  key={node.fullPath}
                  className={`${styles.tagSelectorItem} ${selected ? styles.tagSelectorItemSelected : ''} ${isVirtual ? styles.tagSelectorItemVirtual : ''}`}
                  style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(node) }}
                >
                  <span className={styles.tagSelectorDot} style={{ background: node.tag.color }} />
                  {node.tag.icon && <span>{node.tag.icon}</span>}
                  <span className={styles.tagSelectorName}>{node.segment}</span>
                  {isVirtual && <span className={styles.tagSelectorVirtualHint}>自动创建</span>}
                  {selected && <span className={styles.tagSelectorCheck}>✓</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
