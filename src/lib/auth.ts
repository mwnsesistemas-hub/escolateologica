import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "lumen_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

type SessionPayload = { uid: string; role: "admin" | "student"; name: string };

function secret(): string {
  return (
    process.env.AUTH_SECRET ||
    "lumen-dev-secret-troque-em-producao"
  );
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

/** Cria a sessão (cookie httpOnly) para o usuário informado */
export async function createSession(user: User) {
  const store = await cookies();
  store.set(COOKIE_NAME, encode({ uid: user.id, role: user.role, name: user.name }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Retorna o usuário autenticado (ou null) */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = decode(token);
  if (!payload) return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
  return user ?? null;
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}
