"use client";

import Link from "next/link";

import { PageBackLink } from "@/components/page-back-link";
import styles from "./notification-centre.module.css";
import { useNotifications } from "./notification-provider";

const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

function unreadSummary(unreadCount: number) {
  return `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`;
}

export function NotificationCentre() {
  const notifications = useNotifications();

  return (
    <section className={styles.centre} aria-labelledby="notifications-heading">
      <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
      <header className={styles.centreHeader}>
        <div>
          <p className={styles.eyebrow}>Account updates</p>
          <h1 id="notifications-heading">Notifications</h1>
          <p>Review controlled updates about your reports and claims.</p>
        </div>
        {notifications.status === "ready" ? (
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={notifications.isRefreshing}
            onClick={() => void notifications.refresh()}
          >
            {notifications.isRefreshing
              ? "Refreshing notifications"
              : "Refresh notifications"}
          </button>
        ) : null}
      </header>

      {notifications.status === "loading" || notifications.status === "idle" ? (
        <p className={styles.loading} role="status" aria-live="polite">
          Loading notifications
        </p>
      ) : null}

      {notifications.status === "error" ? (
        <section
          className={styles.statePanel}
          role="alert"
          aria-labelledby="notification-load-error"
        >
          <h2 id="notification-load-error">We could not load notifications</h2>
          <p>The notification service is temporarily unavailable. Try again.</p>
          <button type="button" onClick={() => void notifications.refresh()}>
            Retry notifications
          </button>
        </section>
      ) : null}

      {notifications.status === "ready" ? (
        <>
          <p className={styles.unreadSummary} role="status" aria-live="polite">
            {unreadSummary(notifications.unreadCount)}
          </p>

          {notifications.refreshFailed ? (
            <p className={styles.inlineError} role="alert" aria-live="polite">
              We could not refresh notifications. Your current list is still available.
            </p>
          ) : null}

          {notifications.notifications.length === 0 ? (
            <section className={styles.emptyState} aria-labelledby="empty-notifications">
              <h2 id="empty-notifications">No notifications yet</h2>
              <p>Updates about your reports and claims will appear here.</p>
            </section>
          ) : (
            <section aria-labelledby="notification-list-heading">
              <h2 id="notification-list-heading" className={styles.visuallyHidden}>
                Notification history
              </h2>
              <ol className={styles.notificationList}>
                {notifications.notifications.map((notification) => {
                  const isMarking = notifications.markingIds.has(notification.id);
                  const markFailed = notifications.failedMarkIds.has(notification.id);

                  return (
                    <li key={notification.id} className={styles.notificationItem}>
                      <article className={styles.notificationCard}>
                        <div className={styles.notificationHeading}>
                          <h3>{notification.title}</h3>
                          <span className={notification.isRead ? styles.read : styles.unread}>
                            {notification.isRead ? "Read" : "Unread"}
                          </span>
                        </div>
                        <p className={styles.notificationSummary}>{notification.summary}</p>
                        <time dateTime={notification.createdAt}>
                          {dateTimeFormatter.format(new Date(notification.createdAt))}
                        </time>
                        <div className={styles.notificationActions}>
                          <Link
                            className={styles.detailLink}
                            href={`${notification.action.href}?returnTo=%2Fnotifications`}
                            onClick={() => {
                              if (!notification.isRead) {
                                void notifications.markRead(notification.id);
                              }
                            }}
                          >
                            {notification.action.label}
                          </Link>
                          {!notification.isRead ? (
                            <button
                              className={styles.markButton}
                              type="button"
                              disabled={isMarking}
                              onClick={() => void notifications.markRead(notification.id)}
                            >
                              {isMarking ? "Marking as read" : "Mark as read"}
                            </button>
                          ) : null}
                        </div>
                        {markFailed ? (
                          <p className={styles.itemError} role="alert">
                            We could not mark this notification as read. Try again.
                          </p>
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ol>

              {notifications.loadMoreFailed ? (
                <p className={styles.inlineError} role="alert" aria-live="polite">
                  We could not load more notifications. Try again.
                </p>
              ) : null}

              {notifications.hasMore ? (
                <button
                  className={styles.loadMoreButton}
                  type="button"
                  disabled={notifications.isLoadingMore}
                  onClick={() => void notifications.loadMore()}
                >
                  {notifications.isLoadingMore
                    ? "Loading more notifications"
                    : notifications.loadMoreFailed
                      ? "Retry load more"
                      : "Load more"}
                </button>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
