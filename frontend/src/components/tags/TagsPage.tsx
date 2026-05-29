import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { useTagStore } from '@/stores/tagStore'
import { tagsApi } from '@/api/tags'
import styles from './TagsPage.module.css'

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

export default function TagsPage() {
  const { tags, fetchTags, addTag, updateTag, removeTag } = useTagStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { fetchTags() }, [fetchTags])

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
    setEditingId(null)
    reset({ name: '', color: PRESET_COLORS[0], icon: '' })
    setShowForm(true)
  }

  const openEdit = (id: string) => {
    const tag = tags.find((t) => t.id === id)
    if (!tag) return
    setEditingId(id)
    reset({ name: tag.name, color: tag.color, icon: tag.icon ?? '' })
    setShowForm(true)
  }

  const onSubmit = async (data: TagFormValues) => {
    if (editingId) {
      const updated = await tagsApi.update(editingId, data)
      updateTag(editingId, updated)
    } else {
      const created = await tagsApi.create({ id: nanoid(), ...data })
      addTag(created)
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    await tagsApi.remove(id)
    removeTag(id)
    if (editingId === id) setShowForm(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>标签管理</h1>
        <button className={styles.addBtn} onClick={openCreate}>+ 新建标签</button>
      </div>

      <div className={styles.content}>
        {/* 标签列表 */}
        <div className={styles.list}>
          {tags.length === 0 && (
            <div className={styles.empty}>还没有标签，点击右上角新建</div>
          )}
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={`${styles.tagRow} ${editingId === tag.id ? styles.tagRowActive : ''}`}
              onClick={() => openEdit(tag.id)}
            >
              <span className={styles.tagDot} style={{ background: tag.color }} />
              <span className={styles.tagIcon}>{tag.icon}</span>
              <span className={styles.tagName}>{tag.name}</span>
              <button
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); handleDelete(tag.id) }}
              >
                删除
              </button>
            </div>
          ))}
        </div>

        {/* 编辑面板 */}
        {showForm && (
          <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
            <h2>{editingId ? '编辑标签' : '新建标签'}</h2>

            <div className={styles.field}>
              <label>标签名</label>
              <input {...register('name')} placeholder="例如：工作、健康、学习" autoFocus />
              {errors.name && <span className={styles.error}>{errors.name.message}</span>}
            </div>

            <div className={styles.field}>
              <label>图标（可选）</label>
              <input {...register('icon')} placeholder="输入 emoji，例如 💼" />
            </div>

            <div className={styles.field}>
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

            {/* 预览 */}
            <div className={styles.field}>
              <label>预览</label>
              <span
                className={styles.previewChip}
                style={{ background: selectedColor + '20', color: selectedColor, borderColor: selectedColor }}
              >
                {watch('icon')} {watch('name') || '标签名'}
              </span>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>
                取消
              </button>
              <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                {isSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
