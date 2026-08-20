import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  EventClickArg,
  DatesSetArg,
  EventContentArg,
  EventDropArg,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import dayjs from 'dayjs'
import type { Dimension, DimensionOption, Task } from '@time-manage/shared'
import { buildOptionTree, flattenOptionTree, getDescendantIds } from '@/utils/dimensionTree'
import { useTaskStore } from '@/stores/taskStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useUiStore } from '@/stores/uiStore'
import { tasksApi } from '@/api/tasks'
import styles from './CalendarPage.module.css'

const fmt = (d: Date) => dayjs(d).format('HH:mm')

// 将颜色（hex）映射到颜色组
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return h * 360
}

type ColorGroup = 'green' | 'clay' | 'blue' | 'purple' | 'amber'

function colorToGroup(hex: string): ColorGroup {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 'green'
  const hue = hexToHue(hex)
  if (hue >= 75 && hue < 165) return 'green'
  if (hue >= 165 && hue < 255) return 'blue'
  if (hue >= 255 && hue < 315) return 'purple'
  if (hue >= 315 || hue < 30) return 'clay'
  return 'amber' // 30–75
}

const GROUP_VARS: Record<ColorGroup, { bg: string; bar: string; ink: string }> = {
  green:  { bg: 'var(--ev-green-bg)',  bar: 'var(--ev-green-bar)',  ink: 'var(--ev-green-ink)' },
  clay:   { bg: 'var(--ev-clay-bg)',   bar: 'var(--ev-clay-bar)',   ink: 'var(--ev-clay-ink)' },
  blue:   { bg: 'var(--ev-blue-bg)',   bar: 'var(--ev-blue-bar)',   ink: 'var(--ev-blue-ink)' },
  purple: { bg: 'var(--ev-purple-bg)', bar: 'var(--ev-purple-bar)', ink: 'var(--ev-purple-ink)' },
  amber:  { bg: 'var(--ev-amber-bg)',  bar: 'var(--ev-amber-bar)',  ink: 'var(--ev-amber-ink)' },
}

