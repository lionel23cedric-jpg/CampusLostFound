"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  BrowserReportError,
  submitReport,
  type CreatedReport,
  type ReportCampusLocation,
  type ReportCategory,
} from "@/lib/reports/browser-client";
import {
  createInitialReportFormValues,
  validateReportForm,
  type ReportFormErrors,
  type ReportFormValues,
} from "@/lib/reports/form-validation";

import styles from "./report-form.module.css";

const GENERIC_ERROR = "We could not complete that request. Please try again.";
const NETWORK_ERROR = "We could not reach the service. Please try again.";

const PHOTO_LIMIT = 5;
const FEATURE_LIMIT = 10;
const QUESTION_LIMIT = 5;

export type ReportFormProps = {
  categories: ReportCategory[];
  campusLocations: ReportCampusLocation[];
  onSuccess: (report: CreatedReport) => void;
  onAuthenticationRequired: () => void;
  onPermissionLost: () => void;
  onReferenceUnavailable: () => Promise<void>;
};

type FocusRequest = { token: number; targetId?: string };

const SERVER_FIELD_TARGETS = new Set([
  "title",
  "publicDescription",
  "categoryId",
  "campusLocationId",
  "occurredAt",
  "colors",
  "tags",
]);

const SERVER_GROUP_TARGETS: Record<string, string> = {
  photoUrls: "photoUrls.0",
  privacySettings: "privacySettings.showPhoto",
  privateVerification: "privateVerification.distinguishingFeatures.0",
};

function normaliseServerFields(fields: Record<string, string[]>) {
  const errors: ReportFormErrors = {};
  const groups: Record<string, string> = {};

  for (const [field, messages] of Object.entries(fields)) {
    const target =
      SERVER_GROUP_TARGETS[field] ??
      (SERVER_FIELD_TARGETS.has(field) ? field : "_form");
    (errors[target] ??= []).push(...messages);
    if (SERVER_GROUP_TARGETS[field]) groups[target] = field;
  }

  return { errors, groups };
}

function messagesFor(
  errors: ReportFormErrors,
  path: string,
  aliases: string[] = [],
) {
  return [path, ...aliases].flatMap((key) => errors[key] ?? []);
}

