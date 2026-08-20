import { useEffect, useRef, useState } from 'react'
import type { Dimension, DimensionOption } from '@time-manage/shared'
import { buildOptionTree, flattenOptionTree } from '@/utils/dimensionTree'
import styles from './DimensionSelector.module.css'

export default function DimensionSelector({
  dimension,
  options,
  selectedOptionId,
  onSelect,
}: {
  dimension: Dimension
  options: DimensionOption[]
  selectedOptionId: string | undefined
  onSelect: (optionId: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const lockedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        lockedRef.current = false
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const closeAndUnlock = () => {
    setOpen(false)
    lockedRef.current = false
  }

  const flatOptions = dimension.type === 'tree'
    ? flattenOptionTree(buildOptionTree(options))
    : options.map((o) => ({ option: o, depth: 0, children: [] }))

  const selected = options.find((o) => o.id === selectedOptionId)

  return (
    <div
      className={styles.chipSelector}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!lockedRef.current) setOpen(false) }}
    >
      <div
        className={`${styles.chipTrigger} ${selected ? styles.chipTriggerActive : ''}`}
        style={selected ? {
          background: selected.color + '18',
          color: selected.color,
          borderColor: selected.color + '88',
        } : {}}
        onClick={() => {
          if (lockedRef.current) {
            closeAndUnlock()
          } else {
            lockedRef.current = true
            setOpen(true)
          }
        }}
      >
        {selected ? (
          <>
            {selected.icon && <span>{selected.icon}</span>}
            <span className={styles.chipLabel}>{selected.name}</span>
            <span
              className={styles.chipRemove}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(undefined) }}
            >×</span>
          </>
        ) : (
          <span className={styles.chipPlaceholder}>{dimension.icon ?? '●'} {dimension.name}</span>
        )}
      </div>

      {open && (
        <div className={styles.chipDropdown}>
          {flatOptions.length === 0 ? (
            <div className={styles.chipDropdownEmpty}>暂无{dimension.name}</div>
          ) : (
            flatOptions.map(({ option, depth }) => (
              <div
                key={option.id}
                className={`${styles.chipDropdownItem} ${selectedOptionId === option.id ? styles.chipDropdownItemSelected : ''}`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(selectedOptionId === option.id ? undefined : option.id)
                  closeAndUnlock()
                }}
              >
                <span className={styles.chipDropdownDot} style={{ background: option.color }} />
                {option.icon && <span>{option.icon}</span>}
                <span className={styles.chipDropdownName}>{option.name}</span>
                {selectedOptionId === option.id && <span className={styles.chipDropdownCheck}>✓</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
