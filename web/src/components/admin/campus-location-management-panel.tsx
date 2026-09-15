"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserReferenceDataError,
  createAdministratorCampusLocation,
  listAdministratorCampusLocations,
  updateAdministratorCampusLocation,
} from "@/lib/admin/reference-data-browser-client";
import {
  createAdminCampusLocationSchema,
  referenceDataListQuerySchema,
  updateAdminCampusLocationSchema,
  type AdminCampusLocation,
  type AdminCampusLocationPage,
  type ReferenceDataListQuery,
  type UpdateAdminCampusLocationInput,
} from "@/lib/admin/reference-data-contract";

import styles from "./admin-reference-data.module.css";
import {
  ReferenceDataFilters,
  ReferenceDataPagination,
  type ReferenceDataStatus,
} from "./reference-data-panel-controls";

const DEFAULT_QUERY: ReferenceDataListQuery = {
  q: undefined,
  status: "all",
  page: 1,
};

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
});

type CampusLocationListState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      page: AdminCampusLocationPage;
      isRefreshing: boolean;
      refreshFailed: boolean;
    }
  | { status: "accessChanged" };

type CampusLocationEditor = {
  recordId: string;
  updatedAt: string;
  campusName: string;
  locationName: string;
  description: string;
  desiredActive: boolean;
  originalCampusName: string;
  originalLocationName: string;
  originalDescription: string;
  originalActive: boolean;
  conflict: boolean;
};

type FormErrors = {
  campusName?: string;
  locationName?: string;
  description?: string;
  form?: string;
};

type MutationNotice = {
  kind: "status" | "alert";
  message: string;
};

type UpdateKind = "edit" | "deactivate" | "restore";

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

function createErrors(fields: {
  campusName: string;
  locationName: string;
  description: string;
}): FormErrors {
  const parsed = createAdminCampusLocationSchema.safeParse(fields);
  if (parsed.success) return {};
  const flattened = parsed.error.flatten();
  return {
    campusName: flattened.fieldErrors.campusName?.length
      ? "Enter a campus name between 2 and 80 valid characters."
      : undefined,
    locationName: flattened.fieldErrors.locationName?.length
      ? "Enter a location name between 2 and 120 valid characters."
      : undefined,
    description: flattened.fieldErrors.description?.length
      ? "Enter no more than 300 valid description characters."
      : undefined,
    form: flattened.formErrors[0],
  };
}

function editorFrom(record: AdminCampusLocation): CampusLocationEditor {
  return {
    recordId: record.id,
    updatedAt: record.updatedAt,
    campusName: record.campusName,
    locationName: record.locationName,
    description: record.description ?? "",
    desiredActive: record.isActive,
    originalCampusName: record.campusName,
    originalLocationName: record.locationName,
    originalDescription: record.description ?? "",
    originalActive: record.isActive,
    conflict: false,
  };
}

