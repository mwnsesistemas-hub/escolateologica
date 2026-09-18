import Link from "next/link";
import { ArrowRight, Clock, FileQuestion, Plus, Trophy } from "lucide-react";
import { db } from "@/db";
import { courses, examQuestions, exams, modules } from "@/db/schema";
import { asc, count, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Provas · Admin" };

export default async function AdminExamsPage() {
  const allExams = await db
    .select({ exam: exams, module: modules, course: courses })
    .from(exams)
    .innerJoin(modules, eq(exams.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .orderBy(asc(courses.title), asc(modules.position), asc(exams.position));

  // Conta questões por prova
  const examIds = allExams.map((r) => r.exam.id);
  const qCounts = examIds.length
    ? await db
        .select({ examId: examQuestions.examId, total: count() })
        .from(examQuestions)
        .where(inArray(examQuestions.examId, examIds))
        .groupBy(examQuestions.examId)
    : [];

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">Avaliação</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
            Provas e avaliações
          </h1>
          <p className="mt-2 text-sm text-ivory-300/60">
            Crie provas de múltipla escolha com cronômetro e gabarito automático.
          </p>
        </div>
      </header>

      {allExams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-600 p-16 text-center text-sm text-ivory-300/60">
          <Trophy className="mx-auto size-10 text-gold-500/40 mb-4" />
          <p>Nenhuma prova criada ainda.</p>
          <p className="mt-2">Acesse o editor de um curso → vá ao módulo → crie uma prova.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {allExams.map(({ exam, module, course }) => {
            const numQ = qCounts.find((q) => q.examId === exam.id)?.total ?? 0;
            return (
              <Link
                key={exam.id}
                href={`/admin/provas/${exam.id}`}
                className="course-card group flex items-center gap-5 rounded-2xl border border-ink-700 bg-ink-900 p-5 transition"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-300">
                  <Trophy className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-lg font-semibold text-ivory-50 transition group-hover:text-gold-300">
                    {exam.title}
                  </h2>
                  <p className="text-xs text-ivory-300/55">
                    {course.title} → {module.title}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-ivory-300/50">
                    <span className="flex items-center gap-1.5">
                      <FileQuestion className="size-3.5 text-gold-500/70" /> {numQ} questões
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 text-gold-500/70" /> {exam.timeLimitMin} min
                    </span>
                    <span>Nota mínima: {exam.passingScore}%</span>
                    <span>Máx. {exam.maxAttempts} tentativas</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-ivory-300/60 group-hover:text-gold-300">
                  Editar <ArrowRight className="ml-1 inline size-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
