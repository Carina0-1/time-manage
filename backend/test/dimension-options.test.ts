import assert from 'node:assert/strict'
import test from 'node:test'
import type { DimensionOption } from '@time-manage/shared'
import { getOrderedOptionNodes } from '../../frontend/src/utils/dimensionTree.js'

// 各层的 sortOrder 可重复，低排序子项也必须留在自己的父节点下面。
const options = [
  { id: 'home-product', name: '产品', parentId: 'home', sortOrder: 0 },
  { id: 'home', name: '生活', sortOrder: 2 },
  { id: 'research', name: '调研', parentId: 'work-product', sortOrder: -1 },
  { id: 'work-other', name: '其他', parentId: 'work', sortOrder: 4 },
  { id: 'work', name: '工作', sortOrder: 1 },
  { id: 'work-product', name: '产品', parentId: 'work', sortOrder: 0 },
] as DimensionOption[]

test('下拉树按同级排序展示，子孙连续跟随父节点且保持正确缩进', () => {
  assert.deepEqual(getOrderedOptionNodes(options, 'tree').map(({ option, depth }) => [option.id, depth]), [
    ['work', 0], ['work-product', 1], ['research', 2], ['work-other', 1], ['home', 0], ['home-product', 1],
  ])
  const reordered = options.map(option => option.id === 'home' ? { ...option, sortOrder: 0 } : option)
  assert.deepEqual(getOrderedOptionNodes(reordered, 'tree').map(({ option }) => option.id), [
    'home', 'home-product', 'work', 'work-product', 'research', 'work-other',
  ])
})

test('单选维度按 sortOrder 展示，排序不修改缓存数组', () => {
  const before = structuredClone(options)
  const nodes = getOrderedOptionNodes(options, 'single')
  assert.deepEqual(nodes.map(({ option }) => option.sortOrder), [-1, 0, 0, 1, 2, 4])
  assert(nodes.every(node => node.depth === 0))
  assert.deepEqual(options, before)
})
