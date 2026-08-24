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
import type { Dimension, DimensionState } from '@time-manage/shared'
import { useDimensionStore } from '@/stores/dimensionStore'
import { dimensionStatesApi } from '@/api/dimensionStates'
import styles from './SettingsPage.module.css'
import formStyles from '../Layout.module.css'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1a1a1a',
]

const StateFormSchema = z.object({
  name: z.string().min(1, '请输入名称').max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择颜色').optional(),
})
type StateFormValues = z.infer<typeof StateFormSchema>

export default function StateManager({ dimension }: { dimension: Dimension }) {
  const { statesByDimension, fetchStates, addState, updateState, removeState, reorderStates } = useDimensionStore()
  const [showForm, setShowForm] = useState(false)
  const [editingStateId, setEditingStateId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const states = statesByDimension[dimension.id] ?? []
  const sortedStates = [...states].sort((a, b) => a.sortOrder - b.sortOrder)

  useEffect(() => {
    fetchStates(dimension.id)
  }, [dimension.id, fetchStates])

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<StateFormValues>({
    resolver: zodResolver(StateFormSchema),
    defaultValues: { name: '', color: PRESET_COLORS[0] },
  })

  const selectedColor = watch('color')

  const openCreate = () => {
    setEditingStateId(null)
    reset({ name: '', color: PRESET_COLORS[0] })
    setShowForm(true)
  }

  const openEdit = (state: DimensionState) => {
    setEditingStateId(state.id)
    reset({ name: state.name, color: state.color ?? PRESET_COLORS[0] })
    setShowForm(true)
  }

  const onSubmit = async (data: StateFormValues) => {
    if (editingStateId) {
      const updated = await dimensionStatesApi.update(editingStateId, { name: data.name, color: data.color })
      updateState(dimension.id, editingStateId, updated)
    } else {
      const nextOrder = states.length > 0 ? Math.max(...states.map((s) => s.sortOrder)) + 1 : 0
      const created = await dimensionStatesApi.create({
        id: nanoid(), dimensionId: dimension.id, name: data.name, color: data.color, sortOrder: nextOrder,
      })
      addState(dimension.id, created)
    }
    setShowForm(false)
  }

  const handleDelete = async (stateId: string) => {
    if (!confirm('删除该状态定义后，已有的时间线记录仍会保留，但不会再作为"当前状态"展示，确定删除吗？')) return
    await dimensionStatesApi.remove(stateId)
    removeState(dimension.id, stateId)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedStates.findIndex((s) => s.id === active.id)
    const newIndex = sortedStates.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedStates, oldIndex, newIndex).map((s, i) => ({ ...s, sortOrder: i }))
    reorderStates(dimension.id, reordered)
    try {
      await dimensionStatesApi.reorder(reordered.map((s) => ({ id: s.id, sortOrder: s.sortOrder })))
    } catch {
      reorderStates(dimension.id, sortedStates)
    }
  }

  return (
    <div className={styles.optionManager}>
      <div className={styles.optionManagerHeader}>
        <span>状态词表</span>
        <button className={styles.addBtn} onClick={openCreate} title="新建状态">＋</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedStates.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sortedStates.map((state) => (
            <SortableStateRow key={state.id} state={state} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </SortableContext>
      </DndContext>
      {states.length === 0 && <div className={styles.empty}>暂无状态，请先定义该维度下实体会经历哪些状态</div>}

      {showForm && (
        <div className={formStyles.formModalOverlay}>
          <div className={formStyles.formModal}>
            <div className={formStyles.formModalHeader}>
              <span>{editingStateId ? '编辑状态' : '新建状态'}</span>
              <button className={formStyles.formModalClose} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className={formStyles.formModalBody}>
              <div className={formStyles.formField}>
                <label>名称</label>
                <input {...register('name')} placeholder="例如：MVP验证" autoFocus className={formStyles.formInput} />
                {errors.name && <span className={formStyles.formError}>{errors.name.message}</span>}
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

function SortableStateRow({
  state,
  onEdit,
  onDelete,
}: {
  state: DimensionState
  onEdit: (state: DimensionState) => void
  onDelete: (stateId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: state.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={styles.optionRow}>
      <span className={formStyles.dragHandle} {...attributes} {...listeners}>⠿</span>
      <span className={styles.optionDot} style={{ background: state.color ?? 'var(--ink-faint)' }} />
      <span className={styles.optionName}>{state.name}</span>
      <button className={styles.linkBtnSmall} onClick={() => onEdit(state)}>编辑</button>
      <button className={styles.linkBtnSmallDanger} onClick={() => onDelete(state.id)}>删除</button>
    </div>
  )
}
