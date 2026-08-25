"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAuthError,
  getProfileSettings,
  updateProfileSettings,
} from "@/lib/auth/browser-client";
import type { PublicUser } from "@/lib/auth/public-user";
import type { EditableProfile } from "@/lib/profile/validation";
import { updateProfileSchema } from "@/lib/profile/validation";
import {
  BrowserReportError,
  getReportCampusLocations,
  type ReportCampusLocation,
} from "@/lib/reports/browser-client";

import styles from "./profile-settings.module.css";

type ProfileFormValues = Omit<EditableProfile, "updatedAt">;
type FieldErrors = Partial<Record<keyof ProfileFormValues, string[]>>;
type LoadState = "loading" | "ready" | "error";

const PROFILE_FIELD_NAMES = new Set<keyof ProfileFormValues>([
  "displayName",
  "preferredContactMethod",
  "preferredCampusLocationIds",
  "notificationSettings",
]);

const notificationOptions = [
  ["possibleMatches", "Possible match suggestions"],
  ["claimUpdates", "Ownership claim updates"],
  ["statusChanges", "Report status changes"],
  ["handoverInstructions", "Recovery handover instructions"],
] as const;

function profileValues(profile: EditableProfile): ProfileFormValues {
  return {
    displayName: profile.displayName,
    preferredContactMethod: profile.preferredContactMethod,
    preferredCampusLocationIds: [...profile.preferredCampusLocationIds],
    notificationSettings: { ...profile.notificationSettings },
  };
}

