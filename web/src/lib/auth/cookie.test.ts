import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "./cookie";

const get = vi.fn();
const set = vi.fn();

describe("authentication cookie", () => {
  beforeEach(() => {
    vi.mocked(cookies).mockResolvedValue({ get, set } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the raw token from the named cookie", async () => {
    get.mockReturnValue({ value: "raw-session-token" });

    await expect(readSessionCookie()).resolves.toBe("raw-session-token");
    expect(cookies).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("clf_session");
  });

  it("returns undefined when the named cookie is absent", async () => {
    get.mockReturnValue(undefined);

    await expect(readSessionCookie()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith("clf_session");
  });

  it("sets a seven-day secure production cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setSessionCookie("raw-session-token");

    expect(SESSION_COOKIE_NAME).toBe("clf_session");
    expect(set).toHaveBeenCalledWith("clf_session", "raw-session-token", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
      secure: true,
    });
  });

  it("does not mark a development cookie as secure", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await setSessionCookie("raw-session-token");

    expect(set).toHaveBeenCalledWith("clf_session", "raw-session-token", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
      secure: false,
    });
  });

  it("clears the cookie using the same security boundary", async () => {
    vi.stubEnv("NODE_ENV", "test");

    await clearSessionCookie();

    expect(set).toHaveBeenCalledWith("clf_session", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: false,
      expires: new Date(0),
    });
  });
});