export function CampusLocationManagementPanel(): React.JSX.Element {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [state, setState] = useState<CampusLocationListState>({ status: "loading" });
  const [query, setQuery] = useState<ReferenceDataListQuery>(DEFAULT_QUERY);
  const [searchDraft, setSearchDraft] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [createCampusName, setCreateCampusName] = useState("");
  const [createLocationName, setCreateLocationName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createFormErrors, setCreateFormErrors] = useState<FormErrors>({});
  const [editor, setEditor] = useState<CampusLocationEditor | null>(null);
  const [editorErrors, setEditorErrors] = useState<FormErrors>({});
  const [confirmingStateChange, setConfirmingStateChange] = useState(false);
  const [mutationStatus, setMutationStatus] = useState<"idle" | "pending">(
    "idle",
  );
  const [mutationNotice, setMutationNotice] =
    useState<MutationNotice | null>(null);
  const mounted = useRef(false);
  const listRequestId = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const mutationRequestId = useRef(0);
  const mutationController = useRef<AbortController | null>(null);
  const mutationPending = useRef(false);
  const activeQuery = useRef<ReferenceDataListQuery>(DEFAULT_QUERY);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const recordHeadings = useRef(new Map<string, HTMLHeadingElement>());

  const focusNotice = useCallback(() => {
    window.setTimeout(() => noticeRef.current?.focus(), 0);
  }, []);

  const handleAccessError = useCallback(
    async (
      error: BrowserReferenceDataError,
      requestKind: "list" | "mutation",
      currentRequest: number,
    ) => {
      if (
        error.code !== "AUTHENTICATION_REQUIRED" &&
        error.code !== "ADMINISTRATOR_REQUIRED"
      ) {
        return false;
      }

      setEditor(null);
      setConfirmingStateChange(false);
      setState({ status: "accessChanged" });
      mutationPending.current = false;
      setMutationStatus("idle");
      await refreshSession().catch(() => undefined);

      const stillCurrent =
        mounted.current &&
        (requestKind === "list"
          ? listRequestId.current === currentRequest
          : mutationRequestId.current === currentRequest);
      if (error.code === "AUTHENTICATION_REQUIRED" && stillCurrent) {
        router.replace("/login");
      }
      return true;
    },
    [refreshSession, router],
  );

  const loadCampusLocations = useCallback(
    async (
      nextQuery: ReferenceDataListQuery,
      mode: "initial" | "refresh",
    ): Promise<AdminCampusLocationPage | null> => {
      // Only the newest filter request may update the list; older work is aborted
      // and also guarded by a monotonically increasing request ID.
      const currentRequest = ++listRequestId.current;
      listController.current?.abort();
      const controller = new AbortController();
      listController.current = controller;
      activeQuery.current = nextQuery;
      setQuery(nextQuery);
      setFilterError(null);
      setState((current) =>
        mode === "refresh" && current.status === "ready"
          ? { ...current, isRefreshing: true, refreshFailed: false }
          : { status: "loading" },
      );

      try {
        const page = await listAdministratorCampusLocations(
          nextQuery,
          controller.signal,
        );
        if (
          !mounted.current ||
          controller.signal.aborted ||
          listRequestId.current !== currentRequest
        ) {
          return null;
        }
        setState({
          status: "ready",
          page,
          isRefreshing: false,
          refreshFailed: false,
        });
        return page;
      } catch (error) {
        if (
          !mounted.current ||
          listRequestId.current !== currentRequest ||
          isAbort(error, controller.signal)
        ) {
          return null;
        }
        if (
          error instanceof BrowserReferenceDataError &&
          (await handleAccessError(error, "list", currentRequest))
        ) {
          return null;
        }
        if (
          error instanceof BrowserReferenceDataError &&
          error.code === "INVALID_REFERENCE_DATA_REQUEST"
        ) {
          setFilterError("Check the campus location filters and try again.");
        }
        setState((current) =>
          mode === "refresh" && current.status === "ready"
            ? { ...current, isRefreshing: false, refreshFailed: true }
            : { status: "error" },
        );
        return null;
      }
    },
    [handleAccessError],
  );

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadCampusLocations(DEFAULT_QUERY, "initial");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      listRequestId.current += 1;
      mutationRequestId.current += 1;
      listController.current?.abort();
      mutationController.current?.abort();
      mutationPending.current = false;
    };
  }, [loadCampusLocations]);

  const editorRecordId = editor?.recordId;

  useEffect(() => {
    if (editorRecordId) editorHeadingRef.current?.focus();
  }, [editorRecordId]);

  function applySearch() {
    const parsed = referenceDataListQuerySchema.safeParse({
      q: searchDraft,
      status: query.status,
      page: "1",
    });
    if (!parsed.success) {
      setFilterError("Enter no more than 80 valid search characters.");
      return;
    }
    setSearchDraft(parsed.data.q ?? "");
    setFilterError(null);
    void loadCampusLocations(parsed.data, "refresh");
  }

  function changeStatus(status: ReferenceDataStatus) {
    void loadCampusLocations({ ...query, status, page: 1 }, "refresh");
  }

  function resetFilters() {
    setSearchDraft("");
    setFilterError(null);
    void loadCampusLocations(DEFAULT_QUERY, "refresh");
  }

  function changePage(page: number) {
    void loadCampusLocations({ ...query, page }, "refresh");
  }

  async function createCampusLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationPending.current) return;

    const fields = {
      campusName: createCampusName,
      locationName: createLocationName,
      description: createDescription,
    };
    const parsed = createAdminCampusLocationSchema.safeParse(fields);
    if (!parsed.success) {
      setCreateFormErrors(createErrors(fields));
      return;
    }

    const currentRequest = ++mutationRequestId.current;
    const controller = new AbortController();
    mutationController.current = controller;
    mutationPending.current = true;
    setMutationStatus("pending");
    setCreateFormErrors({});
    setMutationNotice(null);

    try {
      const created = await createAdministratorCampusLocation(
        parsed.data,
        controller.signal,
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        mutationRequestId.current !== currentRequest
      ) {
        return;
      }
      mutationPending.current = false;
      setMutationStatus("idle");
      setCreateCampusName("");
      setCreateLocationName("");
      setCreateDescription("");
      setSearchDraft("");
      setMutationNotice({
        kind: "status",
        message: `Campus location ${created.locationName} created`,
      });
      focusNotice();
      void loadCampusLocations(DEFAULT_QUERY, "refresh");
    } catch (error) {
      if (
        !mounted.current ||
        mutationRequestId.current !== currentRequest ||
        isAbort(error, controller.signal)
      ) {
        return;
      }
      mutationPending.current = false;
      setMutationStatus("idle");
      if (
        error instanceof BrowserReferenceDataError &&
        (await handleAccessError(error, "mutation", currentRequest))
      ) {
        return;
      }
      const message =
        error instanceof BrowserReferenceDataError &&
        error.code === "REFERENCE_DATA_DUPLICATE"
          ? "That campus and location combination already exists. Choose unique values."
          : error instanceof BrowserReferenceDataError &&
              error.code === "INVALID_REFERENCE_DATA_REQUEST"
            ? "Check the campus location values and try again."
            : "Campus location management is temporarily unavailable. Try again.";
      setCreateFormErrors({ form: message });
    }
  }

  function openEditor(record: AdminCampusLocation, trigger: HTMLButtonElement) {
    if (mutationPending.current) return;
    editTriggerRef.current = trigger;
    setEditor(editorFrom(record));
    setEditorErrors({});
    setConfirmingStateChange(false);
    setMutationNotice(null);
  }

  function closeEditor() {
    if (mutationPending.current) return;
    const trigger = editTriggerRef.current;
    setEditor(null);
    setEditorErrors({});
    setConfirmingStateChange(false);
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function updateVisibleRecord(updated: AdminCampusLocation) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            page: {
              ...current.page,
              campusLocations: current.page.campusLocations.map((record) =>
                record.id === updated.id ? updated : record,
              ),
            },
          }
        : current,
    );
  }

  async function submitUpdate(
    input: UpdateAdminCampusLocationInput,
    kind: UpdateKind,
  ) {
    if (!editor || mutationPending.current) return;
    const targetId = editor.recordId;
    const currentRequest = ++mutationRequestId.current;
    const controller = new AbortController();
    mutationController.current = controller;
    mutationPending.current = true;
    setMutationStatus("pending");
    setEditorErrors({});
    setMutationNotice(null);

    try {
      const updated = await updateAdministratorCampusLocation(
        targetId,
        input,
        controller.signal,
      );
      if (updated.id !== targetId) throw new Error("Campus location target mismatch");
      if (
        !mounted.current ||
        controller.signal.aborted ||
        mutationRequestId.current !== currentRequest
      ) {
        return;
      }
      mutationPending.current = false;
      setMutationStatus("idle");
      updateVisibleRecord(updated);
      setEditor(null);
      setConfirmingStateChange(false);
      setMutationNotice({
        kind: "status",
        message:
          kind === "deactivate"
            ? `Campus location ${updated.locationName} deactivated`
            : kind === "restore"
              ? `Campus location ${updated.locationName} restored`
              : `Campus location ${updated.locationName} updated`,
      });
      window.setTimeout(
        () => recordHeadings.current.get(updated.id)?.focus(),
        0,
      );
    } catch (error) {
      if (
        !mounted.current ||
        mutationRequestId.current !== currentRequest ||
        isAbort(error, controller.signal)
      ) {
        return;
      }
      mutationPending.current = false;
      setMutationStatus("idle");
      if (
        error instanceof BrowserReferenceDataError &&
        (await handleAccessError(error, "mutation", currentRequest))
      ) {
        return;
      }
      if (
        error instanceof BrowserReferenceDataError &&
        error.code === "REFERENCE_DATA_NOT_FOUND"
      ) {
        setEditor(null);
        setConfirmingStateChange(false);
        await loadCampusLocations(activeQuery.current, "refresh");
        if (mounted.current) {
          setMutationNotice({
            kind: "status",
            message:
              "That campus location is no longer available. The current list has been refreshed.",
          });
          focusNotice();
        }
        return;
      }
      if (
        error instanceof BrowserReferenceDataError &&
        error.code === "REFERENCE_DATA_STATE_CONFLICT"
      ) {
        // A 409 means the record changed elsewhere. Reloading protects that newer
        // work from being overwritten by the currently open editor.
        setEditor((current) =>
          current?.recordId === targetId
            ? { ...current, conflict: true }
            : current,
        );
        setEditorErrors({
          form:
            "This campus location changed after you opened it. Reload the latest version before saving again.",
        });
        return;
      }
      setEditorErrors({
        form:
          error instanceof BrowserReferenceDataError &&
          error.code === "REFERENCE_DATA_DUPLICATE"
            ? "That campus and location combination already exists. Choose unique values."
            : error instanceof BrowserReferenceDataError &&
                error.code === "INVALID_REFERENCE_DATA_REQUEST"
              ? "Check the campus location values and try again."
              : "Campus location management is temporarily unavailable. Try again.",
      });
    }
  }

  function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.conflict || mutationPending.current) return;

    const raw: Record<string, unknown> = { updatedAt: editor.updatedAt };
    if (editor.campusName !== editor.originalCampusName) {
      raw.campusName = editor.campusName;
    }
    if (editor.locationName !== editor.originalLocationName) {
      raw.locationName = editor.locationName;
    }
    if (editor.description !== editor.originalDescription) {
      raw.description = editor.description;
    }
    const parsed = updateAdminCampusLocationSchema.safeParse(raw);
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setEditorErrors({
        campusName: flattened.fieldErrors.campusName?.length
          ? "Enter a campus name between 2 and 80 valid characters."
          : undefined,
        locationName: flattened.fieldErrors.locationName?.length
          ? "Enter a location name between 2 and 120 valid characters."
          : undefined,
        description: flattened.fieldErrors.description?.length
          ? "Enter no more than 300 valid description characters."
          : undefined,
        form:
          flattened.formErrors.length > 0
            ? "Change at least one campus location value before saving."
            : undefined,
      });
      return;
    }
    void submitUpdate(parsed.data, "edit");
  }

  function askForStateChange(desiredActive: boolean) {
    if (!editor || editor.conflict || mutationPending.current) return;
    setEditor({ ...editor, desiredActive });
    setConfirmingStateChange(true);
    setEditorErrors({});
  }

  function cancelStateChange() {
    if (!editor || mutationPending.current) return;
    setEditor({ ...editor, desiredActive: editor.originalActive });
    setConfirmingStateChange(false);
  }

  function confirmStateChange() {
    if (!editor || editor.conflict || mutationPending.current) return;
    const parsed = updateAdminCampusLocationSchema.safeParse({
      updatedAt: editor.updatedAt,
      isActive: editor.desiredActive,
    });
    if (!parsed.success) {
      setEditorErrors({ form: "Check the campus location values and try again." });
      return;
    }
    // Deactivation removes the choice from future reports without deleting the
    // location referenced by reports that already exist.
    void submitUpdate(
      parsed.data,
      editor.desiredActive ? "restore" : "deactivate",
    );
  }

  async function reloadLatest() {
    if (!editor || mutationPending.current) return;
    const targetId = editor.recordId;
    const latestPage = await loadCampusLocations(activeQuery.current, "refresh");
    if (!latestPage || !mounted.current) return;
    const latest = latestPage.campusLocations.find((record) => record.id === targetId);
    if (!latest) {
      setEditor(null);
      setConfirmingStateChange(false);
      setMutationNotice({
        kind: "status",
        message: "That campus location is no longer available. The current list has been refreshed.",
      });
      focusNotice();
      return;
    }
    setEditor(editorFrom(latest));
    setEditorErrors({});
    setConfirmingStateChange(false);
    setMutationNotice({
      kind: "status",
      message: `Latest campus location ${latest.locationName} loaded. Review it before saving.`,
    });
  }

  function setRecordHeading(id: string, node: HTMLHeadingElement | null) {
    if (node) recordHeadings.current.set(id, node);
    else recordHeadings.current.delete(id);
  }

  if (state.status === "accessChanged") {
    return (
      <section className={styles.statePanel} aria-labelledby="campus-location-access-changed">
        <h2 id="campus-location-access-changed">Administrator access changed</h2>
        <p>Your account no longer has access to campus location management.</p>
      </section>
    );
  }

  const page = state.status === "ready" ? state.page : null;
  const listBusy = state.status === "ready" && state.isRefreshing;
  const writeBusy = mutationStatus === "pending";
  const filtered = query.q !== undefined || query.status !== "all";

  return (
    <section className={styles.resourcePanel} aria-labelledby="campus-location-management-heading">
      <header className={styles.resourceHeading}>
        <div>
          <h2 id="campus-location-management-heading">Campus locations</h2>
          <p>Manage the campus location choices available for new lost and found reports.</p>
        </div>
      </header>

      {mutationNotice ? (
        <p
          ref={noticeRef}
          className={
            mutationNotice.kind === "alert" ? styles.alert : styles.notice
          }
          role={mutationNotice.kind === "alert" ? "alert" : "status"}
          aria-live={mutationNotice.kind === "status" ? "polite" : undefined}
          tabIndex={-1}
        >
          {mutationNotice.message}
        </p>
      ) : null}

      <section className={styles.createSection} aria-labelledby="create-campus-location-heading">
        <div className={styles.sectionCopy}>
          <h3 id="create-campus-location-heading">Create campus location</h3>
          <p>Use recognisable campus and location names that members can distinguish.</p>
        </div>
        <form
          className={styles.formGrid}
          aria-label="Create campus location"
          noValidate
          onSubmit={(event) => void createCampusLocation(event)}
        >
          <div className={styles.field}>
            <label htmlFor="campus-location-create-campus-name">Campus name</label>
            <input
              id="campus-location-create-campus-name"
              value={createCampusName}
              maxLength={80}
              disabled={writeBusy}
              aria-invalid={createFormErrors.campusName ? "true" : undefined}
              aria-describedby={
                createFormErrors.campusName
                  ? "campus-location-create-campus-name-error"
                  : undefined
              }
              onChange={(event) => setCreateCampusName(event.target.value)}
            />
            {createFormErrors.campusName ? (
              <p id="campus-location-create-campus-name-error" className={styles.fieldError}>
                {createFormErrors.campusName}
              </p>
            ) : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="campus-location-create-location-name">Location name</label>
            <input
              id="campus-location-create-location-name"
              value={createLocationName}
              maxLength={120}
              disabled={writeBusy}
              aria-invalid={createFormErrors.locationName ? "true" : undefined}
              aria-describedby={
                createFormErrors.locationName
                  ? "campus-location-create-location-name-error"
                  : undefined
              }
              onChange={(event) => setCreateLocationName(event.target.value)}
            />
            {createFormErrors.locationName ? (
              <p id="campus-location-create-location-name-error" className={styles.fieldError}>
                {createFormErrors.locationName}
              </p>
            ) : null}
          </div>
          <div className={`${styles.field} ${styles.fullField}`}>
            <label htmlFor="campus-location-create-description">Campus location description</label>
            <textarea
              id="campus-location-create-description"
              value={createDescription}
              maxLength={300}
              rows={3}
              disabled={writeBusy}
              aria-invalid={createFormErrors.description ? "true" : undefined}
              aria-describedby={
                createFormErrors.description
                  ? "campus-location-create-description-error"
                  : undefined
              }
              onChange={(event) => setCreateDescription(event.target.value)}
            />
            {createFormErrors.description ? (
              <p
                id="campus-location-create-description-error"
                className={styles.fieldError}
              >
                {createFormErrors.description}
              </p>
            ) : null}
          </div>
          {createFormErrors.form ? (
            <p className={`${styles.alert} ${styles.fullField}`} role="alert">
              {createFormErrors.form}
            </p>
          ) : null}
          <div className={`${styles.buttonRow} ${styles.fullField}`}>
            <button type="submit" disabled={writeBusy}>
              {writeBusy ? "Creating campus location" : "Create campus location"}
            </button>
          </div>
        </form>
      </section>

      <ReferenceDataFilters
        resourceLabel="campus locations"
        searchDraft={searchDraft}
        status={query.status}
        isBusy={writeBusy}
        onSearchDraftChange={setSearchDraft}
        onStatusChange={changeStatus}
        onSearch={applySearch}
        onReset={resetFilters}
      />

      {filterError ? (
        <p className={styles.alert} role="alert">
          {filterError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className={styles.loading} role="status" aria-live="polite">
          Loading campus locations
        </p>
      ) : null}

      {state.status === "error" ? (
        <section className={styles.statePanel} aria-labelledby="campus-location-list-error">
          <h3 id="campus-location-list-error">Campus location management unavailable</h3>
          <p>We could not load campus locations. Try again.</p>
          <button
            type="button"
            onClick={() => void loadCampusLocations(activeQuery.current, "initial")}
          >
            Retry campus locations
          </button>
        </section>
      ) : null}

      {state.status === "ready" && state.refreshFailed ? (
        <p className={styles.alert} role="alert">
          We could not refresh campus locations. The last valid list remains visible.
        </p>
      ) : null}

      {page ? (
        <>
          <p className={styles.resultStatus} role="status" aria-live="polite">
            {listBusy
              ? "Refreshing campus locations"
              : page.total === 0
                ? "0 campus locations"
                : `${page.total} campus locations`}
          </p>

          {page.campusLocations.length === 0 ? (
            <section className={styles.emptyState} aria-labelledby="campus-location-empty-heading">
              <h3 id="campus-location-empty-heading">
                {filtered ? "No campus locations match these filters" : "No campus locations yet"}
              </h3>
              <p>
                {filtered
                  ? "Change or reset the filters to see other campus locations."
                  : "Create the first campus location above."}
              </p>
              {filtered ? (
                <button type="button" onClick={resetFilters} disabled={writeBusy}>
                  Reset campus location filters
                </button>
              ) : null}
            </section>
          ) : (
            <ul className={styles.resultList} aria-label="Campus location results">
              {page.campusLocations.map((record) => {
                const isEditing = editor?.recordId === record.id;
                const locationLabel = isEditing
                  ? editor.originalLocationName
                  : record.locationName;
                const campusLabel = isEditing
                  ? editor.originalCampusName
                  : record.campusName;
                return (
                  <li key={record.id}>
                    <article className={styles.card}>
                      <header className={styles.cardHeading}>
                        <div>
                          <h3
                            ref={(node) => setRecordHeading(record.id, node)}
                            tabIndex={-1}
                          >
                            {record.locationName}
                          </h3>
                          <span
                            className={`${styles.statusBadge} ${
                              record.isActive ? styles.activeBadge : styles.inactiveBadge
                            }`}
                          >
                            {record.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {!isEditing ? (
                          <button
                            type="button"
                            disabled={writeBusy}
                            onClick={(event) => openEditor(record, event.currentTarget)}
                          >
                            Edit campus location {record.locationName}
                          </button>
                        ) : null}
                      </header>
                      <p className={styles.description}>
                        {record.description ?? "No description provided"}
                      </p>
                      <dl className={styles.recordMeta}>
                        <div>
                          <dt>Campus</dt>
                          <dd>{record.campusName}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>
                            <time dateTime={record.createdAt}>
                              {dateFormatter.format(new Date(record.createdAt))}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>Last updated</dt>
                          <dd>
                            <time dateTime={record.updatedAt}>
                              {dateFormatter.format(new Date(record.updatedAt))}
                            </time>
                          </dd>
                        </div>
                      </dl>

                      {isEditing && editor ? (
                        <form
                          className={styles.editor}
                          aria-label={`Edit campus location ${locationLabel}`}
                          noValidate
                          onSubmit={saveEditor}
                        >
                          <h4 ref={editorHeadingRef} tabIndex={-1}>
                            Edit {locationLabel} on {campusLabel}
                          </h4>
                          <div className={styles.formGrid}>
                            <div className={styles.field}>
                              <label htmlFor={`campus-location-edit-campus-name-${record.id}`}>
                                Campus name
                              </label>
                              <input
                                id={`campus-location-edit-campus-name-${record.id}`}
                                value={editor.campusName}
                                maxLength={80}
                                disabled={writeBusy}
                                aria-invalid={editorErrors.campusName ? "true" : undefined}
                                aria-describedby={
                                  editorErrors.campusName
                                    ? `campus-location-edit-campus-name-error-${record.id}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  setEditor({ ...editor, campusName: event.target.value })
                                }
                              />
                              {editorErrors.campusName ? (
                                <p
                                  id={`campus-location-edit-campus-name-error-${record.id}`}
                                  className={styles.fieldError}
                                >
                                  {editorErrors.campusName}
                                </p>
                              ) : null}
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`campus-location-edit-location-name-${record.id}`}>
                                Location name
                              </label>
                              <input
                                id={`campus-location-edit-location-name-${record.id}`}
                                value={editor.locationName}
                                maxLength={120}
                                disabled={writeBusy}
                                aria-invalid={editorErrors.locationName ? "true" : undefined}
                                aria-describedby={
                                  editorErrors.locationName
                                    ? `campus-location-edit-location-name-error-${record.id}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  setEditor({ ...editor, locationName: event.target.value })
                                }
                              />
                              {editorErrors.locationName ? (
                                <p
                                  id={`campus-location-edit-location-name-error-${record.id}`}
                                  className={styles.fieldError}
                                >
                                  {editorErrors.locationName}
                                </p>
                              ) : null}
                            </div>
                            <div className={`${styles.field} ${styles.fullField}`}>
                              <label htmlFor={`campus-location-edit-description-${record.id}`}>
                                Campus location description
                              </label>
                              <textarea
                                id={`campus-location-edit-description-${record.id}`}
                                value={editor.description}
                                maxLength={300}
                                rows={3}
                                disabled={writeBusy}
                                aria-invalid={
                                  editorErrors.description ? "true" : undefined
                                }
                                aria-describedby={
                                  editorErrors.description
                                    ? `campus-location-edit-description-error-${record.id}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  setEditor({
                                    ...editor,
                                    description: event.target.value,
                                  })
                                }
                              />
                              {editorErrors.description ? (
                                <p
                                  id={`campus-location-edit-description-error-${record.id}`}
                                  className={styles.fieldError}
                                >
                                  {editorErrors.description}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {editorErrors.form ? (
                            <p className={styles.alert} role="alert">
                              {editorErrors.form}
                            </p>
                          ) : null}

                          {confirmingStateChange ? (
                            <section
                              className={styles.confirmation}
                              aria-labelledby={`campus-location-state-heading-${record.id}`}
                            >
                              <h5 id={`campus-location-state-heading-${record.id}`}>
                                Confirm campus location status change
                              </h5>
                              <p>
                                {editor.desiredActive
                                  ? `Restore ${locationLabel} on ${campusLabel}? It will be available for new reports again.`
                                  : `Deactivate ${locationLabel} on ${campusLabel}? It will no longer be available for new reports, while existing report references remain unchanged.`}
                              </p>
                              <div className={styles.secondaryActions}>
                                <button
                                  type="button"
                                  disabled={writeBusy}
                                  onClick={confirmStateChange}
                                >
                                  {editor.desiredActive
                                    ? `Confirm restoration of ${locationLabel}`
                                    : `Confirm deactivation of ${locationLabel}`}
                                </button>
                                <button
                                  type="button"
                                  disabled={writeBusy}
                                  onClick={cancelStateChange}
                                >
                                  Cancel status change
                                </button>
                              </div>
                            </section>
                          ) : null}

                          <div className={styles.editorActions}>
                            <button
                              type="submit"
                              disabled={writeBusy || editor.conflict}
                            >
                              {writeBusy ? "Saving campus location" : `Save campus location ${locationLabel}`}
                            </button>
                            {!confirmingStateChange ? (
                              <button
                                type="button"
                                disabled={writeBusy || editor.conflict}
                                onClick={() => askForStateChange(!record.isActive)}
                              >
                                {record.isActive
                                  ? `Deactivate campus location ${locationLabel}`
                                  : `Restore campus location ${locationLabel}`}
                              </button>
                            ) : null}
                            {editor.conflict ? (
                              <button type="button" onClick={() => void reloadLatest()}>
                                Reload latest campus location {locationLabel}
                              </button>
                            ) : null}
                            <button type="button" disabled={writeBusy} onClick={closeEditor}>
                              Cancel editing {locationLabel}
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}

          <ReferenceDataPagination
            resourceLabel="campus locations"
            page={page.page}
            totalPages={page.totalPages}
            total={page.total}
            isBusy={writeBusy || listBusy}
            onPageChange={changePage}
          />
        </>
      ) : null}
    </section>
  );
}
