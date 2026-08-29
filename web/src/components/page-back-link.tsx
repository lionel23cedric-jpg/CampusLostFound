import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import styles from "./page-back-link.module.css";

type PageBackLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  children: ReactNode;
  className?: string;
};

export function PageBackLink({
  children,
  className,
  href,
  ...linkProps
}: PageBackLinkProps) {
  return (
    <Link
      className={`${styles.link}${className ? ` ${className}` : ""}`}
      href={href}
      {...linkProps}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12.75 4.75 7.5 10l5.25 5.25" />
      </svg>
      <span>{children}</span>
    </Link>
  );
}
