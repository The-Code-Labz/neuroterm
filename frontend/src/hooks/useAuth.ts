import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    const token = localStorage.getItem(JWT_KEY);
    if (!token && !import.meta.env.VITE_AUTH_TOKEN) {
      setLoading(false);
      return;
    }
    api.auth.me()
      .then(setUser)
      .catch(() => {
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
  }, []);

  return { user, loading, login, register, logout };
}
