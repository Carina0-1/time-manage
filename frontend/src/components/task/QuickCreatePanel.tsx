import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import type { CreateTaskInput } from '@time-manage/shared'
import { useTaskStore } from '@/stores/taskStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useUiStore } from '@/stores/uiStore'
import { tasksApi } from '@/api/tasks'
import DimensionSelector from '@/components/dimension/DimensionSelector'
import styles from './QuickCreatePanel.module.css'

const PanelFormSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  expectedOutput: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()),
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
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => fetchOptions(d.id))
  }, [dimensions, fetchOptions])

  const editingTask = editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  const getValuesRef = useRef<(() => PanelFormValues) | null>(null)
  const doSaveRef = useRef<(data: PanelFormValues) => Promise<void>>(async () => {})
  const isSavingRef = useRef(false)

  const { register, handleSubmit, reset, setValue, watch, getValues } = useForm<PanelFormValues>({
    resolver: zodResolver(PanelFormSchema),
    defaultValues: { id: nanoid(), title: '', dimensionValues: {} },
  })

  getValuesRef.current = getValues

  const dimensionValues = watch('dimensionValues') ?? {}

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
        dimensionValues: editingTask.dimensionValues,
      })
    } else {
      reset({ id: nanoid(), title: '', dimensionValues: {} })
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
      startTime: startRaw?.toISOString(),
      endTime: endRaw?.toISOString(),
      isAllDay,
      priority: 'medium',
      status: editingTask?.status ?? 'todo',
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
      dimensionValues: editingTask.dimensionValues,
      status: 'todo',
      priority: editingTask.priority,
    }
    const created = await tasksApi.create(input)
    addTask(created)
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

  const sortedDimensions = [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder)

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

        {/* 底部：维度选择器（动态遍历所有维度） */}
        <div className={styles.footer}>
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
      </form>
    </div>
  )
}
