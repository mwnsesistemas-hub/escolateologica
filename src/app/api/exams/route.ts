import { NextResponse } from "next/server";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { moduleId, title } = body;
  if (!moduleId || !title)
    return NextResponse.json({ error: "Informe módulo e título." }, { status: 400 });

  const [last] = await db
    .select({ position: exams.position })
    .from(exams)
    .where(eq(exams.moduleId, String(moduleId)))
    .orderBy(desc(exams.position))
    .limit(1);

  const [exam] = await db
    .insert(exams)
    .values({
      moduleId: String(moduleId),
      title: String(title).trim(),
      description: String(body.description || ""),
      timeLimitMin: Number(body.timeLimitMin) || 30,
      maxAttempts: Number(body.maxAttempts) || 3,
      passingScore: Number(body.passingScore) || 70,
      position: (last?.position ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, exam });
}
