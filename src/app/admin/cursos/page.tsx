import Link from "next/link";
import { BarChart3, Layers, PenLine, PlayCircle } from "lucide-react";
import { getCourseSummaries } from "@/lib/queries";
import { brl } from "@/lib/format";
import { NewCourseButton } from "@/components/new-course";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cursos · Admin" };

export default async function AdminCoursesPage() {
  const list = await getCourseSummaries();

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">Conteúdo</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
            Cursos da plataforma
          </h1>
        </div>
        <NewCourseButton />
      </header>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-600 p-16 text-center text-sm text-ivory-300/60">
          Nenhum curso criado ainda. Clique em “Novo curso” para começar.
        </div>
      ) : (
        <div className="grid gap-5">
          {list.map((course) => (
            <Link
              key={course.id}
              href={`/admin/cursos/${course.id}`}
              className="course-card group flex flex-col gap-5 rounded-2xl border border-ink-700 bg-ink-900 p-5 sm:flex-row sm:items-center"
            >
              <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-xl sm:w-40">
                {course.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-800 to-ink-950">
                    <PlayCircle className="size-8 text-gold-500/40" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                      course.status === "published"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-gold-500/15 text-gold-300"
                    }`}
                  >
                    {course.status === "published" ? "Publicado" : "Rascunho"}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ivory-300/50">
                    {course.category}
                  </span>
                </div>
                <h2 className="mt-2 truncate font-display text-xl font-semibold text-ivory-50 transition group-hover:text-gold-300">
                  {course.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ivory-300/60">
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-3.5 text-gold-500/70" /> {course.modulesCount} módulos
                  </span>
                  <span className="flex items-center gap-1.5">
                    <PlayCircle className="size-3.5 text-gold-500/70" /> {course.lessonsCount} aulas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BarChart3 className="size-3.5 text-gold-500/70" /> {course.level}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-5 sm:flex-col sm:items-end sm:gap-2">
                <span className="font-display text-xl font-semibold text-gold-400">
                  {course.priceCents > 0 ? brl(course.priceCents) : "Gratuito"}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ivory-300/60 transition group-hover:text-gold-300">
                  <PenLine className="size-3.5" /> Editar
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
