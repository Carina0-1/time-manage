import { pgTable, text, boolean, timestamp, jsonb, primaryKey, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email'),
  name: text('name'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const goals = pgTable('goals', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  status: text('status').default('active').notNull(),
  background: text('background'),
  successCriteria: text('success_criteria'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const phases = pgTable('phases', {
  id: text('id').primaryKey(),
  goalId: text('goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  isDone: boolean('is_done').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  reason: text('reason'),
  currentState: text('current_state'),
  completionCriteria: text('completion_criteria'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  isAllDay: boolean('is_all_day').default(false).notNull(),
  status: text('status').default('todo').notNull(),
  priority: text('priority').default('medium').notNull(),
  recurrence: jsonb('recurrence'),
  color: text('color'),
  goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
  phaseId: text('phase_id').references(() => phases.id, { onDelete: 'set null' }),
  roleId: text('role_id').references(() => roles.id, { onDelete: 'set null' }),
  expectedOutput: text('expected_output'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const taskTags = pgTable('task_tags', {
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  tagId: text('tag_id').references(() => tags.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [primaryKey({ columns: [t.taskId, t.tagId] })])

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  goalTermLabel: text('goal_term_label').default('目标').notNull(),
  tagTermLabel: text('tag_term_label').default('标签').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
