import Image from "next/image";

import styles from "./context-illustration.module.css";

const sources = {
  auth: "/illustrations/auth.webp",
  reports: "/illustrations/reports.webp",
  claims: "/illustrations/claims.webp",
  notifications: "/illustrations/notifications.webp",
  administration: "/illustrations/administration.webp",
} as const;

export type IllustrationKind = keyof typeof sources;

export function ContextIllustration({
  kind,
  priority = false,
  variant = "standard",
  className,
}: {
  kind: IllustrationKind;
  priority?: boolean;
  variant?: "standard" | "banner";
  className?: string;
}) {
  return (
    <figure
      className={[styles.frame, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <Image
        src={sources[kind]}
        alt=""
        width={960}
        height={640}
        priority={priority}
        sizes={
          variant === "banner"
            ? "(max-width: 76rem) 100vw, 76rem"
            : "(max-width: 48rem) 100vw, 32rem"
        }
      />
    </figure>
  );
}
