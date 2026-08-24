import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useUiStore } from '@/stores/uiStore'
import { buildOptionTree, getDescendantIds } from '@/utils/dimensionTree'
import styles from '../Layout.module.css'

export default function DimensionNav() {
  const { dimensions, optionsByDimension, currentStateByOption, fetchDimensions, fetchOptions, fetchCurrentStates } = useDimensionStore()

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => {
      fetchOptions(d.id)
      if (d.type === 'entity') fetchCurrentStates(d.id)
    })
  }, [dimensions, fetchOptions, fetchCurrentStates])

  const visibleDimensions = [...dimensions]
    .filter((d) => d.showInSidebar)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      {visibleDimensions.map((dim) => (
        <DimensionSection
          key={dim.id}
          dimension={dim}
          options={optionsByDimension[dim.id] ?? []}
          currentStateByOption={currentStateByOption}
        />
      ))}
    </>
  )
}

function DimensionSection({
  dimension,
  options,
  currentStateByOption,
}: {
  dimension: Dimension
  options: DimensionOption[]
  currentStateByOption: Record<string, { name: string; color?: string }>
}) {
  const { activeDimensionFilters, setDimensionFilter } = useUiStore()
  const navigate = useNavigate()
  const location = useLocation()

  const activeOptionId = activeDimensionFilters[dimension.id] ?? null
  const tree = useMemo(() => buildOptionTree(options), [options])

  const handleSelect = (optionId: string) => {
    setDimensionFilter(dimension.id, activeOptionId === optionId ? null : optionId)
    if (location.pathname !== '/calendar') navigate('/calendar')
  }

  if (dimension.type === 'tree') {
    return (
      <div className={styles.tagSection}>
        <div className={styles.tagSectionHeader}>
          <span
            className={`${styles.tagSectionTitle} ${activeOptionId ? styles.tagSectionTitleActive : ''}`}
            title={activeOptionId ? '点击显示全部任务' : dimension.name}
            onClick={() => setDimensionFilter(dimension.id, null)}
          >
            {dimension.icon} {dimension.name}
          </span>
        </div>
        {tree.map((node) => (
          <TreeNodeItem key={node.option.id} node={node} activeOptionId={activeOptionId} onSelect={handleSelect} />
        ))}
      </div>
    )
  }

  const sortedOptions = [...options].sort((a, b) => a.sortOrder - b.sortOrder)
  return (
    <div className={styles.tagSection}>
      <div className={styles.tagSectionHeader}>
        <span
          className={`${styles.tagSectionTitle} ${activeOptionId ? styles.tagSectionTitleActive : ''}`}
          title={activeOptionId ? '点击显示全部任务' : dimension.name}
          onClick={() => setDimensionFilter(dimension.id, null)}
        >
          {dimension.icon} {dimension.name}
        </span>
      </div>
      {sortedOptions.map((option) => (
        <div
          key={option.id}
          className={`${styles.tagNavItem} ${activeOptionId === option.id ? styles.tagNavItemActive : ''}`}
          style={{ paddingLeft: '10px' }}
          onClick={() => handleSelect(option.id)}
        >
          <span className={styles.expandIcon} />
          <span className={styles.tagNavDot} style={{ background: option.color }} />
          {option.icon && <span>{option.icon}</span>}
          <span className={styles.tagNavLabel}>{option.name}</span>
          {dimension.type === 'entity' && currentStateByOption[option.id] && (
            <span
              className={styles.stateBadge}
              style={{
                background: currentStateByOption[option.id].color ? currentStateByOption[option.id].color + '20' : 'var(--panel-2)',
                color: currentStateByOption[option.id].color ?? 'var(--ink-faint)',
              }}
            >
              {currentStateByOption[option.id].name}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function TreeNodeItem({
  node,
  activeOptionId,
  onSelect,
  rootColor,
}: {
  node: ReturnType<typeof buildOptionTree>[number]
  activeOptionId: string | null
  onSelect: (optionId: string) => void
  rootColor?: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const hasChildren = node.children.length > 0
  const isActive = activeOptionId === node.option.id

  const hasActiveDescendant = useMemo(() => {
    if (!activeOptionId) return false
    return getDescendantIds(node).includes(activeOptionId) && activeOptionId !== node.option.id
  }, [activeOptionId, node])

  return (
    <div>
      <div
        className={`${styles.tagNavItem} ${isActive ? styles.tagNavItemActive : ''}`}
        style={{ paddingLeft: `${10 + node.depth * 18}px` }}
        onClick={() => onSelect(node.option.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          className={`${styles.expandIcon} ${hasChildren && hovered ? styles.expandIconVisible : ''}`}
          onClick={hasChildren ? (e) => { e.stopPropagation(); setExpanded(!expanded) } : undefined}
        >
          {hasChildren && hovered ? (expanded ? '▾' : '▸') : null}
        </span>
        <span className={styles.tagNavDot} style={{ background: rootColor ?? node.option.color }} />
        {node.option.icon && <span>{node.option.icon}</span>}
        <span className={styles.tagNavLabel} style={hasActiveDescendant ? { fontWeight: 600 } : {}}>{node.option.name}</span>
      </div>
      {hasChildren && expanded && node.children.map((child) => (
        <TreeNodeItem
          key={child.option.id}
          node={child}
          activeOptionId={activeOptionId}
          onSelect={onSelect}
          rootColor={rootColor ?? node.option.color}
        />
      ))}
    </div>
  )
}
