import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { lessonId, name, url, fileType } = await req.json().catch(() => ({}));
  if (!lessonId || !name || !url)
    return NextResponse.json({ error: "Campos obrigatórios: lessonId, name, url." }, { status: 400 });

  const [last] = await db
    .select({ position: attachments.position })
    .from(attachments)
    .where(eq(attachments.lessonId, String(lessonId)))
    .orderBy(desc(attachments.position))
    .limit(1);

  const [att] = await db
    .insert(attachments)
    .values({
      lessonId: String(lessonId),
      name: String(name).trim(),
      url: String(url).trim(),
      fileType: String(fileType || "pdf").toLowerCase(),
      position: (last?.position ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, attachment: att });
}
