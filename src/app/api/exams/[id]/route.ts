import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const patch: Partial<typeof exams.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.timeLimitMin === "number") patch.timeLimitMin = Math.max(1, body.timeLimitMin);
  if (typeof body.maxAttempts === "number") patch.maxAttempts = Math.max(1, body.maxAttempts);
  if (typeof body.passingScore === "number") patch.passingScore = Math.min(100, Math.max(0, body.passingScore));

  const [exam] = await db.update(exams).set(patch).where(eq(exams.id, id)).returning();
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, exam });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await ctx.params;
  await db.delete(exams).where(eq(exams.id, id));
  return NextResponse.json({ ok: true });
}
