import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dimension, Task, TaskListResult, TaskStatus } from '@time-manage/shared'
import { UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'
import { ApiError } from '@/api/client'
import { useTaskStore } from '@/stores/taskStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useTaskListStore, type TaskListFilters } from '@/stores/taskListStore'
import { useUiStore } from '@/stores/uiStore'
import { getOptionPath } from '@/utils/dimensionTree'
import DimensionFields from './DimensionFields'
import TaskInlineEditor from './TaskInlineEditor'
import TaskScheduleEditor from './TaskScheduleEditor'
import { durationLabel, scheduleLabel, STATUS_LABELS } from './taskForm'
import styles from './TaskListPage.module.css'

const EMPTY_RESULT: TaskListResult = { items: [], total: 0, page: 1, pageSize: 50 }
const errorMessage = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试'

function queryFrom(filters: TaskListFilters, q: string) {
  const end = filters.endDate ? new Date(`${filters.endDate}T00:00:00`) : null
  if (end) end.setDate(end.getDate() + 1)
  return { q, status: filters.status, schedule: filters.schedule, sort: filters.sort, page: filters.page, pageSize: 50,
    start: filters.startDate ? new Date(`${filters.startDate}T00:00:00`).toISOString() : undefined,
    end: end?.toISOString(), dimensionFilters: filters.dimensionFilters }
}

export default function TaskListPage() {
  const filters = useTaskListStore()
  const { setFilters, clearFilters } = filters
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()
  const { revision, cacheTasks, updateTask, removeTask, taskCache } = useTaskStore()
  const openCreateModal = useUiStore(s => s.openCreateModal)
  const [result, setResult] = useState<TaskListResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dimensionError, setDimensionError] = useState('')
  const [queryText, setQueryText] = useState(filters.q)
  const [retry, setRetry] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; task?: Task } | null>(null)
  const handledRevision = useRef(revision)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)
  const dims = useMemo(() => [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder), [dimensions])

  const refreshDimensions = async () => {
    try {
      setDimensionError('')
      await fetchDimensions()
      await Promise.all(useDimensionStore.getState().dimensions.map(d => fetchOptions(d.id)))
      const state = useDimensionStore.getState()
      const values = useTaskListStore.getState().dimensionFilters
      const next = Object.fromEntries(Object.entries(values).filter(([id, value]) => state.dimensions.some(d => d.id === id) && (value === UNSET_DIMENSION_VALUE || state.optionsByDimension[id]?.some(o => o.id === value))))
      if (Object.keys(next).length !== Object.keys(values).length) {
        setFilters({ dimensionFilters: next })
        setNotice({ message: '失效的维度筛选已移除' })
      }
    } catch (e) { setDimensionError(errorMessage(e)) }
  }
  useEffect(() => { void refreshDimensions() }, [])
  useEffect(() => { const timer = setTimeout(() => setQueryText(filters.q.trim()), 300); return () => clearTimeout(timer) }, [filters.q])
  useEffect(() => { setEditingId(null); setScheduleId(null); setTaggingId(null); setPinnedId(null) }, [filters.q, filters.status, filters.schedule, filters.startDate, filters.endDate, filters.sort, filters.page, filters.dimensionFilters])

  const invalidDates = !!(filters.startDate && filters.endDate && filters.startDate > filters.endDate)
  const query = useMemo(() => queryFrom(filters, queryText), [queryText, filters.status, filters.schedule, filters.sort, filters.page, filters.startDate, filters.endDate, filters.dimensionFilters])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setError('')
    if (invalidDates) { setLoading(false); return }
    setLoading(true)
    const mutation = useTaskStore.getState().lastMutation
    const mutationRevision = useTaskStore.getState().revision
    void tasksApi.query(query, controller.signal).then(async data => {
      if (!active) return
      setResult(data)
      cacheTasks(data.items)
      if (data.page !== query.page) setFilters({ page: data.page })
      if (mutation && mutationRevision > handledRevision.current) {
        handledRevision.current = mutationRevision
        if (mutation.type !== 'delete' && mutation.task) {
          const matches = data.items.some(t => t.id === mutation.id) || (await tasksApi.query({ ...query, id: mutation.id, page: 1, pageSize: 1 }, controller.signal)).total > 0
          if (!active) return
          setNotice({ message: `${mutation.type === 'create' ? '已创建任务' : '已保存'}${matches ? '' : '，任务不符合当前筛选'}`, task: !matches ? mutation.task : undefined })
        }
      }
    }).catch(e => {
      if (active && !controller.signal.aborted) {
        setError(errorMessage(e))
        if (e instanceof ApiError && e.status === 400 && e.message.includes('失效')) void refreshDimensions()
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [query, revision, retry, invalidDates, cacheTasks, setFilters])

  const canLeaveEditor = () => {
    const guard = useTaskListStore.getState().confirmLeave
    if (guard && !guard()) return false
    setEditingId(null)
    setScheduleId(null)
    return true
  }
  const changeFilters = (patch: Partial<TaskListFilters>) => {
    if (!canLeaveEditor()) return
    setTaggingId(null); setPinnedId(null); setFilters(patch)
  }
  const beginEdit = (id: string) => {
    if (id === editingId || !canLeaveEditor()) return
    setTaggingId(null); setEditingId(id)
  }
  const beginScheduleEdit = (id: string) => {
    if (id === scheduleId || !canLeaveEditor()) return
    setTaggingId(null); setScheduleId(id)
  }
  const handleDelete = async (task: Task) => {
    if (!window.confirm(`删除「${task.title}」？\n删除后将从任务列表、日历和统计中移除。`)) return
    setDeleting(task.id)
    try {
      await tasksApi.remove(task.id)
      removeTask(task.id)
      if (pinnedId === task.id) setPinnedId(null)
      setNotice({ message: '已删除任务' })
    } catch (e) { setNotice({ message: errorMessage(e) }) }
    finally { setDeleting(null) }
  }
  const handleStatus = async (task: Task, status: TaskStatus) => {
    setStatusBusy(task.id)
    try { const updated = await tasksApi.update(task.id, { status }); updateTask(task.id, updated) }
    catch (e) { setNotice({ message: errorMessage(e) }) }
    finally { setStatusBusy(null) }
  }
  const activeChips: { key: string; label: string; clear: () => void }[] = []
  if (filters.q) activeChips.push({ key: 'q', label: `搜索：${filters.q}`, clear: () => changeFilters({ q: '' }) })
  if (filters.status !== 'all') activeChips.push({ key: 'status', label: `状态：${{ unfinished: '待办', done: '已完成' }[filters.status]}`, clear: () => changeFilters({ status: 'all' }) })
  if (filters.schedule !== 'all') activeChips.push({ key: 'schedule', label: filters.schedule === 'scheduled' ? '已排期' : '未排期', clear: () => changeFilters({ schedule: 'all' }) })
  if (filters.startDate || filters.endDate) activeChips.push({ key: 'date', label: `${filters.startDate || '不限'} 至 ${filters.endDate || '不限'}`, clear: () => changeFilters({ startDate: '', endDate: '' }) })
  for (const [id, value] of Object.entries(filters.dimensionFilters)) {
    const dim = dims.find(d => d.id === id)
    const options = optionsByDimension[id] ?? []
    activeChips.push({ key: id, label: `${dim?.name ?? '维度'}：${value === UNSET_DIMENSION_VALUE ? '未设置' : getOptionPath(options, value) || '加载中…'}${dim?.type === 'tree' && value !== UNSET_DIMENSION_VALUE && options.some(o => o.parentId === value) ? '及下级' : ''}`, clear: () => { if (canLeaveEditor()) filters.setDimensionFilter(id, null) } })
  }
  const busy = loading || filters.q.trim() !== queryText
  const pinnedTask = pinnedId ? taskCache[pinnedId] : undefined
  const renderTask = (task: Task) => {
    const allTags = dims.flatMap(dim => {
      const value = task.dimensionValues[dim.id]
      const option = optionsByDimension[dim.id]?.find(o => o.id === value)
      return option ? [{ dim, option, path: getOptionPath(optionsByDimension[dim.id] ?? [], option.id) }] : []
    })
    const visibleTags = allTags.filter(t => t.dim.showInSidebar).slice(0, 2)
    const hiddenCount = allTags.length - visibleTags.length
    const pendingRequired = dims.some(d => d.isRequired && !task.dimensionValues[d.id])
    const renderRow = (titleEditor?: ReactNode) => <tr className={task.status === 'done' ? styles.doneRow : ''}>
        <td className={styles.titleCell}>
          {titleEditor ?? <button className={styles.taskTitle} title="双击任务名称编辑；仅编辑名称、备注与预期产出；也可按 Enter 或 F2" onDoubleClick={() => beginEdit(task.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(task.id) } }}>{task.title}</button>}
          {!titleEditor && task.description && <div className={styles.taskDescription} title={task.description}>{task.description}</div>}
          {pendingRequired && <span className={styles.missingBadge}>必填维度待补齐</span>}
        </td>
        <td><select className={`${styles.statusSelect} ${styles[`status_${task.status}`] ?? ''}`} aria-label={`修改${task.title}的状态`} value={task.status} disabled={statusBusy === task.id} onChange={e => void handleStatus(task, e.target.value as TaskStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
        <td className={styles.scheduleCell}><button className={styles.cellButton} aria-label={`修改${task.title}的排期`} title="点击修改排期" onClick={() => beginScheduleEdit(task.id)}>{scheduleLabel(task)}</button></td>
        <td className={styles.durationCell}><button className={styles.cellButton} aria-label={`通过排期修改${task.title}的时长`} title="时长由排期计算，点击修改排期" onClick={() => beginScheduleEdit(task.id)}>{durationLabel(task)}</button></td>
        <td className={styles.tagsCell}>
          <div className={styles.tagList}>
            {visibleTags.map(({ dim, option, path }) => <button key={dim.id} className={styles.tag} style={{ color: option.color, borderColor: `${option.color}50`, background: `${option.color}12` }} title={`${dim.name}：${path} · 点击打标`} onClick={() => { if (canLeaveEditor()) setTaggingId(taggingId === task.id ? null : task.id) }}>{option.icon} {option.name}</button>)}
            {hiddenCount > 0 && <button className={styles.moreTags} title={allTags.map(t => `${t.dim.name}：${t.path}`).join('\n')} onClick={() => { if (canLeaveEditor()) setTaggingId(taggingId === task.id ? null : task.id) }}>+{hiddenCount}</button>}
            {!allTags.length && <button className={styles.unsetTag} onClick={() => { if (canLeaveEditor()) setTaggingId(task.id) }}>未打标</button>}
          </div>
        </td>
        <td className={styles.rowActions}><button className={styles.textButton} onClick={() => { if (canLeaveEditor()) setTaggingId(taggingId === task.id ? null : task.id) }}>打标</button><button className={styles.mobileEdit} onClick={() => beginEdit(task.id)}>编辑</button><button className={styles.deleteButton} disabled={deleting === task.id} onClick={() => void handleDelete(task)}>{deleting === task.id ? '删除中…' : '删除'}</button></td>
      </tr>
    return <Fragment key={task.id}>
      {editingId === task.id ? <TaskInlineEditor task={task} renderRow={renderRow} onCancel={() => setEditingId(null)} onSave={async input => {
        const updated = await tasksApi.update(task.id, input)
        cacheTasks([updated]); updateTask(task.id, updated); setEditingId(null)
      }} /> : renderRow()}
      {scheduleId === task.id && <TaskScheduleEditor task={task} onCancel={() => setScheduleId(null)} onSave={async input => {
        const updated = await tasksApi.update(task.id, input)
        cacheTasks([updated]); updateTask(task.id, updated); setScheduleId(null)
      }} />}
      {taggingId === task.id && <TaskTagRow task={task} dimensions={dims} optionsByDimension={optionsByDimension} onClose={() => setTaggingId(null)} onSaved={updated => { cacheTasks([updated]); updateTask(updated.id, updated) }} />}
    </Fragment>
  }
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>TASKS</div><h1>任务</h1><p className={styles.subtitle}>把想做的事，慢慢安排好。</p></div>
      <div className={styles.headerActions}><button className={styles.primaryButton} onClick={() => { if (canLeaveEditor()) openCreateModal({ isAllDay: false }) }}>＋ 新建任务</button></div>
    </header>
    <section className={styles.toolbar} aria-label="搜索与筛选">
      <div className={styles.searchBox}><span aria-hidden="true">⌕</span><input aria-label="搜索任务" type="search" maxLength={200} placeholder="搜索任务标题、备注、预期产出…" value={filters.q} onChange={e => changeFilters({ q: e.target.value })} /></div>
      <div className={styles.filterRow}>
        <label className={styles.filterField}><span>状态</span><select aria-label="筛选任务状态" value={filters.status} onChange={e => changeFilters({ status: e.target.value as TaskListFilters['status'] })}><option value="all">全部状态</option><option value="unfinished">待办</option><option value="done">已完成</option></select></label>
        <label className={styles.filterField}><span>排期</span><select aria-label="筛选排期" value={filters.schedule} onChange={e => {
          const schedule = e.target.value as TaskListFilters['schedule']
          changeFilters({ schedule, ...(schedule === 'unscheduled' ? { startDate: '', endDate: '' } : {}) })
          if (schedule === 'unscheduled' && (filters.startDate || filters.endDate)) setNotice({ message: '已清除日期范围；未排期任务不适用日期筛选' })
        }}><option value="all">全部排期</option><option value="scheduled">已排期</option><option value="unscheduled">未排期</option></select></label>
        <div className={styles.dateRange} title={filters.schedule === 'unscheduled' ? '日期筛选适用于已排期任务' : '按排期与所选日期范围重叠筛选'}><input type="date" aria-label="筛选开始日期" disabled={filters.schedule === 'unscheduled'} value={filters.startDate} onChange={e => changeFilters({ startDate: e.target.value })} /><span>至</span><input type="date" aria-label="筛选结束日期" disabled={filters.schedule === 'unscheduled'} value={filters.endDate} onChange={e => changeFilters({ endDate: e.target.value })} /></div>
        <details className={styles.dimensionFilter}><summary>维度筛选{Object.keys(filters.dimensionFilters).length ? ` · ${Object.keys(filters.dimensionFilters).length}` : ''}</summary><div className={styles.filterPopover}><div className={styles.popoverHeader}><strong>按维度筛选</strong><span className={styles.hint}>不同维度同时满足</span></div><DimensionFields dimensions={dims} optionsByDimension={optionsByDimension} values={filters.dimensionFilters} mode="filter" onChange={(id, value) => { if (canLeaveEditor()) filters.setDimensionFilter(id, value) }} /></div></details>
      </div>
      {activeChips.length > 0 && <div className={styles.activeFilters}>{activeChips.map(chip => <button className={styles.filterChip} key={chip.key} onClick={chip.clear}>{chip.label}<span>×</span></button>)}<button className={styles.textButton} onClick={() => { if (canLeaveEditor()) { clearFilters(); setPinnedId(null); setTaggingId(null) } }}>清空条件</button></div>}
    </section>
    {dimensionError && <div role="alert" className={styles.notice}>维度加载失败：{dimensionError}<button className={styles.textButton} onClick={() => void refreshDimensions()}>重试</button></div>}
    {notice && <div role="status" className={styles.notice}><span>{notice.message}</span>{notice.task && <button className={styles.textButton} onClick={() => { if (canLeaveEditor() && notice.task) { setPinnedId(notice.task.id); setEditingId(notice.task.id); setNotice(null) } }}>查看任务</button>}<button aria-label="关闭提示" className={styles.dismiss} onClick={() => setNotice(null)}>×</button></div>}
    {invalidDates && <p role="alert" className={styles.error}>开始日期不能晚于结束日期</p>}
    <div className={styles.resultBar}><span>{busy ? '正在更新任务…' : `共 ${result.total} 条 · 当前显示 ${result.items.length} 条`}</span><div><span className={styles.editHint}>双击名称，行内编辑</span><select aria-label="任务排序" value={filters.sort} onChange={e => changeFilters({ sort: e.target.value as TaskListFilters['sort'] })}><option value="created_desc">创建时间 · 最新</option><option value="created_asc">创建时间 · 最早</option><option value="start_asc">排期时间 · 从早到晚</option><option value="start_desc">排期时间 · 从晚到早</option></select></div></div>
    <div className={styles.tableWrap} aria-busy={busy}>
      {pinnedTask && !result.items.some(t => t.id === pinnedTask.id) && <><div className={styles.pinnedLabel}>刚刚保存的任务 · 不在当前筛选结果中<button className={styles.textButton} onClick={() => { if (canLeaveEditor()) setPinnedId(null) }}>收起</button></div><table className={styles.table}><tbody>{renderTask(pinnedTask)}</tbody></table></>}
      {error ? <div className={styles.empty} role="alert"><strong>任务加载失败</strong><p>{error}</p><button className={styles.secondaryButton} onClick={() => setRetry(r => r + 1)}>重新加载</button></div>
        : !invalidDates && (!loading || result.items.length > 0) && result.items.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>☷</span><h2>{activeChips.length ? '没有符合条件的任务' : '还没有任务'}</h2><p>{activeChips.length ? '试试其他关键词，或调整筛选条件。' : '先记下一件想做的事，不必马上安排时间。'}</p><button className={styles.secondaryButton} onClick={() => activeChips.length ? clearFilters() : openCreateModal({ isAllDay: false })}>{activeChips.length ? '清空条件' : '新建任务'}</button></div>
        : !invalidDates && <table className={styles.table}><thead><tr><th>任务名称</th><th>状态</th><th>排期</th><th>时长</th><th>维度标签</th><th>操作</th></tr></thead><tbody inert={busy}>{result.items.map(renderTask)}</tbody></table>}
      {busy && <div className={styles.loadingLine} role="status" aria-label="正在加载任务" />}
    </div>
    <footer className={styles.pagination}><span>每页 50 条</span><div><button className={styles.secondaryButton} disabled={busy || result.page <= 1} onClick={() => changeFilters({ page: result.page - 1 })}>上一页</button><span>第 {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 页</span><button className={styles.secondaryButton} disabled={busy || result.page * result.pageSize >= result.total} onClick={() => changeFilters({ page: result.page + 1 })}>下一页</button></div></footer>
  </div>
}

function TaskTagRow({ task, dimensions, optionsByDimension, onClose, onSaved }: {
  task: Task; dimensions: Dimension[]; optionsByDimension: ReturnType<typeof useDimensionStore.getState>['optionsByDimension']; onClose: () => void; onSaved: (task: Task) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return <tr className={styles.taggingRow}><td colSpan={6}><section className={styles.tagEditor} aria-label={`为${task.title}打标`}><div className={styles.popoverHeader}><div><strong>为任务打标</strong><p className={styles.hint}>每个维度选择一项，选择后自动保存。</p></div><button className={styles.textButton} disabled={saving} onClick={onClose}>完成</button></div><DimensionFields dimensions={dimensions} optionsByDimension={optionsByDimension} values={task.dimensionValues} disabled={saving} onChange={async (id, value) => {
    if (saving || value === (task.dimensionValues[id] ?? null)) return
    setSaving(true); setError('')
    try { onSaved(await tasksApi.updateDimension(task.id, id, value)) }
    catch (e) { setError(errorMessage(e)) }
    finally { setSaving(false) }
  }} />{saving && <p className={styles.hint} role="status">正在保存…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}</section></td></tr>
}
