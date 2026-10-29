import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

// 直接运行前端 store；隔离 API，保证缓存回归测试不会发出网络请求。
const result = await build({
  stdin: {
    contents: `export { useDimensionStore } from './src/stores/dimensionStore';
      export { useTaskStore } from './src/stores/taskStore';`,
    resolveDir: new URL('../../frontend', import.meta.url).pathname,
  },
  tsconfig: new URL('../../frontend/tsconfig.json', import.meta.url).pathname,
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'no-network', setup(builder) {
    builder.onResolve({ filter: /^@\/api\// }, args => ({ path: args.path, namespace: 'mock-api' }))
    builder.onLoad({ filter: /.*/, namespace: 'mock-api' }, () => ({ contents: 'export const tasksApi = {}; export const dimensionsApi = {};' }))
  } }],
})
const bundled = { exports: {} as any }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports)
const { useDimensionStore, useTaskStore } = bundled.exports

test('删除树形选项同步清理日历及详情缓存，保留同维度其他分支和其他维度', () => {
  useTaskStore.getState().reset()
  useDimensionStore.getState().reset()
  useDimensionStore.setState({ dimensions: [{ id: 'method' }], optionsByDimension: { method: [
    { id: 'parent', sortOrder: 0 }, { id: 'child', parentId: 'parent', sortOrder: 0 },
    { id: 'grandchild', parentId: 'child', sortOrder: 0 }, { id: 'other', sortOrder: 1 },
  ] } })
  useTaskStore.setState({ tasks: [
    { id: 'calendar', dimensionValues: { method: 'child', project: 'project-a' } },
    { id: 'other-branch', dimensionValues: { method: 'other' } },
  ], taskCache: {
    calendar: { id: 'calendar', dimensionValues: { method: 'child', project: 'project-a' } },
    detail: { id: 'detail', dimensionValues: { method: 'grandchild', project: 'project-b' } },
  } })
  useDimensionStore.getState().removeOption('method', 'parent')
  const state = useTaskStore.getState()
  assert.deepEqual(state.tasks[0].dimensionValues, { project: 'project-a' })
  assert.deepEqual(state.tasks[1].dimensionValues, { method: 'other' })
  assert.deepEqual(state.taskCache.calendar.dimensionValues, { project: 'project-a' })
  assert.deepEqual(state.taskCache.detail.dimensionValues, { project: 'project-b' })
  assert.deepEqual(useDimensionStore.getState().optionsByDimension.method.map((o: { id: string }) => o.id), ['other'])
})

test('删除整个维度时，即使选项未加载也能清理所有任务引用', () => {
  useTaskStore.getState().reset()
  useDimensionStore.getState().reset()
  useDimensionStore.setState({ dimensions: [{ id: 'method' }, { id: 'project' }], optionsByDimension: {} })
  useTaskStore.setState({ tasks: [{ id: 'calendar', dimensionValues: { method: 'unloaded-option', project: 'a' } }],
    taskCache: { detail: { id: 'detail', dimensionValues: { method: 'another-option' } } } })
  useDimensionStore.getState().removeDimension('method')
  assert.deepEqual(useTaskStore.getState().tasks[0].dimensionValues, { project: 'a' })
  assert.deepEqual(useTaskStore.getState().taskCache.detail.dimensionValues, {})
  assert.deepEqual(useDimensionStore.getState().dimensions.map((d: { id: string }) => d.id), ['project'])
})
