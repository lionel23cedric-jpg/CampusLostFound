import Image from "next/image";

import styles from "./context-illustration.module.css";

const sources = {
  auth: "/illustrations/auth-campus-service.webp",
  reports: "/illustrations/reports-found-item.webp",
  claims: "/illustrations/claims-item-handover.webp",
  notifications: "/illustrations/notifications-campus-match.webp",
  administration: "/illustrations/administration-review.webp",
  adminOverview: "/illustrations/admin-operations-overview.png",
  adminAccounts: "/illustrations/admin-accounts-staff.png",
  adminReference: "/illustrations/admin-reference-data.png",
  adminModeration: "/illustrations/admin-report-moderation.png",
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
