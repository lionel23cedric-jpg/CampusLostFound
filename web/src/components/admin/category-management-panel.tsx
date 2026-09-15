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
  createAdministratorCategory,
  listAdministratorCategories,
  updateAdministratorCategory,
} from "@/lib/admin/reference-data-browser-client";
import {
  createAdminCategorySchema,
  referenceDataListQuerySchema,
  updateAdminCategorySchema,
  type AdminCategory,
  type AdminCategoryPage,
  type ReferenceDataListQuery,
  type UpdateAdminCategoryInput,
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

type CategoryListState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      page: AdminCategoryPage;
      isRefreshing: boolean;
      refreshFailed: boolean;
    }
  | { status: "accessChanged" };

type CategoryEditor = {
  recordId: string;
  updatedAt: string;
  name: string;
  description: string;
  desiredActive: boolean;
  originalName: string;
  originalDescription: string;
  originalActive: boolean;
  conflict: boolean;
};

type FormErrors = {
  name?: string;
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

function createErrors(fields: { name: string; description: string }): FormErrors {
  const parsed = createAdminCategorySchema.safeParse(fields);
  if (parsed.success) return {};
  const flattened = parsed.error.flatten();
  return {
    name: flattened.fieldErrors.name?.length
      ? "Enter a category name between 2 and 80 valid characters."
      : undefined,
    description: flattened.fieldErrors.description?.length
      ? "Enter no more than 300 valid description characters."
      : undefined,
    form: flattened.formErrors[0],
  };
}

function editorFrom(record: AdminCategory): CategoryEditor {
  return {
    recordId: record.id,
    updatedAt: record.updatedAt,
    name: record.name,
    description: record.description ?? "",
    desiredActive: record.isActive,
    originalName: record.name,
    originalDescription: record.description ?? "",
    originalActive: record.isActive,
    conflict: false,
  };
}

export function CategoryManagementPanel(): React.JSX.Element {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [state, setState] = useState<CategoryListState>({ status: "loading" });
  const [query, setQuery] = useState<ReferenceDataListQuery>(DEFAULT_QUERY);
  const [searchDraft, setSearchDraft] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createFormErrors, setCreateFormErrors] = useState<FormErrors>({});
  const [editor, setEditor] = useState<CategoryEditor | null>(null);
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

  const loadCategories = useCallback(
    async (
      nextQuery: ReferenceDataListQuery,
      mode: "initial" | "refresh",
    ): Promise<AdminCategoryPage | null> => {
      // Abort the previous list request and ignore stale completions so a slow
      // search cannot replace the results from a newer filter.
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
        const page = await listAdministratorCategories(
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
          setFilterError("Check the category filters and try again.");
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
      void loadCategories(DEFAULT_QUERY, "initial");
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
  }, [loadCategories]);

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
    void loadCategories(parsed.data, "refresh");
  }

  function changeStatus(status: ReferenceDataStatus) {
    void loadCategories({ ...query, status, page: 1 }, "refresh");
  }

  function resetFilters() {
    setSearchDraft("");
    setFilterError(null);
    void loadCategories(DEFAULT_QUERY, "refresh");
  }

  function changePage(page: number) {
    void loadCategories({ ...query, page }, "refresh");
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationPending.current) return;

    const fields = { name: createName, description: createDescription };
    const parsed = createAdminCategorySchema.safeParse(fields);
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
      const created = await createAdministratorCategory(
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
      setCreateName("");
      setCreateDescription("");
      setSearchDraft("");
      setMutationNotice({
        kind: "status",
        message: `Category ${created.name} created`,
      });
      focusNotice();
      void loadCategories(DEFAULT_QUERY, "refresh");
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
          ? "A category with that name already exists. Choose a unique name."
          : error instanceof BrowserReferenceDataError &&
              error.code === "INVALID_REFERENCE_DATA_REQUEST"
            ? "Check the category values and try again."
            : "Category management is temporarily unavailable. Try again.";
      setCreateFormErrors({ form: message });
    }
  }

  function openEditor(record: AdminCategory, trigger: HTMLButtonElement) {
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

  function updateVisibleRecord(updated: AdminCategory) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            page: {
              ...current.page,
              categories: current.page.categories.map((record) =>
                record.id === updated.id ? updated : record,
              ),
            },
          }
        : current,
    );
  }

  async function submitUpdate(
    input: UpdateAdminCategoryInput,
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
      const updated = await updateAdministratorCategory(
        targetId,
        input,
        controller.signal,
      );
      if (updated.id !== targetId) throw new Error("Category target mismatch");
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
            ? `Category ${updated.name} deactivated`
            : kind === "restore"
              ? `Category ${updated.name} restored`
              : `Category ${updated.name} updated`,
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
        await loadCategories(activeQuery.current, "refresh");
        if (mounted.current) {
          setMutationNotice({
            kind: "status",
            message:
              "That category is no longer available. The current list has been refreshed.",
          });
          focusNotice();
        }
        return;
      }
      if (
        error instanceof BrowserReferenceDataError &&
        error.code === "REFERENCE_DATA_STATE_CONFLICT"
      ) {
        // Keep the administrator's draft visible, but require an explicit reload
        // of the current database version before another save is attempted.
        setEditor((current) =>
          current?.recordId === targetId
            ? { ...current, conflict: true }
            : current,
        );
        setEditorErrors({
          form:
            "This category changed after you opened it. Reload the latest version before saving again.",
        });
        return;
      }
      setEditorErrors({
        form:
          error instanceof BrowserReferenceDataError &&
          error.code === "REFERENCE_DATA_DUPLICATE"
            ? "A category with that name already exists. Choose a unique name."
            : error instanceof BrowserReferenceDataError &&
                error.code === "INVALID_REFERENCE_DATA_REQUEST"
              ? "Check the category values and try again."
              : "Category management is temporarily unavailable. Try again.",
      });
    }
  }

  function saveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.conflict || mutationPending.current) return;

    const raw: Record<string, unknown> = { updatedAt: editor.updatedAt };
    if (editor.name !== editor.originalName) raw.name = editor.name;
    if (editor.description !== editor.originalDescription) {
      raw.description = editor.description;
    }
    const parsed = updateAdminCategorySchema.safeParse(raw);
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setEditorErrors({
        name: flattened.fieldErrors.name?.length
          ? "Enter a category name between 2 and 80 valid characters."
          : undefined,
        description: flattened.fieldErrors.description?.length
          ? "Enter no more than 300 valid description characters."
          : undefined,
        form:
          flattened.formErrors.length > 0
            ? "Change at least one category value before saving."
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
    const parsed = updateAdminCategorySchema.safeParse({
      updatedAt: editor.updatedAt,
      isActive: editor.desiredActive,
    });
    if (!parsed.success) {
      setEditorErrors({ form: "Check the category values and try again." });
      return;
    }
    // Reference data is soft-deactivated, never deleted, so reports that already
    // refer to this category retain their historical meaning.
    void submitUpdate(
      parsed.data,
      editor.desiredActive ? "restore" : "deactivate",
    );
  }

  async function reloadLatest() {
    if (!editor || mutationPending.current) return;
    const targetId = editor.recordId;
    const latestPage = await loadCategories(activeQuery.current, "refresh");
    if (!latestPage || !mounted.current) return;
    const latest = latestPage.categories.find((record) => record.id === targetId);
    if (!latest) {
      setEditor(null);
      setConfirmingStateChange(false);
      setMutationNotice({
        kind: "status",
        message: "That category is no longer available. The current list has been refreshed.",
      });
      focusNotice();
      return;
    }
    setEditor(editorFrom(latest));
    setEditorErrors({});
    setConfirmingStateChange(false);
    setMutationNotice({
      kind: "status",
      message: `Latest category ${latest.name} loaded. Review it before saving.`,
    });
  }

  function setRecordHeading(id: string, node: HTMLHeadingElement | null) {
    if (node) recordHeadings.current.set(id, node);
    else recordHeadings.current.delete(id);
  }

  if (state.status === "accessChanged") {
    return (
      <section className={styles.statePanel} aria-labelledby="category-access-changed">
        <h2 id="category-access-changed">Administrator access changed</h2>
        <p>Your account no longer has access to category management.</p>
      </section>
    );
  }

  const page = state.status === "ready" ? state.page : null;
  const listBusy = state.status === "ready" && state.isRefreshing;
  const writeBusy = mutationStatus === "pending";
  const filtered = query.q !== undefined || query.status !== "all";

  return (
    <section className={styles.resourcePanel} aria-labelledby="category-management-heading">
      <header className={styles.resourceHeading}>
        <div>
          <h2 id="category-management-heading">Categories</h2>
          <p>Manage the category choices available for new lost and found reports.</p>
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

      <section className={styles.createSection} aria-labelledby="create-category-heading">
        <div className={styles.sectionCopy}>
          <h3 id="create-category-heading">Create category</h3>
          <p>Use a short, distinct name that members can recognise.</p>
        </div>
        <form
          className={styles.formGrid}
          aria-label="Create category"
          noValidate
          onSubmit={(event) => void createCategory(event)}
        >
          <div className={styles.field}>
            <label htmlFor="category-create-name">Category name</label>
            <input
              id="category-create-name"
              value={createName}
              maxLength={80}
              disabled={writeBusy}
              aria-invalid={createFormErrors.name ? "true" : undefined}
              aria-describedby={
                createFormErrors.name ? "category-create-name-error" : undefined
              }
              onChange={(event) => setCreateName(event.target.value)}
            />
            {createFormErrors.name ? (
              <p id="category-create-name-error" className={styles.fieldError}>
                {createFormErrors.name}
              </p>
            ) : null}
          </div>
          <div className={`${styles.field} ${styles.fullField}`}>
            <label htmlFor="category-create-description">Category description</label>
            <textarea
              id="category-create-description"
              value={createDescription}
              maxLength={300}
              rows={3}
              disabled={writeBusy}
              aria-invalid={createFormErrors.description ? "true" : undefined}
              aria-describedby={
                createFormErrors.description
                  ? "category-create-description-error"
                  : undefined
              }
              onChange={(event) => setCreateDescription(event.target.value)}
            />
            {createFormErrors.description ? (
              <p
                id="category-create-description-error"
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
              {writeBusy ? "Creating category" : "Create category"}
            </button>
          </div>
        </form>
      </section>

      <ReferenceDataFilters
        resourceLabel="categories"
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
          Loading categories
        </p>
      ) : null}

      {state.status === "error" ? (
        <section className={styles.statePanel} aria-labelledby="category-list-error">
          <h3 id="category-list-error">Category management unavailable</h3>
          <p>We could not load categories. Try again.</p>
          <button
            type="button"
            onClick={() => void loadCategories(activeQuery.current, "initial")}
          >
            Retry categories
          </button>
        </section>
      ) : null}

      {state.status === "ready" && state.refreshFailed ? (
        <p className={styles.alert} role="alert">
          We could not refresh categories. The last valid list remains visible.
        </p>
      ) : null}

      {page ? (
        <>
          <p className={styles.resultStatus} role="status" aria-live="polite">
            {listBusy
              ? "Refreshing categories"
              : page.total === 0
                ? "0 categories"
                : `${page.total} categories`}
          </p>

          {page.categories.length === 0 ? (
            <section className={styles.emptyState} aria-labelledby="category-empty-heading">
              <h3 id="category-empty-heading">
                {filtered ? "No categories match these filters" : "No categories yet"}
              </h3>
              <p>
                {filtered
                  ? "Change or reset the filters to see other categories."
                  : "Create the first category above."}
              </p>
              {filtered ? (
                <button type="button" onClick={resetFilters} disabled={writeBusy}>
                  Reset category filters
                </button>
              ) : null}
            </section>
          ) : (
            <ul className={styles.resultList} aria-label="Category results">
              {page.categories.map((record) => {
                const isEditing = editor?.recordId === record.id;
                const label = isEditing ? editor.originalName : record.name;
                return (
                  <li key={record.id}>
                    <article className={styles.card}>
                      <header className={styles.cardHeading}>
                        <div>
                          <h3
                            ref={(node) => setRecordHeading(record.id, node)}
                            tabIndex={-1}
                          >
                            {record.name}
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
                            Edit category {record.name}
                          </button>
                        ) : null}
                      </header>
                      <p className={styles.description}>
                        {record.description ?? "No description provided"}
                      </p>
                      <dl className={styles.recordMeta}>
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
                          aria-label={`Edit category ${label}`}
                          noValidate
                          onSubmit={saveEditor}
                        >
                          <h4 ref={editorHeadingRef} tabIndex={-1}>
                            Edit {label}
                          </h4>
                          <div className={styles.formGrid}>
                            <div className={styles.field}>
                              <label htmlFor={`category-edit-name-${record.id}`}>
                                Category name
                              </label>
                              <input
                                id={`category-edit-name-${record.id}`}
                                value={editor.name}
                                maxLength={80}
                                disabled={writeBusy}
                                aria-invalid={editorErrors.name ? "true" : undefined}
                                aria-describedby={
                                  editorErrors.name
                                    ? `category-edit-name-error-${record.id}`
                                    : undefined
                                }
                                onChange={(event) =>
                                  setEditor({ ...editor, name: event.target.value })
                                }
                              />
                              {editorErrors.name ? (
                                <p
                                  id={`category-edit-name-error-${record.id}`}
                                  className={styles.fieldError}
                                >
                                  {editorErrors.name}
                                </p>
                              ) : null}
                            </div>
                            <div className={`${styles.field} ${styles.fullField}`}>
                              <label htmlFor={`category-edit-description-${record.id}`}>
                                Category description
                              </label>
                              <textarea
                                id={`category-edit-description-${record.id}`}
                                value={editor.description}
                                maxLength={300}
                                rows={3}
                                disabled={writeBusy}
                                aria-invalid={
                                  editorErrors.description ? "true" : undefined
                                }
                                aria-describedby={
                                  editorErrors.description
                                    ? `category-edit-description-error-${record.id}`
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
                                  id={`category-edit-description-error-${record.id}`}
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
                              aria-labelledby={`category-state-heading-${record.id}`}
                            >
                              <h5 id={`category-state-heading-${record.id}`}>
                                Confirm category status change
                              </h5>
                              <p>
                                {editor.desiredActive
                                  ? `Restore ${label}? It will be available for new reports again.`
                                  : `Deactivate ${label}? It will no longer be available for new reports, while existing report references remain unchanged.`}
                              </p>
                              <div className={styles.secondaryActions}>
                                <button
                                  type="button"
                                  disabled={writeBusy}
                                  onClick={confirmStateChange}
                                >
                                  {editor.desiredActive
                                    ? `Confirm restoration of ${label}`
                                    : `Confirm deactivation of ${label}`}
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
                              {writeBusy ? "Saving category" : `Save category ${label}`}
                            </button>
                            {!confirmingStateChange ? (
                              <button
                                type="button"
                                disabled={writeBusy || editor.conflict}
                                onClick={() => askForStateChange(!record.isActive)}
                              >
                                {record.isActive
                                  ? `Deactivate category ${label}`
                                  : `Restore category ${label}`}
                              </button>
                            ) : null}
                            {editor.conflict ? (
                              <button type="button" onClick={() => void reloadLatest()}>
                                Reload latest category {label}
                              </button>
                            ) : null}
                            <button type="button" disabled={writeBusy} onClick={closeEditor}>
                              Cancel editing {label}
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
            resourceLabel="categories"
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
