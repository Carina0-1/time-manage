import { useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LabelList,
} from 'recharts'
import dayjs from 'dayjs'
import { statsApi } from '@/api/stats'
import { useDimensionStore } from '@/stores/dimensionStore'
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
  const { dimensions, fetchDimensions } = useDimensionStore()
  const [range, setRange] = useState<Range>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchDimensions() }, [fetchDimensions])

  useEffect(() => {
    const { start, end } = getRangeDates(range, customStart, customEnd)
    setLoading(true)
    statsApi.get(start, end)
      .then(setStats)
      .finally(() => setLoading(false))
  }, [range, customStart, customEnd])

  const completionRate = stats
    ? stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0
    : 0

  const sidebarDimensions = useMemo(
    () => [...dimensions].filter((d) => d.showInSidebar).sort((a, b) => a.sortOrder - b.sortOrder),
    [dimensions]
  )

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

      {!loading && stats && (
        <>
          {/* 汇总卡片 */}
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>总时长</div>
              <div className={styles.cardValue}>{fmtMinutes(stats.totalMinutes)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>任务数</div>
              <div className={styles.cardValue}>{stats.totalCount}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>完成率</div>
              <div className={styles.cardValue}>{completionRate}%</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>已完成</div>
              <div className={styles.cardValue}>{stats.completedCount}</div>
            </div>
          </div>

          {stats.totalCount === 0 ? (
            <div className={styles.empty}>该时间段内暂无数据</div>
          ) : (
            <div className={styles.charts}>
              {/* 每日总时长 */}
              {stats.dailyMinutes.length > 0 && (
                <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                  <h2>每日任务总时长</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.dailyMinutes} margin={{ left: 8, right: 16, top: 20 }}>
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

              {/* 每个维度：每日堆叠柱状图 + 占比饼图 + 明细表 */}
              {sidebarDimensions.map((dim) => (
                <DimensionCharts key={dim.id} dimensionId={dim.id} dimensionName={dim.name} stats={stats} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DimensionCharts({
  dimensionId,
  dimensionName,
  stats,
}: {
  dimensionId: string
  dimensionName: string
  stats: StatsResult
}) {
  const dailyRows = stats.dailyDimensionMinutes[dimensionId] ?? []
  const optionStats = stats.dimensionStats[dimensionId] ?? []

  const dailyChart = useMemo(() => {
    if (dailyRows.length === 0 || !dailyRows.some((r) => r.minutes > 0)) return null
    const dateSet = [...new Set(dailyRows.map((r) => r.date))].sort()
    const names = [...new Set(dailyRows.map((r) => r.optionName))].sort()
    const colorByName = new Map(dailyRows.map((r) => [r.optionName, r.color]))
    const chartData = dateSet.map((date) => {
      const row: Record<string, string | number> = { date }
      for (const name of names) {
        row[name] = dailyRows.find((r) => r.date === date && r.optionName === name)?.minutes ?? 0
      }
      return row
    })
    return { chartData, names, colorByName }
  }, [dailyRows])

  const totalMinutes = optionStats.reduce((sum, o) => sum + o.totalMinutes, 0)

  if (optionStats.length === 0) return null

  return (
    <>
      {dailyChart && (
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          <h2>每日各{dimensionName}时长</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart.chartData} margin={{ left: 8, right: 16, top: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
              <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}h`} fontSize={12} domain={[0, (max: number) => Math.ceil(max * 1.2)]} />
              <Tooltip formatter={(v) => fmtMinutes(Number(v))} labelFormatter={(d) => String(d)} />
              <Legend />
              {dailyChart.names.map((name) => (
                <Bar key={name} dataKey={name} fill={dailyChart.colorByName.get(name)} radius={[4, 4, 0, 0]} maxBarSize={28}>
                  <LabelList dataKey={name} position="top" fontSize={10} formatter={(v: unknown) => typeof v === 'number' && v > 0 ? fmtMinutes(v) : ''} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={styles.chartCard}>
        <h2>{dimensionName}时间占比</h2>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={optionStats}
              dataKey="totalMinutes"
              nameKey="optionName"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, payload }) => {
                const p = payload as { optionName?: string; totalMinutes?: number } | undefined
                const pct = p && totalMinutes > 0 ? Math.round((p.totalMinutes ?? 0) / totalMinutes * 100) : 0
                return `${p?.optionName ?? name} ${pct}%`
              }}
              labelLine={true}
            >
              {optionStats.map((o) => (
                <Cell key={o.optionId} fill={o.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
        <h2>{dimensionName}明细</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{dimensionName}</th>
              <th>时长</th>
              <th>任务数</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            {optionStats.map((o) => (
              <tr key={o.optionId}>
                <td>
                  <span className={styles.tagBadge} style={{ background: o.color + '20', color: o.color }}>
                    {o.optionName}
                  </span>
                </td>
                <td>{fmtMinutes(o.totalMinutes)}</td>
                <td>{o.taskCount}</td>
                <td>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${o.percentage}%`, background: o.color }}
                    />
                  </div>
                  {o.percentage}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
