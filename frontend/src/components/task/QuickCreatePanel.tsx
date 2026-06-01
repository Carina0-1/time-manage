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
import { tasksApi } from '@/api/tasks'
import { tagsApi } from '@/api/tags'
import styles from './QuickCreatePanel.module.css'

const PanelFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  tagIds: z.array(z.string()),
})

type PanelFormValues = z.infer<typeof PanelFormSchema>

export default function QuickCreatePanel() {
  const { taskModalOpen, editingTaskId, createDefaults, panelPos, closeTaskModal } = useUiStore()
  const { tasks, addTask, updateTask, removeTask } = useTaskStore()
  const { tags, addTag } = useTagStore()

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  // 用 ref 避免 stale closure 问题
  const getValuesRef = useRef<(() => PanelFormValues) | null>(null)
  const doSaveRef = useRef<(data: PanelFormValues) => Promise<void>>(async () => {})
  const isSavingRef = useRef(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
  } = useForm<PanelFormValues>({
    resolver: zodResolver(PanelFormSchema),
    defaultValues: { id: nanoid(), title: '', tagIds: [] },
  })

  getValuesRef.current = getValues

  const selectedTagIds = watch('tagIds') ?? []

  useEffect(() => {
    if (!taskModalOpen) return
    isSavingRef.current = false
    if (editingTask) {
      reset({
        id: editingTask.id,
        title: editingTask.title,
        description: editingTask.description ?? undefined,
        tagIds: editingTask.tagIds,
      })
    } else {
      reset({ id: nanoid(), title: '', tagIds: [] })
    }
  }, [taskModalOpen, editingTaskId, createDefaults, reset])

  // Position panel near click, flip if near viewport edge
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

    const start = editingTask
      ? new Date(editingTask.startTime)
      : (createDefaults?.start ?? new Date())
    const end = editingTask
      ? new Date(editingTask.endTime)
      : (createDefaults?.end ?? new Date())
    const isAllDay = editingTask ? editingTask.isAllDay : (createDefaults?.isAllDay ?? false)

    const input = {
      ...data,
      tagIds: data.tagIds.slice(0, 1),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      isAllDay,
      priority: editingTask?.priority ?? 'medium',
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

  // 点击外部：title 非空则保存，否则放弃
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

  // Escape：放弃
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

  // Time display
  const startDate = editingTask ? new Date(editingTask.startTime) : createDefaults?.start
  const endDate = editingTask ? new Date(editingTask.endTime) : createDefaults?.end
  const isAllDay = editingTask ? editingTask.isAllDay : createDefaults?.isAllDay

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const dateLabel = startDate
    ? `${dayjs(startDate).format('M月D日')} 周${WEEKDAYS[startDate.getDay()]}`
    : ''
  const timeLabel = (!isAllDay && startDate && endDate)
    ? `${dayjs(startDate).format('HH:mm')}-${dayjs(endDate).format('HH:mm')}`
    : '全天'

  // Tag selection
  const selectedTag = tags.find((t) => t.id === selectedTagIds[0])
  const sortedNodes = useMemo(() => flattenTree(buildTagTree(tags)), [tags])
  const [tagOpen, setTagOpen] = useState(false)
  const tagRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagOpen) return
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagOpen(false)
      }
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
    <div
      ref={panelRef}
      className={styles.panel}
      style={{ left: pos.left, top: pos.top }}
    >
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
        {/* 标题 */}
        <input
          {...register('title')}
          placeholder="准备做什么?"
          className={styles.titleInput}
          autoFocus
        />

        {/* 备注 */}
        <textarea
          {...register('description')}
          placeholder="备注（可选）"
          rows={2}
          className={styles.textarea}
        />

        {/* 底部：标签 + 回车提示 */}
        <div className={styles.footer}>
          <div className={styles.tagArea} ref={tagRef}>
            <button
              type="button"
              className={styles.tagBtn}
              onClick={() => setTagOpen((o) => !o)}
              style={selectedTag ? { color: selectedTag.color, borderColor: selectedTag.color + '66' } : {}}
              title={selectedTag?.name}
            >
              {selectedTag ? (
                <>
                  {selectedTag.icon && <span>{selectedTag.icon}</span>}
                  <span className={styles.tagBtnLabel}>{selectedTag.name}</span>
                  <span
                    className={styles.tagRemove}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setValue('tagIds', [], { shouldDirty: true })
                    }}
                  >×</span>
                </>
              ) : (
                <span className={styles.tagPlaceholder}># 标签</span>
              )}
            </button>
            {tagOpen && tags.length > 0 && (
              <div className={styles.tagDropdown}>
                {sortedNodes.map((node) => {
                  const virt = isVirtualNode(node)
                  const sel = !virt && selectedTagIds.includes(node.tag.id)
                  return (
                    <div
                      key={node.fullPath}
                      className={`${styles.tagItem} ${sel ? styles.tagItemSelected : ''} ${virt ? styles.tagItemVirtual : ''}`}
                      style={{ paddingLeft: `${10 + node.depth * 14}px` }}
                      onMouseDown={(e) => { e.preventDefault(); handleTagSelect(node) }}
                    >
                      <span className={styles.tagDot} style={{ background: node.tag.color }} />
                      {node.tag.icon && <span>{node.tag.icon}</span>}
                      <span>{node.segment}</span>
                      {virt && <span className={styles.tagVirtual}>自动创建</span>}
                      {sel && <span className={styles.tagCheck}>✓</span>}
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
