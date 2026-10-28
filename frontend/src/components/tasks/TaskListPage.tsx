import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task, TaskListResult } from '@time-manage/shared'
import { UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import { tasksApi } from '@/api/tasks'
import { ApiError } from '@/api/client'
import { useTaskStore } from '@/stores/taskStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useTaskListStore, type TaskListFilters } from '@/stores/taskListStore'
import { nanoid } from 'nanoid'
import { getOptionPath } from '@/utils/dimensionTree'
import DimensionFields from './DimensionFields'
import TaskItem, { type TaskSession } from './TaskItem'
import { matchesTask, projectTaskList } from './taskListProjection'
import { taskChangeImpact } from '@/stores/taskImpact'
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
  const { revision, cacheTasks, removeTask, taskCache } = useTaskStore()
  const [newTask, setNewTask] = useState<Task | null>(null)
  const [result, setResult] = useState<TaskListResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dimensionError, setDimensionError] = useState('')
  const [queryText, setQueryText] = useState(filters.q)
  const [retry, setRetry] = useState(0)
  const [session, setSession] = useState<TaskSession | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listRevision, setListRevision] = useState(revision)
  const [refreshNeeded, setRefreshNeeded] = useState(revision)
  const loadedQuery = useRef('')
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; task?: Task } | null>(null)
  const handledRevision = useRef(revision)
  const dims = useMemo(() => [...dimensions].sort((a, b) => a.sortOrder - b.sortOrder), [dimensions])

  const refreshDimensions = async (force = false) => {
    try {
      setDimensionError('')
      await fetchDimensions(force)
      await Promise.all(useDimensionStore.getState().dimensions.map(d => fetchOptions(d.id, force)))
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
  useEffect(() => { if (!session) setListRevision(refreshNeeded) }, [refreshNeeded, session])
  useEffect(() => { setSession(null); setSelectedId(null); setPinnedId(null) }, [filters.q, filters.status, filters.schedule, filters.startDate, filters.endDate, filters.sort, filters.page, filters.dimensionFilters])

  const invalidDates = !!(filters.startDate && filters.endDate && filters.startDate > filters.endDate)
  const query = useMemo(() => queryFrom(filters, queryText), [queryText, filters.status, filters.schedule, filters.sort, filters.page, filters.startDate, filters.endDate, filters.dimensionFilters])
  useEffect(() => {
    if (revision <= handledRevision.current) return
    handledRevision.current = revision
    const mutation = useTaskStore.getState().lastMutation
    if (!mutation) { setRefreshNeeded(revision); return }
    setResult(previous => projectTaskList(previous, mutation, query, optionsByDimension, session?.id))
    const matches = mutation.task && matchesTask(mutation.task, query, optionsByDimension)
    if (mutation.type === 'update' && mutation.task && !matches) {
      setNotice({ message: '已保存，任务不符合当前筛选', task: mutation.task })
    }
    const textOnly = mutation.type === 'update' && mutation.task && mutation.previous && !taskChangeImpact(mutation.previous, mutation.task).stats
    if (!textOnly || query.q) setRefreshNeeded(revision)
  }, [revision])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const key = JSON.stringify(query)
    const foreground = loadedQuery.current !== key
    const snapshotRevision = useTaskStore.getState().revision
    setError('')
    if (invalidDates) { setLoading(false); return }
    if (foreground) setLoading(true)
    const timer = setTimeout(() => {
      void tasksApi.query(query, controller.signal).then(data => {
        if (!active) return
        if (useTaskStore.getState().revision !== snapshotRevision) { setRefreshNeeded(useTaskStore.getState().revision); return }
        setResult(data); cacheTasks(data.items); loadedQuery.current = key
        if (data.page !== query.page) setFilters({ page: data.page })
      }).catch(e => {
        if (active && !controller.signal.aborted) {
          if (foreground) setError(errorMessage(e))
          else setNotice({ message: '修改已保存，列表校验暂未完成，请稍后刷新' })
          if (e instanceof ApiError && e.status === 400 && e.message.includes('失效')) void refreshDimensions(true)
        }
      }).finally(() => { if (active) setLoading(false) })
    }, foreground ? 0 : 250)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [query, listRevision, retry, invalidDates, cacheTasks, setFilters])

  const canLeaveEditor = async () => {
    const guard = useTaskListStore.getState().confirmLeave
    if (guard && !await guard()) return false
    if (newTask) {
      if (useTaskStore.getState().taskCache[newTask.id]) setPinnedId(newTask.id)
      setNewTask(null)
    }
    setSession(null)
    return true
  }
  const createInline = async () => {
    if (!await canLeaveEditor()) return
    const now = new Date().toISOString()
    const task: Task = { id: nanoid(), userId: '', title: '', description: '', startTime: null, endTime: null,
      isAllDay: false, dimensionValues: {}, status: 'todo', priority: 'medium', createdAt: now, updatedAt: now }
    setNewTask(task); setSelectedId(task.id); setSession({ id: task.id, mode: 'inline', field: 'title' })
    setNotice(null)
    // 新建行固定在列表上方，已有筛选和排序保持不变。
    requestAnimationFrame(() => document.querySelector('[data-task-list-scroll]')?.scrollTo({ top: 0 }))
  }
  const changeFilters = async (patch: Partial<TaskListFilters>) => {
    if (!await canLeaveEditor()) return
    setPinnedId(null); setFilters(patch)
  }
  const handleDelete = async (task: Task) => {
    if (!window.confirm(`删除「${task.title}」？\n删除后将从任务列表、日历和统计中移除。`)) return
    try {
      await tasksApi.remove(task.id)
      removeTask(task.id)
      setSession(null)
      if (pinnedId === task.id) setPinnedId(null)
      setNotice(null)
    } catch (e) { setNotice({ message: errorMessage(e) }) }
  }
  const activeChips: { key: string; label: string; clear: () => void }[] = []
  if (filters.q) activeChips.push({ key: 'q', label: `搜索：${filters.q}`, clear: () => changeFilters({ q: '' }) })
  if (filters.status !== 'all') activeChips.push({ key: 'status', label: `状态：${{ unfinished: '待办', done: '已完成' }[filters.status]}`, clear: () => changeFilters({ status: 'all' }) })
  if (filters.schedule !== 'all') activeChips.push({ key: 'schedule', label: filters.schedule === 'scheduled' ? '已排期' : '未排期', clear: () => changeFilters({ schedule: 'all' }) })
  if (filters.startDate || filters.endDate) activeChips.push({ key: 'date', label: `${filters.startDate || '不限'} 至 ${filters.endDate || '不限'}`, clear: () => changeFilters({ startDate: '', endDate: '' }) })
  for (const [id, value] of Object.entries(filters.dimensionFilters)) {
    const dim = dims.find(d => d.id === id)
    const options = optionsByDimension[id] ?? []
    activeChips.push({ key: id, label: `${dim?.name ?? '维度'}：${value === UNSET_DIMENSION_VALUE ? '未设置' : getOptionPath(options, value) || '加载中…'}${dim?.type === 'tree' && value !== UNSET_DIMENSION_VALUE && options.some(o => o.parentId === value) ? '及下级' : ''}`, clear: async () => { if (await canLeaveEditor()) filters.setDimensionFilter(id, null) } })
  }
  const busy = loading || filters.q.trim() !== queryText
  const pinnedTask = pinnedId ? taskCache[pinnedId] : undefined
  const renderTask = (task: Task) => <TaskItem key={task.id} task={taskCache[task.id] ?? task} dimensions={dims} optionsByDimension={optionsByDimension}
    isNew={newTask?.id === task.id} session={session?.id === task.id ? session : null} selected={selectedId === task.id}
    onSelect={async () => {
      if (session && session.id !== task.id && !await canLeaveEditor()) return
      setSelectedId(task.id)
    }}
    onActivate={async (mode, field) => {
      if (session?.id !== task.id && !await canLeaveEditor()) return
      setSelectedId(task.id); setSession({ id: task.id, mode, field })
    }}
    onClose={async () => { await canLeaveEditor() }} onDelete={() => handleDelete(taskCache[task.id] ?? task)} />
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>TASKS</div><h1>任务</h1><p className={styles.subtitle}>把想做的事，慢慢安排好。</p></div>
      <div className={styles.headerActions}>
        <div className={styles.searchBox}><span aria-hidden="true">⌕</span><input aria-label="搜索任务" type="search" maxLength={200} placeholder="搜索任务名称、备注…" value={filters.q} onChange={e => changeFilters({ q: e.target.value })} /></div>
        <button className={styles.primaryButton} onClick={() => void createInline()}>＋ 新建任务</button>
      </div>
    </header>
    <section className={styles.toolbar} aria-label="搜索与筛选">
      <div className={styles.filterRow}>
        <label className={styles.filterField}><span>状态</span><select aria-label="筛选任务状态" value={filters.status} onChange={e => changeFilters({ status: e.target.value as TaskListFilters['status'] })}><option value="all">全部状态</option><option value="unfinished">待办</option><option value="done">已完成</option></select></label>
        <label className={styles.filterField}><span>排期</span><select aria-label="筛选排期" value={filters.schedule} onChange={e => {
          const schedule = e.target.value as TaskListFilters['schedule']
          changeFilters({ schedule, ...(schedule === 'unscheduled' ? { startDate: '', endDate: '' } : {}) })
          if (schedule === 'unscheduled' && (filters.startDate || filters.endDate)) setNotice({ message: '已清除日期范围；未排期任务不适用日期筛选' })
        }}><option value="all">全部排期</option><option value="scheduled">已排期</option><option value="unscheduled">未排期</option></select></label>
        <div className={styles.dateRange} title={filters.schedule === 'unscheduled' ? '日期筛选适用于已排期任务' : '按排期与所选日期范围重叠筛选'}><input type="date" aria-label="筛选开始日期" disabled={filters.schedule === 'unscheduled'} value={filters.startDate} onChange={e => changeFilters({ startDate: e.target.value })} /><span>至</span><input type="date" aria-label="筛选结束日期" disabled={filters.schedule === 'unscheduled'} value={filters.endDate} onChange={e => changeFilters({ endDate: e.target.value })} /></div>
        <details className={styles.dimensionFilter}><summary>维度筛选{Object.keys(filters.dimensionFilters).length ? ` · ${Object.keys(filters.dimensionFilters).length}` : ''}</summary><div className={styles.filterPopover}><div className={styles.popoverHeader}><strong>按维度筛选</strong><span className={styles.hint}>不同维度同时满足</span></div><DimensionFields dimensions={dims} optionsByDimension={optionsByDimension} values={filters.dimensionFilters} mode="filter" onChange={async (id, value) => { if (await canLeaveEditor()) filters.setDimensionFilter(id, value) }} /></div></details>
      </div>
      {activeChips.length > 0 && <div className={styles.activeFilters}>{activeChips.map(chip => <button className={styles.filterChip} key={chip.key} onClick={chip.clear}>{chip.label}<span>×</span></button>)}<button className={styles.textButton} onClick={async () => { if (await canLeaveEditor()) { clearFilters(); setPinnedId(null) } }}>清空条件</button></div>}
    </section>
    {dimensionError && <div role="alert" className={styles.notice}>维度加载失败：{dimensionError}<button className={styles.textButton} onClick={() => void refreshDimensions(true)}>重试</button></div>}
    {notice && <div role="status" className={styles.notice}><span>{notice.message}</span>{notice.task && <button className={styles.textButton} onClick={async () => { if (await canLeaveEditor() && notice.task) { setPinnedId(notice.task.id); setSession({ id: notice.task.id, mode: 'detail' }); setNotice(null) } }}>查看任务</button>}<button aria-label="关闭提示" className={styles.dismiss} onClick={() => setNotice(null)}>×</button></div>}
    {invalidDates && <p role="alert" className={styles.error}>开始日期不能晚于结束日期</p>}
    <div className={styles.resultBar}><span>{busy ? '正在更新任务…' : `共 ${result.total} 条 · 当前显示 ${result.items.length} 条`}</span><div><span className={styles.editHint}>双击文字编辑 · ⓘ 查看完整信息</span><select aria-label="任务排序" value={filters.sort} onChange={e => changeFilters({ sort: e.target.value as TaskListFilters['sort'] })}><option value="created_desc">创建时间 · 最新</option><option value="created_asc">创建时间 · 最早</option><option value="start_asc">排期时间 · 从早到晚</option><option value="start_desc">排期时间 · 从晚到早</option></select></div></div>
    <div className={styles.tableWrap} aria-busy={busy} data-task-list-scroll>
      {newTask && <div role="list" aria-label="新建任务" className={styles.taskList}>{renderTask(newTask)}</div>}
      {pinnedTask && pinnedTask.id !== newTask?.id && !result.items.some(t => t.id === pinnedTask.id) && <><div className={styles.pinnedLabel}>刚刚编辑的任务 · 当前列表外<button className={styles.textButton} onClick={async () => { if (await canLeaveEditor()) setPinnedId(null) }}>收起</button></div><div role="list" aria-label="筛选外的任务">{renderTask(pinnedTask)}</div></>}
      {error ? <div className={styles.empty} role="alert"><strong>任务加载失败</strong><p>{error}</p><button className={styles.secondaryButton} onClick={() => setRetry(r => r + 1)}>重新加载</button></div>
        : !newTask && !invalidDates && (!loading || result.items.length > 0) && result.items.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>☷</span><h2>{activeChips.length ? '没有符合条件的任务' : '还没有任务'}</h2><p>{activeChips.length ? '试试其他关键词，或调整筛选条件。' : '先记下一件想做的事，不必马上安排时间。'}</p><button className={styles.secondaryButton} onClick={async () => { if (await canLeaveEditor()) { if (activeChips.length) clearFilters(); else await createInline() } }}>{activeChips.length ? '清空条件' : '新建任务'}</button></div>
        : !invalidDates && <div role="list" aria-label="任务列表" className={styles.taskList} inert={busy}>{result.items.filter(task => task.id !== newTask?.id).map(renderTask)}</div>}
      {busy && <div className={styles.loadingLine} role="status" aria-label="正在加载任务" />}
    </div>
    <footer className={styles.pagination}><span>每页 50 条</span><div><button className={styles.secondaryButton} disabled={busy || result.page <= 1} onClick={() => changeFilters({ page: result.page - 1 })}>上一页</button><span>第 {result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))} 页</span><button className={styles.secondaryButton} disabled={busy || result.page * result.pageSize >= result.total} onClick={() => changeFilters({ page: result.page + 1 })}>下一页</button></div></footer>
  </div>
}
