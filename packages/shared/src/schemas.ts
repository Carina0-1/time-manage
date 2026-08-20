import { z } from 'zod'

export const RecurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  endDate: z.string().datetime().optional(),
  count: z.number().int().min(1).optional(),
})

export const CreateTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  isAllDay: z.boolean().default(false),
  dimensionValues: z.record(z.string(), z.string()).default({}),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  recurrence: RecurrenceSchema.optional(),
  expectedOutput: z.string().optional(),
})

export const UpdateTaskSchema = CreateTaskSchema.partial().omit({ id: true })

export const CreateDimensionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  type: z.enum(['single', 'tree']),
  icon: z.string().optional(),
  isRequired: z.boolean().default(false),
  showInSidebar: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export const UpdateDimensionSchema = CreateDimensionSchema.partial().omit({ id: true, type: true })

export const CreateDimensionOptionSchema = z.object({
  id: z.string(),
  dimensionId: z.string(),
  parentId: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  sortOrder: z.number().int().default(0),
})

export const UpdateDimensionOptionSchema = CreateDimensionOptionSchema.partial().omit({ id: true, dimensionId: true })

export const StatsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type CreateDimensionInput = z.infer<typeof CreateDimensionSchema>
export type UpdateDimensionInput = z.infer<typeof UpdateDimensionSchema>
export type CreateDimensionOptionInput = z.infer<typeof CreateDimensionOptionSchema>
export type UpdateDimensionOptionInput = z.infer<typeof UpdateDimensionOptionSchema>
export type StatsQuery = z.infer<typeof StatsQuerySchema>

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export type LoginInput = z.infer<typeof LoginSchema>
