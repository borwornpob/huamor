import { Hono } from "hono";
import { z } from "zod";
import { issueToken } from "../lib/auth.js";
import { authRequired, getAuth } from "../middleware/auth.js";
import { usersStore } from "../lib/store.js";

const loginSchema = z.object({
  email: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().min(1),
  gender: z.string().min(1),
  password: z.string().min(6),
  displayName: z.string().min(1).optional(),
  role: z.enum(["patient", "doctor"]).optional(),
});

export const authRouter = new Hono();

authRouter.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const identifier = parsed.data.email ?? parsed.data.username;
  if (!identifier) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const found = await usersStore.verifyCredentials(identifier, parsed.data.password);
  if (!found) {
    return c.json({ error: "Invalid username or password" }, 401);
  }

  const user = usersStore.publicUser(found);
  const token = await issueToken(user);

  return c.json({ token, user });
});

authRouter.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const existing = await usersStore.findByIdentifier(parsed.data.email);
  if (existing) {
    return c.json({ error: "Email already exists" }, 409);
  }

  const created = await usersStore.create({
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    birthDate: parsed.data.birthDate,
    gender: parsed.data.gender,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
    role: parsed.data.role ?? "patient",
  });

  const user = usersStore.publicUser(created);
  const token = await issueToken(user);

  return c.json({ token, user }, 201);
});

authRouter.use("/me", authRequired);

authRouter.get("/me", async (c) => {
  const auth = getAuth(c);
  const user = await usersStore.findById(auth.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: usersStore.publicUser(user) });
});
