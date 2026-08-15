import type { Metadata } from "next";
import Link from "next/link";

import { AuthPanel } from "@/components/auth/auth-panel";
import formStyles from "@/components/auth/auth-form.module.css";
import { LoginForm } from "@/components/auth/login-form";

import styles from "../auth-page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main id="main-content" className={styles.main}>
      <AuthPanel
        title="Welcome back"
        description="Sign in to manage your reports and follow recovery updates."
        footer={
          <p className={styles.footerText}>
            New to Campus Find?{" "}
            <Link className={formStyles.footerLink} href="/register">
              Create an account
            </Link>
          </p>
        }
      >
        <LoginForm />
      </AuthPanel>
    </main>
  );
}
