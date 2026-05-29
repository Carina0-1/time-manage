import { useEffect, useRef } from 'react'
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
  EventMountArg,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import dayjs from 'dayjs'
import { mixWithGray } from '@/utils/colorUtils'
import { useTaskStore } from '@/stores/taskStore'
import { useTagStore } from '@/stores/tagStore'
import { useUiStore } from '@/stores/uiStore'
import { tasksApi } from '@/api/tasks'
import TaskModal from '@/components/task/TaskModal'
import styles from './CalendarPage.module.css'

const fmt = (d: Date) => dayjs(d).format('HH:mm')

// 从 mirror 元素的 style.top 和 slot 容器反推当前拖拽时间
// 返回 { start: Date, end: Date } 或 null
function getMirrorTime(durationMs: number): { start: Date; end: Date } | null {
  const mirror = document.querySelector<HTMLElement>('.fc-event-mirror')
  if (!mirror) return null

  // mirror 的父容器是 fc-timegrid-col-events，找它对应的日列
  const col = mirror.closest<HTMLElement>('.fc-timegrid-col[data-date]')
  const date = col?.dataset.date
  if (!date) return null

  // slot 容器：fc-timegrid-slots，里面第一个 slot 的 top 是 slotMinTime 对应的位置
  const slotsContainer = col.closest<HTMLElement>('.fc-timegrid-body') ??
    document.querySelector<HTMLElement>('.fc-timegrid-body')
  if (!slotsContainer) return null

  // 取所有 slot，第一个和最后一个确定时间范围和总高度
  const slots = document.querySelectorAll<HTMLElement>('.fc-timegrid-slot[data-time]')
  if (slots.length < 2) return null
  const firstSlot = slots[0]
  const lastSlot = slots[slots.length - 1]
  const firstRect = firstSlot.getBoundingClientRect()
  const lastRect = lastSlot.getBoundingClientRect()
  const slotHeight = firstRect.height

  // 第一个 slot 的 data-time 就是 slotMinTime，解析成分钟数
  const [fh, fm] = firstSlot.dataset.time!.split(':').map(Number)
  const firstMinutes = fh * 60 + fm

  // mirror 的 top（相对视口）减去第一个 slot 的 top，得到偏移像素
  const mirrorRect = mirror.getBoundingClientRect()
  const offsetPx = mirrorRect.top - firstRect.top

  // 每个 slot 的高度对应 slotDuration（默认30分钟，但可能不同）
  // 用最后一个 slot 算出总分钟数和总高度，推算 px/min
  const [lh, lm] = lastSlot.dataset.time!.split(':').map(Number)
  const lastMinutes = lh * 60 + lm
  const totalMinutes = lastMinutes - firstMinutes
  const totalHeight = lastRect.top - firstRect.top
  if (totalHeight <= 0) return null

  const pxPerMin = totalHeight / totalMinutes
  const offsetMinutes = Math.round(offsetPx / pxPerMin / 5) * 5 // snap 到 5 分钟

  const startMinutes = firstMinutes + offsetMinutes
  const startDate = new Date(`${date}T00:00:00`)
  startDate.setMinutes(startDate.getMinutes() + startMinutes)
  const endDate = new Date(startDate.getTime() + durationMs)

  return { start: startDate, end: endDate }
}

const TIME_TAG_BASE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  left: '4px',
  fontSize: '11px',
  fontWeight: '700',
  fontVariantNumeric: 'tabular-nums',
  background: 'rgba(0,0,0,0.45)',
  color: '#fff',
  padding: '0 4px',
  borderRadius: '3px',
  lineHeight: '1.6',
  pointerEvents: 'none',
  zIndex: '10',
  whiteSpace: 'nowrap',
}

function applyTagStyle(el: HTMLElement, position: 'top' | 'bottom') {
  Object.assign(el.style, TIME_TAG_BASE, position === 'top' ? { top: '2px' } : { bottom: '2px' })
}

// 往 mirror 注入/更新时间标签（直接找 .fc-event-mirror，用内联样式确保生效）
function setMirrorTags(start: Date, end: Date) {
  // mirror 可能没有 fc-event-main，直接找 mirror 元素本身
  const mirrors = document.querySelectorAll<HTMLElement>('.fc-event-mirror')
  mirrors.forEach((mirror) => {
    // 优先找 fc-event-main，没有就直接用 mirror
    const container = mirror.querySelector<HTMLElement>('.fc-event-main') ?? mirror

    let topTag = container.querySelector<HTMLElement>('[data-timetag="top"]')
    let bottomTag = container.querySelector<HTMLElement>('[data-timetag="bottom"]')

    if (!topTag) {
      topTag = document.createElement('span')
      topTag.dataset.timetag = 'top'
      applyTagStyle(topTag, 'top')
      container.appendChild(topTag)
    }
    if (!bottomTag) {
      bottomTag = document.createElement('span')
      bottomTag.dataset.timetag = 'bottom'
      applyTagStyle(bottomTag, 'bottom')
      container.appendChild(bottomTag)
    }
    topTag.textContent = fmt(start)
    bottomTag.textContent = fmt(end)
  })
}

