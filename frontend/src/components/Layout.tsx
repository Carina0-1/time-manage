import { useEffect, useState } from 'react'
import type { DailyActivity } from '@time-manage/shared'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import QuickCreatePanel from './task/QuickCreatePanel'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useDimensionStore } from '@/stores/dimensionStore'
import { canLeaveTaskEditor } from '@/stores/taskListStore'
import { useTaskStore } from '@/stores/taskStore'
import { tasksApi } from '@/api/tasks'
import { statsApi } from '@/api/stats'
import DimensionNav from './dimension/DimensionNav'

import styles from './Layout.module.css'

export default function Layout() {
  const navigate = useNavigate()
  const { taskModalOpen, panelPos } = useUiStore()
  const { user, logout } = useAuthStore()
  const activity = useSidebarActivity()

  const handleLogout = async () => {
    if (!await canLeaveTaskEditor()) return
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <div className={styles.brandRow}>
          <div className={styles.brand} onClick={async () => { if (await canLeaveTaskEditor()) navigate('/calendar') }}>
            <span className={styles.brandDot} />
            <span className={styles.brandName}>TiGo</span>
          </div>
          <button className={styles.settingsBtn} onClick={async () => { if (await canLeaveTaskEditor()) navigate('/settings') }} title="设置">⚙</button>
        </div>
        <div className={styles.mainNav}>
          {([['/calendar', '▦', '日历'], ['/tasks', '☷', '任务'], ['/stats', '◷', '统计']] as const).map(([to, icon, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`} onClick={async e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); if (await canLeaveTaskEditor()) navigate(to) }}><span aria-hidden="true">{icon}</span>{label}</NavLink>
          ))}
        </div>
        <SidebarStats activity={activity} onClickStats={() => navigate('/stats')} />
        <ActivityHeatmap activity={activity} />
        <DimensionNav />
        <div className={styles.sidebarFooter}>
          <span className={styles.sidebarUsername}>{user?.username}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>退出</button>
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
      {taskModalOpen && panelPos && <QuickCreatePanel />}
    </div>
  )
}

function SidebarStats({ onClickStats, activity }: { onClickStats: () => void; activity: DailyActivity[] }) {
  const revision = useTaskStore(s => s.countRevision)
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()
  const [totalTaskCount, setTotalTaskCount] = useState(0)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90)
  const activeDays = activity.filter(item => item.date >= cutoff.toISOString().slice(0, 10)).length

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => fetchOptions(d.id))
  }, [dimensions, fetchOptions])

  // 用配色维度（若无则用第一个维度）的选项数量作为展示统计项
  const primaryDimension = dimensions.find((d) => d.isColorSource) ?? dimensions[0]
  const primaryOptionCount = primaryDimension ? (optionsByDimension[primaryDimension.id]?.length ?? 0) : 0

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { void tasksApi.count(controller.signal).then(setTotalTaskCount).catch(() => {}) }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [revision])

  return (
    <div className={styles.sidebarStats} onClick={async () => { if (await canLeaveTaskEditor()) onClickStats() }} title="查看统计">
      <div className={styles.statItem}>
        <span className={styles.statNum}>{totalTaskCount}</span>
        <span className={styles.statLabel}>任务</span>
      </div>
      {primaryDimension && (
        <div className={styles.statItem}>
          <span className={styles.statNum}>{primaryOptionCount}</span>
          <span className={styles.statLabel}>{primaryDimension.name}</span>
        </div>
      )}
      <div className={styles.statItem}>
        <span className={styles.statNum}>{activeDays}</span>
        <span className={styles.statLabel}>天</span>
      </div>
    </div>
  )
}

function useSidebarActivity() {
  const revision = useTaskStore(s => s.activityRevision)
  const [activity, setActivity] = useState<DailyActivity[]>([])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const end = new Date(), start = new Date(end)
      start.setDate(start.getDate() - 104)
      void statsApi.activity(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), controller.signal).then(setActivity).catch(() => {})
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [revision])
  return activity
}

function ActivityHeatmap({ activity }: { activity: DailyActivity[] }) {
  const activityMap = new Map(activity.map(item => [item.date, item.taskCount]))
  const today = new Date()
  const dayOfWeek = (today.getDay() + 6) % 7
  const gridEnd = new Date(today)
  gridEnd.setDate(today.getDate() + (6 - dayOfWeek))
  const gridStart = new Date(gridEnd)
  gridStart.setDate(gridStart.getDate() - 104)
  const cells: { date: string; count: number }[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    const key = cur.toISOString().slice(0, 10)
    cells.push({ date: key, count: activityMap.get(key) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }
  const heatColor = (count: number) => count === 0 ? 'var(--heat-0)' : count <= 1 ? 'var(--heat-1)' : count <= 3 ? 'var(--heat-2)' : count <= 5 ? 'var(--heat-3)' : 'var(--heat-4)'
  const numWeeks = cells.length / 7
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
