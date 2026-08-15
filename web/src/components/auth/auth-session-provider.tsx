"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  BrowserAuthError,
  getCurrentAccount,
  logoutAccount,
} from "@/lib/auth/browser-client";
import type { PublicUser } from "@/lib/auth/public-user";

export type AuthSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export type AuthSessionContextValue = {
  status: AuthSessionStatus;
  user: PublicUser | null;
  setAuthenticatedUser: (user: PublicUser) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthSessionStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const currentUser = await getCurrentAccount();
      setUser(currentUser);
      setStatus(currentUser ? "authenticated" : "unauthenticated");
    } catch {
      setUser(null);
      setStatus("unavailable");
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setStatus("loading");
    await loadSession();
  }, [loadSession]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSession();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSession]);

  const setAuthenticatedUser = useCallback((nextUser: PublicUser) => {
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutAccount();
      setUser(null);
      setStatus("unauthenticated");
    } catch (error) {
      if (error instanceof BrowserAuthError && error.code !== "NETWORK_ERROR") {
        try {
          const currentUser = await getCurrentAccount();
          setUser(currentUser);
          setStatus(currentUser ? "authenticated" : "unauthenticated");
        } catch {
          setUser(null);
          setStatus("unavailable");
        }
      }

      throw error;
    }
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({ status, user, setAuthenticatedUser, refreshSession, logout }),
    [logout, refreshSession, setAuthenticatedUser, status, user],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext);

  if (!session) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }

  return session;
}