function removeMirrorTags() {
  document.querySelectorAll('[data-timetag]').forEach((n) => n.remove())
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null)
  const { tasks, fetchTasks, updateTask } = useTaskStore()
  const { tags, fetchTags } = useTagStore()
  const { openCreateModal, openEditModal } = useUiStore()
  const draggingId = useRef<string | null>(null)

  // 拖拽移动时用 ref 记录事件时长（ms）
  const dragDurationRef = useRef<number>(0)

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
    fetchTags()
  }, [fetchTags])

  const tagColorMap = new Map(tags.map((t) => [t.id, t.color]))

  const events = tasks.map((task) => {
    const baseColor = task.color ?? (task.tagIds[0] ? tagColorMap.get(task.tagIds[0]) : undefined) ?? '#6366f1'
    const isDone = task.status === 'done'
    const color = isDone ? mixWithGray(baseColor) : baseColor
    return {
      id: task.id,
      title: task.title,
      start: task.startTime,
      end: task.endTime,
      allDay: task.isAllDay,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { task },
    }
  })

  const handleDatesSet = (info: DatesSetArg) => {
    fetchTasks(info.startStr, info.endStr)
  }

  const handleSelect = (info: DateSelectArg) => {
    openCreateModal({ start: info.start, end: info.end, isAllDay: info.allDay })
    calendarRef.current?.getApi().unselect()
  }

  const handleEventClick = (info: EventClickArg) => {
    openEditModal(info.event.id)
  }

  const handleEventDrop = async (info: EventDropArg) => {
    draggingId.current = null
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
    draggingId.current = null
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

  // resize：用 MutationObserver 监听 fc-event-resizing class，mousemove 实时读取 event 时间
  const handleEventDidMount = (info: EventMountArg) => {
    const main = info.el.querySelector<HTMLElement>('.fc-event-main')
    if (!main) return

    let resizing = false

    const observer = new MutationObserver(() => {
      const isResizing = info.el.classList.contains('fc-event-resizing')
      if (isResizing && !resizing) {
        resizing = true
        // 立刻注入标签
        const s = info.event.start
        const e = info.event.end
        if (s && e) {
          let top = main.querySelector<HTMLElement>('[data-timetag="top"]')
          let bottom = main.querySelector<HTMLElement>('[data-timetag="bottom"]')
          if (!top) {
            top = document.createElement('span')
            top.dataset.timetag = 'top'
            top.className = `${styles.eventTimeTag} ${styles.eventTimeTagTop}`
            main.appendChild(top)
          }
          if (!bottom) {
            bottom = document.createElement('span')
            bottom.dataset.timetag = 'bottom'
            bottom.className = `${styles.eventTimeTag} ${styles.eventTimeTagBottom}`
            main.appendChild(bottom)
          }
          top.textContent = fmt(s)
          bottom.textContent = fmt(e)
        }
      } else if (!isResizing && resizing) {
        resizing = false
        main.querySelectorAll('[data-timetag]').forEach((n) => n.remove())
      }
    })

    const onMouseMove = () => {
      if (!resizing) return
      const s = info.event.start
      const e = info.event.end
      if (!s || !e) return
      const top = main.querySelector<HTMLElement>('[data-timetag="top"]')
      const bottom = main.querySelector<HTMLElement>('[data-timetag="bottom"]')
      if (top) top.textContent = fmt(s)
      if (bottom) bottom.textContent = fmt(e)
    }

    observer.observe(info.el, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('mousemove', onMouseMove)

    // FullCalendar 销毁事件时清理（用 willUnmount 事件）
    info.el.addEventListener('fullcalendar:willUnmount' as never, () => {
      observer.disconnect()
      window.removeEventListener('mousemove', onMouseMove)
    })
  }

  return (
    <div className={styles.page}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: '今天',
          month: '月',
          week: '周',
          day: '日',
        }}
        locale="zh-cn"
        firstDay={1}
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        allDayText="全天"
        snapDuration="00:05:00"
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        weekends={true}
        events={events}
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventDragStart={(info) => {
          const start = info.event.start!
          const end = info.event.end!
          dragDurationRef.current = end.getTime() - start.getTime()

          // 立即注入初始时间标签（mirror 此时已在 DOM 中）
          requestAnimationFrame(() => setMirrorTags(start, end))

          const onMove = () => {
            const times = getMirrorTime(dragDurationRef.current)
            if (!times) return
            setMirrorTags(times.start, times.end)
          }
          window.addEventListener('mousemove', onMove)
          ;(info.el as HTMLElement & { _dragMoveHandler?: () => void })._dragMoveHandler = onMove
        }}
        eventDragStop={(info) => {
          draggingId.current = null
          removeMirrorTags()
          const handler = (info.el as HTMLElement & { _dragMoveHandler?: () => void })._dragMoveHandler
          if (handler) {
            window.removeEventListener('mousemove', handler)
            delete (info.el as HTMLElement & { _dragMoveHandler?: () => void })._dragMoveHandler
          }
        }}
        eventResizeStop={() => draggingId.current = null}
        eventDidMount={handleEventDidMount}
        eventContent={(info) => (
          <EventContent
            info={info}
            onToggleDone={(taskId, status) => handleToggleDone(taskId, status)}
          />
        )}
        height="100%"
      />
      <TaskModal />
    </div>
  )
}

function EventContent({
  info,
  onToggleDone,
}: {
  info: EventContentArg
  onToggleDone: (taskId: string, status: string) => void
}) {
  const task = info.event.extendedProps.task as { status: string }
  const isDone = task.status === 'done'

  return (
    <div className={`${styles.eventContent} ${isDone ? styles.eventDone : ''}`}>
      <button
        className={styles.checkBtn}
        onClick={(e) => {
          e.stopPropagation()
          onToggleDone(info.event.id, task.status)
        }}
        title={isDone ? '标记为未完成' : '标记为已完成'}
      >
        {isDone ? '✓' : '○'}
      </button>
      <span className={styles.eventTitle}>{info.event.title}</span>
    </div>
  )
}
