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
  dimensionValues: Record<string, string>  // dimensionId -> optionId
  status: TaskStatus
  priority: Priority
  recurrence?: Recurrence
  expectedOutput?: string
  createdAt: string
  updatedAt: string
}

export type DimensionType = 'single' | 'tree'

export interface Dimension {
  id: string
  userId: string
  name: string
  type: DimensionType
  icon?: string
  isRequired: boolean
  isColorSource: boolean
  showInSidebar: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface DimensionOption {
  id: string
  dimensionId: string
  userId: string
  parentId?: string
  name: string
  color: string          // HEX, e.g. "#6366f1"
  icon?: string          // emoji
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface DailyActivity {
  date: string      // "YYYY-MM-DD"
  taskCount: number
}

export interface DailyMinutes {
  date: string        // "YYYY-MM-DD"
  totalMinutes: number
}

export interface DimensionStats {
  dimensionId: string
  optionId: string
  optionName: string
  color: string
  totalMinutes: number
  taskCount: number
  percentage: number
}

export interface DailyDimensionMinutes {
  date: string        // "YYYY-MM-DD"
  dimensionId: string
  optionName: string  // tree 类型取根节点名称聚合
  color: string
  minutes: number
}

export interface StatsResult {
  totalMinutes: number
  completedCount: number
  totalCount: number
  dailyActivity: DailyActivity[]
  dailyMinutes: DailyMinutes[]
  dimensionStats: Record<string, DimensionStats[]>
  dailyDimensionMinutes: Record<string, DailyDimensionMinutes[]>
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
