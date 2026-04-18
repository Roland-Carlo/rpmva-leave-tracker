import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: sessionStorage.getItem('login_email') || '', password: '' });
  const [error, setError] = useState(() => sessionStorage.getItem('login_error') || '');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      sessionStorage.removeItem('login_error');
      sessionStorage.removeItem('login_email');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please try again.';
      sessionStorage.setItem('login_error', msg);
      sessionStorage.setItem('login_email', form.email);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-asphalt flex items-center justify-center p-4">
      {/* Yellow accent bar at top */}
      <div className="fixed top-0 inset-x-0 h-1 bg-brand-yellow" />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-yellow rounded-2xl shadow-lg mb-4">
            <span className="text-brand-black font-bold text-xl">LT</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-white">Leave Tracker</h1>
          <p className="text-brand-slate mt-1 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-brand-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-5 px-4 py-4 bg-red-600 rounded-xl text-white text-sm font-semibold flex items-center gap-3 shadow-lg animate-shake">
              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-brand-slate/20">
            <p className="text-xs text-brand-slate font-semibold mb-3 uppercase tracking-wide">Demo Credentials</p>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="font-bold text-brand-black">Admin</span>
                <span className="text-gray-500">admin@company.com / admin123</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="font-bold text-brand-black">HR</span>
                <span className="text-gray-500">hr@company.com / hr1234</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="font-bold text-brand-black">Employee</span>
                <span className="text-gray-500">pat.silva@company.com / password123</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
