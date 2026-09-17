import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  Compass,
  GraduationCap,
  PlayCircle,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Reveal } from "@/components/reveal";
import { getSessionUser } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/queries";
import { ensureSeeded } from "@/db/seed";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meu painel" };

export default async function StudentDashboard() {
  await ensureSeeded();
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/painel");

  const items = await getStudentDashboard(user.id);
  const totalCompleted = items.reduce((a, i) => a + i.completedCount, 0);
  const finishedCourses = items.filter(
    (i) => i.lessonsCount > 0 && i.completedCount >= i.lessonsCount
  ).length;

  return (
    <main className="min-h-screen bg-ink-950">
      <Nav user={{ name: user.name, role: user.role }} />

      <section className="grain relative overflow-hidden pt-40 pb-14">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(50% 60% at 50% -10%, rgb(201 162 39 / 0.35), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.35em] text-gold-300">
              <GraduationCap className="size-4" /> Área do aluno
            </p>
            <h1 className="text-balance mt-5 font-display text-4xl font-semibold text-ivory-50 md:text-6xl">
              Bem-vindo, {user.name.split(" ")[0]}.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ivory-300/75">
              Continue de onde parou — perseverança e constância formam um bom teólogo.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-10 grid grid-cols-3 gap-4 max-w-2xl">
              {[
                { icon: BookOpenCheck, big: String(items.length), small: "Cursos" },
                { icon: PlayCircle, big: String(totalCompleted), small: "Aulas concluídas" },
                { icon: Award, big: String(finishedCourses), small: "Certificados" },
              ].map((s) => (
                <div key={s.small} className="glass rounded-2xl p-5">
                  <s.icon className="mb-2 size-4 text-gold-400" />
                  <p className="font-display text-3xl font-semibold text-ivory-50">{s.big}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-widest text-ivory-300/60">
                    {s.small}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-28 lg:px-8">
        {items.length === 0 ? (
          <Reveal>
            <div className="glass mx-auto max-w-lg rounded-3xl p-12 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-gold-500/15 text-gold-300">
                <Compass className="size-7" />
              </span>
              <h2 className="mt-6 font-display text-2xl font-semibold text-ivory-50">
                Você ainda não possui matrículas
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ivory-300/70">
                Explore o catálogo e comece hoje mesmo a sua jornada de formação teológica.
              </p>
              <Link href="/cursos" className="btn-gold mt-8 w-full">
                Explorar cursos <ArrowRight className="size-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="grid gap-7 md:grid-cols-2">
            {items.map(({ course, lessonsCount, completedCount }, i) => {
              const pct = lessonsCount ? Math.round((completedCount / lessonsCount) * 100) : 0;
              const done = lessonsCount > 0 && completedCount >= lessonsCount;
              return (
                <Reveal key={course.id} delay={i * 0.08}>
                  <div className="course-card flex h-full flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 sm:flex-row">
                    <div className="relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:w-44">
                      {course.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={course.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-950" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 to-transparent sm:bg-gradient-to-r" />
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gold-400">
                        {course.category}
                      </span>
                      <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug text-ivory-50">
                        {course.title}
                      </h3>

                      <div className="mt-4">
                        <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-widest text-ivory-300/55">
                          <span>{done ? "Curso concluído!" : `${completedCount} de ${lessonsCount} aulas`}</span>
                          <span className="text-gold-300">{pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              done
                                ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
                                : "bg-gradient-to-r from-gold-500 to-gold-300"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-auto flex items-center gap-3 pt-5">
                        <Link
                          href={`/curso/${course.slug}/aulas`}
                          className="btn-gold !px-5 !py-2.5 !text-xs"
                        >
                          <PlayCircle className="size-4" /> {done ? "Revisar aulas" : "Continuar"}
                        </Link>
                        {done && (
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                            <Award className="size-4" /> Certificado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
