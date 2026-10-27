import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import LoginPage from '@/components/LoginPage'
import CalendarPage from '@/components/calendar/CalendarPage'
import StatsPage from '@/components/stats/StatsPage'
import SettingsPage from '@/components/settings/SettingsPage'
import TaskListPage from '@/components/tasks/TaskListPage'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/hooks/useTheme'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, initialized } = useAuthStore()
  if (!initialized) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const initFromStorage = useAuthStore(s => s.initFromStorage)
  const theme = useTheme(s => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('time-manage-theme', theme)
  }, [theme])

  useEffect(() => {
    initFromStorage()
  }, [initFromStorage])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/calendar" replace />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<TaskListPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
