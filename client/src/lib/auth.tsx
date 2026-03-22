import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiRequest, setAuthToken } from "./queryClient";
import { queryClient } from "./queryClient";

const TOKEN_KEY = "splittrip_token";

type User = {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  avatarColor: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setAuthToken(storedToken);
    }
    apiRequest("GET", "/api/auth/me")
      .then(res => res.json())
      .then(u => setUser(u))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { username, password });
    const u = await res.json();
    const { token, ...userData } = u;
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(userData);
    queryClient.clear();
  }, []);

  const register = useCallback(async (username: string, password: string, displayName: string, email: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { username, password, displayName, email });
    const u = await res.json();
    const { token, ...userData } = u;
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(userData);
    queryClient.clear();
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    queryClient.clear();
  }, []);

  const forgotPassword = useCallback(async (email: string): Promise<string> => {
    const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
    const data = await res.json();
    return data.message;
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<void> => {
    const res = await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Failed to reset password");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
