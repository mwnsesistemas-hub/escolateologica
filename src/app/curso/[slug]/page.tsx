import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BadgeCheck,
  BarChart3,
  Clock3,
  Infinity as InfinityIcon,
  Layers,
  MonitorPlay,
  PlayCircle,
  Unlock,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { EnrollButton } from "@/components/enroll-button";
import { getSessionUser } from "@/lib/auth";
import { getCourseTree, getEnrollment } from "@/lib/queries";
import { brl } from "@/lib/format";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseTree(slug);
  return { title: course ? course.title : "Curso" };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await ensureSeeded();
  const [course, user] = await Promise.all([
    getCourseTree(slug).catch(() => null),
    getSessionUser().catch(() => null),
  ]);
  if (!course || course.status !== "published") notFound();

  const enrollment = user ? await getEnrollment(user.id, course.id).catch(() => null) : null;
  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const totalMinutes = course.modules.reduce(
    (acc, m) => acc + m.lessons.reduce((a, l) => a + l.durationMin, 0),
    0
  );
  const hours = Math.round(totalMinutes / 60);

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={user ? { name: user.name, role: user.role } : null} />

      {/* ── HERO DO CURSO ─────────────────────────────────── */}
      <section className="grain relative overflow-hidden pt-32">
        {course.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950 to-ink-950" />

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-10 lg:px-8">
          <Reveal>
            <nav className="mb-8 flex items-center gap-2 text-xs uppercase tracking-widest text-ivory-300/50">
              <Link href="/" className="hover:text-gold-300">Início</Link>
              <span>/</span>
              <Link href="/cursos" className="hover:text-gold-300">Cursos</Link>
              <span>/</span>
              <span className="text-gold-300">{course.category}</span>
            </nav>

            <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
              <div>
                <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-gold-300">
                  {course.category}
                </span>
                <h1 className="text-balance mt-6 font-display text-4xl font-semibold leading-tight text-ivory-50 md:text-6xl">
                  {course.title}
                </h1>
                {course.subtitle && (
                  <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ivory-200/80">
                    {course.subtitle}
                  </p>
                )}

                <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-sm text-ivory-300/70">
                  <span className="flex items-center gap-2">
                    <Layers className="size-4 text-gold-400" /> {course.modules.length} módulos
                  </span>
                  <span className="flex items-center gap-2">
                    <PlayCircle className="size-4 text-gold-400" /> {totalLessons} aulas
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock3 className="size-4 text-gold-400" /> {hours > 0 ? `${hours}h de conteúdo` : `${totalMinutes} min`}
                  </span>
                  <span className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-gold-400" /> Nível {course.level}
                  </span>
                </div>
              </div>

              {/* Card de matrícula */}
              <div className="lg:pt-2">
                <div className="glass sticky top-24 rounded-3xl p-7">
                  <div className="mb-5">
                    {course.priceCents > 0 ? (
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-4xl font-semibold text-gold-400">
                          {brl(course.priceCents)}
                        </span>
                        <span className="text-sm text-ivory-300/60">pagamento único</span>
                      </div>
                    ) : (
                      <span className="font-display text-4xl font-semibold text-gold-400">
                        Gratuito
                      </span>
                    )}
                  </div>

                  <EnrollButton
                    courseId={course.id}
                    courseSlug={course.slug}
                    priceCents={course.priceCents}
                    isLoggedIn={Boolean(user)}
                    isEnrolled={Boolean(enrollment)}
                  />

                  <ul className="mt-6 space-y-3 border-t border-ink-700 pt-6 text-sm text-ivory-300/80">
                    <li className="flex items-center gap-3">
                      <InfinityIcon className="size-4 shrink-0 text-gold-400" /> Acesso vitalício ao curso
                    </li>
                    <li className="flex items-center gap-3">
                      <MonitorPlay className="size-4 shrink-0 text-gold-400" /> Assista em qualquer dispositivo
                    </li>
                    <li className="flex items-center gap-3">
                      <Award className="size-4 shrink-0 text-gold-400" /> Certificado de conclusão
                    </li>
                    <li className="flex items-center gap-3">
                      <BadgeCheck className="size-4 shrink-0 text-gold-400" /> Pagamento seguro via Asaas
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── DESCRIÇÃO + CURRÍCULO ─────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 pb-28 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[1fr_380px]">
          <div>
            <Reveal>
              <h2 className="font-display text-3xl font-semibold text-ivory-50">
                Sobre este curso
              </h2>
              <div className="mt-6 space-y-5 text-lg leading-relaxed text-ivory-200/80">
                {course.description.split(/\n+/).filter(Boolean).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <h2 className="mt-16 font-display text-3xl font-semibold text-ivory-50">
                Conteúdo programático
              </h2>
              <div className="mt-7 space-y-4">
                {course.modules.map((mod, mi) => (
                  <details
                    key={mod.id}
                    open={mi === 0}
                    className="acc group rounded-2xl border border-ink-700 bg-ink-900 px-6 py-5 transition open:border-gold-500/30"
                  >
                    <summary className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-4">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold-500/15 font-display text-sm font-bold text-gold-300">
                          {String(mi + 1).padStart(2, "0")}
                        </span>
                        <span className="font-display text-lg font-semibold text-ivory-50">
                          {mod.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ivory-300/50">
                        {mod.lessons.length} aulas
                      </span>
                    </summary>
                    <ul className="mt-5 space-y-1 border-t border-ink-700/80 pt-4">
                      {mod.lessons.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ivory-200/85 transition hover:bg-ink-850"
                        >
                          <PlayCircle className="size-4 shrink-0 text-gold-500/80" />
                          <span className="flex-1">{lesson.title}</span>
                          {lesson.isFree && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                              <Unlock className="size-3" /> Prévia
                            </span>
                          )}
                          <span className="text-xs tabular-nums text-ivory-300/50">
                            {lesson.durationMin > 0 ? `${lesson.durationMin} min` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Coluna lateral: prévia das aulas grátis */}
          <div className="lg:pt-[4.75rem]">
            <Reveal delay={0.15}>
              <div className="rounded-3xl border border-ink-700 bg-ink-900 p-7">
                <h3 className="font-display text-xl font-semibold text-ivory-50">
                  Como vai ser sua experiência
                </h3>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed text-ivory-300/75">
                  <li className="flex gap-3">
                    <span className="rule-gold mt-3 w-6 shrink-0" />
                    Aulas em vídeo com acompanhamento de progresso aula a aula.
                  </li>
                  <li className="flex gap-3">
                    <span className="rule-gold mt-3 w-6 shrink-0" />
                    Bibliografia recomendada e exercícios de leitura guiada.
                  </li>
                  <li className="flex gap-3">
                    <span className="rule-gold mt-3 w-6 shrink-0" />
                    Estude no seu ritmo: o acesso é vitalício e sem mensalidades.
                  </li>
                  <li className="flex gap-3">
                    <span className="rule-gold mt-3 w-6 shrink-0" />
                    Notificações de novas turmas e conteúdos direto no WhatsApp.
                  </li>
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
