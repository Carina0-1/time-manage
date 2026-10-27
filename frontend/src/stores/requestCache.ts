// 合并相同读取，并在短时间内复用已加载状态。reset 后旧账号的请求不能再写入状态。
export class RequestCache {
  private pending = new Map<string, Promise<void>>()
  private loadedAt = new Map<string, number>()
  private generation = 0
  run(key: string, load: (isCurrent: () => boolean) => Promise<void>, force = false) {
    const pending = this.pending.get(key)
    if (pending) return pending
    if (!force && Date.now() - (this.loadedAt.get(key) ?? 0) < 30000) return Promise.resolve()
    const generation = this.generation
    const isCurrent = () => generation === this.generation
    const job = load(isCurrent).then(() => { if (isCurrent()) this.loadedAt.set(key, Date.now()) }).finally(() => { if (this.pending.get(key) === job) this.pending.delete(key) })
    this.pending.set(key, job)
    return job
  }
  reset() { this.generation++; this.pending.clear(); this.loadedAt.clear() }
}
