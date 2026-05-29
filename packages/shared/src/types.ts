export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Recurrence {
  frequency: RecurrenceFrequency
  interval: number
  daysOfWeek?: number[]  // 0-6，周重复时使用
  endDate?: string       // ISO 8601
  count?: number
}

export interface Task {
  id: string
  userId: string
  title: string
  description?: string
  startTime: string      // ISO 8601
  endTime: string        // ISO 8601
  isAllDay: boolean
  tagIds: string[]
  status: TaskStatus
  priority: Priority
  recurrence?: Recurrence
  color?: string
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  userId: string
  name: string
  color: string          // HEX, e.g. "#6366f1"
  icon?: string          // emoji
  createdAt: string
  updatedAt: string
}

export interface TagStats {
  tagId: string
  tagName: string
  color: string
  totalMinutes: number
  taskCount: number
  percentage: number
}

export interface StatsResult {
  tags: TagStats[]
  totalMinutes: number
  completedCount: number
  totalCount: number
}

// API 通用响应格式
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
  details?: unknown
}
