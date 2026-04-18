import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const doLogout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Inactivity auto-logout
  useEffect(() => {
    if (!user) return;

    const reset = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        doLogout();
        window.location.href = '/login?reason=inactivity';
      }, INACTIVITY_MS);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [user, doLogout]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = doLogout;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refetchUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
