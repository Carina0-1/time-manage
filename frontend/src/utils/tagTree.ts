import type { Tag } from '@time-manage/shared'

export interface TagTreeNode {
  tag: Tag
  segment: string
  fullPath: string
  children: TagTreeNode[]
  depth: number
}

export function buildTagTree(tags: Tag[], presorted = false): TagTreeNode[] {
  const sorted = presorted ? tags : [...tags].sort((a, b) => a.name.localeCompare(b.name))
  // fullPath → 真实 tag 的映射，用于节点绑定正确的 tag
  const tagByName = new Map(tags.map((t) => [t.name, t]))
  const roots: TagTreeNode[] = []
  const pathMap = new Map<string, TagTreeNode>()

  for (const tag of sorted) {
    const parts = tag.name.split('/')
    for (let i = 0; i < parts.length; i++) {
      const fullPath = parts.slice(0, i + 1).join('/')
      if (pathMap.has(fullPath)) continue
      const node: TagTreeNode = {
        // 优先用和 fullPath 完全匹配的真实 tag，否则用当前 tag 占位
        tag: tagByName.get(fullPath) ?? tag,
        segment: parts[i],
        fullPath,
        children: [],
        depth: i,
      }
      pathMap.set(fullPath, node)
      if (i === 0) {
        roots.push(node)
      } else {
        const parentPath = parts.slice(0, i).join('/')
        pathMap.get(parentPath)!.children.push(node)
      }
    }
  }
  return roots
}

export function getDescendantTagIds(node: TagTreeNode): string[] {
  const ids: string[] = []
  // 只收集真实 tag（fullPath 与 tag.name 匹配的节点）
  if (node.tag.name === node.fullPath) {
    ids.push(node.tag.id)
  }
  for (const child of node.children) {
    ids.push(...getDescendantTagIds(child))
  }
  return ids
}

export function getTagDisplayName(tag: Tag): string {
  const parts = tag.name.split('/')
  return parts[parts.length - 1]
}

export function flattenTree(nodes: TagTreeNode[]): TagTreeNode[] {
  const result: TagTreeNode[] = []
  function walk(ns: TagTreeNode[]) {
    for (const node of ns) {
      result.push(node)
      if (node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return result
}

// 判断节点是否为虚拟中间节点（没有对应真实 tag）
export function isVirtualNode(node: TagTreeNode): boolean {
  return node.tag.name !== node.fullPath
}

export function searchTags(tags: Tag[], query: string): Tag[] {
  const q = query.toLowerCase()
  if (!q) return tags
  return tags.filter((t) => t.name.toLowerCase().includes(q))
}
