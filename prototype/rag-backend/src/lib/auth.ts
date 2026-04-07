import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";
import type { User, UserRole } from "../shared/types.js";

const encoder = new TextEncoder();
const key = encoder.encode(config.jwtSecret);
const passwordHashLength = 64;

export interface JwtClaims {
  sub: string;
  username: string;
  role: UserRole;
  displayName: string;
}

export async function issueToken(user: User): Promise<string> {
  return await new SignJWT({
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .setSubject(user.id)
    .sign(key);
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, key);

  if (!payload.sub || typeof payload.username !== "string" || typeof payload.role !== "string") {
    throw new Error("Invalid token payload");
  }

  return {
    sub: payload.sub,
    username: payload.username,
    role: payload.role as UserRole,
    displayName: String(payload.displayName ?? payload.username),
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, passwordHashLength).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, derivedHex] = storedHash.split(":");
  if (!salt || !derivedHex) {
    return false;
  }

  const derived = scryptSync(password, salt, passwordHashLength);
  const expected = Buffer.from(derivedHex, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
