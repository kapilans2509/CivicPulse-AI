import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import ReportPage from './pages/ReportPage'
import MyReportsPage from './pages/MyReportsPage'
import MyTasksPage from './pages/MyTasksPage'
import DashboardPage from './pages/DashboardPage'
import MapPage from './pages/MapPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      {/* ── Public auth routes (no layout chrome) ── */}
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* ── All other routes share the Layout (Navbar + Footer) ── */}
      <Route path="/" element={<Layout />}>
        {/* Public */}
        <Route index element={<HomePage />} />

        {/* Any authenticated user */}
        <Route path="report" element={
          <ProtectedRoute>
            <ReportPage />
          </ProtectedRoute>
        } />

        {/* Citizen: own reports via GET /api/issues/mine */}
        <Route path="my-reports" element={
          <ProtectedRoute roles={['citizen']}>
            <MyReportsPage />
          </ProtectedRoute>
        } />

        {/* Worker: assigned tasks only */}
        <Route path="my-tasks" element={
          <ProtectedRoute roles={['worker']}>
            <MyTasksPage />
          </ProtectedRoute>
        } />

        {/* Officer + Admin: full dashboard, map, stats */}
        <Route path="dashboard" element={
          <ProtectedRoute roles={['officer', 'admin']}>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="map" element={
          <ProtectedRoute roles={['officer', 'admin', 'worker']}>
            <MapPage />
          </ProtectedRoute>
        } />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
