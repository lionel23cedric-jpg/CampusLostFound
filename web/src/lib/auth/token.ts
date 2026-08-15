import { createHash, randomBytes } from "node:crypto";

export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
}