type ViewType = 'timeGridWeek' | 'timeGridDay' | 'dayGridMonth'

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null)
  const { tasks, fetchTasks, updateTask } = useTaskStore()
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()
  const { taskModalOpen, openCreateModal, openEditModal, activeDimensionFilters, setDimensionFilter } = useUiStore()

  const [currentView, setCurrentView] = useState<ViewType>('timeGridWeek')
  const [dateTitle, setDateTitle] = useState('')

  const handleToggleDone = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done'
    updateTask(taskId, { status: newStatus as 'todo' | 'done' })
    try {
      await tasksApi.update(taskId, { status: newStatus as 'todo' | 'done' })
    } catch {
      updateTask(taskId, { status: currentStatus as 'todo' | 'done' })
    }
  }

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => fetchOptions(d.id))
  }, [dimensions, fetchOptions])

  // 初次加载时滚动到当前时间（偏移 -30 分钟，让时间线不贴顶）
  useEffect(() => {
    const id = setTimeout(() => {
      const now = new Date()
      const totalMinutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - 30)
      const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
      const m = String(totalMinutes % 60).padStart(2, '0')
      calendarRef.current?.getApi().scrollToTime(`${h}:${m}:00`)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const colorDimension = dimensions.find((d) => d.isColorSource)

  const getEventColor = (task: Task): string => {
    if (!colorDimension) return '#57b683'
    const optionId = task.dimensionValues[colorDimension.id]
    if (!optionId) return '#57b683'
    const option = optionsByDimension[colorDimension.id]?.find((o) => o.id === optionId)
    return option?.color ?? '#57b683'
  }

  const filteredTaskIds = useMemo(() => {
    const activeFilters = Object.entries(activeDimensionFilters).filter(([, v]) => v) as [string, string][]
    if (activeFilters.length === 0) return null

    const idSetsPerFilter: Set<string>[] = activeFilters.map(([dimensionId, optionId]) => {
      const dim = dimensions.find((d) => d.id === dimensionId)
      const options = optionsByDimension[dimensionId] ?? []
      let matchOptionIds = new Set([optionId])
      if (dim?.type === 'tree') {
        const tree = buildOptionTree(options)
        const node = flattenOptionTree(tree).find((n) => n.option.id === optionId)
        if (node) matchOptionIds = new Set(getDescendantIds(node))
      }
      return new Set(tasks.filter((t) => matchOptionIds.has(t.dimensionValues[dimensionId])).map((t) => t.id))
    })

    return idSetsPerFilter.reduce<Set<string>>((acc, idSet, idx) => {
      if (idx === 0) return idSet
      return new Set([...acc].filter((id) => idSet.has(id)))
    }, new Set<string>())
  }, [activeDimensionFilters, dimensions, optionsByDimension, tasks])

  const events = tasks
    .filter((task) => task.startTime && task.endTime)  // Inbox 任务不显示在日历
    .filter((task) => !filteredTaskIds || filteredTaskIds.has(task.id))
    .map((task) => {
      const hexColor = getEventColor(task)
      const group = colorToGroup(hexColor)
      const vars = GROUP_VARS[group]
      const isDone = task.status === 'done'
      return {
        id: task.id,
        title: task.title,
        start: task.startTime,
        end: task.endTime,
        allDay: task.isAllDay,
        // 传递颜色信息给 eventContent
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: { task, group, vars, isDone },
      }
    })

  const handleDatesSet = (info: DatesSetArg) => {
    fetchTasks(info.startStr, info.endStr)
    setDateTitle(info.view.title)
    setCurrentView(info.view.type as ViewType)
  }

  const handleSelect = (info: DateSelectArg) => {
    const pos = info.jsEvent ? { x: info.jsEvent.clientX, y: info.jsEvent.clientY } : undefined
    const start = info.start
    const durationMs = info.end.getTime() - info.start.getTime()
    const end = durationMs <= 30 * 60_000
      ? new Date(start.getTime() + 30 * 60_000)
      : info.end
    openCreateModal({ start, end, isAllDay: info.allDay }, pos)
    calendarRef.current?.getApi().unselect()
  }

  const handleEventClick = (info: EventClickArg) => {
    openEditModal(info.event.id, { x: info.jsEvent.clientX, y: info.jsEvent.clientY })
  }

  const handleEventDrop = async (info: EventDropArg) => {
    const { id, start, end, allDay } = info.event
    if (!start) return
    updateTask(id, {
      startTime: start.toISOString(),
      endTime: (end ?? start).toISOString(),
      isAllDay: allDay,
    })
    try {
      await tasksApi.update(id, {
        startTime: start.toISOString(),
        endTime: (end ?? start).toISOString(),
        isAllDay: allDay,
      })
    } catch {
      info.revert()
      const original = info.oldEvent
      updateTask(id, {
        startTime: original.start!.toISOString(),
        endTime: (original.end ?? original.start!).toISOString(),
        isAllDay: original.allDay,
      })
    }
  }

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const { id, start, end } = info.event
    if (!start || !end) return
    updateTask(id, { startTime: start.toISOString(), endTime: end.toISOString() })
    try {
      await tasksApi.update(id, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      })
    } catch {
      info.revert()
      const original = info.oldEvent
      updateTask(id, {
        startTime: original.start!.toISOString(),
        endTime: original.end!.toISOString(),
      })
    }
  }

  return (
    <div className={styles.page}>
      <CalendarTopBar
        calendarRef={calendarRef}
        currentView={currentView}
        dateTitle={dateTitle}
        optionsByDimension={optionsByDimension}
        activeDimensionFilters={activeDimensionFilters}
        onClearFilter={(dimensionId) => setDimensionFilter(dimensionId, null)}
      />
      <div className={styles.calendarWrap}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false}
          locale="zh-cn"
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          allDayText="全天"
          snapDuration="00:05:00"
          editable={true}
          selectable={!taskModalOpen}
          selectMirror={true}
          dayMaxEvents={true}
          weekends={true}
          events={events}
          datesSet={handleDatesSet}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={(info) => (
            <EventContent
              info={info}
              dimensions={dimensions}
              optionsByDimension={optionsByDimension}
              onToggleDone={(taskId, status) => handleToggleDone(taskId, status)}
            />
          )}
          height="100%"
        />
      </div>
    </div>
  )
}

