import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { name, email, password } = await req.json().catch(() => ({}));
  if (!name || !email || !password) {
    return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "A senha precisa ter ao menos 6 caracteres." }, { status: 400 });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "Este e-mail já possui uma conta. Faça login." }, { status: 409 });
  }

  const [user] = await db
    .insert(users)
    .values({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role: "student",
    })
    .returning();

  await createSession(user);
  return NextResponse.json({ ok: true, role: user.role, name: user.name });
}
