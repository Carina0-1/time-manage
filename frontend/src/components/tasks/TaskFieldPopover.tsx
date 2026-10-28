import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './TaskQuickFields.module.css'

export default function TaskFieldPopover({ anchor, label, onClose, children }: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 12, top: 12 })
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) { close.current(); return }
      const rect = anchor.getBoundingClientRect(), box = panel.current!.getBoundingClientRect()
      const below = rect.bottom + 6
      const top = below + box.height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - box.height - 6)
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12)), top })
    }
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close.current()
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel.current!)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', outside, true)
    const focus = panel.current?.querySelector<HTMLElement>('[aria-selected=true], [aria-pressed=true]') ?? panel.current?.querySelector<HTMLElement>('textarea, input, button')
    focus?.focus({ preventScroll: true })
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('pointerdown', outside, true) }
  }, [anchor])
  return createPortal(<div ref={panel} className={styles.popover} style={position} role="dialog" aria-label={label} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close.current(); anchor.focus() }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      const buttons = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
  }}>{children}</div>, document.body)
}