function describedBy(...ids: Array<string | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function FieldError({ id, messages }: { id: string; messages: string[] }) {
  if (!messages.length) return null;

  return (
    <p className={styles.fieldError} id={id}>
      {messages.join(". ")}
    </p>
  );
}

export function ReportForm({
  categories,
  campusLocations,
  onSuccess,
  onAuthenticationRequired,
  onPermissionLost,
  onReferenceUnavailable,
}: ReportFormProps) {
  const idPrefix = useId();
  const [values, setValues] = useState(() => createInitialReportFormValues());
  const [errors, setErrors] = useState<ReportFormErrors>({});
  const [formMessage, setFormMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const focusToken = useRef(0);
  const nextPhotoId = useRef(1);
  const nextFeatureId = useRef(1);
  const nextQuestionId = useRef(1);
  const mappedServerGroups = useRef<Record<string, string>>({});

  const inputId = (path: string) => `${idPrefix}-${path.replaceAll(".", "-")}`;
  const errorId = (path: string) => `${inputId(path)}-error`;

  function targetIdForPath(path: string) {
    if (path.startsWith("photoUrls")) {
      const index = Number(path.split(".")[1] ?? 0);
      return inputId(values.photoUrls[index]?.id ?? values.photoUrls[0].id);
    }

    if (path.startsWith("privateVerification.distinguishingFeatures")) {
      const index = Number(path.split(".")[2] ?? 0);
      const row =
        values.privateVerification.distinguishingFeatures[index] ??
        values.privateVerification.distinguishingFeatures[0];
      return inputId(row.id);
    }

    if (path.startsWith("privateVerification.verificationQuestions")) {
      const parts = path.split(".");
      const index = Number(parts[2] ?? 0);
      const field = parts[3] === "expectedAnswer" ? "answer" : "question";
      const row =
        values.privateVerification.verificationQuestions[index] ??
        values.privateVerification.verificationQuestions[0];
      return inputId(`${row.id}-${field}`);
    }

    if (path.startsWith("colors")) return inputId("colors");
    if (path.startsWith("tags")) return inputId("tags");
    if (path.startsWith("privacySettings.")) return inputId(path);
    return inputId(path);
  }

  function publishFailure(nextErrors: ReportFormErrors, message?: string) {
    const firstPath = Object.keys(nextErrors)[0];
    setErrors(nextErrors);
    setFormMessage(message);
    setFocusRequest({
      token: ++focusToken.current,
      targetId:
        firstPath && firstPath !== "_form"
          ? targetIdForPath(firstPath)
          : undefined,
    });
  }

  useEffect(() => {
    if (!focusRequest) return;

    summaryRef.current?.focus();
    if (!focusRequest.targetId) return;

    const timer = window.setTimeout(() => {
      document.getElementById(focusRequest.targetId ?? "")?.focus();
    }, 75);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  function clearErrorsFor(...paths: string[]) {
    const mappedTargets = Object.entries(mappedServerGroups.current)
      .filter(([, group]) =>
        paths.some((path) => path === group || path.startsWith(`${group}.`)),
      )
      .map(([target]) => target);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            !mappedTargets.includes(key) &&
            !paths.some(
              (path) => key === path || key.startsWith(`${path}.`),
            ),
        ),
      ),
    );
    mappedServerGroups.current = Object.fromEntries(
      Object.entries(mappedServerGroups.current).filter(
        ([target]) => !mappedTargets.includes(target),
      ),
    );
    setFormMessage(undefined);
  }

  function updateValue<K extends keyof ReportFormValues>(
    field: K,
    value: ReportFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    clearErrorsFor(field);
  }

  function updatePhoto(id: string, value: string) {
    const index = values.photoUrls.findIndex((row) => row.id === id);
    setValues((current) => ({
      ...current,
      photoUrls: current.photoUrls.map((row) =>
        row.id === id ? { ...row, value } : row,
      ),
    }));
    clearErrorsFor(`photoUrls.${index}`);
  }

  function updateFeature(id: string, value: string) {
    const rows = values.privateVerification.distinguishingFeatures;
    const index = rows.findIndex((row) => row.id === id);
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        distinguishingFeatures:
          current.privateVerification.distinguishingFeatures.map((row) =>
            row.id === id ? { ...row, value } : row,
          ),
      },
    }));
    clearErrorsFor(`privateVerification.distinguishingFeatures.${index}`);
  }

  function updateQuestion(
    id: string,
    field: "question" | "expectedAnswer",
    value: string,
  ) {
    const rows = values.privateVerification.verificationQuestions;
    const index = rows.findIndex((row) => row.id === id);
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        verificationQuestions:
          current.privateVerification.verificationQuestions.map((row) =>
            row.id === id ? { ...row, [field]: value } : row,
          ),
      },
    }));
    clearErrorsFor(
      `privateVerification.verificationQuestions.${index}.${field}`,
    );
  }

  function updatePrivateText(
    field: "exactLocationDetails" | "serialNumber" | "privateNotes",
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        [field]: value,
      },
    }));
    clearErrorsFor(`privateVerification.${field}`);
  }

  function addPhoto() {
    if (values.photoUrls.length >= PHOTO_LIMIT) return;
    setValues((current) => ({
      ...current,
      photoUrls: [
        ...current.photoUrls,
        { id: `photo-${nextPhotoId.current++}`, value: "" },
      ],
    }));
  }

  function addFeature() {
    if (
      values.privateVerification.distinguishingFeatures.length >= FEATURE_LIMIT
    ) {
      return;
    }
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        distinguishingFeatures: [
          ...current.privateVerification.distinguishingFeatures,
          { id: `feature-${nextFeatureId.current++}`, value: "" },
        ],
      },
    }));
  }

  function addQuestion() {
    if (
      values.privateVerification.verificationQuestions.length >= QUESTION_LIMIT
    ) {
      return;
    }
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        verificationQuestions: [
          ...current.privateVerification.verificationQuestions,
          {
            id: `question-${nextQuestionId.current++}`,
            question: "",
            expectedAnswer: "",
          },
        ],
      },
    }));
  }

  function removePhoto(id: string) {
    if (values.photoUrls.length <= 1) return;
    setValues((current) => ({
      ...current,
      photoUrls: current.photoUrls.filter((row) => row.id !== id),
    }));
    clearErrorsFor("photoUrls");
  }

  function removeFeature(id: string) {
    if (values.privateVerification.distinguishingFeatures.length <= 1) return;
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        distinguishingFeatures:
          current.privateVerification.distinguishingFeatures.filter(
            (row) => row.id !== id,
          ),
      },
    }));
    clearErrorsFor("privateVerification.distinguishingFeatures");
  }

  function removeQuestion(id: string) {
    if (values.privateVerification.verificationQuestions.length <= 1) return;
    setValues((current) => ({
      ...current,
      privateVerification: {
        ...current.privateVerification,
        verificationQuestions:
          current.privateVerification.verificationQuestions.filter(
            (row) => row.id !== id,
          ),
      },
    }));
    clearErrorsFor("privateVerification.verificationQuestions");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;

    const validation = validateReportForm(values);
    if (!validation.success) {
      mappedServerGroups.current = {};
      publishFailure(validation.errors);
      return;
    }

    setErrors({});
    setFormMessage(undefined);
    mappedServerGroups.current = {};
    submitLock.current = true;
    setIsPending(true);

    try {
      const report = await submitReport(validation.data);
      onSuccess(report);
    } catch (error) {
      if (error instanceof BrowserReportError) {
        if (error.code === "AUTHENTICATION_REQUIRED") {
          onAuthenticationRequired();
        } else if (error.code === "REPORT_CREATION_FORBIDDEN") {
          onPermissionLost();
        } else if (error.code === "CATEGORY_UNAVAILABLE") {
          publishFailure({ categoryId: [error.message] });
          await onReferenceUnavailable();
        } else if (error.code === "CAMPUS_LOCATION_UNAVAILABLE") {
          publishFailure({ campusLocationId: [error.message] });
          await onReferenceUnavailable();
        } else if (error.status === 400 && error.fields) {
          const normalised = normaliseServerFields(error.fields);
          mappedServerGroups.current = normalised.groups;
          publishFailure(normalised.errors, error.message);
        } else if (error.code === "NETWORK_ERROR") {
          publishFailure({}, NETWORK_ERROR);
        } else {
          publishFailure({}, GENERIC_ERROR);
        }
      } else {
        publishFailure({}, GENERIC_ERROR);
      }
    } finally {
      submitLock.current = false;
      setIsPending(false);
    }
  }

  const summaryEntries = Object.entries(errors).flatMap(([path, messages]) =>
    messages.map((message) => ({ path, message })),
  );

  const titleErrors = messagesFor(errors, "title");
  const descriptionErrors = messagesFor(errors, "publicDescription");
  const categoryErrors = messagesFor(errors, "categoryId");
  const locationErrors = messagesFor(errors, "campusLocationId");
  const occurredErrors = messagesFor(errors, "occurredAt");
  const colorErrors = messagesFor(errors, "colors", ["colors.0"]);
  const tagErrors = messagesFor(errors, "tags", ["tags.0"]);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {(formMessage || summaryEntries.length > 0) && (
        <div
          className={styles.errorSummary}
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
        >
          <h2>Please review this report</h2>
          {formMessage && <p>{formMessage}</p>}
          {summaryEntries.length > 0 && (
            <ul>
              {summaryEntries.map(({ path, message }, index) => (
                <li key={`${path}-${index}`}>
                  {path === "_form" ? (
                    message
                  ) : (
                    <a href={`#${targetIdForPath(path)}`}>{message}</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className={styles.requiredNote}>
        All fields are required unless marked optional.
      </p>

      <fieldset className={styles.section} disabled={isPending}>
        <legend>Basic information</legend>
        <p className={styles.sectionIntro}>
          Describe what happened using details that are safe to share with
          other campus members.
        </p>

        <fieldset className={styles.reportTypeGroup}>
          <legend className={styles.label}>Report type</legend>
          <div className={styles.choiceRow}>
            {(["lost", "found"] as const).map((reportType) => {
              const id = inputId(`reportType-${reportType}`);
              return (
                <label className={styles.radioChoice} htmlFor={id} key={reportType}>
                  <input
                    id={id}
                    name="reportType"
                    type="radio"
                    value={reportType}
                    checked={values.reportType === reportType}
                    onChange={() => updateValue("reportType", reportType)}
                  />
                  {reportType === "lost" ? "Lost item" : "Found item"}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label htmlFor={inputId("title")}>Title</label>
          <input
            id={inputId("title")}
            name="title"
            value={values.title}
            onChange={(event) => updateValue("title", event.target.value)}
            maxLength={120}
            required
            aria-invalid={Boolean(titleErrors.length)}
            aria-describedby={
              titleErrors.length ? errorId("title") : undefined
            }
          />
          <FieldError id={errorId("title")} messages={titleErrors} />
        </div>

        <div className={styles.field}>
          <label htmlFor={inputId("publicDescription")}>Public description</label>
          <textarea
            id={inputId("publicDescription")}
            name="publicDescription"
            value={values.publicDescription}
            onChange={(event) =>
              updateValue("publicDescription", event.target.value)
            }
            maxLength={2000}
            rows={5}
            required
            aria-invalid={Boolean(descriptionErrors.length)}
            aria-describedby={describedBy(
              inputId("publicDescription-help"),
              descriptionErrors.length
                ? errorId("publicDescription")
                : undefined,
            )}
          />
          <p className={styles.help} id={inputId("publicDescription-help")}>
            Do not include contact details, serial numbers or ownership answers.
          </p>
          <FieldError
            id={errorId("publicDescription")}
            messages={descriptionErrors}
          />
        </div>

        <div className={styles.shortGrid}>
          <div className={styles.field}>
            <label htmlFor={inputId("categoryId")}>Category</label>
            <select
              id={inputId("categoryId")}
              name="categoryId"
              value={values.categoryId}
              onChange={(event) => updateValue("categoryId", event.target.value)}
              required
              aria-invalid={Boolean(categoryErrors.length)}
              aria-describedby={
                categoryErrors.length ? errorId("categoryId") : undefined
              }
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError id={errorId("categoryId")} messages={categoryErrors} />
          </div>

          <div className={styles.field}>
            <label htmlFor={inputId("campusLocationId")}>Campus location</label>
            <select
              id={inputId("campusLocationId")}
              name="campusLocationId"
              value={values.campusLocationId}
              onChange={(event) =>
                updateValue("campusLocationId", event.target.value)
              }
              required
              aria-invalid={Boolean(locationErrors.length)}
              aria-describedby={
                locationErrors.length
                  ? errorId("campusLocationId")
                  : undefined
              }
            >
              <option value="">Select a campus location</option>
              {campusLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.campusName} - {location.locationName}
                </option>
              ))}
            </select>
            <FieldError
              id={errorId("campusLocationId")}
              messages={locationErrors}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={inputId("occurredAt")}>Event date and time</label>
          <input
            id={inputId("occurredAt")}
            name="occurredAt"
            type="datetime-local"
            value={values.occurredAt}
            onChange={(event) => updateValue("occurredAt", event.target.value)}
            required
            aria-invalid={Boolean(occurredErrors.length)}
            aria-describedby={describedBy(
              inputId("occurredAt-help"),
              occurredErrors.length ? errorId("occurredAt") : undefined,
            )}
          />
          <p className={styles.help} id={inputId("occurredAt-help")}>
            Use the local date and time when the item was lost or found.
          </p>
          <FieldError id={errorId("occurredAt")} messages={occurredErrors} />
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={isPending}>
        <legend>Appearance and photos</legend>
        <p className={styles.sectionIntro}>
          Add visible details that can help other members recognise the item.
        </p>

        <div className={styles.shortGrid}>
          <div className={styles.field}>
            <label htmlFor={inputId("colors")}>Colours</label>
            <input
              id={inputId("colors")}
              name="colors"
              value={values.colors}
              onChange={(event) => updateValue("colors", event.target.value)}
              required
              aria-invalid={Boolean(colorErrors.length)}
              aria-describedby={describedBy(
                inputId("colors-help"),
                colorErrors.length ? errorId("colors") : undefined,
              )}
            />
            <p className={styles.help} id={inputId("colors-help")}>
              Enter 1-5 colours separated by commas.
            </p>
            <FieldError id={errorId("colors")} messages={colorErrors} />
          </div>

          <div className={styles.field}>
            <label htmlFor={inputId("tags")}>Tags (optional)</label>
            <input
              id={inputId("tags")}
              name="tags"
              value={values.tags}
              onChange={(event) => updateValue("tags", event.target.value)}
              aria-invalid={Boolean(tagErrors.length)}
              aria-describedby={describedBy(
                inputId("tags-help"),
                tagErrors.length ? errorId("tags") : undefined,
              )}
            />
            <p className={styles.help} id={inputId("tags-help")}>
              Enter up to 10 search tags separated by commas.
            </p>
            <FieldError id={errorId("tags")} messages={tagErrors} />
          </div>
        </div>

        <div className={styles.repeatedGroup}>
          <div>
            <h3>Photo URLs</h3>
            <p className={styles.help} id={inputId("photos-help")}>
              Add up to five HTTPS image URLs. Do not use private or temporary
              signed links.
            </p>
          </div>
          {values.photoUrls.map((row, index) => {
            const path = `photoUrls.${index}`;
            const rowErrors = messagesFor(errors, path);
            const id = inputId(row.id);
            return (
              <div className={styles.repeatRow} key={row.id}>
                <div className={styles.field}>
                  <label htmlFor={id}>Photo URL {index + 1} (optional)</label>
                  <input
                    id={id}
                    name={path}
                    type="url"
                    inputMode="url"
                    value={row.value}
                    onChange={(event) => updatePhoto(row.id, event.target.value)}
                    aria-invalid={Boolean(rowErrors.length)}
                    aria-describedby={describedBy(
                      inputId("photos-help"),
                      rowErrors.length ? errorId(path) : undefined,
                    )}
                  />
                  <FieldError id={errorId(path)} messages={rowErrors} />
                </div>
                <button
                  className={styles.removeButton}
                  type="button"
                  onClick={() => removePhoto(row.id)}
                  disabled={isPending || values.photoUrls.length === 1}
                >
                  Remove photo URL {index + 1}
                </button>
              </div>
            );
          })}
          <button
            className={styles.addButton}
            type="button"
            onClick={addPhoto}
            disabled={isPending || values.photoUrls.length >= PHOTO_LIMIT}
          >
            Add photo URL
          </button>
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={isPending}>
        <legend>Privacy settings</legend>
        <p className={styles.sectionIntro}>
          These choices affect what other members can see. Authorised staff can
          still process the complete report.
        </p>

        <div className={styles.checkList}>
          {(
            [
              ["showPhoto", "Show photos to other members"],
              ["showEventDate", "Show event date to other members"],
              [
                "showCampusLocation",
                "Show campus location to other members",
              ],
            ] as const
          ).map(([field, label]) => {
            const path = `privacySettings.${field}`;
            const fieldErrors = messagesFor(errors, path);
            return (
              <div className={styles.checkboxField} key={field}>
                <label htmlFor={inputId(path)}>
                  <input
                    id={inputId(path)}
                    name={path}
                    type="checkbox"
                    checked={values.privacySettings[field]}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        privacySettings: {
                          ...current.privacySettings,
                          [field]: event.target.checked,
                        },
                      }));
                      clearErrorsFor(path);
                    }}
                    aria-invalid={Boolean(fieldErrors.length)}
                    aria-describedby={
                      fieldErrors.length ? errorId(path) : undefined
                    }
                  />
                  <span>{label}</span>
                </label>
                <FieldError id={errorId(path)} messages={fieldErrors} />
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={`${styles.section} ${styles.privateSection}`} disabled={isPending}>
        <legend>Private ownership verification</legend>
        <p className={styles.privateNotice}>
          Only authorised staff can use this information. It is stored
          separately and is not included in public report responses.
        </p>

        <div className={styles.repeatedGroup}>
          <div>
            <h3>Distinguishing features</h3>
            <p className={styles.help} id={inputId("features-help")}>
              Describe details that the owner should know but other members
              should not see.
            </p>
          </div>
          {values.privateVerification.distinguishingFeatures.map((row, index) => {
            const path = `privateVerification.distinguishingFeatures.${index}`;
            const rowErrors = messagesFor(errors, path, [
              "privateVerification.distinguishingFeatures",
            ]);
            const id = inputId(row.id);
            return (
              <div className={styles.repeatRow} key={row.id}>
                <div className={styles.field}>
                  <label htmlFor={id}>Distinguishing feature {index + 1}</label>
                  <input
                    id={id}
                    name={path}
                    value={row.value}
                    onChange={(event) => updateFeature(row.id, event.target.value)}
                    maxLength={200}
                    required
                    aria-invalid={Boolean(rowErrors.length)}
                    aria-describedby={describedBy(
                      inputId("features-help"),
                      rowErrors.length ? errorId(path) : undefined,
                    )}
                  />
                  <FieldError id={errorId(path)} messages={rowErrors} />
                </div>
                <button
                  className={styles.removeButton}
                  type="button"
                  onClick={() => removeFeature(row.id)}
                  disabled={
                    isPending ||
                    values.privateVerification.distinguishingFeatures.length === 1
                  }
                >
                  Remove distinguishing feature {index + 1}
                </button>
              </div>
            );
          })}
          <button
            className={styles.addButton}
            type="button"
            onClick={addFeature}
            disabled={
              isPending ||
              values.privateVerification.distinguishingFeatures.length >=
                FEATURE_LIMIT
            }
          >
            Add distinguishing feature
          </button>
        </div>

        <div className={styles.shortGrid}>
          <div className={styles.field}>
            <label htmlFor={inputId("privateVerification.exactLocationDetails")}>
              Exact location details (optional)
            </label>
            <textarea
              id={inputId("privateVerification.exactLocationDetails")}
              name="privateVerification.exactLocationDetails"
              value={values.privateVerification.exactLocationDetails}
              onChange={(event) =>
                updatePrivateText("exactLocationDetails", event.target.value)
              }
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(
                errors["privateVerification.exactLocationDetails"]?.length,
              )}
              aria-describedby={
                errors["privateVerification.exactLocationDetails"]?.length
                  ? errorId("privateVerification.exactLocationDetails")
                  : undefined
              }
            />
            <FieldError
              id={errorId("privateVerification.exactLocationDetails")}
              messages={messagesFor(
                errors,
                "privateVerification.exactLocationDetails",
              )}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor={inputId("privateVerification.serialNumber")}>
              Serial number (optional)
            </label>
            <input
              id={inputId("privateVerification.serialNumber")}
              name="privateVerification.serialNumber"
              value={values.privateVerification.serialNumber}
              onChange={(event) =>
                updatePrivateText("serialNumber", event.target.value)
              }
              maxLength={200}
              aria-invalid={Boolean(
                errors["privateVerification.serialNumber"]?.length,
              )}
              aria-describedby={
                errors["privateVerification.serialNumber"]?.length
                  ? errorId("privateVerification.serialNumber")
                  : undefined
              }
            />
            <FieldError
              id={errorId("privateVerification.serialNumber")}
              messages={messagesFor(errors, "privateVerification.serialNumber")}
            />
          </div>
        </div>

        <div className={styles.repeatedGroup}>
          <div>
            <h3>Verification questions</h3>
            <p className={styles.help} id={inputId("questions-help")}>
              Ask for evidence that only the genuine owner is likely to know.
            </p>
          </div>
          {values.privateVerification.verificationQuestions.map((row, index) => {
            const questionPath =
              `privateVerification.verificationQuestions.${index}.question`;
            const answerPath =
              `privateVerification.verificationQuestions.${index}.expectedAnswer`;
            const questionErrors = messagesFor(errors, questionPath, [
              "privateVerification.verificationQuestions",
            ]);
            const answerErrors = messagesFor(errors, answerPath);
            return (
              <div className={styles.questionRow} key={row.id}>
                <div className={styles.shortGrid}>
                  <div className={styles.field}>
                    <label htmlFor={inputId(`${row.id}-question`)}>
                      Verification question {index + 1}
                    </label>
                    <input
                      id={inputId(`${row.id}-question`)}
                      name={questionPath}
                      value={row.question}
                      onChange={(event) =>
                        updateQuestion(row.id, "question", event.target.value)
                      }
                      maxLength={200}
                      required
                      aria-invalid={Boolean(questionErrors.length)}
                      aria-describedby={describedBy(
                        inputId("questions-help"),
                        questionErrors.length ? errorId(questionPath) : undefined,
                      )}
                    />
                    <FieldError
                      id={errorId(questionPath)}
                      messages={questionErrors}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={inputId(`${row.id}-answer`)}>
                      Expected answer {index + 1}
                    </label>
                    <input
                      id={inputId(`${row.id}-answer`)}
                      name={answerPath}
                      value={row.expectedAnswer}
                      onChange={(event) =>
                        updateQuestion(
                          row.id,
                          "expectedAnswer",
                          event.target.value,
                        )
                      }
                      maxLength={500}
                      required
                      aria-invalid={Boolean(answerErrors.length)}
                      aria-describedby={
                        answerErrors.length ? errorId(answerPath) : undefined
                      }
                    />
                    <FieldError id={errorId(answerPath)} messages={answerErrors} />
                  </div>
                </div>
                <button
                  className={styles.removeButton}
                  type="button"
                  onClick={() => removeQuestion(row.id)}
                  disabled={
                    isPending ||
                    values.privateVerification.verificationQuestions.length === 1
                  }
                >
                  Remove verification question {index + 1}
                </button>
              </div>
            );
          })}
          <button
            className={styles.addButton}
            type="button"
            onClick={addQuestion}
            disabled={
              isPending ||
              values.privateVerification.verificationQuestions.length >=
                QUESTION_LIMIT
            }
          >
            Add verification question
          </button>
        </div>

        <div className={styles.field}>
          <label htmlFor={inputId("privateVerification.privateNotes")}>
            Private notes (optional)
          </label>
          <textarea
            id={inputId("privateVerification.privateNotes")}
            name="privateVerification.privateNotes"
            value={values.privateVerification.privateNotes}
            onChange={(event) =>
              updatePrivateText("privateNotes", event.target.value)
            }
            maxLength={2000}
            rows={4}
            aria-invalid={Boolean(
              errors["privateVerification.privateNotes"]?.length,
            )}
            aria-describedby={
              errors["privateVerification.privateNotes"]?.length
                ? errorId("privateVerification.privateNotes")
                : undefined
            }
          />
          <FieldError
            id={errorId("privateVerification.privateNotes")}
            messages={messagesFor(errors, "privateVerification.privateNotes")}
          />
        </div>
      </fieldset>

      <div className={styles.submitRow}>
        <p>Review public and private details before submitting.</p>
        <button className={styles.submitButton} type="submit" disabled={isPending}>
          {isPending ? "Submitting report..." : "Submit report"}
        </button>
      </div>
    </form>
  );
}
