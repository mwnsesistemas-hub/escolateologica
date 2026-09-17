import { NextResponse } from "next/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const patch: Partial<typeof lessons.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.videoUrl === "string") patch.videoUrl = body.videoUrl || null;
  if (typeof body.durationMin === "number") patch.durationMin = Math.max(0, Math.round(body.durationMin));
  if (typeof body.isFree === "boolean") patch.isFree = body.isFree;
  if (typeof body.position === "number") patch.position = body.position;

  const [lesson] = await db.update(lessons).set(patch).where(eq(lessons.id, id)).returning();
  if (!lesson) return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, lesson });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  await db.delete(lessons).where(eq(lessons.id, id));
  return NextResponse.json({ ok: true });
}
