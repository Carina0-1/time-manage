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
  startTime?: string     // ISO 8601，Inbox 任务为空
  endTime?: string       // ISO 8601，Inbox 任务为空
  isAllDay: boolean
  tagIds: string[]
  goalId?: string
  phaseId?: string
  status: TaskStatus
  priority: Priority
  recurrence?: Recurrence
  color?: string
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  userId: string
  name: string
  color: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Phase {
  id: string
  goalId: string
  userId: string
  name: string
  isDone: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  userId: string
  name: string
  color: string          // HEX, e.g. "#6366f1"
  icon?: string          // emoji
  sortOrder: number
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

export interface DailyActivity {
  date: string      // "YYYY-MM-DD"
  taskCount: number
}

export interface DailyMinutes {
  date: string        // "YYYY-MM-DD"
  totalMinutes: number
}

export interface DailyTagMinutes {
  date: string        // "YYYY-MM-DD"
  tagName: string     // 一级标签名
  color: string
  minutes: number
}

export interface DailyGoalMinutes {
  date: string        // "YYYY-MM-DD"
  goalId: string
  goalName: string
  color: string
  minutes: number
}

export interface StatsResult {
  tags: TagStats[]
  totalMinutes: number
  completedCount: number
  totalCount: number
  dailyActivity: DailyActivity[]
  dailyMinutes: DailyMinutes[]
  dailyTagMinutes: DailyTagMinutes[]
  dailyGoalMinutes: DailyGoalMinutes[]
}

export interface AuthUser {
  id: string
  username: string
  name: string | null
}

export interface LoginResponse {
  token: string
  user: AuthUser
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
