"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./site-header.module.css";

export function SiteHeader() {
  const router = useRouter();
  const { status, user, refreshSession, logout } = useAuthSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const isActive = user?.status === "active";
  const canReviewClaims =
    isActive && (user?.role === "staff" || user?.role === "administrator");
  const canManageOwnClaims = isActive && user?.role === "student";

  async function handleSignOut() {
    setLogoutError(false);
    setIsSigningOut(true);

    try {
      await logout();
      router.replace("/");
      router.refresh();
    } catch {
      setLogoutError(true);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label="Campus Find home">
          <span className={styles.mark} aria-hidden="true" />
          <span>Campus Find</span>
        </Link>

        <nav className={styles.navigation} aria-label="Account navigation">
          {status === "loading" ? <span className={styles.status}>Checking session</span> : null}

          {status === "unauthenticated" ? (
            <>
              <Link className={`${styles.navLink} text-link`} href="/login">
                Sign in
              </Link>
              <Link className="primary-action" href="/register">
                Create account
              </Link>
            </>
          ) : null}

          {status === "authenticated" && user ? (
            <>
              <span className={styles.userName}>{user.profile.displayName}</span>
              <Link className={`${styles.navLink} text-link`} href="/reports">
                Browse
              </Link>
              {canManageOwnClaims ? (
                <Link className={`${styles.navLink} text-link`} href="/claims">
                  My claims
                </Link>
              ) : null}
              {canReviewClaims ? (
                <Link className={`${styles.navLink} text-link`} href="/staff/claims">
                  Claim reviews
                </Link>
              ) : null}
              <Link className={`${styles.navLink} text-link`} href="/reports/new">
                Report item
              </Link>
              <Link className={`${styles.navLink} text-link`} href="/dashboard">
                Dashboard
              </Link>
              <button
                className={styles.signOut}
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? "Signing out" : "Sign out"}
              </button>
            </>
          ) : null}

          {status === "unavailable" ? (
            <button className={styles.retry} type="button" onClick={() => void refreshSession()}>
              Retry session check
            </button>
          ) : null}
        </nav>
      </div>

      {logoutError ? (
        <p className={styles.error} role="alert">
          We could not sign you out. Please try again.
        </p>
      ) : null}
    </header>
  );
}
