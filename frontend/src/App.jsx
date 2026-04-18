import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LeaveApplication from './pages/LeaveApplication';
import MyLeaves from './pages/MyLeaves';
import Approvals from './pages/Approvals';
import Employees from './pages/Employees';
import Departments from './pages/Departments';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/apply" element={
        <ProtectedRoute>
          <Layout><LeaveApplication /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/my-leaves" element={
        <ProtectedRoute>
          <Layout><MyLeaves /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/approvals" element={
        <ProtectedRoute roles={['admin', 'hr']}>
          <Layout><Approvals /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/employees" element={
        <ProtectedRoute roles={['admin', 'hr']}>
          <Layout><Employees /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/departments" element={
        <ProtectedRoute roles={['admin']}>
          <Layout><Departments /></Layout>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
