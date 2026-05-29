import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import CalendarPage from '@/components/calendar/CalendarPage'
import StatsPage from '@/components/stats/StatsPage'
import TagsPage from '@/components/tags/TagsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/calendar" replace />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="tags" element={<TagsPage />} />
      </Route>
    </Routes>
  )
}
