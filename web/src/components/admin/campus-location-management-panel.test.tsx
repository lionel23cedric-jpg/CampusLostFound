// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/reference-data-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/reference-data-browser-client")
  >("@/lib/admin/reference-data-browser-client");
  return {
    ...actual,
    listAdministratorCampusLocations: vi.fn(),
    createAdministratorCampusLocation: vi.fn(),
    updateAdministratorCampusLocation: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserReferenceDataError,
  createAdministratorCampusLocation,
  listAdministratorCampusLocations,
  updateAdministratorCampusLocation,
  type BrowserReferenceDataErrorCode,
} from "@/lib/admin/reference-data-browser-client";
import type {
  AdminCampusLocation,
  AdminCampusLocationPage,
} from "@/lib/admin/reference-data-contract";

import { CampusLocationManagementPanel } from "./campus-location-management-panel";

const library: AdminCampusLocation = {
  id: "64b64c5f2f8f9e0012345678",
  campusName: "Albany",
  locationName: "Library help desk",
  description: "Ground floor service desk",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
};
const registry: AdminCampusLocation = {
  id: "64b64c5f2f8f9e0012345679",
  campusName: "Manawatū",
  locationName: "Registry service desk",
  description: null,
  isActive: false,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
};

function campusLocationPage(
  campusLocations: AdminCampusLocation[] = [library, registry],
  overrides: Partial<AdminCampusLocationPage> = {},
): AdminCampusLocationPage {
  const total = overrides.total ?? campusLocations.length;
  return {
    campusLocations,
    page: 1,
    pageSize: 20,
    total,
    totalPages: Math.ceil(total / 20),
    ...overrides,
  };
}

const approvedErrors: Record<
  BrowserReferenceDataErrorCode,
  readonly [number, string]
> = {
  INVALID_REFERENCE_DATA_REQUEST: [400, "Reference data request is invalid"],
  AUTHENTICATION_REQUIRED: [401, "Authentication required"],
  ADMINISTRATOR_REQUIRED: [403, "Administrator access required"],
  REFERENCE_DATA_NOT_FOUND: [404, "Reference data not found"],
  REFERENCE_DATA_DUPLICATE: [409, "Reference data already exists"],
  REFERENCE_DATA_STATE_CONFLICT: [409, "Reference data has changed"],
  REFERENCE_DATA_OPERATION_FAILED: [500, "Reference data operation failed"],
};

function browserError(code: BrowserReferenceDataErrorCode) {
  const [status, message] = approvedErrors[code];
  return new BrowserReferenceDataError(code, status, message);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdministratorCampusLocations).mockReset();
  vi.mocked(createAdministratorCampusLocation).mockReset();
  vi.mocked(updateAdministratorCampusLocation).mockReset();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
  });
});

afterEach(cleanup);

it("loads page one and renders privacy-safe campus location cards", async () => {
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  const { container } = render(<CampusLocationManagementPanel />);

  expect(screen.getByRole("status").textContent).toContain("Loading campus locations");
  expect(await screen.findByRole("heading", { name: "Campus locations" })).toBeTruthy();
  expect(listAdministratorCampusLocations).toHaveBeenCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
  const libraryHeading = screen.getByRole("heading", { name: "Library help desk" });
  expect(libraryHeading).toBeTruthy();
  const libraryCard = libraryHeading.closest("article");
  expect(libraryCard).toBeTruthy();
  expect(
    within(libraryCard as HTMLElement).getByText("Campus").nextElementSibling
      ?.textContent,
  ).toBe("Albany");
  expect(screen.getByRole("heading", { name: "Registry service desk" })).toBeTruthy();
  expect(screen.getByText("Ground floor service desk")).toBeTruthy();
  expect(screen.getByText("No description provided")).toBeTruthy();
  expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Inactive").length).toBeGreaterThanOrEqual(1);
  expect(container.textContent).not.toMatch(
    /passwordHash|tokenHash|MONGODB|PRIVATE|administratorId/i,
  );
});

