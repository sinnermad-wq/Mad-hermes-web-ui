import { useLocation } from 'react-router-dom';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TopBar } from './components/Shell/TopBar';
import { Sidebar } from './components/Shell/Sidebar';
import { BottomNav } from './components/Shell/BottomNav';
import { ChatPage } from './pages/Chat/Chat';
import { DashboardPage } from './pages/Dashboard/Dashboard';
import { SessionsPage } from './pages/Sessions/Sessions';
import { SettingsPage } from './pages/Settings/Settings';
import { NotFoundPage } from './pages/NotFound/NotFound';

const titles: Record<string, string> = {
  '/': 'Chat',
  '/dashboard': 'Dashboard',
  '/sessions': 'Sessions',
  '/settings': 'Settings',
};

function Cream() {
  const loc = useLocation();
  const crumb = titles[loc.pathname] ?? '404';
  return <TopBar crumb={crumb} />;
}

export function App() {
  return (
    <BrowserRouter>
      <div className="app-root">
        <Cream />
        <div className="app-body">
          <Sidebar />
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* Last-resort fallbacks: redirect /index.html → /, anything else → NotFound */}
            <Route path="/index.html" element={<NotFoundPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