function CalendarTopBar({
  calendarRef,
  currentView,
  dateTitle,
  optionsByDimension,
  activeDimensionFilters,
  onClearFilter,
}: {
  calendarRef: React.RefObject<FullCalendar | null>
  currentView: ViewType
  dateTitle: string
  optionsByDimension: Record<string, DimensionOption[]>
  activeDimensionFilters: Record<string, string | null>
  onClearFilter: (dimensionId: string) => void
}) {
  const api = () => calendarRef.current?.getApi()
  const { theme, toggle } = useTheme()

  const views: { key: ViewType; label: string }[] = [
    { key: 'dayGridMonth', label: '月' },
    { key: 'timeGridWeek', label: '周' },
    { key: 'timeGridDay',  label: '日' },
  ]

  const activeFilterChips = Object.entries(activeDimensionFilters)
    .filter(([, optionId]) => optionId)
    .map(([dimensionId, optionId]) => {
      const option = optionsByDimension[dimensionId]?.find((o) => o.id === optionId)
      return option ? { dimensionId, name: option.name, color: option.color } : null
    })
    .filter((v): v is { dimensionId: string; name: string; color: string } => v !== null)

  return (
    <div className={styles.topbar}>
      <div className={styles.navGroup}>
        <button className={styles.iconBtn} onClick={() => api()?.prev()} aria-label="上一期">‹</button>
        <button className={styles.iconBtn} onClick={() => api()?.next()} aria-label="下一期">›</button>
        <button className={styles.todayBtn} onClick={() => api()?.today()}>今天</button>
      </div>
      <div className={styles.dateTitle}>{dateTitle}</div>
      {activeFilterChips.map((chip) => (
        <button
          key={chip.dimensionId}
          className={styles.filterChip}
          style={{ borderColor: chip.color, color: chip.color, background: chip.color + '22' }}
          onClick={() => onClearFilter(chip.dimensionId)}
          title="取消筛选"
        >
          <span className={styles.filterChipDot} style={{ background: chip.color }} />
          {chip.name}
          <span className={styles.filterChipClose}>×</span>
        </button>
      ))}
      <div className={styles.rightGroup}>
        <button
          className={styles.iconBtn}
          onClick={toggle}
          aria-label="切换主题"
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <div className={styles.seg}>
          {views.map(({ key, label }) => (
            <button
              key={key}
              className={currentView === key ? styles.segBtnActive : styles.segBtn}
              onClick={() => api()?.changeView(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventContent({
  info,
  dimensions,
  optionsByDimension,
  onToggleDone,
}: {
  info: EventContentArg
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  onToggleDone: (taskId: string, status: string) => void
}) {
  const { task, vars, isDone } = info.event.extendedProps as {
    task: Task | undefined
    vars: { bg: string; bar: string; ink: string }
    isDone: boolean
  }

  if (!task || !vars) return <span style={{ fontSize: 12, padding: '1px 4px' }}>{info.event.title}</span>

  const isTimeGrid = info.view.type.startsWith('timeGrid')

  const cardStyle: React.CSSProperties = {
    background: vars.bg,
    borderLeft: `3px solid ${vars.bar}`,
    color: vars.ink,
    height: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--r-sm)',
  }

  const sidebarDimensions = [...dimensions].filter((d) => d.showInSidebar).sort((a, b) => a.sortOrder - b.sortOrder)
  const chips = sidebarDimensions
    .map((dim) => {
      const optionId = task.dimensionValues[dim.id]
      if (!optionId) return null
      const option = optionsByDimension[dim.id]?.find((o) => o.id === optionId)
      return option ? { dimensionId: dim.id, option } : null
    })
    .filter((v): v is { dimensionId: string; option: DimensionOption } => v !== null)

  const hasMeta = chips.length > 0

  if (isTimeGrid) {
    const start = info.event.start
    const end = info.event.end
    const timeRange = (!info.event.allDay && start && end)
      ? `${fmt(start)} – ${fmt(end)}`
      : null

    return (
      <div className={`${styles.evCard} ${isDone ? styles.evDone : ''}`} style={cardStyle}>
        <div className={styles.evTitle}>
          <button
            className={styles.evChk}
            style={{ borderColor: vars.bar, ...(isDone ? { background: vars.bar } : {}) }}
            onClick={(e) => { e.stopPropagation(); onToggleDone(info.event.id, task.status) }}
            title={isDone ? '标记为未完成' : '标记为已完成'}
          >
            {isDone && <span style={{ color: '#fff', fontSize: 9 }}>✓</span>}
          </button>
          <span className={styles.evText}>{info.event.title}</span>
        </div>
        {timeRange && <div className={styles.evTime}>{timeRange}</div>}
        {hasMeta && (
          <div className={styles.evMeta}>
            {chips.map(({ dimensionId, option }) => (
              <span key={dimensionId} className={styles.evGenericChip}>
                <span className={styles.evGenericDot} style={{ background: option.color }} />
                {option.name}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 月视图：chip 样式
  return (
    <div
      className={`${styles.evChip} ${isDone ? styles.evChipDone : ''}`}
      style={{ background: vars.bg, borderLeft: `3px solid ${vars.bar}`, color: vars.ink }}
    >
      <button
        className={styles.evChipDot}
        style={{ background: vars.bar }}
        onClick={(e) => { e.stopPropagation(); onToggleDone(info.event.id, task.status) }}
        title={isDone ? '标记为未完成' : '标记为已完成'}
      />
      <span className={styles.evChipText}>{info.event.title}</span>
    </div>
  )
}
