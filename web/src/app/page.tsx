import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

const heroActions = [
  {
    title: "Report a lost item",
    description: "Record what went missing and keep proof of ownership private.",
    href: "/reports/new",
  },
  {
    title: "Report a found item",
    description: "Share the public details that can help the owner recognise it.",
    href: "/reports/new",
  },
  {
    title: "Search reports",
    description: "Browse member-visible lost and found reports across campus.",
    href: "/reports",
  },
] as const;

const recoverySteps = [
  {
    title: "Report clearly",
    description: "Add the public details that help with discovery while keeping evidence private.",
    image: "/illustrations/reports-found-item.webp",
    imageAlt: "A found backpack and everyday belongings ready to be reported",
    href: "/reports/new",
    action: "Open report form",
  },
  {
    title: "Review AI-assisted matches",
    description: "Compare possible matches and decide which report is worth reviewing.",
    image: "/illustrations/notifications-campus-match.webp",
    imageAlt: "A campus notification for a possible item match",
    href: "/reports",
    action: "Search reports",
  },
  {
    title: "Recover through a controlled handover",
    description: "Use ownership checks and staff-supported updates before an item changes hands.",
    image: "/illustrations/claims-item-handover.webp",
    imageAlt: "A careful campus handover of a recovered item",
    href: "/claims",
    action: "Review my claims",
  },
] as const;

export default function Home() {
  return (
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <h1 id="home-title">Lost something? Let the campus help.</h1>
          <p className={styles.intro}>
            Report belongings, receive possible matches, and arrange a safer recovery through one
            campus service.
          </p>
          <nav className={styles.heroActions} aria-label="Start a lost and found task">
            {heroActions.map((action) => (
              <Link
                className={styles.actionCard}
                href={action.href}
                key={action.title}
                aria-label={action.title}
              >
                <strong>{action.title}</strong>
                <span>{action.description}</span>
              </Link>
            ))}
          </nav>
        </div>

        <figure className={styles.heroVisual}>
          <Image
            className={styles.heroImage}
            src="/campus-find-hero.webp"
            alt="Found belongings on a campus bench"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 896px) 100vw, 50vw"
          />
          <figcaption>One campus place for reporting, matching, and secure recovery.</figcaption>
        </figure>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.sectionHeading}>
          <h2 id="workflow-title">How Campus Find works</h2>
          <p>Move from a clear report to a verified recovery without exposing private evidence.</p>
        </div>
        <ol className={styles.workflowList}>
          {recoverySteps.map((step) => (
            <li key={step.title} aria-label={`Recovery step: ${step.title}`}>
              <Link className={styles.stepLink} href={step.href} aria-label={step.title}>
                <Image
                  className={styles.stepImage}
                  src={step.image}
                  alt={step.imageAlt}
                  width={960}
                  height={640}
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
                <span className={styles.stepCopy}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                  <span className={styles.stepAction}>{step.action}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.privacy} aria-labelledby="privacy-title">
        <div>
          <h2 id="privacy-title">Public enough to match. Private enough to protect.</h2>
          <p>
            Exact locations, serial numbers, ownership-verification details stay private and remain
            separate from member-visible report data.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>Campus Find is a student-built service for safer lost-item recovery at Massey.</p>
      </footer>
    </main>
  );
}
