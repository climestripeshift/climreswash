import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
  }
}

export async function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
}

export function logoutHandler(req: Request, res: Response) {
  req.session.destroy(() => {});
  res.json({ ok: true });
}

export function meHandler(req: Request, res: Response) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  res.json({ username: req.session.username });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
