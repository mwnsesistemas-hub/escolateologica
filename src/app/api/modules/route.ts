import { NextResponse } from "next/server";
import { db } from "@/db";
import { modules } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { courseId, title } = await req.json().catch(() => ({}));
  if (!courseId || !title || !String(title).trim()) {
    return NextResponse.json({ error: "Informe curso e título do módulo." }, { status: 400 });
  }

  const [last] = await db
    .select({ position: modules.position })
    .from(modules)
    .where(eq(modules.courseId, String(courseId)))
    .orderBy(desc(modules.position))
    .limit(1);

  const [mod] = await db
    .insert(modules)
    .values({
      courseId: String(courseId),
      title: String(title).trim(),
      position: (last?.position ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, module: mod });
}
