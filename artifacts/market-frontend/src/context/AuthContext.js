import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => {
        localStorage.removeItem('mm_token');
        localStorage.removeItem('mm_user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier, password) => {
    try {
      const { data } = await api.post('/auth/login', {
        email_or_username: identifier,
        password,
      });
      localStorage.setItem('mm_token', data.access_token);
      localStorage.setItem('mm_user', JSON.stringify(data.user));
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, message: formatApiError(err) };
    }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch (_) { /* ignore */ }
    localStorage.removeItem('mm_token');
    localStorage.removeItem('mm_user');
    setUser(null);
  };

  const can = (...roles) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return roles.includes(user.role);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    can,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
