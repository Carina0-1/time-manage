import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import LoginPage from '@/components/LoginPage'
import CalendarPage from '@/components/calendar/CalendarPage'
import StatsPage from '@/components/stats/StatsPage'
import InboxPage from '@/components/inbox/InboxPage'
import GoalDetailPage from '@/components/goal/GoalDetailPage'
import { useAuthStore } from '@/stores/authStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, initialized } = useAuthStore()
  if (!initialized) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const initFromStorage = useAuthStore(s => s.initFromStorage)

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
        <Route path="inbox/:goalId" element={<InboxPage />} />
        <Route path="goals/:id" element={<GoalDetailPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>
    </Routes>
  )
}
