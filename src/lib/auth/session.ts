/**
 * Stateless, HMAC-signed session cookie. No provider, no database.
 * Payload: { sub: userId, exp: unix seconds, sid: random session id }.
 *
 * Sign-out is backed by a small in-process revocation list keyed by the token's
 * signature, so a token that was signed out stops working before it expires. The
 * list only ever holds tokens that were valid when revoked, and entries are dropped
 * once the token would have expired anyway, so it is bounded by the session TTL.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "relay_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionPayload {
  sub: string;
  exp: number;
  /** Absent on cookies issued before per-session identifiers were introduced. */
  sid?: string;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(userId: string, secret: string, now = Date.now()): string {
  if (secret.length < 16) throw new Error("SESSION_SECRET must be at least 16 characters");
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    // Different logins must not share a revocation signature, even within one second.
    sid: randomUUID(),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload for a valid, unexpired, not signed-out token; null otherwise. Never throws. */
export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token || secret.length < 16) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (isRevoked(sig, now)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Revocation (sign-out)
// ---------------------------------------------------------------------------

declare global {
  // Next bundles every route separately, so module state is not shared between the
  // logout route and the pages; the store and this list live on globalThis instead.
  var __relayRevokedSessions: Map<string, number> | undefined;
}

/** signature -> expiry (ms). Only signatures of tokens that verified are stored. */
function revokedSessions(): Map<string, number> {
  globalThis.__relayRevokedSessions ??= new Map();
  return globalThis.__relayRevokedSessions;
}

function isRevoked(sig: string, now: number): boolean {
  const revoked = revokedSessions();
  const exp = revoked.get(sig);
  if (exp === undefined) return false;
  if (exp <= now) {
    revoked.delete(sig);
    return false;
  }
  return true;
}

/**
 * Marks a token as signed out. Only a token that verifies against the secret is
 * recorded, so an anonymous caller cannot grow the list with made-up tokens.
 * Returns true when something was revoked.
 */
export function revokeSessionToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  const payload = verifySessionToken(token, secret, now);
  if (!payload || !token) return false;
  const revoked = revokedSessions();
  for (const [sig, exp] of revoked) if (exp <= now) revoked.delete(sig);
  revoked.set(token.split(".")[1]!, payload.exp * 1000);
  return true;
}

/** Test helper. */
export function resetRevokedSessions(): void {
  revokedSessions().clear();
}
