"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  getNotifications,
  markNotificationRead,
  NotificationBrowserError,
  type NotificationPage,
  type PublicNotification,
} from "@/lib/notifications/browser-client";

export type NotificationContextValue = {
  status: "idle" | "loading" | "ready" | "error" | "forbidden";
  notifications: PublicNotification[];
  unreadCount: number;
  hasMore: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  refreshFailed: boolean;
  loadMoreFailed: boolean;
  markingIds: ReadonlySet<string>;
  failedMarkIds: ReadonlySet<string>;
  authenticationExpired: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
};

type NotificationState = Omit<
  NotificationContextValue,
  "refresh" | "loadMore" | "markRead"
> & {
  ownerId: string | null;
  nextCursor: string | null;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function emptyState(ownerId: string | null = null): NotificationState {
  return {
    ownerId,
    nextCursor: null,
    status: "idle",
    notifications: [],
    unreadCount: 0,
    hasMore: false,
    isRefreshing: false,
    isLoadingMore: false,
    refreshFailed: false,
    loadMoreFailed: false,
    markingIds: new Set(),
    failedMarkIds: new Set(),
    authenticationExpired: false,
  };
}

function pageState(ownerId: string, page: NotificationPage): NotificationState {
  return {
    ...emptyState(ownerId),
    status: "ready",
    notifications: page.notifications,
    unreadCount: page.unreadCount,
    hasMore: page.pagination.hasMore,
    nextCursor: page.pagination.nextCursor,
  };
}

function isAuthenticationError(error: unknown) {
  return (
    error instanceof NotificationBrowserError &&
    error.code === "AUTHENTICATION_REQUIRED"
  );
}

function isForbiddenError(error: unknown) {
  return (
    error instanceof NotificationBrowserError &&
    error.code === "NOTIFICATION_FORBIDDEN"
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const activeAccountId =
    session.status === "authenticated" && session.user?.status === "active"
      ? session.user.id
      : null;
  const [state, setState] = useState<NotificationState>(() => emptyState());
  const stateRef = useRef(state);
  const generation = useRef(0);
  const loadMoreLock = useRef(false);
  const marking = useRef(new Set<string>());
  const currentAccountId = useRef<string | null>(activeAccountId);

  useLayoutEffect(() => {
    currentAccountId.current = activeAccountId;
  }, [activeAccountId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const canCommit = useCallback((ownerId: string, operationGeneration: number) => {
    return (
      currentAccountId.current === ownerId &&
      generation.current === operationGeneration
    );
  }, []);

  const commitAccessFailure = useCallback(
    (ownerId: string, operationGeneration: number, error: unknown) => {
      if (!canCommit(ownerId, operationGeneration)) return false;

      if (isAuthenticationError(error)) {
        setState({
          ...emptyState(ownerId),
          authenticationExpired: true,
        });
        return true;
      }
      if (isForbiddenError(error)) {
        setState({ ...emptyState(ownerId), status: "forbidden" });
        return true;
      }
      return false;
    },
    [canCommit],
  );

  useEffect(() => {
    const operationGeneration = ++generation.current;
    loadMoreLock.current = false;
    marking.current.clear();

    const timeoutId = window.setTimeout(() => {
      if (!activeAccountId) {
        setState(emptyState());
        return;
      }

      const ownerId = activeAccountId;
      setState({ ...emptyState(ownerId), status: "loading" });
      void getNotifications({ pageSize: 20 })
        .then((page) => {
          if (canCommit(ownerId, operationGeneration)) {
            setState(pageState(ownerId, page));
          }
        })
        .catch((error: unknown) => {
          if (commitAccessFailure(ownerId, operationGeneration, error)) return;
          if (canCommit(ownerId, operationGeneration)) {
            setState({ ...emptyState(ownerId), status: "error" });
          }
        });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeAccountId, canCommit, commitAccessFailure]);

  const refresh = useCallback(async () => {
    const ownerId = currentAccountId.current;
    if (!ownerId) return;

    const operationGeneration = ++generation.current;
    loadMoreLock.current = false;
    marking.current.clear();
    setState((current) =>
      current.ownerId === ownerId
        ? {
            ...current,
            isRefreshing: true,
            isLoadingMore: false,
            refreshFailed: false,
            loadMoreFailed: false,
            markingIds: new Set(),
            failedMarkIds: new Set(),
            authenticationExpired: false,
          }
        : { ...emptyState(ownerId), status: "loading", isRefreshing: true },
    );

    try {
      const page = await getNotifications({ pageSize: 20 });
      if (canCommit(ownerId, operationGeneration)) {
        setState(pageState(ownerId, page));
      }
    } catch (error) {
      if (commitAccessFailure(ownerId, operationGeneration, error)) return;
      if (canCommit(ownerId, operationGeneration)) {
        setState((current) => ({
          ...current,
          status: current.status === "loading" ? "error" : current.status,
          isRefreshing: false,
          refreshFailed: true,
        }));
      }
    }
  }, [canCommit, commitAccessFailure]);

  const loadMore = useCallback(async () => {
    const ownerId = currentAccountId.current;
    const current = stateRef.current;
    if (
      !ownerId ||
      current.ownerId !== ownerId ||
      !current.hasMore ||
      !current.nextCursor ||
      loadMoreLock.current
    ) {
      return;
    }

    const operationGeneration = generation.current;
    const cursor = current.nextCursor;
    loadMoreLock.current = true;
    setState((value) => ({
      ...value,
      isLoadingMore: true,
      loadMoreFailed: false,
    }));

    try {
      const page = await getNotifications({ pageSize: 20, cursor });
      if (!canCommit(ownerId, operationGeneration)) return;
      setState((value) => {
        const existingIds = new Set(value.notifications.map(({ id }) => id));
        return {
          ...value,
          notifications: [
            ...value.notifications,
            ...page.notifications.filter(({ id }) => !existingIds.has(id)),
          ],
          unreadCount: page.unreadCount,
          hasMore: page.pagination.hasMore,
          nextCursor: page.pagination.nextCursor,
          isLoadingMore: false,
          loadMoreFailed: false,
        };
      });
    } catch (error) {
      if (commitAccessFailure(ownerId, operationGeneration, error)) return;
      if (canCommit(ownerId, operationGeneration)) {
        setState((value) => ({
          ...value,
          isLoadingMore: false,
          loadMoreFailed: true,
        }));
      }
    } finally {
      if (canCommit(ownerId, operationGeneration)) {
        loadMoreLock.current = false;
      }
    }
  }, [canCommit, commitAccessFailure]);

  const markRead = useCallback(
    async (notificationId: string) => {
      const ownerId = currentAccountId.current;
      if (!ownerId || marking.current.has(notificationId)) return;

      const operationGeneration = generation.current;
      const previous = stateRef.current.notifications.find(
        ({ id }) => id === notificationId,
      );
      marking.current.add(notificationId);
      setState((current) => {
        const failedMarkIds = new Set(current.failedMarkIds);
        failedMarkIds.delete(notificationId);
        return {
          ...current,
          markingIds: new Set(marking.current),
          failedMarkIds,
        };
      });

      try {
        const updated = await markNotificationRead(notificationId);
        if (!canCommit(ownerId, operationGeneration)) return;
        setState((current) => ({
          ...current,
          notifications: current.notifications.map((item) =>
            item.id === updated.id ? updated : item,
          ),
          unreadCount:
            previous && !previous.isRead && updated.isRead
              ? Math.max(0, current.unreadCount - 1)
              : current.unreadCount,
        }));
      } catch (error) {
        if (commitAccessFailure(ownerId, operationGeneration, error)) return;
        if (canCommit(ownerId, operationGeneration)) {
          setState((current) => ({
            ...current,
            failedMarkIds: new Set(current.failedMarkIds).add(notificationId),
          }));
        }
      } finally {
        if (canCommit(ownerId, operationGeneration)) {
          marking.current.delete(notificationId);
          setState((current) => ({
            ...current,
            markingIds: new Set(marking.current),
          }));
        }
      }
    },
    [canCommit, commitAccessFailure],
  );

  const value = useMemo<NotificationContextValue>(() => {
    const visibleState =
      !activeAccountId
        ? emptyState()
        : state.ownerId === activeAccountId
          ? state
          : { ...emptyState(activeAccountId), status: "loading" as const };

    return {
      status: visibleState.status,
      notifications: visibleState.notifications,
      unreadCount: visibleState.unreadCount,
      hasMore: visibleState.hasMore,
      isRefreshing: visibleState.isRefreshing,
      isLoadingMore: visibleState.isLoadingMore,
      refreshFailed: visibleState.refreshFailed,
      loadMoreFailed: visibleState.loadMoreFailed,
      markingIds: visibleState.markingIds,
      failedMarkIds: visibleState.failedMarkIds,
      authenticationExpired: visibleState.authenticationExpired,
      refresh,
      loadMore,
      markRead,
    };
  }, [activeAccountId, loadMore, markRead, refresh, state]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const notifications = useContext(NotificationContext);
  if (!notifications) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return notifications;
}
