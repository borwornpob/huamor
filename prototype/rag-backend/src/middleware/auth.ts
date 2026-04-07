import type { MiddlewareHandler } from "hono";
import { config } from "../config.js";
import { verifyToken } from "../lib/auth.js";

export interface AuthContext {
  userId: string;
  role: "patient" | "doctor";
  username: string;
  displayName: string;
}

export const authRequired: MiddlewareHandler = async (c, next) => {
  if (config.trustForwardedUserHeaders) {
    const forwardedUserId = c.req.header("x-user-id") ?? "";
    if (forwardedUserId) {
      const forwardedRole = c.req.header("x-user-role");
      const role = forwardedRole === "doctor" ? "doctor" : "patient";
      const forwardedName = c.req.header("x-user-name") ?? c.req.header("x-user-email") ?? forwardedUserId;

      c.set("auth", {
        userId: forwardedUserId,
        role,
        username: forwardedUserId,
        displayName: forwardedName,
      } as AuthContext);
      await next();
      return;
    }
  }

  const authHeader = c.req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return c.json({ error: "Missing token" }, 401);
  }

  try {
    const claims = await verifyToken(token);
    c.set("auth", {
      userId: claims.sub,
      role: claims.role,
      username: claims.username,
      displayName: claims.displayName,
    } as AuthContext);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};

export function getAuth(c: Parameters<MiddlewareHandler>[0]): AuthContext {
  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth) {
    throw new Error("Auth context missing");
  }
  return auth;
}
