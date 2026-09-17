import Link from "next/link";
import { Layers, PlayCircle, BarChart3 } from "lucide-react";
import { brl } from "@/lib/format";
import type { CourseWithCounts } from "@/lib/queries";

export function CourseCard({ course }: { course: CourseWithCounts }) {
  return (
    <Link
      href={`/curso/${course.slug}`}
      className="course-card group flex h-full flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-900"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverUrl}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-ink-800 to-ink-950">
            <PlayCircle className="size-12 text-gold-500/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-ink-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-300 backdrop-blur">
          {course.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-xl font-semibold leading-snug text-ivory-50 transition group-hover:text-gold-300">
          {course.title}
        </h3>
        {course.subtitle && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ivory-300/70">
            {course.subtitle}
          </p>
        )}

        <div className="mt-5 flex items-center gap-4 text-xs text-ivory-300/60">
          <span className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-gold-500/80" /> {course.modulesCount} módulos
          </span>
          <span className="flex items-center gap-1.5">
            <PlayCircle className="size-3.5 text-gold-500/80" /> {course.lessonsCount} aulas
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-gold-500/80" /> {course.level}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-ink-700/70 pt-5">
          {course.priceCents > 0 ? (
            <span className="font-display text-2xl font-semibold text-gold-400">
              {brl(course.priceCents)}
            </span>
          ) : (
            <span className="rounded-full bg-gold-500/15 px-3 py-1 text-sm font-bold text-gold-300">
              Gratuito
            </span>
          )}
          <span className="text-xs font-semibold uppercase tracking-widest text-ivory-300/60 transition group-hover:text-gold-300">
            Ver curso →
          </span>
        </div>
      </div>
    </Link>
  );
}
