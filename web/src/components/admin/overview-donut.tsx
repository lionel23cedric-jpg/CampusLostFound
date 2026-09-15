import type { CSSProperties } from "react";

import styles from "./admin-overview.module.css";

export type OverviewDonutSegment = {
  label: string;
  value: number;
  color: string;
};

function buildGradient(segments: readonly OverviewDonutSegment[], total: number) {
  if (total === 0) {
    return "conic-gradient(var(--line) 0deg 360deg)";
  }

  let start = 0;
  const stops = segments.map((segment) => {
    const end = start + (segment.value / total) * 360;
    const stop = `${segment.color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function formatPercentage(value: number, total: number) {
  return `${total === 0 ? 0 : Math.round((value / total) * 100)}%`;
}

export function OverviewDonut({
  title,
  total,
  segments,
}: {
  title: string;
  total: number;
  segments: readonly OverviewDonutSegment[];
}) {
  const description = `${title}: ${segments
    .map((segment) => `${segment.label} ${segment.value}`)
    .join(", ")}. Total ${total}.`;

  return (
    <figure className={styles.chartFigure}>
      <div
        className={styles.donutChart}
        role="img"
        aria-label={description}
        style={{ background: buildGradient(segments, total) } as CSSProperties}
      >
        <span>
          <strong>{total}</strong>
          <small>Total</small>
        </span>
      </div>
      <figcaption>
        <h3>{title}</h3>
        <ul className={styles.chartLegend}>
          {segments.map((segment) => (
            <li key={segment.label}>
              <span
                className={styles.legendSwatch}
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span>{segment.label}</span>
              <span className={styles.legendValue}>
                <strong>{segment.value}</strong>
                <small>{formatPercentage(segment.value, total)}</small>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
