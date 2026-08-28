"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { CampusLocationManagementPanel } from "./campus-location-management-panel";
import { CategoryManagementPanel } from "./category-management-panel";
import styles from "./admin-reference-data.module.css";

type ReferenceDataTab = "categories" | "campusLocations";

export function AdminReferenceDataClient(): React.JSX.Element {
  const [selectedTab, setSelectedTab] = useState<ReferenceDataTab>("categories");
  const [campusVisited, setCampusVisited] = useState(false);
  const categoryTabRef = useRef<HTMLButtonElement>(null);
  const campusTabRef = useRef<HTMLButtonElement>(null);

  function activate(tab: ReferenceDataTab) {
    setSelectedTab(tab);
    if (tab === "campusLocations") setCampusVisited(true);
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    tab: ReferenceDataTab,
  ) {
    const otherTab = tab === "categories" ? campusTabRef : categoryTabRef;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      otherTab.current?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? categoryTabRef : campusTabRef).current?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(tab);
    }
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <h1>Manage reference data</h1>
        <p>
          Deactivated choices are removed from future report selections while
          historical report references remain available.
        </p>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Reference data resources">
        <button
          ref={categoryTabRef}
          className={styles.tab}
          id="reference-data-tab-categories"
          type="button"
          role="tab"
          aria-selected={selectedTab === "categories"}
          aria-controls="reference-data-panel-categories"
          tabIndex={selectedTab === "categories" ? 0 : -1}
          onClick={() => activate("categories")}
          onKeyDown={(event) => handleTabKeyDown(event, "categories")}
        >
          Categories
        </button>
        <button
          ref={campusTabRef}
          className={styles.tab}
          id="reference-data-tab-campus-locations"
          type="button"
          role="tab"
          aria-selected={selectedTab === "campusLocations"}
          aria-controls="reference-data-panel-campus-locations"
          tabIndex={selectedTab === "campusLocations" ? 0 : -1}
          onClick={() => activate("campusLocations")}
          onKeyDown={(event) => handleTabKeyDown(event, "campusLocations")}
        >
          Campus locations
        </button>
      </div>

      <section
        className={styles.panel}
        id="reference-data-panel-categories"
        role="tabpanel"
        aria-labelledby="reference-data-tab-categories"
        hidden={selectedTab !== "categories"}
      >
        <CategoryManagementPanel />
      </section>

      {campusVisited ? (
        <section
          className={styles.panel}
          id="reference-data-panel-campus-locations"
          role="tabpanel"
          aria-labelledby="reference-data-tab-campus-locations"
          hidden={selectedTab !== "campusLocations"}
        >
          <CampusLocationManagementPanel />
        </section>
      ) : null}
    </main>
  );
}
