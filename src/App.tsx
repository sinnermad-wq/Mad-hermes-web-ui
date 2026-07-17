import { useLocation } from 'react-router-dom';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { TopBar } from './components/Shell/TopBar';
import { Sidebar } from './components/Shell/Sidebar';
import { BottomNav } from './components/Shell/BottomNav';
import { ChatPage } from './pages/Chat/Chat';
import { DashboardPage } from './pages/Dashboard/Dashboard';
import { DashboardEmbed } from './pages/Dashboard/DashboardEmbed';
import { SessionsPage } from './pages/Sessions/Sessions';
import { SettingsPage } from './pages/Settings/Settings';
import { NotFoundPage } from './pages/NotFound/NotFound';
import { LoginPage } from './pages/Auth/Login';
import { RegisterPage } from './pages/Auth/Register';

const titles: Record<string, string> = {
  '/': 'Chat',
  '/dashboard': 'XAUUSD Dashboard',
  '/hermes-dashboard': 'Hermes Dashboard',
  '/sessions': 'Sessions',
  '/settings': 'Settings',
  '/login': 'Login',
  '/register': 'Register',
};

function Cream() {
  const loc = useLocation();
  const crumb = titles[loc.pathname] ?? '404';
  return <TopBar crumb={crumb} />;
}

// Redirect to /dashboard if authenticated, otherwise to /login
function AuthRedirect() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-root">
      <Cream />
      <div className="app-body">
        <Sidebar />
        {children}
      </div>
      <BottomNav />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth-redirect" element={<AuthRedirect />} />

      {/* Protected routes — require authentication */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell><ChatPage /></AppShell>
          </ProtectedRoute>
        }
      />
      {/* XAUUSD Dashboard — Streamlit embed (primary) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell><DashboardEmbed /></AppShell>
          </ProtectedRoute>
        }
      />
      {/* Hermes Dashboard — existing Hermes data tabs */}
      <Route
        path="/hermes-dashboard"
        element={
          <ProtectedRoute>
            <AppShell><DashboardPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions"
        element={
          <ProtectedRoute>
            <AppShell><SessionsPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppShell><SettingsPage /></AppShell>
          </ProtectedRoute>
        }
      />
      {/* Fallbacks */}
      <Route path="/index.html" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}