function userProfileValues(user: PublicUser): ProfileFormValues {
  return {
    displayName: user.profile.displayName,
    preferredContactMethod: user.profile.preferredContactMethod,
    preferredCampusLocationIds: [...user.profile.preferredCampusLocationIds],
    notificationSettings: { ...user.profile.notificationSettings },
  };
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safeFieldErrors(fields: Record<string, string[]> | undefined) {
  if (!fields) return {};

  return Object.fromEntries(
    Object.entries(fields).filter(([field]) =>
      PROFILE_FIELD_NAMES.has(field as keyof ProfileFormValues),
    ),
  ) as FieldErrors;
}

export function ProfileSettingsClient() {
  const router = useRouter();
  const session = useAuthSession();
  const accountId = session.user?.id;
  const accountStatus = session.user?.status;

  const [profileState, setProfileState] = useState<LoadState>("loading");
  const [locationState, setLocationState] = useState<LoadState>("loading");
  const [locations, setLocations] = useState<ReportCampusLocation[]>([]);
  const [values, setValues] = useState<ProfileFormValues | null>(null);
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [hasConflict, setHasConflict] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const profileRequest = useRef(0);
  const locationRequest = useRef(0);
  const saveRequest = useRef(0);
  const saveLock = useRef(false);
  const currentAccountId = useRef(accountId);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const locationGroupRef = useRef<HTMLFieldSetElement>(null);
  const notificationRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    if (!accountId) return;
    const requestId = ++profileRequest.current;
    setProfileState("loading");
    setMessage(undefined);
    setHasConflict(false);

    try {
      const profile = await getProfileSettings();
      if (
        requestId !== profileRequest.current ||
        currentAccountId.current !== accountId
      ) {
        return;
      }
      setValues(profileValues(profile));
      setProfileUpdatedAt(profile.updatedAt);
      setFieldErrors({});
      setProfileState("ready");
    } catch (error) {
      if (
        requestId !== profileRequest.current ||
        currentAccountId.current !== accountId
      ) {
        return;
      }
      if (error instanceof BrowserAuthError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setProfileState("error");
    }
  }, [accountId, router]);

  const loadLocations = useCallback(async () => {
    if (!accountId) return;
    const requestId = ++locationRequest.current;
    setLocationState("loading");

    try {
      const nextLocations = await getReportCampusLocations();
      if (
        requestId !== locationRequest.current ||
        currentAccountId.current !== accountId
      ) {
        return;
      }
      setLocations(nextLocations);
      setLocationState("ready");
    } catch (error) {
      if (
        requestId !== locationRequest.current ||
        currentAccountId.current !== accountId
      ) {
        return;
      }
      if (error instanceof BrowserReportError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setLocationState("error");
    }
  }, [accountId, router]);

  useEffect(() => {
    currentAccountId.current = accountId;

    if (session.status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (
      session.status !== "authenticated" ||
      !accountId ||
      accountStatus !== "active"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setValues(null);
      setProfileUpdatedAt(undefined);
      setLocations([]);
      setFieldErrors({});
      setMessage(undefined);
      setHasConflict(false);
      void loadProfile();
      void loadLocations();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      profileRequest.current += 1;
      locationRequest.current += 1;
      saveRequest.current += 1;
      saveLock.current = false;
    };
  }, [accountId, accountStatus, loadLocations, loadProfile, router, session.status]);

  function clearError(field: keyof ProfileFormValues) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setMessage(undefined);
    setHasConflict(false);
  }

  function focusFirstError(errors: FieldErrors) {
    const target = errors.displayName
      ? displayNameRef.current
      : errors.preferredContactMethod
        ? contactRef.current
        : errors.preferredCampusLocationIds
          ? locationGroupRef.current
          : errors.notificationSettings
            ? notificationRef.current
            : undefined;
    window.setTimeout(() => target?.focus(), 0);
  }

  function changeLocation(id: string, checked: boolean) {
    if (!values) return;
    if (
      checked &&
      !values.preferredCampusLocationIds.includes(id) &&
      values.preferredCampusLocationIds.length >= 5
    ) {
      setSelectionMessage("Choose up to 5 campus locations.");
      return;
    }

    setSelectionMessage("");
    setValues({
      ...values,
      preferredCampusLocationIds: checked
        ? [...values.preferredCampusLocationIds, id]
        : values.preferredCampusLocationIds.filter((value) => value !== id),
    });
    clearError("preferredCampusLocationIds");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || !profileUpdatedAt || saveLock.current || !session.user) return;

    const parsed = updateProfileSchema.safeParse({
      ...values,
      expectedUpdatedAt: profileUpdatedAt,
    });
    if (!parsed.success) {
      const errors = safeFieldErrors(parsed.error.flatten().fieldErrors);
      setFieldErrors(errors);
      setMessage("Check the highlighted settings and try again.");
      focusFirstError(errors);
      return;
    }

    const requestId = ++saveRequest.current;
    const ownerId = session.user.id;
    saveLock.current = true;
    setIsSaving(true);
    setFieldErrors({});
    setMessage(undefined);
    setHasConflict(false);

    try {
      const result = await updateProfileSettings(parsed.data);
      if (
        requestId !== saveRequest.current ||
        currentAccountId.current !== ownerId
      ) {
        return;
      }
      session.setAuthenticatedUser(result.user);
      setProfileUpdatedAt(result.profileUpdatedAt);
      setValues(userProfileValues(result.user));
      setMessage("Profile settings saved");
    } catch (error) {
      if (
        requestId !== saveRequest.current ||
        currentAccountId.current !== ownerId
      ) {
        return;
      }
      if (error instanceof BrowserAuthError) {
        if (error.status === 401) {
          router.replace("/login");
        } else if (error.code === "PROFILE_CHANGED") {
          setHasConflict(true);
          setMessage("Your profile changed in another session. Reload the latest version before saving again.");
        } else if (error.status === 400 && error.fields) {
          const errors = safeFieldErrors(error.fields);
          setFieldErrors(errors);
          setMessage("Check the highlighted settings and try again.");
          focusFirstError(errors);
        } else if (error.code === "NETWORK_ERROR") {
          setMessage("We could not reach the service. Your changes are still here; try again.");
        } else {
          setMessage("We could not save your profile. Your changes are still here; try again.");
        }
      } else {
        setMessage("We could not save your profile. Your changes are still here; try again.");
      }
    } finally {
      if (
        requestId === saveRequest.current &&
        currentAccountId.current === ownerId
      ) {
        saveLock.current = false;
        setIsSaving(false);
      }
    }
  }

  if (session.status === "unavailable") {
    return (
      <section className={styles.statePanel} aria-labelledby="profile-session-error">
        <h1 id="profile-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button type="button" onClick={() => void session.refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }

  if (session.status === "unauthenticated") {
    return <p className={styles.loading} role="status">Taking you to sign in</p>;
  }

  if (session.status === "loading" || !session.user) {
    return <p className={styles.loading} role="status">Loading profile settings</p>;
  }

  if (session.user.status !== "active") {
    return (
      <section className={styles.statePanel} aria-labelledby="profile-inactive">
        <h1 id="profile-inactive">Profile settings unavailable</h1>
        <p>This account is not active, so its profile cannot be changed.</p>
      </section>
    );
  }

  if (profileState === "loading") {
    return <p className={styles.loading} role="status">Loading profile settings</p>;
  }

  if (profileState === "error" || !values || !profileUpdatedAt) {
    return (
      <section className={styles.statePanel} aria-labelledby="profile-load-error">
        <h1 id="profile-load-error">Profile settings are temporarily unavailable</h1>
        <p>Your account is still signed in. Retry without losing other session data.</p>
        <button type="button" onClick={() => void loadProfile()}>
          Retry profile
        </button>
      </section>
    );
  }

  const disabled = isSaving;
  const selectedCount = values.preferredCampusLocationIds.length;
  const savedUnavailableIds = values.preferredCampusLocationIds.filter(
    (id) => !locations.some((location) => location.id === id),
  );

  return (
    <div className={styles.profilePage}>
      <header className={styles.introduction}>
        <h1>Profile settings</h1>
        <p>Keep your campus preferences and recovery notifications useful and up to date.</p>
      </header>

      <section className={styles.accountSummary} aria-labelledby="account-summary-heading">
        <div>
          <h2 id="account-summary-heading">Account</h2>
          <p>Email, role and status are managed separately from your profile.</p>
        </div>
        <dl>
          <div><dt>Email</dt><dd>{session.user.email}</dd></div>
          <div><dt>Role</dt><dd>{formatLabel(session.user.role)}</dd></div>
          <div><dt>Status</dt><dd>{formatLabel(session.user.status)}</dd></div>
        </dl>
      </section>

      <form className={styles.settingsSheet} onSubmit={handleSubmit} noValidate>
        <fieldset className={styles.section} disabled={disabled}>
          <legend>Identity and contact</legend>
          <p className={styles.sectionIntro}>Choose the name shown inside Campus Find and how you prefer to receive controlled contact.</p>

          <div className={styles.field}>
            <label htmlFor="profile-display-name">Display name</label>
            <input
              ref={displayNameRef}
              id="profile-display-name"
              value={values.displayName}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={fieldErrors.displayName ? "profile-display-name-error" : "profile-display-name-help"}
              onChange={(event) => {
                setValues({ ...values, displayName: event.target.value });
                clearError("displayName");
              }}
            />
            <p className={styles.help} id="profile-display-name-help">Use 2–80 visible characters.</p>
            {fieldErrors.displayName ? <p className={styles.fieldError} id="profile-display-name-error">{fieldErrors.displayName.join(". ")}</p> : null}
          </div>

          <fieldset className={styles.choiceGroup}>
            <legend>Preferred contact method</legend>
            <div className={styles.choiceRow}>
              <label>
                <input ref={contactRef} type="radio" name="preferred-contact" checked={values.preferredContactMethod === "in_app"} onChange={() => { setValues({ ...values, preferredContactMethod: "in_app" }); clearError("preferredContactMethod"); }} />
                In-app messages
              </label>
              <label>
                <input type="radio" name="preferred-contact" checked={values.preferredContactMethod === "email"} onChange={() => { setValues({ ...values, preferredContactMethod: "email" }); clearError("preferredContactMethod"); }} />
                Email
              </label>
            </div>
            {fieldErrors.preferredContactMethod ? <p className={styles.fieldError}>{fieldErrors.preferredContactMethod.join(". ")}</p> : null}
          </fieldset>
        </fieldset>

        <fieldset
          ref={locationGroupRef}
          className={styles.section}
          disabled={disabled || locationState !== "ready"}
          tabIndex={-1}
        >
          <legend>Campus preferences</legend>
          <div className={styles.sectionHeadingRow}>
            <p className={styles.sectionIntro}>Select up to five places that are most relevant to your campus activity.</p>
            <p className={styles.selectionCount}>{selectedCount} of 5 selected</p>
          </div>

          {locationState === "loading" ? <p role="status">Loading campus locations</p> : null}
          {locationState === "error" ? <p className={styles.inlineError}>Campus locations are temporarily unavailable.</p> : null}
          {locationState === "ready" ? (
            <div className={styles.locationList}>
              {locations.map((location) => (
                <label key={location.id}>
                  <input aria-label={`${location.campusName} — ${location.locationName}`} type="checkbox" checked={values.preferredCampusLocationIds.includes(location.id)} onChange={(event) => changeLocation(location.id, event.target.checked)} />
                  <span><strong>{location.campusName}</strong><span>{location.locationName}</span></span>
                </label>
              ))}
              {savedUnavailableIds.map((id) => (
                <label key={id}>
                  <input aria-label="Previously selected campus — Currently unavailable" type="checkbox" checked onChange={(event) => changeLocation(id, event.target.checked)} />
                  <span><strong>Previously selected campus</strong><span>Currently unavailable</span></span>
                </label>
              ))}
            </div>
          ) : null}
          {fieldErrors.preferredCampusLocationIds ? <p className={styles.fieldError}>{fieldErrors.preferredCampusLocationIds.join(". ")}</p> : null}
        </fieldset>
        {locationState === "error" ? (
          <button className={styles.secondaryButton} type="button" onClick={() => void loadLocations()} disabled={isSaving}>Retry campus locations</button>
        ) : null}
        <p className={styles.visuallyHidden} role="status" aria-live="polite">{selectionMessage}</p>

        <fieldset className={styles.section} disabled={disabled}>
          <legend>Notifications</legend>
          <p className={styles.sectionIntro}>Choose which recovery updates should reach you.</p>
          <div className={styles.notificationList}>
            {notificationOptions.map(([key, label], index) => (
              <label key={key}>
                <input
                  ref={index === 0 ? notificationRef : undefined}
                  type="checkbox"
                  checked={values.notificationSettings[key]}
                  onChange={(event) => {
                    setValues({ ...values, notificationSettings: { ...values.notificationSettings, [key]: event.target.checked } });
                    clearError("notificationSettings");
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {fieldErrors.notificationSettings ? <p className={styles.fieldError}>{fieldErrors.notificationSettings.join(". ")}</p> : null}
        </fieldset>

        <footer className={styles.saveRow}>
          <div className={styles.saveFeedback} aria-live="polite">
            {message ? <p className={hasConflict || Object.keys(fieldErrors).length ? styles.inlineError : undefined} role={Object.keys(fieldErrors).length ? "alert" : "status"}>{message}</p> : <p>Changes apply to this account only.</p>}
            {hasConflict ? <button className={styles.textButton} type="button" onClick={() => void loadProfile()}>Reload latest profile</button> : null}
          </div>
          <button className={styles.saveButton} type="submit" disabled={isSaving}>
            {isSaving ? "Saving profile settings" : "Save profile settings"}
          </button>
        </footer>
      </form>
    </div>
  );
}
