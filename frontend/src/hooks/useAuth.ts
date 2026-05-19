import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ApiUser } from '../lib/api';

const JWT_KEY = 'neuroterm_jwt';

export interface AuthState {
  user: ApiUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser]       = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate              = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) {
      // No JWT stored — not authenticated, send to login
      setLoading(false);
      return;
    }
    api.auth.me()
      .then(setUser)
      .catch(() => {
        // Token expired or invalid — wipe it
        localStorage.removeItem(JWT_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await api.auth.login(username, password);
    localStorage.setItem(JWT_KEY, token);
    setUser(u);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await api.auth.register(username, password);
    localStorage.setItem(JWT_KEY, token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(JWT_KEY);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  return { user, loading, login, register, logout };
}
