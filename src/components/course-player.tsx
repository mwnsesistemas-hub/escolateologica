"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  MonitorPlay,
  Trophy,
} from "lucide-react";
import { toYouTubeEmbed } from "@/lib/format";

type AttachmentData = { id: string; name: string; url: string; fileType: string };
type ExamData = { id: string; title: string; timeLimitMin: number };

export type PlayerLesson = {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  durationMin: number;
  isFree: boolean;
  attachments?: AttachmentData[];
};

export type PlayerModule = {
  id: string;
  title: string;
  lessons: PlayerLesson[];
  exams?: ExamData[];
};

export function CoursePlayer({
  courseTitle,
  courseSlug,
  modules,
  initialLessonId,
  completedIds: initialCompleted,
  isAdmin,
}: {
  courseTitle: string;
  courseSlug: string;
  modules: PlayerModule[];
  initialLessonId: string | null;
  completedIds: string[];
  isAdmin: boolean;
}) {
  const flat = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const [currentId, setCurrentId] = useState(
    initialLessonId && flat.some((l) => l.id === initialLessonId)
      ? initialLessonId
      : flat[0]?.id ?? null
  );
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompleted));
  const [marking, setMarking] = useState(false);
  const [openModules, setOpenModules] = useState<Set<string>>(
    () => new Set(modules.map((m) => m.id))
  );

  const current = flat.find((l) => l.id === currentId) ?? null;
  const currentIndex = flat.findIndex((l) => l.id === currentId);
  const next = currentIndex >= 0 ? flat[currentIndex + 1] : null;
  const pct = flat.length ? Math.round((completed.size / flat.length) * 100) : 0;

  function toggleModule(id: string) {
    setOpenModules((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function markComplete() {
    if (!current || marking || completed.has(current.id)) return;
    setMarking(true);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: current.id }),
      });
      if (res.ok) {
        setCompleted((prev) => new Set(prev).add(current.id));
        if (next) setCurrentId(next.id);
      }
    } finally {
      setMarking(false);
    }
  }

  const embed = current?.videoUrl ? toYouTubeEmbed(current.videoUrl) : null;

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Trilha lateral */}
      <aside className="order-2 w-full border-t border-ink-800 lg:order-1 lg:h-full lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
        <div className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/95 p-5 backdrop-blur">
          <Link
            href={`/curso/${courseSlug}`}
            className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ivory-300/60 transition hover:text-gold-300"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao curso
          </Link>
          <h1 className="font-display text-xl font-semibold leading-snug text-ivory-50">
            {courseTitle}
          </h1>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-widest text-ivory-300/60">
              <span>Progresso</span>
              <span className="text-gold-300">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-4">
          {modules.map((mod, mi) => (
            <div key={mod.id} className="mb-2 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900">
              <button
                onClick={() => toggleModule(mod.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-500/15 font-display text-xs font-bold text-gold-300">
                  {String(mi + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 font-display text-sm font-semibold text-ivory-50">
                  {mod.title}
                </span>
                <ChevronDown
                  className={`size-4 text-ivory-300/50 transition-transform ${openModules.has(mod.id) ? "rotate-180" : ""}`}
                />
              </button>
              {openModules.has(mod.id) && (
                <div className="border-t border-ink-800">
                  <ul className="p-2">
                    {mod.lessons.map((lesson) => {
                      const isActive = lesson.id === currentId;
                      const isDone = completed.has(lesson.id);
                      return (
                        <li key={lesson.id}>
                          <button
                            onClick={() => setCurrentId(lesson.id)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                              isActive
                                ? "bg-gold-500/15 text-gold-200"
                                : "text-ivory-200/80 hover:bg-ink-850"
                            }`}
                          >
                            {isDone ? (
                              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                                <Check className="size-3.5" strokeWidth={3} />
                              </span>
                            ) : (
                              <CirclePlay className={`size-5 shrink-0 ${isActive ? "text-gold-300" : "text-ivory-300/50"}`} />
                            )}
                            <span className="flex-1 leading-snug">{lesson.title}</span>
                            {lesson.attachments && lesson.attachments.length > 0 && (
                              <FileText className="size-3.5 shrink-0 text-blue-400/70" />
                            )}
                            {lesson.durationMin > 0 && (
                              <span className="shrink-0 text-[10px] tabular-nums text-ivory-300/45">
                                {lesson.durationMin}m
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Provas do módulo */}
                  {mod.exams && mod.exams.length > 0 && (
                    <div className="border-t border-ink-800 p-2">
                      {mod.exams.map((exam) => (
                        <Link
                          key={exam.id}
                          href={`/curso/${courseSlug}/prova/${exam.id}`}
                          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-amber-200/80 transition hover:bg-amber-500/10"
                        >
                          <Trophy className="size-5 shrink-0 text-amber-400" />
                          <span className="flex-1 leading-snug">{exam.title}</span>
                          <span className="shrink-0 text-[10px] text-ivory-300/45">
                            {exam.timeLimitMin}min
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Área do player */}
      <section className="order-1 flex flex-1 flex-col lg:order-2 lg:h-full lg:overflow-y-auto">
        <div className="relative aspect-video w-full bg-black lg:aspect-auto lg:h-[62vh] lg:shrink-0">
          {embed ? (
            <iframe
              key={current?.id}
              src={`${embed}?rel=0`}
              title={current?.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : current?.videoUrl ? (
            <video key={current.id} src={current.videoUrl} controls className="absolute inset-0 h-full w-full" />
          ) : (
            <div className="grain absolute inset-0 grid place-items-center bg-gradient-to-br from-ink-900 to-ink-950">
              <div className="text-center">
                <MonitorPlay className="mx-auto size-14 text-gold-500/50" />
                <p className="mt-5 font-display text-xl font-semibold text-ivory-100">Vídeo em preparação</p>
              </div>
            </div>
          )}
        </div>

        {current && (
          <div className="flex-1 p-6 lg:p-10">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">
                Aula {String(currentIndex + 1).padStart(2, "0")} de {flat.length}
                {current.durationMin > 0 && (
                  <span className="ml-3 inline-flex items-center gap-1.5 text-ivory-300/50">
                    <Clock3 className="size-3.5" /> {current.durationMin} min
                  </span>
                )}
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-ivory-50 md:text-4xl">
                {current.title}
              </h2>

              {current.description && (
                <p className="mt-6 text-lg leading-relaxed text-ivory-200/80">
                  {current.description}
                </p>
              )}

              {/* ── ANEXOS DA AULA ── */}
              {current.attachments && current.attachments.length > 0 && (
                <div className="mt-8 rounded-2xl border border-ink-700 bg-ink-900 p-5">
                  <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-300">
                    <FileText className="size-4" /> Material da aula
                  </p>
                  <div className="grid gap-2">
                    {current.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 text-sm transition hover:border-gold-500/40 hover:bg-ink-800"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-300">
                          <FileText className="size-4" />
                        </span>
                        <span className="flex-1 font-medium text-ivory-100">{att.name}</span>
                        <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ivory-300/50">
                          {att.fileType}
                        </span>
                        <Download className="size-4 text-gold-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-ink-800 pt-8">
                {completed.has(current.id) ? (
                  <span className="flex items-center gap-2.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-6 py-3.5 text-sm font-bold text-emerald-300">
                    <CheckCircle2 className="size-5" /> Aula concluída
                  </span>
                ) : (
                  <button onClick={markComplete} disabled={marking} className="btn-gold">
                    {marking ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="size-5" />
                        Concluir e avançar
                      </>
                    )}
                  </button>
                )}
                {next && (
                  <button onClick={() => setCurrentId(next.id)} className="btn-ghost">
                    Próxima aula <ArrowRight className="size-4 text-gold-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
