import { NextResponse } from "next/server";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { title } = await req.json().catch(() => ({}));
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: "Informe o título do curso." }, { status: 400 });
  }

  // garante slug único
  const base = slugify(title) || "curso";
  let slug = base;
  let i = 2;
  for (;;) {
    const [exists] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.slug, slug))
      .limit(1);
    if (!exists) break;
    slug = `${base}-${i++}`;
  }

  const [course] = await db
    .insert(courses)
    .values({ title: String(title).trim(), slug, status: "draft" })
    .returning();

  return NextResponse.json({ ok: true, course });
}