it("submits search explicitly, changes status at page one, resets and pages", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });

  await user.type(screen.getByLabelText("Search campus locations"), "library & registry");
  expect(listAdministratorCampusLocations).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Search campus locations" }));
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: "library & registry", status: "all", page: 1 },
    expect.any(AbortSignal),
  );

  await user.selectOptions(screen.getByLabelText("Campus location status"), "inactive");
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: "library & registry", status: "inactive", page: 1 },
    expect.any(AbortSignal),
  );

  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(
    campusLocationPage([library], { page: 1, total: 21, totalPages: 2 }),
  );
  await user.click(screen.getByRole("button", { name: "Reset campus location filters" }));
  expect(screen.getByLabelText("Search campus locations").getAttribute("value")).toBe("");
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(screen.getByText("Page 1 of 2 · 21 campus locations")).toBeTruthy(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 2 },
    expect.any(AbortSignal),
  );
});

it("shows unfiltered and filtered empty states with a safe reset", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage([]));
  render(<CampusLocationManagementPanel />);

  expect(await screen.findByText("No campus locations yet")).toBeTruthy();
  expect(screen.getByText("Create the first campus location above.")).toBeTruthy();

  await user.type(screen.getByLabelText("Search campus locations"), "laptop");
  await user.click(screen.getByRole("button", { name: "Search campus locations" }));
  const emptyHeading = await screen.findByRole("heading", {
    name: "No campus locations match these filters",
  });
  await user.click(
    within(emptyHeading.parentElement as HTMLElement).getByRole("button", {
      name: "Reset campus location filters",
    }),
  );
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
});

it("supports initial retry and retains the last valid page on refresh failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations)
    .mockRejectedValueOnce(new Error("PRIVATE-INITIAL"))
    .mockResolvedValueOnce(campusLocationPage())
    .mockRejectedValueOnce(new Error("PRIVATE-REFRESH"));
  render(<CampusLocationManagementPanel />);

  expect(await screen.findByRole("heading", { name: "Campus location management unavailable" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry campus locations" }));
  expect(await screen.findByRole("heading", { name: "Library help desk" })).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Campus location status"), "inactive");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not refresh campus locations. The last valid list remains visible.",
  );
  expect(screen.getByRole("heading", { name: "Library help desk" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/PRIVATE/i);
});

it("shows the approved filter error for an invalid list request", async () => {
  vi.mocked(listAdministratorCampusLocations).mockRejectedValue(
    browserError("INVALID_REFERENCE_DATA_REQUEST"),
  );
  render(<CampusLocationManagementPanel />);

  expect(
    await screen.findByText("Check the campus location filters and try again."),
  ).toBeTruthy();
  expect(document.body.textContent).not.toContain("Reference data request is invalid");
});

it("ignores aborted and stale list responses and aborts on unmount", async () => {
  const user = userEvent.setup();
  const first = deferred<AdminCampusLocationPage>();
  const second = deferred<AdminCampusLocationPage>();
  vi.mocked(listAdministratorCampusLocations)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const view = render(<CampusLocationManagementPanel />);

  await waitFor(() => expect(listAdministratorCampusLocations).toHaveBeenCalledTimes(1));
  const firstSignal = vi.mocked(listAdministratorCampusLocations).mock.calls[0][1];
  await user.type(screen.getByLabelText("Search campus locations"), "registry");
  await user.click(screen.getByRole("button", { name: "Search campus locations" }));
  expect(firstSignal?.aborted).toBe(true);
  second.resolve(campusLocationPage([registry]));
  expect(await screen.findByRole("heading", { name: "Registry service desk" })).toBeTruthy();
  first.resolve(campusLocationPage([library]));
  await act(async () => undefined);
  expect(screen.queryByRole("heading", { name: "Library help desk" })).toBeNull();

  const secondSignal = vi.mocked(listAdministratorCampusLocations).mock.calls[1][1];
  view.unmount();
  expect(secondSignal?.aborted).toBe(true);
});

it("validates campus location creation locally", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });

  expect(screen.getByLabelText("Campus name").getAttribute("maxlength")).toBe("80");
  expect(screen.getByLabelText("Location name").getAttribute("maxlength")).toBe("120");
  expect(screen.getByLabelText("Campus location description").getAttribute("maxlength")).toBe("300");
  await user.type(screen.getByLabelText("Campus name"), "x");
  await user.type(screen.getByLabelText("Location name"), "x");
  await user.click(screen.getByRole("button", { name: "Create campus location" }));
  expect(screen.getByText("Enter a campus name between 2 and 80 valid characters.")).toBeTruthy();
  expect(screen.getByText("Enter a location name between 2 and 120 valid characters.")).toBeTruthy();
  expect(createAdministratorCampusLocation).not.toHaveBeenCalled();
});

