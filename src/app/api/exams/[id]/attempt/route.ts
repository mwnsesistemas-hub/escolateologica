import { NextResponse } from "next/server";
import { db } from "@/db";
import { examAttempts, examQuestions, exams, modules, enrollments } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** GET — Retorna dados da prova + tentativas anteriores do aluno */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id: examId } = await ctx.params;

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });

  // Verifica matrícula
  const [mod] = await db.select().from(modules).where(eq(modules.id, exam.moduleId)).limit(1);
  if (!mod) return NextResponse.json({ error: "Módulo não encontrado." }, { status: 404 });

  if (user.role !== "admin") {
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.userId, user.id), eq(enrollments.courseId, mod.courseId)))
      .limit(1);
    if (!enrollment) return NextResponse.json({ error: "Matrícula necessária." }, { status: 403 });
  }

  const questions = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId))
    .orderBy(asc(examQuestions.position));

  const attempts = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.userId, user.id), eq(examAttempts.examId, examId)))
    .orderBy(asc(examAttempts.startedAt));

  const finishedAttempts = attempts.filter((a) => a.finishedAt !== null);
  const attemptsLeft = exam.maxAttempts - finishedAttempts.length;

  // Não envia gabarito se o aluno ainda pode tentar (a menos que já tenha passado)
  const passed = finishedAttempts.some((a) => a.passed);
  const canTry = attemptsLeft > 0 && !passed;

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      timeLimitMin: exam.timeLimitMin,
      maxAttempts: exam.maxAttempts,
      passingScore: exam.passingScore,
    },
    questions: questions.map((q) => ({
      id: q.id,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      // Gabarito só aparece se esgotou tentativas ou já passou
      ...(canTry
        ? {}
        : { correctAnswer: q.correctAnswer, explanation: q.explanation }),
    })),
    attempts: finishedAttempts.map((a) => ({
      id: a.id,
      score: a.score,
      totalCorrect: a.totalCorrect,
      totalQuestions: a.totalQuestions,
      passed: a.passed,
      answers: a.answers,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
    })),
    attemptsLeft,
    passed,
    canTry,
  });
}

/** POST — Envia respostas e calcula o resultado */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id: examId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const submittedAnswers: Record<string, string> = body.answers || {};

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });

  // Conta tentativas finalizadas
  const prevAttempts = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.userId, user.id), eq(examAttempts.examId, examId)));
  const finishedCount = prevAttempts.filter((a) => a.finishedAt !== null).length;
  const alreadyPassed = prevAttempts.some((a) => a.passed);

  if (alreadyPassed)
    return NextResponse.json({ error: "Você já foi aprovado nesta prova." }, { status: 400 });
  if (finishedCount >= exam.maxAttempts)
    return NextResponse.json({ error: "Número máximo de tentativas atingido." }, { status: 400 });

  // Busca questões e calcula nota
  const questions = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId));

  let correct = 0;
  for (const q of questions) {
    if (
      submittedAnswers[q.id] &&
      String(submittedAnswers[q.id]).toUpperCase() === q.correctAnswer
    ) {
      correct++;
    }
  }

  const total = questions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = score >= exam.passingScore;

  const [attempt] = await db
    .insert(examAttempts)
    .values({
      userId: user.id,
      examId,
      answers: JSON.stringify(submittedAnswers),
      score,
      totalCorrect: correct,
      totalQuestions: total,
      passed,
      finishedAt: new Date(),
    })
    .returning();

  const attemptsLeft = exam.maxAttempts - (finishedCount + 1);
  const showAnswers = passed || attemptsLeft <= 0;

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      score,
      totalCorrect: correct,
      totalQuestions: total,
      passed,
    },
    attemptsLeft,
    // Gabarito completo quando esgotou tentativas ou aprovou
    ...(showAnswers
      ? {
          answers: questions.map((q) => ({
            id: q.id,
            question: q.question,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            yourAnswer: submittedAnswers[q.id] || null,
          })),
        }
      : {}),
  });
}
