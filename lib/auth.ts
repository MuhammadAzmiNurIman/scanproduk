import crypto from "node:crypto";
import type { NextRequest } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const SECRET = process.env.ADMIN_SECRET ?? "lumina-scan-dev-secret";

export const AUTH_COOKIE = "lumina_admin";

export function verifyPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function createSession(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "admin", iat: Date.now() }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isAdminRequest(req: NextRequest): boolean {
  return verifySession(req.cookies.get(AUTH_COOKIE)?.value);
}