it("creates a campus location once, clears the form, resets filters and focuses success", async () => {
  const user = userEvent.setup();
  const created = {
    ...library,
    id: "64b64c5f2f8f9e0012345680",
    locationName: "Student services desk",
  };
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(createAdministratorCampusLocation).mockResolvedValue(created);
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.type(screen.getByLabelText("Search campus locations"), "library");
  await user.click(screen.getByRole("button", { name: "Search campus locations" }));
  await user.type(screen.getByLabelText("Campus name"), "  Ａｌｂａｎｙ  ");
  await user.type(screen.getByLabelText("Location name"), " Student services desk ");
  await user.type(
    screen.getByLabelText("Campus location description"),
    "Student identification cards",
  );
  const create = screen.getByRole("button", { name: "Create campus location" });
  await user.click(create);

  expect(createAdministratorCampusLocation).toHaveBeenCalledWith(
    {
      campusName: "Albany",
      locationName: "Student services desk",
      description: "Student identification cards",
    },
    expect.any(AbortSignal),
  );
  expect(createAdministratorCampusLocation).toHaveBeenCalledTimes(1);
  const notice = await screen.findByText("Campus location Student services desk created");
  await waitFor(() => expect(document.activeElement).toBe(notice));
  expect(screen.getByLabelText("Campus name").getAttribute("value")).toBe("");
  expect(screen.getByLabelText("Location name").getAttribute("value")).toBe("");
  expect(screen.getByLabelText("Search campus locations").getAttribute("value")).toBe("");
  expect(listAdministratorCampusLocations).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
});

