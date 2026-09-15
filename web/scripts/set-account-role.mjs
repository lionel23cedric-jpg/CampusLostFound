import path from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

const TARGET_ROLES = new Set(["staff", "administrator"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_PROJECTION = {
  projection: {
    _id: 1,
    email: 1,
    role: 1,
    status: 1,
    updatedAt: 1,
  },
};

export class RoleProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RoleProvisioningError";
    this.code = code;
  }
}

function invalidArguments() {
  throw new RoleProvisioningError(
    "INVALID_ARGUMENTS",
    "Usage: npm run db:set-role -- --email <address> --role <staff|administrator> [--apply]",
  );
}

function normaliseInput(input) {
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input?.role;

  if (!EMAIL_PATTERN.test(email) || !TARGET_ROLES.has(role)) {
    invalidArguments();
  }

  return { email, role, apply: input.apply === true };
}

export function parseRoleArguments(argv) {
  if (!Array.isArray(argv)) invalidArguments();

  let email;
  let role;
  let apply = false;
  let applySeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--apply") {
      if (applySeen) invalidArguments();
      apply = true;
      applySeen = true;
      continue;
    }

    if (argument !== "--email" && argument !== "--role") {
      invalidArguments();
    }

    const value = argv[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      invalidArguments();
    }
    index += 1;

    if (argument === "--email") {
      if (email !== undefined) invalidArguments();
      email = value;
    } else {
      if (role !== undefined) invalidArguments();
      role = value;
    }
  }

  return normaliseInput({ email, role, apply });
}

export function roleTransition(previousRole, nextRole) {
  if (previousRole === nextRole) return "unchanged";
  if (
    previousRole === "student" &&
    (nextRole === "staff" || nextRole === "administrator")
  ) {
    return "allowed";
  }
  if (previousRole === "staff" && nextRole === "administrator") {
    return "allowed";
  }
  return "forbidden";
}

function requireUsableAccount(account) {
  if (!account) {
    throw new RoleProvisioningError(
      "ACCOUNT_NOT_FOUND",
      "No registered account was found for that email address.",
    );
  }
  if (account.status !== "active") {
    throw new RoleProvisioningError(
      "ACCOUNT_INACTIVE",
      "Only an active registered account can receive a privileged role.",
    );
  }
}

function requireAllowedTransition(account, nextRole) {
  const transition = roleTransition(account.role, nextRole);
  if (transition === "forbidden") {
    throw new RoleProvisioningError(
      "ROLE_TRANSITION_FORBIDDEN",
      "That role transition is not permitted by this setup command.",
    );
  }
  return transition;
}

function updatedDocument(result) {
  if (result && typeof result === "object" && "value" in result) {
    return result.value;
  }
  return result;
}

function safeResult(status, account, role, sessionsRevoked = 0) {
  return {
    status,
    email: account.email,
    previousRole: account.role,
    role,
    sessionsRevoked,
  };
}

export async function setAccountRole(
  database,
  input,
  {
    startSession = () => mongoose.startSession(),
    now = () => new Date(),
    log = console.log,
  } = {},
) {
  const request = normaliseInput(input);
  const users = database.collection("users");
  const sessions = database.collection("sessions");
  const current = await users.findOne(
    { email: request.email },
    ACCOUNT_PROJECTION,
  );

  requireUsableAccount(current);
  const initialTransition = requireAllowedTransition(current, request.role);

  if (initialTransition === "unchanged") {
    const result = safeResult("unchanged", current, request.role);
    log(`No change: ${request.email} already has the ${request.role} role.`);
    return result;
  }

  if (!request.apply) {
    const result = safeResult("dry-run", current, request.role);
    log(
      `Dry run: ${request.email} would change from ${current.role} to ${request.role}. ` +
        "No database records were changed.",
    );
    return result;
  }

  let activeSession;
  let result;
  let failure;

  try {
    activeSession = await startSession();
    await activeSession.withTransaction(async () => {
      const latest = await users.findOne(
        { email: request.email },
        { ...ACCOUNT_PROJECTION, session: activeSession },
      );
      requireUsableAccount(latest);
      const transition = requireAllowedTransition(latest, request.role);

      if (transition === "unchanged") {
        result = safeResult("unchanged", latest, request.role);
        return;
      }

      const updatedAt = now();
      const updateResult = await users.findOneAndUpdate(
        {
          _id: latest._id,
          role: latest.role,
          status: "active",
          updatedAt: latest.updatedAt,
        },
        { $set: { role: request.role, updatedAt } },
        {
          returnDocument: "after",
          projection: ACCOUNT_PROJECTION.projection,
          session: activeSession,
        },
      );
      const updated = updatedDocument(updateResult);
      if (!updated) {
        throw new RoleProvisioningError(
          "ACCOUNT_STATE_CONFLICT",
          "The account changed during the operation. Run the dry check again.",
        );
      }

      const revoked = await sessions.deleteMany(
        { userId: latest._id },
        { session: activeSession },
      );
      result = safeResult(
        "updated",
        latest,
        request.role,
        Number.isSafeInteger(revoked.deletedCount) ? revoked.deletedCount : 0,
      );
    });
  } catch (error) {
    failure = error;
  }

  if (activeSession) {
    try {
      await activeSession.endSession();
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure instanceof RoleProvisioningError) throw failure;
  if (failure || !result) {
    throw new RoleProvisioningError(
      "ROLE_OPERATION_FAILED",
      "The role change could not be completed.",
    );
  }

  if (result.status === "unchanged") {
    log(`No change: ${request.email} already has the ${request.role} role.`);
  } else {
    log(
      `Updated ${request.email} from ${result.previousRole} to ${request.role} ` +
        `and revoked ${result.sessionsRevoked} session${result.sessionsRevoked === 1 ? "" : "s"}.`,
    );
  }
  return result;
}

async function main() {
  const request = parseRoleArguments(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new RoleProvisioningError(
      "DATABASE_CONFIG_MISSING",
      "MONGODB_URI is required in .env.local.",
    );
  }

  let connected = false;
  try {
    await mongoose.connect(uri);
    connected = true;
    if (!mongoose.connection.db) {
      throw new RoleProvisioningError(
        "DATABASE_UNAVAILABLE",
        "The configured database is unavailable.",
      );
    }
    await setAccountRole(mongoose.connection.db, request);
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error instanceof RoleProvisioningError
        ? error.message
        : "Role provisioning failed.",
    );
    process.exitCode = 1;
  });
}
