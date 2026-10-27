import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import { getOptionPath } from '@/utils/dimensionTree'
import { canLeaveTaskEditor } from '@/stores/taskListStore'
import styles from './TaskListPage.module.css'

interface Props {
  dimensions: Dimension[]
  optionsByDimension: Record<string, DimensionOption[]>
  values: Record<string, string>
  onChange: (dimensionId: string, value: string | null) => void
  mode?: 'filter' | 'tag'
  disabled?: boolean
}

export default function DimensionFields({ dimensions, optionsByDimension, values, onChange, mode = 'tag', disabled = false }: Props) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const navigate = useNavigate()
  return <div className={styles.dimensionFields}>
    {mode === 'filter' && <input type="search" aria-label="搜索筛选选项" placeholder="搜索维度或选项…" value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} />}
    {!dimensions.length && <p className={styles.hint}>暂无维度，<Link to="/settings" onClick={async e => { e.preventDefault(); if (await canLeaveTaskEditor()) navigate('/settings') }}>前往设置</Link>添加。</p>}
    <div className={styles.dimensionGrid}>
      {dimensions.map(dim => {
        const options = [...(optionsByDimension[dim.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
        const paths = options.map(option => ({ option, path: getOptionPath(options, option.id) }))
        const matching = mode === 'tag' ? paths : paths.filter(({ option, path }) => option.id === values[dim.id] || `${dim.name} ${path}`.toLowerCase().includes(query.trim().toLowerCase()))
        if (mode === 'filter' && query && !matching.length && !dim.name.toLowerCase().includes(query.toLowerCase())) return null
        return <label key={dim.id} className={styles.field}>
          <span>{dim.icon} {dim.name}{mode === 'tag' && dim.isRequired && <b className={styles.required}> *</b>}</span>
          {mode === 'tag' ? <div className={styles.dimensionPicker}>
            <button type="button" className={styles.dimensionTrigger} aria-label={`设置${dim.name}：${getOptionPath(options, values[dim.id]) || '未设置'}`} aria-expanded={openId === dim.id} disabled={disabled || !options.length} onClick={() => setOpenId(openId === dim.id ? null : dim.id)}>{getOptionPath(options, values[dim.id]) || '未设置'}<span aria-hidden="true">⌄</span></button>
            {openId === dim.id && <div role="group" aria-label={`${dim.name}选项`} className={styles.dimensionChoices} onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setOpenId(null); e.currentTarget.parentElement?.querySelector('button')?.focus() }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
              }
            }}>
              <button type="button" disabled={dim.isRequired && !!values[dim.id]} onClick={() => { onChange(dim.id, null); setOpenId(null) }}>未设置</button>
              {paths.map(({ option, path }) => <button type="button" key={option.id} aria-pressed={option.id === values[dim.id]} onClick={() => { onChange(dim.id, option.id); setOpenId(null) }}>{option.icon && `${option.icon} `}{path}{option.id === values[dim.id] && <span aria-hidden="true">✓</span>}</button>)}
            </div>}
          </div> : <select aria-label={`筛选${dim.name}`} value={values[dim.id] ?? ''} disabled={disabled} onChange={e => onChange(dim.id, e.target.value || null)}>
            <option value="">不限</option>
            <option value={UNSET_DIMENSION_VALUE}>未设置</option>
            {matching.map(({ option, path }) => <option key={option.id} value={option.id}>{option.icon ? `${option.icon} ` : ''}{path}{mode === 'filter' && dim.type === 'tree' && options.some(o => o.parentId === option.id) ? '（及下级）' : ''}</option>)}
          </select>}
          {!options.length && <span className={styles.hint}>暂无选项，请在设置中添加</span>}
        </label>
      })}
    </div>
  </div>
}
