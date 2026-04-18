import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const navItems = [
  { path: '/dashboard',   label: 'Dashboard',   icon: HomeIcon,     roles: ['admin','supervisor','employee'] },
  { path: '/apply',       label: 'Apply Leave',  icon: PlusIcon,     roles: ['employee'] },
  { path: '/my-leaves',   label: 'My Leaves',    icon: CalendarIcon, roles: ['employee'] },
  { path: '/approvals',   label: 'Approvals',    icon: CheckIcon,    roles: ['admin','supervisor'] },
  { path: '/employees',   label: 'Employees',    icon: UsersIcon,    roles: ['admin','supervisor'] },
  { path: '/departments', label: 'Departments',  icon: BuildingIcon, roles: ['admin'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'supervisor') {
      api.get('/leaves/pending-count').then(r => setPendingCount(r.data.count)).catch(() => {});
    }
  }, [user, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filtered = navItems.filter(n => n.roles.includes(user?.role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-yellow rounded-lg flex items-center justify-center shrink-0">
            <span className="text-brand-black font-bold text-sm leading-none">LT</span>
          </div>
          <div>
            <p className="text-brand-white font-bold text-sm tracking-wide">Leave Tracker</p>
            <p className="text-brand-slate text-xs capitalize">{user?.role}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {filtered.map(item => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-yellow text-brand-black'
                  : 'text-brand-slate hover:bg-white/10 hover:text-brand-white'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.path === '/approvals' && pendingCount > 0 && (
                <span className="bg-brand-yellow text-brand-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 py-2 mb-1">
          <p className="text-brand-white text-sm font-semibold truncate">{user?.name}</p>
          <p className="text-brand-slate text-xs truncate">{user?.email}</p>
          {user?.department && <p className="text-brand-slate/70 text-xs truncate mt-0.5">{user.department}</p>}
        </div>
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-brand-slate hover:bg-white/10 hover:text-brand-white transition-colors"
        >
          <LogoutIcon className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-brand-asphalt transform transition-transform duration-300 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <aside className="hidden lg:flex lg:flex-col w-64 bg-brand-asphalt shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-brand-white border-b border-brand-slate/30 px-4 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <MenuIcon className="w-5 h-5 text-brand-black" />
          </button>
          <h1 className="text-base font-bold text-brand-black flex-1 truncate">
            {filtered.find(n => n.path === location.pathname)?.label || 'Leave Tracker'}
          </h1>
          <span className="hidden sm:inline text-xs font-semibold text-brand-asphalt bg-brand-glow px-2.5 py-1 rounded-full capitalize">
            {user?.role}
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>

      {confirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-11 h-11 rounded-full bg-brand-glow flex items-center justify-center shrink-0">
                <LogoutIcon className="w-5 h-5 text-brand-asphalt" />
              </div>
              <div>
                <p className="font-bold text-brand-black text-base">Log out?</p>
                <p className="text-sm text-brand-slate mt-0.5">You'll need to log in again to access your account.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmLogout(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleLogout} className="btn-primary flex-1">Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
}
function PlusIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
}
function CalendarIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}
function BuildingIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
}
function LogoutIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
}
function MenuIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
