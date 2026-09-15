import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

const workflow = [
  {
    title: "Report an item",
    description: "Share clear public details while keeping ownership evidence private.",
  },
  {
    title: "Receive possible matches",
    description: "Campus Find compares lost and found reports as the collection grows.",
  },
  {
    title: "Recover it securely",
    description: "Confirm ownership and arrange handover through a controlled process.",
  },
];

const sampleNotices = [
  {
    kind: "Found",
    item: "Canvas backpack",
    detail: "Near the library entrance",
    date: "Today",
  },
  {
    kind: "Lost",
    item: "Reusable bottle",
    detail: "Between the gym and bus stop",
    date: "Yesterday",
  },
  {
    kind: "Found",
    item: "Set of keys",
    detail: "Student services reception",
    date: "This week",
  },
];

export default function Home() {
  return (
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Massey campus community</p>
          <h1 id="home-title">Lost something? Let the campus help.</h1>
          <p className={styles.intro}>
            Report belongings, receive possible matches, and arrange a safer recovery through one
            campus service.
          </p>
          <div className={styles.actions}>
            <Link className="primary-action" href="/register">
              Create an account
            </Link>
            <Link className="text-link" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <Image
            className={styles.heroImage}
            src="/campus-find-hero.webp"
            alt="Found belongings on a campus bench"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 896px) 100vw, 50vw"
          />
        </div>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <h2 id="workflow-title">How Campus Find works</h2>
        <ol className={styles.workflowList}>
          {workflow.map((item) => (
            <li key={item.title} aria-label={`Workflow: ${item.title}`}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.notices} aria-labelledby="notices-title">
        <div className={styles.sectionHeading}>
          <h2 id="notices-title">Illustrative campus notices</h2>
          <p>These are examples. Signed-in members can browse live reports.</p>
        </div>
        <div className={styles.noticeGrid}>
          {sampleNotices.map((notice) => (
            <article className={styles.notice} key={`${notice.kind}-${notice.item}`}>
              <p className={styles.noticeKind}>{notice.kind}</p>
              <h3>{notice.item}</h3>
              <p>{notice.detail}</p>
              <time>{notice.date}</time>
            </article>
          ))}
        </div>
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
