import { NextResponse } from "next/server";
import { db } from "@/db";
import { examQuestions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id: examId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const { question, optionA, optionB, optionC, optionD, correctAnswer, explanation } = body;
  if (!question || !optionA || !optionB || !optionC || !optionD || !correctAnswer)
    return NextResponse.json({ error: "Preencha todos os campos da questão." }, { status: 400 });

  if (!["A", "B", "C", "D"].includes(String(correctAnswer).toUpperCase()))
    return NextResponse.json({ error: "Resposta deve ser A, B, C ou D." }, { status: 400 });

  const [last] = await db
    .select({ position: examQuestions.position })
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId))
    .orderBy(desc(examQuestions.position))
    .limit(1);

  const [q] = await db
    .insert(examQuestions)
    .values({
      examId,
      question: String(question).trim(),
      optionA: String(optionA).trim(),
      optionB: String(optionB).trim(),
      optionC: String(optionC).trim(),
      optionD: String(optionD).trim(),
      correctAnswer: String(correctAnswer).toUpperCase(),
      explanation: String(explanation || "").trim(),
      position: (last?.position ?? -1) + 1,
    })
    .returning();

  return NextResponse.json({ ok: true, question: q });
}

export async function DELETE(req: Request, _ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { questionId } = await req.json().catch(() => ({}));
  if (!questionId) return NextResponse.json({ error: "ID da questão não informado." }, { status: 400 });
  await db.delete(examQuestions).where(eq(examQuestions.id, String(questionId)));
  return NextResponse.json({ ok: true });
}
