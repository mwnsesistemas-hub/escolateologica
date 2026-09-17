import { NextResponse } from "next/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { moduleId, title } = body;
  if (!moduleId || !title || !String(title).trim()) {
    return NextResponse.json({ error: "Informe módulo e título da aula." }, { status: 400 });
  }

  const [last] = await db
    .select({ position: lessons.position })
    .from(lessons)
    .where(eq(lessons.moduleId, String(moduleId)))
    .orderBy(desc(lessons.position))
    .limit(1);

  const [lesson] = await db
    .insert(lessons)
    .values({
      moduleId: String(moduleId),
      title: String(title).trim(),
      description: typeof body.description === "string" ? body.description : "",
      videoUrl: typeof body.videoUrl === "string" && body.videoUrl ? body.videoUrl : null,
      durationMin: Number(body.durationMin) || 0,
      isFree: Boolean(body.isFree),
      position: (last?.position ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, lesson });
}
