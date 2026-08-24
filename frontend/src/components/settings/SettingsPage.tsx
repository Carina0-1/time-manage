import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Dimension, DimensionOption, DimensionType } from '@time-manage/shared'
import { useDimensionStore } from '@/stores/dimensionStore'
import { dimensionsApi } from '@/api/dimensions'
import { buildOptionTree, flattenOptionTree } from '@/utils/dimensionTree'
import StateManager from './StateManager'
import OptionTimelinePanel from './OptionTimelinePanel'
import styles from './SettingsPage.module.css'
import formStyles from '../Layout.module.css'

const PRESET_EMOJIS = [
  '💼', '📁', '📂', '📋', '📌', '📍', '✏️', '📝', '📖', '📚',
  '🖥️', '💻', '⌨️', '🖨️', '📱', '☎️', '📧', '📨', '📩', '🗂️',
  '🏠', '🏡', '🛒', '🍽️', '☕', '🍎', '🥗', '💊', '🏃', '🧘',
  '💪', '🛌', '🚗', '✈️', '🚂', '🚲', '🛵', '⛽', '🗺️', '🏖️',
  '🎮', '🎵', '🎸', '🎨', '📷', '🎬', '📺', '📻', '🎤', '🎭',
  '⚽', '🏀', '🎾', '🏋️', '🎯', '♟️', '🃏', '🎲', '🎪', '🎠',
  '💰', '💳', '📈', '📉', '🏦', '💹', '💎', '🏆', '🥇', '⭐',
  '✅', '🔑', '🔒', '🔓', '⚡', '🔥', '💡', '🌟', '🎉', '🎊',
  '🌱', '🌿', '🌸', '🌻', '🍀', '🌈', '☀️', '🌙', '⛅', '❄️',
  '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '💕', '😊',
]

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1a1a1a',
]

const DimensionFormSchema = z.object({
  name: z.string().min(1, '请输入名称').max(50),
  type: z.enum(['single', 'tree', 'entity']),
  icon: z.string().optional(),
  isRequired: z.boolean(),
  showInSidebar: z.boolean(),
})
type DimensionFormValues = z.infer<typeof DimensionFormSchema>

const OptionFormSchema = z.object({
  name: z.string().min(1, '请输入名称').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择颜色'),
  icon: z.string().optional(),
  parentId: z.string().optional(),
})
type OptionFormValues = z.infer<typeof OptionFormSchema>

