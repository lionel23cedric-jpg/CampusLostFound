import Link from "next/link";

import { HomeObjectIllustration } from "@/components/home/home-object-illustration";

import styles from "./page.module.css";

const actions = [
  { number: "01", category: "LOST", label: "Report a lost item", href: "/reports/new" },
  { number: "02", category: "FOUND", label: "Report a found item", href: "/reports/new" },
  { number: "03", category: "SEARCH", label: "Browse reports", href: "/reports" },
] as const;

const steps = [
  {
    number: "01",
    title: "Share what you know",
    description: "Public details help the search. Proof of ownership stays private.",
    href: "/reports/new",
    kind: "bottle",
  },
  {
    number: "02",
    title: "Spot a possible match",
    description: "Review suggestions and decide what is worth checking.",
    href: "/reports",
    kind: "headphones",
  },
  {
    number: "03",
    title: "Return it safely",
    description: "Ownership checks come before a staff-supported handover.",
    href: "/claims",
    kind: "keys",
  },
] as const;

export default function Home() {
  return (
    <main id="main-content" className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroStage}>
          <div className={styles.heroCopy}>
            <p className={styles.boardLabel}>The campus lost and found board</p>
            <h1
              id="home-title"
              className={styles.heroTitle}
              aria-label="Lost. Found. Back together."
            >
              <span>Lost.</span>
              <span className={styles.highlight}>Found.</span>
              <span>Back together.</span>
            </h1>
            <p className={styles.intro}>
              Report what went missing, share what you found, and take a safer route back.
            </p>
          </div>

          <div className={styles.boardArt} aria-hidden="true">
            <div className={styles.poster}>
              <span className={styles.posterTop}>Everyday things, big relief</span>
              <HomeObjectIllustration kind="backpack" className={styles.posterObject} />
              <strong>Help it find its way.</strong>
            </div>
            <div className={styles.note}>
              <HomeObjectIllustration kind="keys" className={styles.noteObject} />
              <span>One small clue can help.</span>
            </div>
          </div>
        </div>

        <nav className={styles.actionList} aria-label="Start a lost and found task">
          {actions.map((action) => (
            <Link className={styles.actionLink} href={action.href} key={action.number}>
              <span className={styles.actionNumber} aria-hidden="true">
                {action.number} / {action.category}
              </span>
              <strong>{action.label}</strong>
            </Link>
          ))}
        </nav>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.workflowInner}>
          <h2 id="workflow-title">How things find their way home</h2>
          <ol className={styles.workflowList}>
            {steps.map((step) => (
              <li key={step.number}>
                <Link className={styles.stepLink} href={step.href} aria-label={step.title}>
                  <HomeObjectIllustration kind={step.kind} className={styles.stepObject} />
                  <span className={styles.stepNumber} aria-hidden="true">
                    {step.number}
                  </span>
                  <strong>{step.title}</strong>
                  <span className={styles.stepDescription}>{step.description}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.privacy} aria-labelledby="privacy-title">
        <div className={styles.privacyInner}>
          <h2 id="privacy-title">A public notice. A private proof.</h2>
          <p>
            Exact locations stay private, and ownership evidence stays out of public reports.
            Share only what helps someone recognise an item.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>Campus Find is a student-built service for safer lost-item recovery at Massey.</p>
      </footer>
    </main>
  );
}
