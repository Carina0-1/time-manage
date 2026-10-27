import { Client } from 'pg'
import { hashPassword } from '../src/lib/password.js'

// 仅允许本地数据库；在独立 schema 中建表和写入验收数据，不触碰开发数据。
export async function createTaskFixtures() {
  const original = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(original.hostname)) throw new Error('任务测试仅允许使用本地数据库')
  const client = new Client({ connectionString: original.toString() })
  await client.connect()
  const schema = `task_list_test_${process.pid}_${Date.now()}`
  await client.query(`CREATE SCHEMA "${schema}"`)
  for (const table of ['users', 'dimensions', 'dimension_options', 'tasks', 'task_dimension_values']) {
    await client.query(`CREATE TABLE "${schema}".${table} (LIKE public.${table} INCLUDING ALL)`)
  }
  await client.query(`SET search_path TO "${schema}", public`)
  await client.query("ALTER TABLE tasks ADD CONSTRAINT qa_save_failure CHECK (title <> '模拟保存失败')")
  await client.query('INSERT INTO users (id,username,password_hash) VALUES ($1,$2,$3),($4,$5,$6)', ['qa-user', 'task-list-qa', hashPassword('TaskListQA123!'), 'other-user', 'other-qa', hashPassword('OtherQA123!')])
  await client.query(`INSERT INTO dimensions (id,user_id,name,type,is_required,show_in_sidebar,sort_order) VALUES
    ('project','qa-user','项目','single',true,true,0),('tag','qa-user','标签','tree',false,true,1),('context','qa-user','场景','single',false,false,2),('foreign','other-user','其他账号维度','single',false,true,0)`)
  await client.query(`INSERT INTO dimension_options (id,dimension_id,user_id,parent_id,name,color,sort_order) VALUES
    ('project-a','project','qa-user',null,'TiGo','#44b97c',0),('project-b','project','qa-user',null,'其他项目','#7196c4',1),
    ('work','tag','qa-user',null,'工作','#7196c4',0),('product','tag','qa-user','work','产品','#7196c4',1),('research','tag','qa-user','product','调研','#7196c4',2),('personal','tag','qa-user',null,'生活','#c98a6a',3),('personal-product','tag','qa-user','personal','产品','#c98a6a',4),
    ('home','context','qa-user',null,'在家','#9b8bc6',0),('office','context','qa-user',null,'办公室','#9b8bc6',1),('foreign-option','foreign','other-user',null,'其他账号选项','#44b97c',0)`)
  for (let i = 1; i <= 65; i++) {
    const id = `task-${String(i).padStart(3, '0')}`
    await client.query('INSERT INTO tasks (id,user_id,title,created_at) VALUES ($1,$2,$3,$4)', [id, 'qa-user', `整理任务 ${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i))])
    await client.query('INSERT INTO task_dimension_values (id,task_id,dimension_id,option_id) VALUES ($1,$2,$3,$4)', [`rel-${id}`, id, 'project', 'project-a'])
  }
  const special = [
    ['ui-task', '任务列表验收', 'todo', null, null, '可以双击名称进行行内编辑', '产出验收记录'],
    ['scheduled', '排期任务', 'in_progress', '2026-10-27T08:00:00Z', '2026-10-27T09:00:00Z', '复盘', '完成方案'],
    ['boundary', '日期边界任务', 'done', '2026-10-26T15:00:00Z', '2026-10-26T16:00:00Z', null, null],
    ['all-day', '全天任务', 'todo', '2026-10-26T16:00:00Z', '2026-10-27T16:00:00Z', null, null],
    ['cancelled', '已取消任务', 'cancelled', null, null, null, null],
    ['legacy', '历史缺少必填维度', 'todo', null, null, null, null],
    ['literal', '完成 100%_\\ 验收', 'todo', null, null, 'Mixed CASE notes', '跨页查找唯一产出'],
  ] as const
  for (const [id, title, status, start, end, description, output] of special) {
    await client.query('INSERT INTO tasks (id,user_id,title,status,start_time,end_time,description,expected_output,is_all_day,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, 'qa-user', title, status, start, end, description, output, id === 'all-day', new Date(id === 'ui-task' ? '2026-10-27T12:00:00Z' : '2026-10-27T00:00:00Z')])
    if (id !== 'legacy') await client.query('INSERT INTO task_dimension_values (id,task_id,dimension_id,option_id) VALUES ($1,$2,$3,$4)', [`rel-${id}`, id, 'project', 'project-a'])
  }
  await client.query(`INSERT INTO task_dimension_values (id,task_id,dimension_id,option_id) VALUES ('tag-ui','ui-task','tag','product'),('context-ui','ui-task','context','home'),('tag-scheduled','scheduled','tag','research'),('tag-boundary','boundary','tag','personal-product')`)
  await client.query(`INSERT INTO tasks (id,user_id,title,deleted_at) VALUES ('foreign-task','other-user','别人的任务',null),('deleted-task','qa-user','已删除任务',now())`)
  original.searchParams.set('options', `-c search_path=${schema},public`)
  return {
    url: original.toString(),
    client,
    async cleanup() {
      await client.query('SET search_path TO public')
      await client.query(`DROP SCHEMA "${schema}" CASCADE`)
      await client.end()
    },
  }
}
