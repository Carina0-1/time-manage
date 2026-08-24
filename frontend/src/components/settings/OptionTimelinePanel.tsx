import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { DimensionOption, DimensionState, DimensionOptionState } from '@time-manage/shared'
import { dimensionOptionStatesApi } from '@/api/dimensionStates'
import styles from './SettingsPage.module.css'
import formStyles from '../Layout.module.css'

const TimelineFormSchema = z.object({
  stateId: z.string().min(1, '请选择状态'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择开始日期'),
  ongoing: z.boolean(),
  endDate: z.string().optional(),
}).refine((data) => data.ongoing || !!data.endDate, {
  message: '请选择结束日期，或勾选"进行中"',
  path: ['endDate'],
})
type TimelineFormValues = z.infer<typeof TimelineFormSchema>

export default function OptionTimelinePanel({
  option,
  states,
  onClose,
}: {
  option: DimensionOption
  states: DimensionState[]
  onClose: () => void
}) {
  const [records, setRecords] = useState<DimensionOptionState[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const stateNameOf = (stateId: string) => states.find((s) => s.id === stateId)
  const sortedRecords = [...records].sort((a, b) => b.startDate.localeCompare(a.startDate))

  const load = () => {
    setLoading(true)
    dimensionOptionStatesApi.list(option.id).then((data) => {
      setRecords(data)
      setLoading(false)
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.id])

  const {
    register, handleSubmit, reset, watch,
    formState: { errors, isSubmitting },
  } = useForm<TimelineFormValues>({
    resolver: zodResolver(TimelineFormSchema),
    defaultValues: { stateId: states[0]?.id ?? '', startDate: '', ongoing: true, endDate: '' },
  })

  const ongoing = watch('ongoing')

  const openCreate = () => {
    setEditingId(null)
    reset({ stateId: states[0]?.id ?? '', startDate: '', ongoing: true, endDate: '' })
    setShowForm(true)
  }

  const openEdit = (record: DimensionOptionState) => {
    setEditingId(record.id)
    reset({
      stateId: record.stateId,
      startDate: record.startDate,
      ongoing: !record.endDate,
      endDate: record.endDate ?? '',
    })
    setShowForm(true)
  }

  const onSubmit = async (data: TimelineFormValues) => {
    if (editingId) {
      await dimensionOptionStatesApi.update(editingId, {
        stateId: data.stateId,
        startDate: data.startDate,
        endDate: data.ongoing ? null : data.endDate,
      })
    } else {
      await dimensionOptionStatesApi.create({
        id: nanoid(), optionId: option.id,
        stateId: data.stateId, startDate: data.startDate,
        endDate: data.ongoing ? undefined : data.endDate,
      })
    }
    setShowForm(false)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条状态记录吗？')) return
    await dimensionOptionStatesApi.remove(id)
    load()
  }

  return (
    <div className={formStyles.formModalOverlay}>
      <div className={formStyles.formModal}>
        <div className={formStyles.formModalHeader}>
          <span>{option.name} 的状态时间线</span>
          <button className={formStyles.formModalClose} onClick={onClose}>✕</button>
        </div>
        <div className={formStyles.formModalBody}>
          <div className={styles.optionManagerHeader}>
            <span>时间线</span>
            <button className={styles.addBtn} onClick={openCreate} title="添加记录" disabled={states.length === 0}>＋</button>
          </div>
          {states.length === 0 && <div className={styles.empty}>请先在维度详情页配置状态词表</div>}
          {!loading && sortedRecords.length === 0 && states.length > 0 && (
            <div className={styles.empty}>暂无时间线记录</div>
          )}
          {sortedRecords.map((record) => {
            const state = stateNameOf(record.stateId)
            return (
              <div key={record.id} className={styles.timelineRow}>
                <span className={styles.optionDot} style={{ background: state?.color ?? 'var(--ink-faint)' }} />
                <span className={styles.optionName}>{state?.name ?? '（已删除的状态）'}</span>
                <span className={styles.timelineDateRange}>
                  {record.startDate} ~ {record.endDate ?? <span className={styles.timelineOngoing}>进行中</span>}
                </span>
                <button className={styles.linkBtnSmall} onClick={() => openEdit(record)}>编辑</button>
                <button className={styles.linkBtnSmallDanger} onClick={() => handleDelete(record.id)}>删除</button>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className={formStyles.formModalOverlay}>
          <div className={formStyles.formModal}>
            <div className={formStyles.formModalHeader}>
              <span>{editingId ? '编辑记录' : '新增记录'}</span>
              <button className={formStyles.formModalClose} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className={formStyles.formModalBody}>
              <div className={formStyles.formField}>
                <label>状态</label>
                <select {...register('stateId')} className={formStyles.formInput}>
                  {states.map((state) => (
                    <option key={state.id} value={state.id}>{state.name}</option>
                  ))}
                </select>
                {errors.stateId && <span className={formStyles.formError}>{errors.stateId.message}</span>}
              </div>
              <div className={formStyles.formField}>
                <label>开始日期</label>
                <input type="date" {...register('startDate')} className={formStyles.formInput} />
                {errors.startDate && <span className={formStyles.formError}>{errors.startDate.message}</span>}
              </div>
              <div className={formStyles.formField}>
                <label>
                  <input type="checkbox" {...register('ongoing')} /> 进行中（暂无结束日期）
                </label>
              </div>
              {!ongoing && (
                <div className={formStyles.formField}>
                  <label>结束日期</label>
                  <input type="date" {...register('endDate')} className={formStyles.formInput} />
                  {errors.endDate && <span className={formStyles.formError}>{errors.endDate.message}</span>}
                </div>
              )}
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
