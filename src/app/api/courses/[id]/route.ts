import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const [current] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Curso não encontrado." }, { status: 404 });

  const patch: Partial<typeof courses.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim();
    const base = slugify(body.title) || current.slug;
    if (base !== current.slug) {
      let slug = base;
      let i = 2;
      for (;;) {
        const [conflict] = await db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.slug, slug))
          .limit(1);
        if (!conflict) break;
        slug = `${base}-${i++}`;
      }
      patch.slug = slug;
    }
  }
  if (typeof body.subtitle === "string") patch.subtitle = body.subtitle;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.category === "string" && body.category.trim()) patch.category = body.category.trim();
  if (["Iniciante", "Intermediário", "Avançado"].includes(body.level)) patch.level = body.level;
  if (typeof body.priceCents === "number" && body.priceCents >= 0) patch.priceCents = Math.round(body.priceCents);
  if (typeof body.coverUrl === "string") patch.coverUrl = body.coverUrl;
  if (["draft", "published"].includes(body.status)) patch.status = body.status;

  const [course] = await db
    .update(courses)
    .set(patch)
    .where(eq(courses.id, id))
    .returning();

  if (!course) return NextResponse.json({ error: "Curso não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, course });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { id } = await ctx.params;
  await db.delete(courses).where(eq(courses.id, id));
  return NextResponse.json({ ok: true });
}