it("blocks duplicate create submissions and retains safe form errors", async () => {
  const user = userEvent.setup();
  const pending = deferred<AdminCampusLocation>();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(createAdministratorCampusLocation).mockReturnValueOnce(pending.promise);
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.type(screen.getByLabelText("Campus name"), "Albany");
  await user.type(screen.getByLabelText("Location name"), "Phone collection desk");
  const button = screen.getByRole("button", { name: "Create campus location" });
  await user.click(button);
  expect(
    screen.getByRole("button", { name: "Creating campus location" }).hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Creating campus location" }));
  expect(createAdministratorCampusLocation).toHaveBeenCalledTimes(1);
  pending.reject(browserError("REFERENCE_DATA_DUPLICATE"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "That campus and location combination already exists. Choose unique values.",
  );
  expect(screen.getByLabelText("Location name").getAttribute("value")).toBe("Phone collection desk");

  vi.mocked(createAdministratorCampusLocation).mockRejectedValueOnce(
    browserError("INVALID_REFERENCE_DATA_REQUEST"),
  );
  await user.click(screen.getByRole("button", { name: "Create campus location" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Check the campus location values and try again.",
  );
});

it("edits approved fields with the exact updatedAt token and focuses the record", async () => {
  const user = userEvent.setup();
  const updated = {
    ...library,
    campusName: "Wellington",
    locationName: "Library desk",
    description: "Library desk, purses and card holders",
    updatedAt: "2026-08-28T03:00:00.000Z",
  };
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(updateAdministratorCampusLocation).mockResolvedValue(updated);
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.click(screen.getByRole("button", { name: "Edit campus location Library help desk" }));
  const editForm = screen.getByRole("form", { name: "Edit campus location Library help desk" });
  const campusName = within(editForm).getByLabelText("Campus name");
  await user.clear(campusName);
  await user.type(campusName, "Wellington");
  const locationName = within(editForm).getByLabelText("Location name");
  await user.clear(locationName);
  await user.type(locationName, "Library desk");
  const description = within(editForm).getByLabelText("Campus location description");
  await user.clear(description);
  await user.type(description, "Library desk, purses and card holders");
  await user.click(within(editForm).getByRole("button", { name: "Save campus location Library help desk" }));

  expect(updateAdministratorCampusLocation).toHaveBeenCalledWith(
    library.id,
    {
      updatedAt: library.updatedAt,
      campusName: "Wellington",
      locationName: "Library desk",
      description: "Library desk, purses and card holders",
    },
    expect.any(AbortSignal),
  );
  const heading = await screen.findByRole("heading", { name: "Library desk" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.queryByRole("form", { name: "Edit campus location Library help desk" })).toBeNull();
});

it("requires explicit confirmation to deactivate and restore campus locations", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(updateAdministratorCampusLocation)
    .mockResolvedValueOnce({ ...library, isActive: false })
    .mockResolvedValueOnce({ ...registry, isActive: true });
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });

  await user.click(screen.getByRole("button", { name: "Edit campus location Library help desk" }));
  await user.click(screen.getByRole("button", { name: "Deactivate campus location Library help desk" }));
  expect(
    screen.getByText(
      "Deactivate Library help desk on Albany? It will no longer be available for new reports, while existing report references remain unchanged.",
    ),
  ).toBeTruthy();
  expect(updateAdministratorCampusLocation).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm deactivation of Library help desk" }));
  expect(updateAdministratorCampusLocation).toHaveBeenLastCalledWith(
    library.id,
    { updatedAt: library.updatedAt, isActive: false },
    expect.any(AbortSignal),
  );

  await user.click(screen.getByRole("button", { name: "Edit campus location Registry service desk" }));
  await user.click(screen.getByRole("button", { name: "Restore campus location Registry service desk" }));
  expect(screen.getByText("Restore Registry service desk on Manawatū? It will be available for new reports again.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm restoration of Registry service desk" }));
  expect(updateAdministratorCampusLocation).toHaveBeenLastCalledWith(
    registry.id,
    { updatedAt: registry.updatedAt, isActive: true },
    expect.any(AbortSignal),
  );
});

it("preserves a stale edit and requires an explicit latest-record reload", async () => {
  const user = userEvent.setup();
  const latest = {
    ...library,
    locationName: "Library information desk",
    description: "Latest description",
    updatedAt: "2026-08-28T04:00:00.000Z",
  };
  vi.mocked(listAdministratorCampusLocations)
    .mockResolvedValueOnce(campusLocationPage())
    .mockResolvedValueOnce(campusLocationPage([latest, registry]));
  vi.mocked(updateAdministratorCampusLocation).mockRejectedValue(
    browserError("REFERENCE_DATA_STATE_CONFLICT"),
  );
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.click(screen.getByRole("button", { name: "Edit campus location Library help desk" }));
  const editForm = screen.getByRole("form", { name: "Edit campus location Library help desk" });
  const locationName = within(editForm).getByLabelText("Location name");
  await user.clear(locationName);
  await user.type(locationName, "My draft library name");
  await user.click(within(editForm).getByRole("button", { name: "Save campus location Library help desk" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "This campus location changed after you opened it. Reload the latest version before saving again.",
  );
  expect(within(editForm).getByLabelText("Location name").getAttribute("value")).toBe(
    "My draft library name",
  );
  expect(
    screen
      .getByRole("button", { name: "Save campus location Library help desk" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(updateAdministratorCampusLocation).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole("button", { name: "Reload latest campus location Library help desk" }),
  );
  expect(updateAdministratorCampusLocation).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("form", { name: "Edit campus location Library information desk" }),
      )
        .getByLabelText("Location name")
        .getAttribute("value"),
    ).toBe("Library information desk"),
  );
  expect(screen.getByRole("button", { name: "Save campus location Library information desk" }).hasAttribute("disabled")).toBe(false);
});

it("closes a missing editor, refreshes the list and keeps duplicate drafts", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(updateAdministratorCampusLocation)
    .mockRejectedValueOnce(browserError("REFERENCE_DATA_DUPLICATE"))
    .mockRejectedValueOnce(browserError("REFERENCE_DATA_NOT_FOUND"));
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.click(screen.getByRole("button", { name: "Edit campus location Library help desk" }));
  const editForm = screen.getByRole("form", { name: "Edit campus location Library help desk" });
  const locationName = within(editForm).getByLabelText("Location name");
  await user.clear(locationName);
  await user.type(locationName, "Registry service desk");
  await user.click(screen.getByRole("button", { name: "Save campus location Library help desk" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "That campus and location combination already exists. Choose unique values.",
  );
  expect(locationName.getAttribute("value")).toBe("Registry service desk");
  await user.click(screen.getByRole("button", { name: "Save campus location Library help desk" }));
  expect(await screen.findByText("That campus location is no longer available. The current list has been refreshed.")).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Edit campus location Library help desk" })).toBeNull();
  expect(listAdministratorCampusLocations).toHaveBeenCalledTimes(2);
});

it("retains an edit after a safe server failure and allows an explicit retry", async () => {
  const user = userEvent.setup();
  const updated = {
    ...library,
    locationName: "Library reception",
    updatedAt: "2026-08-28T05:00:00.000Z",
  };
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(updateAdministratorCampusLocation)
    .mockRejectedValueOnce(browserError("REFERENCE_DATA_OPERATION_FAILED"))
    .mockResolvedValueOnce(updated);
  render(<CampusLocationManagementPanel />);

  await screen.findByRole("heading", { name: "Library help desk" });
  await user.click(
    screen.getByRole("button", { name: "Edit campus location Library help desk" }),
  );
  const editForm = screen.getByRole("form", {
    name: "Edit campus location Library help desk",
  });
  const locationName = within(editForm).getByLabelText("Location name");
  await user.clear(locationName);
  await user.type(locationName, "Library reception");
  const save = within(editForm).getByRole("button", {
    name: "Save campus location Library help desk",
  });
  await user.click(save);

  expect((await within(editForm).findByRole("alert")).textContent).toContain(
    "Campus location management is temporarily unavailable. Try again.",
  );
  expect(locationName.getAttribute("value")).toBe("Library reception");
  await user.click(save);
  expect(updateAdministratorCampusLocation).toHaveBeenCalledTimes(2);
  expect(
    await screen.findByRole("heading", { name: "Library reception" }),
  ).toBeTruthy();
});

it.each([
  ["AUTHENTICATION_REQUIRED", "/login"],
  ["ADMINISTRATOR_REQUIRED", null],
] as const)("removes the workspace safely after %s", async (code, redirect) => {
  vi.mocked(listAdministratorCampusLocations).mockRejectedValue(browserError(code));
  render(<CampusLocationManagementPanel />);

  expect(await screen.findByRole("heading", { name: "Administrator access changed" })).toBeTruthy();
  expect(refreshSession).toHaveBeenCalledOnce();
  if (redirect) expect(replace).toHaveBeenCalledWith(redirect);
  else expect(replace).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toMatch(/Reference data request|PRIVATE/i);
});

it("uses safe list and mutation failures without exposing raw errors", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  vi.mocked(createAdministratorCampusLocation).mockRejectedValue(
    new Error("PRIVATE-MONGODB-HOST"),
  );
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });
  await user.type(screen.getByLabelText("Campus name"), "Albany");
  await user.type(screen.getByLabelText("Location name"), "Phone collection desk");
  await user.click(screen.getByRole("button", { name: "Create campus location" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Campus location management is temporarily unavailable. Try again.",
  );
  expect(document.body.textContent).not.toMatch(/PRIVATE|MONGODB|HOST/i);
});

it("keeps the campus location workspace usable at 320 pixels", async () => {
  vi.mocked(listAdministratorCampusLocations).mockResolvedValue(campusLocationPage());
  render(<CampusLocationManagementPanel />);
  await screen.findByRole("heading", { name: "Library help desk" });

  const css = readFileSync(
    resolve("src/components/admin/admin-reference-data.module.css"),
    "utf8",
  );
  expect(css).toMatch(/@media\s*\(max-width:\s*(20|24)rem\)/);
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/focus-visible/);
  expect(css).toMatch(/prefers-reduced-motion/);
  expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
});