export default function SettingsPage() {
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions, addDimension, updateDimension, removeDimension, reorderDimensions } = useDimensionStore()
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null)
  const [showDimensionForm, setShowDimensionForm] = useState(false)
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null)
  const dimensionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => fetchOptions(d.id))
  }, [dimensions, fetchOptions])

  useEffect(() => {
    if (!selectedDimensionId && dimensions.length > 0) setSelectedDimensionId(dimensions[0].id)
  }, [dimensions, selectedDimensionId])

  const sortedDimensions = [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder)
  const selectedDimension = dimensions.find((d) => d.id === selectedDimensionId) ?? null

  const {
    register: dimRegister,
    handleSubmit: dimHandleSubmit,
    reset: dimReset,
    setValue: dimSetValue,
    watch: dimWatch,
    formState: { errors: dimErrors, isSubmitting: dimSubmitting },
  } = useForm<DimensionFormValues>({
    resolver: zodResolver(DimensionFormSchema),
    defaultValues: { name: '', type: 'single', isRequired: false, showInSidebar: true },
  })

  const openCreateDimension = () => {
    setEditingDimensionId(null)
    dimReset({ name: '', type: 'single', icon: '', isRequired: false, showInSidebar: true })
    setShowDimensionForm(true)
  }

  const openEditDimension = (dim: Dimension) => {
    setEditingDimensionId(dim.id)
    dimReset({ name: dim.name, type: dim.type, icon: dim.icon ?? '', isRequired: dim.isRequired, showInSidebar: dim.showInSidebar })
    setShowDimensionForm(true)
  }

  const onDimensionSubmit = async (data: DimensionFormValues) => {
    if (editingDimensionId) {
      const updated = await dimensionsApi.update(editingDimensionId, {
        name: data.name, icon: data.icon, isRequired: data.isRequired, showInSidebar: data.showInSidebar,
      })
      updateDimension(editingDimensionId, updated)
    } else {
      const nextOrder = dimensions.length > 0 ? Math.max(...dimensions.map((d) => d.sortOrder)) + 1 : 0
      const created = await dimensionsApi.create({
        id: nanoid(), name: data.name, type: data.type, icon: data.icon,
        isRequired: data.isRequired, showInSidebar: data.showInSidebar, sortOrder: nextOrder,
      })
      addDimension(created)
      setSelectedDimensionId(created.id)
    }
    setShowDimensionForm(false)
  }

  const handleDeleteDimension = async (id: string) => {
    if (!confirm('删除该维度将清空所有任务在该维度上的取值，任务本身不会被删除，确定删除吗？')) return
    await dimensionsApi.remove(id)
    removeDimension(id)
    if (selectedDimensionId === id) setSelectedDimensionId(null)
  }

  const handleSetColorSource = async (id: string) => {
    await dimensionsApi.setColorSource(id)
    dimensions.forEach((d) => updateDimension(d.id, { isColorSource: d.id === id }))
  }

  const handleDimensionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedDimensions.findIndex((d) => d.id === active.id)
    const newIndex = sortedDimensions.findIndex((d) => d.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedDimensions, oldIndex, newIndex).map((d, i) => ({ ...d, sortOrder: i }))
    reorderDimensions(reordered)
    try {
      await dimensionsApi.reorder(reordered.map((d) => ({ id: d.id, sortOrder: d.sortOrder })))
    } catch {
      reorderDimensions(sortedDimensions)
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>设置</h1>
      <div className={styles.layout}>
        <div className={styles.dimensionList}>
          <div className={styles.dimensionListHeader}>
            <span>维度</span>
            <button className={styles.addBtn} onClick={openCreateDimension} title="新建维度">＋</button>
          </div>
          <DndContext sensors={dimensionSensors} collisionDetection={closestCenter} onDragEnd={handleDimensionDragEnd}>
            <SortableContext items={sortedDimensions.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {sortedDimensions.map((dim) => (
                <SortableDimensionItem
                  key={dim.id}
                  dimension={dim}
                  active={selectedDimensionId === dim.id}
                  onSelect={() => setSelectedDimensionId(dim.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className={styles.detail}>
          {selectedDimension ? (
            <>
              <div className={styles.detailHeader}>
                <h2>{selectedDimension.icon} {selectedDimension.name}</h2>
                <div className={styles.detailActions}>
                  <button className={styles.linkBtn} onClick={() => openEditDimension(selectedDimension)}>编辑维度</button>
                  <button
                    className={styles.linkBtn}
                    onClick={() => handleSetColorSource(selectedDimension.id)}
                    disabled={selectedDimension.isColorSource}
                  >
                    {selectedDimension.isColorSource ? '当前配色维度' : '设为配色维度'}
                  </button>
                  <button className={styles.linkBtnDanger} onClick={() => handleDeleteDimension(selectedDimension.id)}>删除维度</button>
                </div>
              </div>
              <div className={styles.detailMeta}>
                <span>类型：{selectedDimension.type === 'tree' ? '树形（多级）' : selectedDimension.type === 'entity' ? '实体型（带状态时间线）' : '单选（平铺）'}</span>
                <span>必填：{selectedDimension.isRequired ? '是' : '否'}</span>
                <span>侧边栏展示：{selectedDimension.showInSidebar ? '是' : '否'}</span>
              </div>
              {selectedDimension.type === 'entity' && (
                <StateManager dimension={selectedDimension} />
              )}
              <OptionManager
                dimension={selectedDimension}
                options={optionsByDimension[selectedDimension.id] ?? []}
              />
            </>
          ) : (
            <div className={styles.empty}>请选择或新建一个维度</div>
          )}
        </div>
      </div>

      {showDimensionForm && (
        <div className={formStyles.formModalOverlay}>
          <div className={formStyles.formModal}>
            <div className={formStyles.formModalHeader}>
              <span>{editingDimensionId ? '编辑维度' : '新建维度'}</span>
              <button className={formStyles.formModalClose} onClick={() => setShowDimensionForm(false)}>✕</button>
            </div>
            <form onSubmit={dimHandleSubmit(onDimensionSubmit)} className={formStyles.formModalBody}>
              <div className={formStyles.formField}>
                <label>维度名称</label>
                <input {...dimRegister('name')} placeholder="例如：优先级" autoFocus className={formStyles.formInput} />
                {dimErrors.name && <span className={formStyles.formError}>{dimErrors.name.message}</span>}
              </div>
              <div className={formStyles.formField}>
                <label>类型{editingDimensionId ? '（创建后不可修改）' : ''}</label>
                <select {...dimRegister('type')} disabled={!!editingDimensionId} className={formStyles.formInput}>
                  <option value="single">单选（平铺列表）</option>
                  <option value="tree">单选（树形，多级标签）</option>
                  <option value="entity">实体型（带状态时间线）</option>
                </select>
              </div>
              <div className={formStyles.formField}>
                <label>图标（可选）</label>
                <div className={formStyles.emojiPickerRow}>
                  <span
                    className={`${formStyles.emojiSelected} ${!dimWatch('icon') ? formStyles.emojiSelectedEmpty : ''}`}
                    onClick={() => dimSetValue('icon', '', { shouldDirty: true })}
                  >
                    {dimWatch('icon') || '—'}
                  </span>
                  <div className={formStyles.emojiGrid}>
                    {PRESET_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`${formStyles.emojiBtn} ${dimWatch('icon') === emoji ? formStyles.emojiBtnSelected : ''}`}
                        onClick={() => dimSetValue('icon', dimWatch('icon') === emoji ? '' : emoji, { shouldDirty: true })}
                      >{emoji}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={formStyles.formField}>
                <label>
                  <input type="checkbox" {...dimRegister('isRequired')} /> 创建任务时必须填写该维度
                </label>
              </div>
              <div className={formStyles.formField}>
                <label>
                  <input type="checkbox" {...dimRegister('showInSidebar')} /> 在侧边栏与日历卡片展示
                </label>
              </div>
              <div className={formStyles.formActions}>
                <button type="button" className={formStyles.formCancelBtn} onClick={() => setShowDimensionForm(false)}>取消</button>
                <button type="submit" className={formStyles.formSubmitBtn} disabled={dimSubmitting}>
                  {dimSubmitting ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableDimensionItem({
  dimension,
  active,
  onSelect,
}: {
  dimension: Dimension
  active: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dimension.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.dimensionItem} ${active ? styles.dimensionItemActive : ''}`}
      onClick={onSelect}
    >
      <span
        className={formStyles.dragHandle}
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >⠿</span>
      <span>{dimension.icon}</span>
      <span className={styles.dimensionItemName}>{dimension.name}</span>
      <span className={styles.dimensionItemType}>{dimension.type === 'tree' ? '树形' : '单选'}</span>
      {dimension.isColorSource && <span className={styles.colorBadge} title="配色维度">🎨</span>}
    </div>
  )
}

function OptionManager({ dimension, options }: { dimension: Dimension; options: DimensionOption[] }) {
  const { addOption, updateOption, removeOption, reorderOptions, statesByDimension, currentStateByOption, fetchStates, fetchCurrentStates } = useDimensionStore()
  const [showForm, setShowForm] = useState(false)
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [parentForNew, setParentForNew] = useState<string | undefined>(undefined)
  const [timelineOption, setTimelineOption] = useState<DimensionOption | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (dimension.type === 'entity') {
      fetchStates(dimension.id)
      fetchCurrentStates(dimension.id)
    }
  }, [dimension.id, dimension.type, fetchStates, fetchCurrentStates])

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<OptionFormValues>({
    resolver: zodResolver(OptionFormSchema),
    defaultValues: { name: '', color: PRESET_COLORS[0] },
  })

  const selectedColor = watch('color')
  const tree = buildOptionTree(options)
  const flatOptions = flattenOptionTree(tree)

  const openCreate = (parentId?: string) => {
    setEditingOptionId(null)
    setParentForNew(parentId)
    reset({ name: '', color: PRESET_COLORS[0], icon: '', parentId })
    setShowForm(true)
  }

  const openEdit = (option: DimensionOption) => {
    setEditingOptionId(option.id)
    setParentForNew(undefined)
    reset({ name: option.name, color: option.color, icon: option.icon ?? '', parentId: option.parentId })
    setShowForm(true)
  }

  const onSubmit = async (data: OptionFormValues) => {
    if (editingOptionId) {
      const updated = await dimensionsApi.updateOption(editingOptionId, {
        name: data.name, color: data.color, icon: data.icon,
        parentId: dimension.type === 'tree' ? (data.parentId || undefined) : undefined,
      })
      updateOption(dimension.id, editingOptionId, updated)
    } else {
      const nextOrder = options.length > 0 ? Math.max(...options.map((o) => o.sortOrder)) + 1 : 0
      const created = await dimensionsApi.createOption({
        id: nanoid(), dimensionId: dimension.id,
        parentId: dimension.type === 'tree' ? ((parentForNew || data.parentId) || undefined) : undefined,
        name: data.name, color: data.color, icon: data.icon, sortOrder: nextOrder,
      })
      addOption(dimension.id, created)
    }
    setShowForm(false)
  }

  const handleDelete = async (optionId: string) => {
    if (!confirm('删除该选项将清空所有任务在该维度上的取值（若有子节点也一并删除），任务本身不会被删除，确定删除吗？')) return
    await dimensionsApi.removeOption(optionId)
    removeOption(dimension.id, optionId)
  }

  // 平铺列表：整体拖拽排序
  const sortedFlatOptions = [...options].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleFlatDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedFlatOptions.findIndex((o) => o.id === active.id)
    const newIndex = sortedFlatOptions.findIndex((o) => o.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedFlatOptions, oldIndex, newIndex).map((o, i) => ({ ...o, sortOrder: i }))
    reorderOptions(dimension.id, reordered)
    try {
      await dimensionsApi.reorderOptions(reordered.map((o) => ({ id: o.id, sortOrder: o.sortOrder })))
    } catch {
      reorderOptions(dimension.id, sortedFlatOptions)
    }
  }

  // 树形列表：同一父节点下的兄弟节点之间拖拽排序（不改变父子关系）
  const handleTreeDragEnd = async (parentId: string | null, event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const siblings = options.filter((o) => (o.parentId ?? null) === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
    const oldIndex = siblings.findIndex((o) => o.id === active.id)
    const newIndex = siblings.findIndex((o) => o.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reorderedSiblings = arrayMove(siblings, oldIndex, newIndex).map((o, i) => ({ ...o, sortOrder: i }))
    const merged = options.map((o) => reorderedSiblings.find((r) => r.id === o.id) ?? o)
    reorderOptions(dimension.id, merged)
    try {
      await dimensionsApi.reorderOptions(reorderedSiblings.map((o) => ({ id: o.id, sortOrder: o.sortOrder })))
    } catch {
      reorderOptions(dimension.id, options)
    }
  }

  return (
    <div className={styles.optionManager}>
      <div className={styles.optionManagerHeader}>
        <span>选项</span>
        <button className={styles.addBtn} onClick={() => openCreate()} title="新建选项">＋</button>
      </div>

      {dimension.type === 'tree' ? (
        <TreeOptionList
          tree={tree}
          sensors={sensors}
          onDragEnd={handleTreeDragEnd}
          onAddChild={openCreate}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFlatDragEnd}>
          <SortableContext items={sortedFlatOptions.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            {sortedFlatOptions.map((option) => (
              <SortableOptionRow
                key={option.id}
                option={option}
                onEdit={openEdit}
                onDelete={handleDelete}
                dimensionType={dimension.type}
                currentState={currentStateByOption[option.id]}
                onOpenTimeline={dimension.type === 'entity' ? () => setTimelineOption(option) : undefined}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      {options.length === 0 && <div className={styles.empty}>暂无选项</div>}

      {timelineOption && (
        <OptionTimelinePanel
          option={timelineOption}
          states={statesByDimension[dimension.id] ?? []}
          onClose={() => {
            setTimelineOption(null)
            fetchCurrentStates(dimension.id)
          }}
        />
      )}

      {showForm && (
        <div className={formStyles.formModalOverlay}>
          <div className={formStyles.formModal}>
            <div className={formStyles.formModalHeader}>
              <span>{editingOptionId ? '编辑选项' : '新建选项'}</span>
              <button className={formStyles.formModalClose} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className={formStyles.formModalBody}>
              <div className={formStyles.formField}>
                <label>名称</label>
                <input {...register('name')} autoFocus className={formStyles.formInput} />
                {errors.name && <span className={formStyles.formError}>{errors.name.message}</span>}
              </div>
              {dimension.type === 'tree' && (
                <div className={formStyles.formField}>
                  <label>上级节点（可选）</label>
                  <select {...register('parentId')} className={formStyles.formInput}>
                    <option value="">（无，作为根节点）</option>
                    {flatOptions
                      .filter((n) => n.option.id !== editingOptionId)
                      .map(({ option, depth }) => (
                        <option key={option.id} value={option.id}>
                          {'　'.repeat(depth)}{option.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className={formStyles.formField}>
                <label>图标（可选）</label>
                <div className={formStyles.emojiPickerRow}>
                  <span
                    className={`${formStyles.emojiSelected} ${!watch('icon') ? formStyles.emojiSelectedEmpty : ''}`}
                    onClick={() => setValue('icon', '', { shouldDirty: true })}
                  >
                    {watch('icon') || '—'}
                  </span>
                  <div className={formStyles.emojiGrid}>
                    {PRESET_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`${formStyles.emojiBtn} ${watch('icon') === emoji ? formStyles.emojiBtnSelected : ''}`}
                        onClick={() => setValue('icon', watch('icon') === emoji ? '' : emoji, { shouldDirty: true })}
                      >{emoji}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={formStyles.formField}>
                <label>颜色</label>
                <div className={formStyles.colorGrid}>
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`${formStyles.colorDot} ${selectedColor === color ? formStyles.colorDotSelected : ''}`}
                      style={{ background: color }}
                      onClick={() => setValue('color', color)}
                    />
                  ))}
                </div>
                <div className={formStyles.colorCustomRow}>
                  <span className={formStyles.colorPreview} style={{ background: selectedColor }} />
                  <input type="color" value={selectedColor} onChange={(e) => setValue('color', e.target.value)} className={formStyles.colorPicker} />
                  <span className={formStyles.colorHex}>{selectedColor}</span>
                </div>
              </div>
              <div className={formStyles.formActions}>
                <button type="button" className={formStyles.formCancelBtn} onClick={() => setShowForm(false)}>取消</button>
                <button type="submit" className={formStyles.formSubmitBtn} disabled={isSubmitting}>
                  {isSubmitting ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TreeOptionList({
  tree,
  sensors,
  onDragEnd,
  onAddChild,
  onEdit,
  onDelete,
}: {
  tree: ReturnType<typeof buildOptionTree>
  sensors: ReturnType<typeof useSensors>
  onDragEnd: (parentId: string | null, event: DragEndEvent) => void
  onAddChild: (parentId: string) => void
  onEdit: (option: DimensionOption) => void
  onDelete: (optionId: string) => void
}) {
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(null, e)}>
      <SortableContext items={tree.map((n) => n.option.id)} strategy={verticalListSortingStrategy}>
        {tree.map((node) => (
          <TreeOptionNode
            key={node.option.id}
            node={node}
            sensors={sensors}
            onDragEnd={onDragEnd}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function TreeOptionNode({
  node,
  sensors,
  onDragEnd,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: ReturnType<typeof buildOptionTree>[number]
  sensors: ReturnType<typeof useSensors>
  onDragEnd: (parentId: string | null, event: DragEndEvent) => void
  onAddChild: (parentId: string) => void
  onEdit: (option: DimensionOption) => void
  onDelete: (optionId: string) => void
}) {
  const { option, depth, children } = node
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className={styles.optionRow} style={{ paddingLeft: `${depth * 20}px` }}>
        <span className={formStyles.dragHandle} {...attributes} {...listeners}>⠿</span>
        <span className={styles.optionDot} style={{ background: option.color }} />
        {option.icon && <span>{option.icon}</span>}
        <span className={styles.optionName}>{option.name}</span>
        <button className={styles.linkBtnSmall} onClick={() => onAddChild(option.id)}>添加子节点</button>
        <button className={styles.linkBtnSmall} onClick={() => onEdit(option)}>编辑</button>
        <button className={styles.linkBtnSmallDanger} onClick={() => onDelete(option.id)}>删除</button>
      </div>
      {children.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(option.id, e)}>
          <SortableContext items={children.map((c) => c.option.id)} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <TreeOptionNode
                key={child.option.id}
                node={child}
                sensors={sensors}
                onDragEnd={onDragEnd}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function SortableOptionRow({
  option,
  onEdit,
  onDelete,
  dimensionType,
  currentState,
  onOpenTimeline,
}: {
  option: DimensionOption
  onEdit: (option: DimensionOption) => void
  onDelete: (optionId: string) => void
  dimensionType?: DimensionType
  currentState?: { name: string; color?: string }
  onOpenTimeline?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={styles.optionRow}>
      <span className={formStyles.dragHandle} {...attributes} {...listeners}>⠿</span>
      <span className={styles.optionDot} style={{ background: option.color }} />
      {option.icon && <span>{option.icon}</span>}
      <span className={styles.optionName}>{option.name}</span>
      {dimensionType === 'entity' && (
        <button className={styles.linkBtnSmall} onClick={onOpenTimeline}>
          状态时间线
          {currentState && (
            <span
              className={styles.stateBadge}
              style={{ background: currentState.color ? currentState.color + '20' : 'var(--panel-2)', color: currentState.color ?? 'var(--ink-faint)' }}
            >
              {currentState.name}
            </span>
          )}
        </button>
      )}
      <button className={styles.linkBtnSmall} onClick={() => onEdit(option)}>编辑</button>
      <button className={styles.linkBtnSmallDanger} onClick={() => onDelete(option.id)}>删除</button>
    </div>
  )
}

