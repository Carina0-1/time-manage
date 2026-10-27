import { useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { useDimensionStore } from '@/stores/dimensionStore'
import { useUiStore } from '@/stores/uiStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTaskListStore } from '@/stores/taskListStore'
import { buildOptionTree, getDescendantIds } from '@/utils/dimensionTree'
import styles from '../Layout.module.css'

export default function DimensionNav() {
  const { dimensions, optionsByDimension, fetchDimensions, fetchOptions } = useDimensionStore()

  useEffect(() => {
    fetchDimensions()
  }, [fetchDimensions])

  useEffect(() => {
    dimensions.forEach((d) => {
      fetchOptions(d.id)
    })
  }, [dimensions, fetchOptions])

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
        />
      ))}
    </>
  )
}

function DimensionSection({
  dimension,
  options,
}: {
  dimension: Dimension
  options: DimensionOption[]
}) {
  const { activeDimensionFilters, setDimensionFilter } = useUiStore()
  const navigate = useNavigate()
  const location = useLocation()
  const listFilters = useTaskListStore(s => s.dimensionFilters)
  const setListFilter = useTaskListStore(s => s.setDimensionFilter)
  const inTaskList = location.pathname === '/tasks'

  const activeOptionId = (inTaskList ? listFilters : activeDimensionFilters)[dimension.id] ?? null
  const tree = useMemo(() => buildOptionTree(options), [options])
  const sectionKey = `dimension:${dimension.userId}:${dimension.id}`
  const expanded = useSidebarStore(state => !state.collapsed[sectionKey])
  const toggle = useSidebarStore(state => state.toggle)
  const optionsId = `sidebar-options-${dimension.id}`

  const handleSelect = async (optionId: string) => {
    if (inTaskList) {
      const guard = useTaskListStore.getState().confirmLeave
      if (!guard || await guard()) setListFilter(dimension.id, activeOptionId === optionId ? null : optionId)
      return
    }
    setDimensionFilter(dimension.id, activeOptionId === optionId ? null : optionId)
    if (location.pathname !== '/calendar') navigate('/calendar')
  }

  const clearFilter = async () => {
    if (inTaskList) {
      const guard = useTaskListStore.getState().confirmLeave
      if (!guard || await guard()) setListFilter(dimension.id, null)
    } else setDimensionFilter(dimension.id, null)
  }

  const sortedOptions = [...options].sort((a, b) => a.sortOrder - b.sortOrder)
  return (
    <section className={styles.tagSection} aria-label={dimension.name}>
      <div className={styles.tagSectionHeader}>
        <button type="button" className={styles.dimensionToggle}
          aria-label={`${expanded ? '收起' : '展开'}维度：${dimension.name}`}
          aria-expanded={expanded} aria-controls={optionsId} onClick={() => toggle(sectionKey)}>
          <span className={`${styles.tagSectionTitle} ${activeOptionId ? styles.tagSectionTitleActive : ''}`}>
            {dimension.icon} {dimension.name}
          </span>
          <Chevron expanded={expanded} />
        </button>
        {activeOptionId && <button type="button" className={styles.clearDimensionFilter}
          aria-label={`清除${dimension.name}筛选`} title="显示全部任务" onClick={clearFilter}>×</button>}
      </div>
      <div id={optionsId} hidden={!expanded}>
        {dimension.type === 'tree' ? tree.map(node => (
          <TreeNodeItem key={node.option.id} node={node} activeOptionId={activeOptionId} onSelect={handleSelect} />
        )) : sortedOptions.map(option => (
          <div key={option.id} className={`${styles.tagNavItem} ${activeOptionId === option.id ? styles.tagNavItemActive : ''}`}>
            <button type="button" className={styles.tagNavSelect} aria-pressed={activeOptionId === option.id} onClick={() => handleSelect(option.id)}>
              <span className={styles.tagNavDot} style={{ background: option.color }} />
              {option.icon && <span>{option.icon}</span>}
              <span className={styles.tagNavLabel}>{option.name}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
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
  const nodeKey = `option:${node.option.userId}:${node.option.id}`
  const expanded = useSidebarStore(state => !state.collapsed[nodeKey])
  const toggle = useSidebarStore(state => state.toggle)
  const childrenId = `sidebar-children-${node.option.id}`
  const hasChildren = node.children.length > 0
  const isActive = activeOptionId === node.option.id

  const hasActiveDescendant = useMemo(() => {
    if (!activeOptionId) return false
    return getDescendantIds(node).includes(activeOptionId) && activeOptionId !== node.option.id
  }, [activeOptionId, node])

  return (
    <div>
      <div className={`${styles.tagNavItem} ${isActive ? styles.tagNavItemActive : ''}`}
        style={{ paddingLeft: `${8 + node.depth * 12}px` }}>
        <button type="button" className={styles.tagNavSelect} aria-pressed={isActive} onClick={() => onSelect(node.option.id)}>
          <span className={styles.tagNavDot} style={{ background: rootColor ?? node.option.color }} />
          {node.option.icon && <span>{node.option.icon}</span>}
          <span className={`${styles.tagNavLabel} ${hasActiveDescendant ? styles.tagNavItemParentActive : ''}`}>{node.option.name}</span>
        </button>
        {hasChildren && <button type="button" className={styles.optionToggle}
          aria-label={`${expanded ? '收起' : '展开'}选项：${node.option.name}`} aria-expanded={expanded}
          aria-controls={childrenId} onClick={() => toggle(nodeKey)}><Chevron expanded={expanded} /></button>}
      </div>
      {hasChildren && <div id={childrenId} hidden={!expanded}>{node.children.map(child => (
        <TreeNodeItem key={child.option.id} node={child} activeOptionId={activeOptionId} onSelect={onSelect}
          rootColor={rootColor ?? node.option.color} />
      ))}</div>}
    </div>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return <svg className={`${styles.sidebarChevron} ${expanded ? styles.sidebarChevronExpanded : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
