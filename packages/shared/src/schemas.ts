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
  tagIds: z.array(z.string()).default([]),
  goalId: z.string().optional(),
  phaseId: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  recurrence: RecurrenceSchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  expectedOutput: z.string().optional(),
})

export const UpdateTaskSchema = CreateTaskSchema.partial().omit({ id: true })

export const CreateGoalSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  sortOrder: z.number().int().default(0),
  status: z.enum(['active', 'done', 'archived']).default('active'),
  background: z.string().optional(),
  successCriteria: z.string().optional(),
})

export const UpdateGoalSchema = CreateGoalSchema.partial().omit({ id: true })

export const CreatePhaseSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  name: z.string().min(1).max(100),
  isDone: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  reason: z.string().optional(),
  currentState: z.string().optional(),
  completionCriteria: z.string().optional(),
})

export const UpdatePhaseSchema = CreatePhaseSchema.partial().omit({ id: true, goalId: true })

export const CreateTagSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().optional(),
  sortOrder: z.number().int().default(0),
})

export const UpdateTagSchema = CreateTagSchema.partial().omit({ id: true })

export const StatsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
})

export const SyncUploadSchema = z.object({
  tasks: z.array(CreateTaskSchema.extend({
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().optional(),
  })),
  tags: z.array(CreateTagSchema.extend({
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().optional(),
  })),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
export type CreatePhaseInput = z.infer<typeof CreatePhaseSchema>
export type UpdatePhaseInput = z.infer<typeof UpdatePhaseSchema>
export type CreateTagInput = z.infer<typeof CreateTagSchema>
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>
export type StatsQuery = z.infer<typeof StatsQuerySchema>
export type SyncUpload = z.infer<typeof SyncUploadSchema>

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export type LoginInput = z.infer<typeof LoginSchema>
