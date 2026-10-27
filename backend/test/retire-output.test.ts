import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createTaskFixtures } from './fixtures.js'

test('历史产出完整追加到备注，覆盖空值、换行及已删除任务，重跑不重复', async () => {
  const fixtures = await createTaskFixtures()
  try {
    const cases = [
      [null, '交付方案', '预期产出：交付方案'],
      ['', '多行\n产出', '预期产出：多行\n产出'],
      ['已有备注', '数据', '已有备注\n\n预期产出：数据'],
      ['已有备注\n预期产出：文字', '文字', '已有备注\n预期产出：文字\n\n预期产出：文字'],
      ['原有备注', '', '原有备注'],
      ['原有备注', null, '原有备注'],
      [null, '', null],
      [' 保留空格 ', ' 产出 ', ' 保留空格 \n\n预期产出： 产出 '],
    ] as const
    for (const [i, [notes, output]] of cases.entries()) {
      await fixtures.client.query('INSERT INTO tasks (id,user_id,title,description,expected_output,deleted_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [`migrate-${i}`, i % 2 ? 'other-user' : 'qa-user', '迁移验收', notes, output, i % 2 ? new Date() : null])
    }
    const sql = await readFile(new URL('../src/db/migrations/0013_merge_expected_output_into_notes.sql', import.meta.url), 'utf8')
    const before = await fixtures.client.query('SELECT count(*)::int AS n FROM tasks')
    for (let run = 0; run < 2; run++) {
      await fixtures.client.query('BEGIN')
      await fixtures.client.query(sql)
      await fixtures.client.query('COMMIT')
      for (const [i, [, , expected]] of cases.entries()) {
        const { rows: [row] } = await fixtures.client.query('SELECT description, expected_output FROM tasks WHERE id=$1', [`migrate-${i}`])
        assert.equal(row.description, expected)
        assert.equal(row.expected_output, null)
      }
      assert.equal((await fixtures.client.query('SELECT count(*)::int AS n FROM tasks')).rows[0].n, before.rows[0].n)
    }
  } finally { await fixtures.cleanup() }
})
