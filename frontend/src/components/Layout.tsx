import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { buildTagTree } from '@/utils/tagTree'
import type { TagTreeNode } from '@/utils/tagTree'
import { useTagStore } from '@/stores/tagStore'
import { useTaskStore } from '@/stores/taskStore'
import { useUiStore } from '@/stores/uiStore'
import { tagsApi } from '@/api/tags'
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
  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate('/calendar')} style={{ cursor: 'pointer' }}>
          时间管理
        </div>
        <SidebarStats onClickStats={() => navigate('/stats')} />
        <ActivityHeatmap />
        <TagTreeNav />
        <div className={styles.motto}>
          时间管理的目的是实现你的目标
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function SidebarStats({ onClickStats }: { onClickStats: () => void }) {
  const { tasks } = useTaskStore()
  const { tags } = useTagStore()
  const [activeDays, setActiveDays] = useState(0)

  useEffect(() => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 90)
    statsApi.get(start.toISOString(), end.toISOString())
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
        <span className={styles.statNum}>{tags.length}</span>
        <span className={styles.statLabel}>标签</span>
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

function TagTreeNav() {
  const { tags, reorderTags } = useTagStore()
  const { activeTagFilter, setTagFilter } = useUiStore()
  const [sortOrder, setSortOrder] = useState<'name' | 'manual'>('manual')

  const sortedTags = useMemo(() => {
    if (sortOrder === 'name') return [...tags].sort((a, b) => a.name.localeCompare(b.name))
    return [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tags, sortOrder])
  const tree = useMemo(() => buildTagTree(sortedTags, true), [sortedTags])

  // drag state: track which root fullPath is being dragged and hovered
  const dragSrcPath = useRef<string | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

  const handleDragStart = (fullPath: string) => {
    dragSrcPath.current = fullPath
  }

  const handleDragOver = (fullPath: string) => {
    if (dragSrcPath.current && dragSrcPath.current !== fullPath) {
      setDragOverPath(fullPath)
    }
  }

  const handleDrop = async (targetPath: string) => {
    const srcPath = dragSrcPath.current
    if (!srcPath || srcPath === targetPath) return
    dragSrcPath.current = null
    setDragOverPath(null)

    // Reorder root nodes: move srcPath to position of targetPath
    const rootPaths = tree.map((n) => n.fullPath)
    const srcIdx = rootPaths.indexOf(srcPath)
    const tgtIdx = rootPaths.indexOf(targetPath)
    if (srcIdx === -1 || tgtIdx === -1) return

    const newRootPaths = [...rootPaths]
    newRootPaths.splice(srcIdx, 1)
    newRootPaths.splice(tgtIdx, 0, srcPath)

    // Map root fullPath -> all tags under that root (by name prefix)
    const getTagsForRoot = (rootPath: string) =>
      tags.filter((t) => t.name === rootPath || t.name.startsWith(rootPath + '/'))

    const reordered: typeof tags = []
    for (const path of newRootPaths) {
      reordered.push(...getTagsForRoot(path))
    }
    // Tags not captured (shouldn't happen) at the end
    const captured = new Set(reordered.map((t) => t.id))
    for (const t of tags) { if (!captured.has(t.id)) reordered.push(t) }

    const withOrder = reordered.map((t, i) => ({ ...t, sortOrder: i }))
    reorderTags(withOrder)
    try {
      await tagsApi.reorder(withOrder.map(({ id, sortOrder }) => ({ id, sortOrder })))
    } catch {
      reorderTags(tags) // revert on error
    }
  }

  const handleDragEnd = () => {
    dragSrcPath.current = null
    setDragOverPath(null)
  }

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
            onClick={() => setSortOrder(o => o === 'name' ? 'manual' : 'name')}
            title="切换排序方式"
          >
            {sortOrder === 'name' ? '名称▾' : '手动▾'}
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
          draggable={sortOrder === 'manual'}
          isDragOver={dragOverPath === node.fullPath}
          onDragStart={() => handleDragStart(node.fullPath)}
          onDragOver={() => handleDragOver(node.fullPath)}
          onDrop={() => handleDrop(node.fullPath)}
          onDragEnd={handleDragEnd}
        />
      ))}

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
        style={{ paddingLeft: `${12 + node.depth * 14}px` }}
        onClick={() => onSelect(node.fullPath)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...dragHandlers}
      >
        {draggable && <span className={styles.dragHandle}>⠿</span>}
        {hasChildren ? (
          <span
            className={styles.expandIcon}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className={styles.expandIcon} />
        )}
        <span className={styles.tagNavDot} style={{ background: node.tag.color }} />
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
        />
      ))}
    </>
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
