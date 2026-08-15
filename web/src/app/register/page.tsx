import type { Metadata } from "next";
import Link from "next/link";

import { AuthPanel } from "@/components/auth/auth-panel";
import formStyles from "@/components/auth/auth-form.module.css";
import { RegisterForm } from "@/components/auth/register-form";

import styles from "../auth-page.module.css";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <main id="main-content" className={styles.main}>
      <AuthPanel
        title="Join Campus Find"
        description="Create a campus account to submit reports and manage recovery updates."
        footer={
          <p className={styles.footerText}>
            Already have an account?{" "}
            <Link className={formStyles.footerLink} href="/login">
              Sign in
            </Link>
          </p>
        }
      >
        <p className={styles.privacyNote}>
          Keep sensitive ownership evidence out of this form. Add it later in the private report
          verification section.
        </p>
        <RegisterForm />
      </AuthPanel>
    </main>
  );
}
