import { notFound } from "next/navigation";
import { db } from "@/db";
import { examQuestions, exams, modules, courses } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ExamEditorClient } from "@/components/exam-editor";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar prova" };

export default async function ExamEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [exam] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
  if (!exam) notFound();

  const [mod] = await db.select().from(modules).where(eq(modules.id, exam.moduleId)).limit(1);
  const [course] = mod
    ? await db.select().from(courses).where(eq(courses.id, mod.courseId)).limit(1)
    : [null];

  const questions = await db
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, id))
    .orderBy(asc(examQuestions.position));

  return (
    <ExamEditorClient
      exam={{
        id: exam.id,
        title: exam.title,
        description: exam.description,
        timeLimitMin: exam.timeLimitMin,
        maxAttempts: exam.maxAttempts,
        passingScore: exam.passingScore,
      }}
      questions={questions.map((q) => ({
        id: q.id,
        question: q.question,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      }))}
      courseName={course?.title ?? ""}
      moduleName={mod?.title ?? ""}
    />
  );
}
