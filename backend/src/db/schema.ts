import { pgTable, text, boolean, timestamp, jsonb, integer, foreignKey, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email'),
  name: text('name'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const dimensions = pgTable('dimensions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'single' | 'tree'
  icon: text('icon'),
  isRequired: boolean('is_required').default(false).notNull(),
  isColorSource: boolean('is_color_source').default(false).notNull(),
  showInSidebar: boolean('show_in_sidebar').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const dimensionOptions = pgTable('dimension_options', {
  id: text('id').primaryKey(),
  dimensionId: text('dimension_id').references(() => dimensions.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: 'dimension_options_parent_id_fk' })
    .onDelete('cascade'),
])

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
  expectedOutput: text('expected_output'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const taskDimensionValues = pgTable('task_dimension_values', {
  id: text('id').primaryKey(),
  taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  dimensionId: text('dimension_id').references(() => dimensions.id, { onDelete: 'cascade' }).notNull(),
  optionId: text('option_id').references(() => dimensionOptions.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [
  uniqueIndex('task_dimension_values_task_dimension_uq').on(t.taskId, t.dimensionId),
])
