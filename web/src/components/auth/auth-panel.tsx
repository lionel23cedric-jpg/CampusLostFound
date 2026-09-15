import type { ReactNode } from "react";

import { ContextIllustration } from "@/components/context-illustration";

import styles from "./auth-panel.module.css";

type AuthPanelProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthPanel({ title, description, children, footer }: AuthPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="auth-panel-title">
      <p className={styles.eyebrow}>Campus account</p>
      <h1 id="auth-panel-title">{title}</h1>
      <p className={styles.description}>{description}</p>
      <ContextIllustration kind="auth" variant="banner" priority />
      {children}
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}
