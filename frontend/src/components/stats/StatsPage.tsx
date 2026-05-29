import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import dayjs from 'dayjs'
import { statsApi } from '@/api/stats'
import { useTagStore } from '@/stores/tagStore'
import type { StatsResult } from '@time-manage/shared'
import styles from './StatsPage.module.css'

type Range = 'week' | 'month' | 'custom'

function getRangeDates(range: Range, customStart: string, customEnd: string) {
  const now = dayjs()
  if (range === 'week') {
    return {
      start: now.startOf('week').add(1, 'day').toISOString(), // 周一
      end: now.endOf('week').add(1, 'day').toISOString(),
    }
  }
  if (range === 'month') {
    return {
      start: now.startOf('month').toISOString(),
      end: now.endOf('month').toISOString(),
    }
  }
  return {
    start: customStart ? new Date(customStart).toISOString() : now.startOf('month').toISOString(),
    end: customEnd ? new Date(customEnd).toISOString() : now.endOf('month').toISOString(),
  }
}

function fmtMinutes(min: number) {
  if (min < 60) return `${min}分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

export default function StatsPage() {
  const { fetchTags } = useTagStore()
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

  const completionRate = stats
    ? stats.totalCount > 0 ? Math.round((stats.completedCount / stats.totalCount) * 100) : 0
    : 0

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

          {stats.tags.length === 0 ? (
            <div className={styles.empty}>该时间段内暂无数据</div>
          ) : (
            <div className={styles.charts}>
              {/* 饼图 */}
              <div className={styles.chartCard}>
                <h2>标签时间占比</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={stats.tags}
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
                      {stats.tags.map((tag) => (
                        <Cell key={tag.tagId} fill={tag.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 柱状图 */}
              <div className={styles.chartCard}>
                <h2>各标签时长明细</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stats.tags} layout="vertical" margin={{ left: 16, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${Math.floor(v / 60)}h`}
                      fontSize={12}
                    />
                    <YAxis type="category" dataKey="tagName" width={64} fontSize={12} />
                    <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
                    <Bar dataKey="totalMinutes" radius={[0, 4, 4, 0]}>
                      {stats.tags.map((tag) => (
                        <Cell key={tag.tagId} fill={tag.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 标签明细表 */}
              <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                <h2>明细</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>标签</th>
                      <th>时长</th>
                      <th>任务数</th>
                      <th>占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tags.map((tag) => (
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
