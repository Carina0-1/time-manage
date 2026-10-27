export interface SaveJob<T> {
  key: string
  value: T
}

// 每个任务串行写入。同一字段尚未发送的修改合并为最新值，失败时保留供重试。
export class TaskSaveQueue<T, R> {
  private pending = new Map<string, T>()
  private running: Promise<boolean> | null = null
  private runningKey: string | null = null
  error = ''
  saving = false
  private save: (job: SaveJob<T>) => Promise<R>
  private saved: (result: R, job: SaveJob<T>) => void
  private changed: () => void
  private failed?: (job: SaveJob<T>) => void

  constructor(
    save: (job: SaveJob<T>) => Promise<R>,
    saved: (result: R, job: SaveJob<T>) => void,
    changed: () => void,
    failed?: (job: SaveJob<T>) => void,
  ) { this.save = save; this.saved = saved; this.changed = changed; this.failed = failed }

  get hasPending() { return this.pending.size > 0 || this.saving }
  hasKey(key: string) { return this.pending.has(key) || this.runningKey === key }
  hasQueuedKey(key: string) { return this.pending.has(key) }

  enqueue(key: string, value: T) {
    this.pending.set(key, value)
    this.error = ''
    void this.flush()
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
      const [key, value] = this.pending.entries().next().value!
      this.pending.delete(key)
      this.runningKey = key
      this.saving = true
      this.changed()
      try { this.saved(await this.save({ key, value }), { key, value }) }
      catch (e) {
        // 新输入已替换失败请求时，重试必须使用新值。
        if (!this.pending.has(key)) this.pending = new Map([[key, value], ...this.pending])
        this.error = e instanceof Error ? e.message : '保存失败，请重试'
        this.failed?.({ key, value })
        return false
      } finally { this.saving = false; this.runningKey = null; this.changed() }
    }
    return true
  }

  discard() { this.pending.clear(); this.error = ''; this.changed() }
}
