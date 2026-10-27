import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { UNSET_DIMENSION_VALUE } from '@time-manage/shared'
import { getOptionPath } from '@/utils/dimensionTree'
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
  return <div className={styles.dimensionFields}>
    <input type="search" aria-label={mode === 'filter' ? '搜索筛选选项' : '搜索打标选项'} placeholder="搜索维度或选项…" value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} />
    {!dimensions.length && <p className={styles.hint}>暂无维度，<Link to="/settings">前往设置</Link>添加。</p>}
    <div className={styles.dimensionGrid}>
      {dimensions.map(dim => {
        const options = [...(optionsByDimension[dim.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
        const paths = options.map(option => ({ option, path: getOptionPath(options, option.id) }))
        const matching = paths.filter(({ option, path }) => option.id === values[dim.id] || `${dim.name} ${path}`.toLowerCase().includes(query.trim().toLowerCase()))
        if (query && !matching.length && !dim.name.toLowerCase().includes(query.toLowerCase())) return null
        return <label key={dim.id} className={styles.field}>
          <span>{dim.icon} {dim.name}{mode === 'tag' && dim.isRequired && <b className={styles.required}> *</b>}</span>
          <select aria-label={`${mode === 'filter' ? '筛选' : '设置'}${dim.name}`} value={values[dim.id] ?? ''} disabled={disabled || (mode === 'tag' && !options.length)} onChange={e => onChange(dim.id, e.target.value || null)}>
            <option value="" disabled={mode === 'tag' && dim.isRequired && !!values[dim.id]}>{mode === 'filter' ? '不限' : '未设置'}</option>
            {mode === 'filter' && <option value={UNSET_DIMENSION_VALUE}>未设置</option>}
            {matching.map(({ option, path }) => <option key={option.id} value={option.id}>{option.icon ? `${option.icon} ` : ''}{path}{mode === 'filter' && dim.type === 'tree' && options.some(o => o.parentId === option.id) ? '（及下级）' : ''}</option>)}
          </select>
          {!options.length && <span className={styles.hint}>暂无选项，请在设置中添加</span>}
        </label>
      })}
    </div>
  </div>
}
