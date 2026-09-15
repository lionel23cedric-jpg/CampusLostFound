import { describe, expect, it, vi } from "vitest";

import {
  parseRoleArguments,
  roleTransition,
  setAccountRole,
} from "./set-account-role.mjs";

const existingUser = {
  _id: "507f191e810c19729de860ea",
  email: "student@example.com",
  role: "student",
  status: "active",
  updatedAt: new Date("2026-09-15T00:00:00.000Z"),
};

function fakeDatabase(
  user: typeof existingUser | null = existingUser,
  updated: typeof existingUser | null = {
    ...existingUser,
    role: "staff",
    updatedAt: new Date("2026-09-15T01:00:00.000Z"),
  },
) {
  const users = {
    findOne: vi.fn().mockResolvedValue(user),
    findOneAndUpdate: vi.fn().mockResolvedValue(updated),
  };
  const sessions = {
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
  };
  const database = {
    collection: vi.fn((name: string) =>
      name === "users" ? users : sessions,
    ),
  };
  const session = {
    withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const startSession = vi.fn().mockResolvedValue(session);

  return { database, users, sessions, session, startSession };
}

describe("role provisioning arguments", () => {
  it("normalises an email and defaults to dry-run mode", () => {
    expect(
      parseRoleArguments([
        "--email",
        "  New.Staff@Example.COM ",
        "--role",
        "staff",
      ]),
    ).toEqual({
      email: "new.staff@example.com",
      role: "staff",
      apply: false,
    });
  });

  it("accepts administrator with an explicit apply flag", () => {
    expect(
      parseRoleArguments([
        "--role",
        "administrator",
        "--apply",
        "--email",
        "admin@example.com",
      ]),
    ).toEqual({
      email: "admin@example.com",
      role: "administrator",
      apply: true,
    });
  });

  it("rejects incomplete, unsafe, duplicate, and unknown arguments", () => {
    const invalidArgumentLists: string[][] = [
      [],
      ["--email", "person@example.com"],
      ["--email", "not-an-email", "--role", "staff"],
      ["--email", "person@example.com", "--role", "student"],
      ["--email", "person@example.com", "--role"],
      ["--email", "person@example.com", "--role", "staff", "--unknown"],
      [
        "--email",
        "one@example.com",
        "--email",
        "two@example.com",
        "--role",
        "staff",
      ],
      [
        "--email",
        "person@example.com",
        "--role",
        "staff",
        "--apply",
        "--apply",
      ],
    ];

    for (const argumentsList of invalidArgumentLists) {
      expect(() => parseRoleArguments(argumentsList)).toThrowError(
        expect.objectContaining({ code: "INVALID_ARGUMENTS" }),
      );
    }
  });
});

describe("role transitions", () => {
  it.each([
    ["student", "staff", "allowed"],
    ["student", "administrator", "allowed"],
    ["staff", "administrator", "allowed"],
    ["student", "student", "unchanged"],
    ["staff", "staff", "unchanged"],
    ["administrator", "administrator", "unchanged"],
    ["administrator", "staff", "forbidden"],
    ["staff", "student", "forbidden"],
  ])("classifies %s to %s as %s", (previousRole, nextRole, expected) => {
    expect(roleTransition(previousRole, nextRole)).toBe(expected);
  });
});

describe("role provisioning database operation", () => {
  it("fails safely when the registered account is missing", async () => {
    const fixture = fakeDatabase(null);

    await expect(
      setAccountRole(
        fixture.database,
        { email: "missing@example.com", role: "staff", apply: false },
        { startSession: fixture.startSession, log: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(fixture.startSession).not.toHaveBeenCalled();
    expect(fixture.users.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps the default dry run read-only and prints no hidden account data", async () => {
    const fixture = fakeDatabase();
    const log = vi.fn();

    await expect(
      setAccountRole(
        fixture.database,
        { email: "STUDENT@example.com", role: "staff", apply: false },
        { startSession: fixture.startSession, log },
      ),
    ).resolves.toEqual({
      status: "dry-run",
      email: "student@example.com",
      previousRole: "student",
      role: "staff",
      sessionsRevoked: 0,
    });

    expect(fixture.startSession).not.toHaveBeenCalled();
    expect(fixture.users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(fixture.sessions.deleteMany).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("Dry run");
    expect(JSON.stringify(log.mock.calls)).not.toContain("507f191e810c19729de860ea");
  });

  it("treats an existing target role as an idempotent no-op", async () => {
    const fixture = fakeDatabase({ ...existingUser, role: "staff" });

    await expect(
      setAccountRole(
        fixture.database,
        { email: existingUser.email, role: "staff", apply: true },
        { startSession: fixture.startSession, log: vi.fn() },
      ),
    ).resolves.toMatchObject({ status: "unchanged", sessionsRevoked: 0 });
    expect(fixture.startSession).not.toHaveBeenCalled();
    expect(fixture.users.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects inactive accounts and forbidden transitions before writes", async () => {
    const inactive = fakeDatabase({ ...existingUser, status: "suspended" });
    await expect(
      setAccountRole(
        inactive.database,
        { email: existingUser.email, role: "staff", apply: true },
        { startSession: inactive.startSession, log: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });

    const administrator = fakeDatabase({
      ...existingUser,
      role: "administrator",
    });
    await expect(
      setAccountRole(
        administrator.database,
        { email: existingUser.email, role: "staff", apply: true },
        { startSession: administrator.startSession, log: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "ROLE_TRANSITION_FORBIDDEN" });
    expect(inactive.users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(administrator.users.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("updates the role and revokes sessions in one transaction", async () => {
    const fixture = fakeDatabase();
    const now = new Date("2026-09-15T01:00:00.000Z");

    await expect(
      setAccountRole(
        fixture.database,
        { email: existingUser.email, role: "staff", apply: true },
        {
          startSession: fixture.startSession,
          now: () => now,
          log: vi.fn(),
        },
      ),
    ).resolves.toEqual({
      status: "updated",
      email: existingUser.email,
      previousRole: "student",
      role: "staff",
      sessionsRevoked: 2,
    });

    expect(fixture.session.withTransaction).toHaveBeenCalledOnce();
    expect(fixture.users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: existingUser._id,
        role: "student",
        status: "active",
        updatedAt: existingUser.updatedAt,
      },
      { $set: { role: "staff", updatedAt: now } },
      expect.objectContaining({
        returnDocument: "after",
        session: fixture.session,
      }),
    );
    expect(fixture.sessions.deleteMany).toHaveBeenCalledWith(
      { userId: existingUser._id },
      { session: fixture.session },
    );
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it("reports a concurrent conflict without revoking sessions", async () => {
    const fixture = fakeDatabase(existingUser, null);

    await expect(
      setAccountRole(
        fixture.database,
        { email: existingUser.email, role: "staff", apply: true },
        { startSession: fixture.startSession, log: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_STATE_CONFLICT" });
    expect(fixture.sessions.deleteMany).not.toHaveBeenCalled();
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it("ends the session when transactional work fails", async () => {
    const fixture = fakeDatabase();
    fixture.session.withTransaction.mockRejectedValueOnce(new Error("private"));

    await expect(
      setAccountRole(
        fixture.database,
        { email: existingUser.email, role: "staff", apply: true },
        { startSession: fixture.startSession, log: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "ROLE_OPERATION_FAILED" });
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });
});
