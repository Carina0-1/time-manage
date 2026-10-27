export interface SaveJob<T> { key: string; value: T }
interface QueueOptions<T> {
  equal?: (left: T, right: T) => boolean
  merge?: (left: T, right: T) => T | null
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

// 每个任务串行写入，区分已确认、正在发送和待发送的值，避免失焦/关闭重复保存。
export class TaskSaveQueue<T, R> {
  private pending = new Map<string, T>()
  private acknowledged = new Map<string, T>()
  private active: SaveJob<T>[] = []
  private running: Promise<boolean> | null = null
  private scheduled = false
  error = ''
  saving = false
  private save: (job: SaveJob<T>) => Promise<R>
  private saved: (result: R, job: SaveJob<T>) => void
  private changed: () => void
  private failed?: (job: SaveJob<T>) => void
  private options: QueueOptions<T>

  constructor(save: (job: SaveJob<T>) => Promise<R>, saved: (result: R, job: SaveJob<T>) => void, changed: () => void, failed?: (job: SaveJob<T>) => void, options: QueueOptions<T> = {}) {
    this.save = save; this.saved = saved; this.changed = changed; this.failed = failed; this.options = options
  }
  get hasPending() { return this.pending.size > 0 || this.saving }
  hasKey(key: string) { return this.pending.has(key) || this.active.some(job => job.key === key) }
  hasQueuedKey(key: string) { return this.pending.has(key) }
  private equal(left: T, right: T) { return this.options.equal ? this.options.equal(left, right) : stable(left) === stable(right) }

  enqueue(key: string, value: T) {
    const inFlight = this.active.find(job => job.key === key)
    const previous = inFlight?.value ?? this.acknowledged.get(key)
    if (!(this.error && this.pending.has(key)) && (inFlight || this.acknowledged.has(key)) && this.equal(previous!, value)) this.pending.delete(key)
    else this.pending.set(key, value)
    this.changed()
    // 同一事件产生的多个字段先合并；不额外增加输入等待时间。
    if (!this.scheduled) {
      this.scheduled = true
      queueMicrotask(() => { this.scheduled = false; void this.flush() })
    }
  }

  flush(): Promise<boolean> {
    if (this.running) return this.running.then(ok => ok && this.pending.size ? this.flush() : ok)
    if (!this.pending.size) return Promise.resolve(!this.error)
    this.running = this.drain().finally(() => { this.running = null; this.changed() })
    return this.running
  }

  private async drain() {
    this.error = ''
    while (this.pending.size) {
      const entries = Array.from(this.pending, ([key, value]) => ({ key, value }))
      const first = entries[0]
      this.active = [first]
      let value = first.value
      for (const next of entries.slice(1)) {
        const merged = this.options.merge?.(value, next.value)
        if (merged === undefined || merged === null) break
        value = merged; this.active.push(next)
      }
      for (const job of this.active) this.pending.delete(job.key)
      const combined = { key: first.key, value }
      this.saving = true; this.changed()
      try {
        const result = await this.save(combined)
        for (const job of this.active) this.acknowledged.set(job.key, job.value)
        this.saved(result, combined)
      } catch (e) {
        const retry = this.active.filter(job => !this.pending.has(job.key)).map(job => [job.key, job.value] as const)
        this.pending = new Map([...retry, ...this.pending])
        this.error = e instanceof Error ? e.message : '保存失败，请重试'
        this.failed?.(combined)
        return false
      } finally { this.saving = false; this.active = []; this.changed() }
    }
    return true
  }
  resetAcknowledged() { this.acknowledged.clear() }
  discard() { this.pending.clear(); this.error = ''; this.changed() }
}
