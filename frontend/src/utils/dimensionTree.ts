import type { DimensionOption } from '@time-manage/shared'

export interface OptionTreeNode {
  option: DimensionOption
  children: OptionTreeNode[]
  depth: number
}

export function buildOptionTree(options: DimensionOption[]): OptionTreeNode[] {
  const sorted = [...options].sort((a, b) => a.sortOrder - b.sortOrder)
  const childrenMap = new Map<string | null, DimensionOption[]>()
  for (const o of sorted) {
    const key = o.parentId ?? null
    const list = childrenMap.get(key) ?? []
    list.push(o)
    childrenMap.set(key, list)
  }
  function build(parentId: string | null, depth: number): OptionTreeNode[] {
    return (childrenMap.get(parentId) ?? []).map((o) => ({
      option: o,
      depth,
      children: build(o.id, depth + 1),
    }))
  }
  return build(null, 0)
}

export function getDescendantIds(node: OptionTreeNode): string[] {
  const ids = [node.option.id]
  for (const child of node.children) ids.push(...getDescendantIds(child))
  return ids
}

export function flattenOptionTree(nodes: OptionTreeNode[]): OptionTreeNode[] {
  const result: OptionTreeNode[] = []
  function walk(ns: OptionTreeNode[]) {
    for (const n of ns) {
      result.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(nodes)
  return result
}

export function searchOptions(options: DimensionOption[], query: string): DimensionOption[] {
  const q = query.toLowerCase()
  if (!q) return options
  return options.filter((o) => o.name.toLowerCase().includes(q))
}
