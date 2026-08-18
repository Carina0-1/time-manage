import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LabelList,
} from 'recharts'
import dayjs from 'dayjs'
import { statsApi } from '@/api/stats'
import { useTagStore } from '@/stores/tagStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { buildTagTree } from '@/utils/tagTree'
import type { StatsResult } from '@time-manage/shared'
import styles from './StatsPage.module.css'

type Range = 'week' | 'month' | 'custom'

function getRangeDates(range: Range, customStart: string, customEnd: string) {
  const now = dayjs()
  if (range === 'week') {
    const dayOfWeek = now.day() === 0 ? 7 : now.day()
    const monday = now.subtract(dayOfWeek - 1, 'day')
    const sunday = monday.add(6, 'day')
    return {
      start: monday.format('YYYY-MM-DD'),
      end: sunday.format('YYYY-MM-DD'),
    }
  }
  if (range === 'month') {
    return {
      start: now.startOf('month').format('YYYY-MM-DD'),
      end: now.endOf('month').format('YYYY-MM-DD'),
    }
  }
  return {
    start: customStart || now.startOf('month').format('YYYY-MM-DD'),
    end: customEnd || now.endOf('month').format('YYYY-MM-DD'),
  }
}

function fmtMinutes(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

export default function StatsPage() {
  const { fetchTags, tags } = useTagStore()
  const { goalTermLabel, tagTermLabel } = useSettingsStore()
  const [range, setRange] = useState<Range>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchTags() }, [fetchTags])

  useEffect(() => {
    const { start, end } = getRangeDates(range, customStart, customEnd)
    setLoading(true)
    statsApi.get(start, end)
      .then(setStats)
      .finally(() => setLoading(false))
  }, [range, customStart, customEnd])

  // 子标签颜色继承根标签（与侧边栏、日历视图保持一致）
  const rootColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const roots = buildTagTree([...tags].sort((a, b) => a.sortOrder - b.sortOrder), true)
    function walk(nodes: typeof roots, rootColor: string | null) {
      for (const node of nodes) {
        const color = rootColor ?? node.tag.color
        if (node.tag.name === node.fullPath) map.set(node.tag.id, color)
        if (node.children.length > 0) walk(node.children, color)
      }
    }
    walk(roots, null)
    return map
  }, [tags])

  // 一级标签名 -> 根颜色（用于 dailyTagMinutes 颜色替换）
  const rootColorByName = useMemo(() => {
    const map = new Map<string, string>()
    const roots = buildTagTree([...tags].sort((a, b) => a.sortOrder - b.sortOrder), true)
    for (const node of roots) {
      map.set(node.fullPath, node.tag.color)
    }
    return map
  }, [tags])

  const statsWithRootColor = useMemo(() => {
    if (!stats) return null
    return {
      ...stats,
      tags: stats.tags.map((t) => ({ ...t, color: rootColorMap.get(t.tagId) ?? t.color })),
      dailyTagMinutes: stats.dailyTagMinutes.map((d) => ({
        ...d,
        color: rootColorByName.get(d.tagName) ?? d.color,
      })),
    }
  }, [stats, rootColorMap, rootColorByName])

  const completionRate = stats
    ? stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0
    : 0

  // 按目标汇总总时长（dailyGoalMinutes 是 日期 x 目标 的笛卡尔积，直接按 goalId 求和即可）
  const goalTotals = useMemo(() => {
    if (!stats) return []
    const map = new Map<string, { goalId: string; goalName: string; color: string; totalMinutes: number }>()
    for (const row of stats.dailyGoalMinutes) {
      const existing = map.get(row.goalId)
      if (existing) existing.totalMinutes += row.minutes
      else map.set(row.goalId, { goalId: row.goalId, goalName: row.goalName, color: row.color, totalMinutes: row.minutes })
    }
    return [...map.values()].filter((g) => g.totalMinutes > 0).sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [stats])
  const goalTotalMinutes = goalTotals.reduce((sum, g) => sum + g.totalMinutes, 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>统计</h1>
        <div className={styles.rangeBar}>
          {(['week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ''}`}
              onClick={() => setRange(r)}
            >
              {r === 'week' ? '本周' : '本月'}
            </button>
          ))}
          <button
            className={`${styles.rangeBtn} ${range === 'custom' ? styles.rangeBtnActive : ''}`}
            onClick={() => setRange('custom')}
          >
            自定义
          </button>
          {range === 'custom' && (
            <div className={styles.customRange}>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span>—</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {loading && <div className={styles.loading}>加载中…</div>}

      {!loading && statsWithRootColor && (
        <>
          {/* 汇总卡片 */}
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>总时长</div>
              <div className={styles.cardValue}>{fmtMinutes(statsWithRootColor.totalMinutes)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>任务数</div>
              <div className={styles.cardValue}>{statsWithRootColor.totalCount}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>完成率</div>
              <div className={styles.cardValue}>{completionRate}%</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>已完成</div>
              <div className={styles.cardValue}>{statsWithRootColor.completedCount}</div>
            </div>
          </div>

          {statsWithRootColor.totalCount === 0 ? (
            <div className={styles.empty}>该时间段内暂无数据</div>
          ) : (
            <div className={styles.charts}>
              {/* 每日总时长 */}
              {statsWithRootColor.dailyMinutes.length > 0 && (
                <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                  <h2>每日任务总时长</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={statsWithRootColor.dailyMinutes} margin={{ left: 8, right: 16, top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
                      <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}h`} fontSize={12} domain={[0, (max: number) => Math.ceil(max * 1.2)]} />
                      <Tooltip formatter={(v) => fmtMinutes(Number(v))} labelFormatter={(d) => String(d)} />
                      <Bar dataKey="totalMinutes" fill="var(--accent)" radius={[4, 4, 0, 0]} name="总时长" maxBarSize={36}>
                        <LabelList dataKey="totalMinutes" position="top" fontSize={11} formatter={(v: unknown) => typeof v === 'number' && v > 0 ? fmtMinutes(v) : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 每日各目标时长 */}
              {(() => {
                const rows = statsWithRootColor.dailyGoalMinutes
                if (!rows || rows.length === 0) return null
                const hasAny = rows.some((r) => r.minutes > 0)
                if (!hasAny) return null
                const dateSet = [...new Set(rows.map((r) => r.date))].sort()
                const goalNames = [...new Set(rows.map((r) => r.goalName))]
                const colorByGoal = new Map(rows.map((r) => [r.goalName, r.color]))
                const chartData = dateSet.map((date) => {
                  const row: Record<string, string | number> = { date }
                  for (const name of goalNames) {
                    row[name] = rows.find((r) => r.date === date && r.goalName === name)?.minutes ?? 0
                  }
                  return row
                })
                return (
                  <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                    <h2>每日各{goalTermLabel}时长</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ left: 8, right: 16, top: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
                        <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}h`} fontSize={12} domain={[0, (max: number) => Math.ceil(max * 1.2)]} />
                        <Tooltip formatter={(v) => fmtMinutes(Number(v))} labelFormatter={(d) => String(d)} />
                        <Legend />
                        {goalNames.map((name) => (
                          <Bar key={name} dataKey={name} fill={colorByGoal.get(name)} radius={[4, 4, 0, 0]} maxBarSize={28}>
                            <LabelList dataKey={name} position="top" fontSize={10} formatter={(v: unknown) => typeof v === 'number' && v > 0 ? fmtMinutes(v) : ''} />
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* 每日各一级标签时长 */}
              {(() => {
                const rows = statsWithRootColor.dailyTagMinutes
                if (rows.length === 0 || !rows.some((r) => r.minutes > 0)) return null
                const dateSet = [...new Set(rows.map((r) => r.date))].sort()
                const tagNames = [...new Set(rows.map((r) => r.tagName))].sort()
                const colorByTag = new Map(rows.map((r) => [r.tagName, r.color]))
                const chartData = dateSet.map((date) => {
                  const row: Record<string, string | number> = { date }
                  for (const name of tagNames) {
                    row[name] = rows.find((r) => r.date === date && r.tagName === name)?.minutes ?? 0
                  }
                  return row
                })
                return (
                  <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                    <h2>每日各{tagTermLabel}时长</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ left: 8, right: 16, top: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
                        <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}h`} fontSize={12} domain={[0, (max: number) => Math.ceil(max * 1.2)]} />
                        <Tooltip formatter={(v) => fmtMinutes(Number(v))} labelFormatter={(d) => String(d)} />
                        <Legend />
                        {tagNames.map((name) => (
                          <Bar key={name} dataKey={name} fill={colorByTag.get(name)} radius={[4, 4, 0, 0]} maxBarSize={28}>
                            <LabelList dataKey={name} position="top" fontSize={10} formatter={(v: unknown) => typeof v === 'number' && v > 0 ? fmtMinutes(v) : ''} />
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}

              {/* 各目标总时长占比 */}
              {goalTotals.length > 0 && (
                <div className={styles.chartCard}>
                  <h2>{goalTermLabel}总时长</h2>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={goalTotals}
                        dataKey="totalMinutes"
                        nameKey="goalName"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, payload }) => {
                          const p = payload as { goalName?: string; totalMinutes?: number } | undefined
                          const pct = p && goalTotalMinutes > 0 ? Math.round((p.totalMinutes ?? 0) / goalTotalMinutes * 100) : 0
                          return `${p?.goalName ?? name} ${pct}%`
                        }}
                        labelLine={true}
                      >
                        {goalTotals.map((g) => (
                          <Cell key={g.goalId} fill={g.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 标签时间占比 */}
              <div className={styles.chartCard}>
                <h2>{tagTermLabel}时间占比</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statsWithRootColor.tags}
                      dataKey="totalMinutes"
                      nameKey="tagName"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, payload }) => {
                        const p = payload as { tagName?: string; percentage?: number } | undefined
                        return p ? `${p.tagName ?? name} ${p.percentage ?? 0}%` : ''
                      }}
                      labelLine={true}
                    >
                      {statsWithRootColor.tags.map((tag) => (
                        <Cell key={tag.tagId} fill={tag.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 标签明细表 */}
              <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                <h2>明细</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{tagTermLabel}</th>
                      <th>时长</th>
                      <th>任务数</th>
                      <th>占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsWithRootColor.tags.map((tag) => (
                      <tr key={tag.tagId}>
                        <td>
                          <span className={styles.tagBadge} style={{ background: tag.color + '20', color: tag.color }}>
                            {tag.tagName}
                          </span>
                        </td>
                        <td>{fmtMinutes(tag.totalMinutes)}</td>
                        <td>{tag.taskCount}</td>
                        <td>
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${tag.percentage}%`, background: tag.color }}
                            />
                          </div>
                          {tag.percentage}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}
