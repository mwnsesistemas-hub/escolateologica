import { NextResponse } from "next/server";
import { db } from "@/db";
import { modules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof modules.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.position === "number") patch.position = body.position;

  const [mod] = await db.update(modules).set(patch).where(eq(modules.id, id)).returning();
  if (!mod) return NextResponse.json({ error: "Módulo não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, module: mod });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  await db.delete(modules).where(eq(modules.id, id)); // aulas caem em cascata
  return NextResponse.json({ ok: true });
}
