import { NextResponse } from "next/server";
import { db } from "@/db";
import { enrollments, lessons, modules, progress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

/** Marca uma aula como concluída (requer matrícula ou admin) */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });

  const { lessonId } = await req.json().catch(() => ({}));
  if (!lessonId) return NextResponse.json({ error: "Aula não informada." }, { status: 400 });

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, String(lessonId))).limit(1);
  if (!lesson) return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });

  const [mod] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId)).limit(1);
  if (!mod) return NextResponse.json({ error: "Módulo não encontrado." }, { status: 404 });

  if (user.role !== "admin") {
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.userId, user.id), eq(enrollments.courseId, mod.courseId)))
      .limit(1);
    if (!enrollment) return NextResponse.json({ error: "Matrícula necessária." }, { status: 403 });
  }

  await db
    .insert(progress)
    .values({ userId: user.id, lessonId: lesson.id })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
